from __future__ import annotations

import base64
import binascii
import os
import struct
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from app.core.settings import TrexEnvironment

CAPTURE_FILE_NAME_ERROR = "capture file name must be a clean .pcap or .cap file name"
CAPTURE_PCAP_DOWNLOAD_MAX_BYTES = 32_000_000

CaptureFileOpener = Callable[[list[str], Path], int]


class CaptureFileError(ValueError):
    def __init__(self, blocker: str, error: str) -> None:
        super().__init__(error)
        self.blocker = blocker
        self.error = error


def normalize_capture_file_name(value: object) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise CaptureFileError("capture_file_name_invalid", CAPTURE_FILE_NAME_ERROR)
    candidate = value.strip()
    if candidate == "" or candidate != value or "\x00" in candidate or "/" in candidate or "\\" in candidate:
        raise CaptureFileError("capture_file_name_invalid", CAPTURE_FILE_NAME_ERROR)
    path = Path(candidate)
    if path.name in {".", ".."}:
        raise CaptureFileError("capture_file_name_invalid", CAPTURE_FILE_NAME_ERROR)
    if path.suffix == "":
        candidate = f"{candidate}.pcap"
        path = Path(candidate)
    if path.suffix.lower() not in {".pcap", ".cap"}:
        raise CaptureFileError("capture_file_name_invalid", CAPTURE_FILE_NAME_ERROR)
    return path.name


def capture_output_root(env: TrexEnvironment) -> Path:
    root = env.daemon_log.parent
    if not clean_path_text(root):
        root = Path.cwd() / ".logs"
    return root / "captures"


def list_capture_files(env: TrexEnvironment) -> dict[str, Any]:
    root = capture_output_root(env)
    if not root.exists():
        return {"root": str(root), "files": []}
    try:
        is_dir = root.is_dir()
    except (OSError, ValueError) as exc:
        raise CaptureFileError("capture_file_root_invalid", str(exc)) from exc
    if not is_dir:
        raise CaptureFileError("capture_file_root_invalid", f"{root} is not a directory")

    files: list[dict[str, Any]] = []
    try:
        for candidate in sorted(root.iterdir(), key=lambda path: path.name):
            if not candidate.is_file() or candidate.suffix.lower() not in {".pcap", ".cap"}:
                continue
            resolved = candidate.resolve()
            resolved.relative_to(root.resolve())
            files.append(capture_saved_file_record(resolved, include_content=False))
    except (OSError, ValueError) as exc:
        raise CaptureFileError("capture_file_list_failed", str(exc)) from exc
    files.sort(key=lambda record: str(record.get("modified_time") or ""), reverse=True)
    return {"root": str(root), "files": files}


def resolve_capture_saved_file(env: TrexEnvironment, file_name: object) -> Path:
    normalized_file_name = normalize_capture_file_name(file_name)
    if normalized_file_name is None:
        raise CaptureFileError("capture_file_name_invalid", CAPTURE_FILE_NAME_ERROR)
    root = capture_output_root(env).resolve()
    target = (root / normalized_file_name).resolve()
    try:
        target.relative_to(root)
    except ValueError as exc:
        raise CaptureFileError("capture_file_name_invalid", CAPTURE_FILE_NAME_ERROR) from exc
    if not target.exists():
        raise CaptureFileError("capture_file_missing", f"{normalized_file_name} does not exist")
    if not target.is_file():
        raise CaptureFileError("capture_file_not_file", f"{normalized_file_name} is not a file")
    return target


def write_capture_pcap(
    env: TrexEnvironment,
    capture_id: int,
    packets: list[dict[str, Any]],
    file_name: str | None,
) -> Path:
    root = capture_output_root(env)
    root.mkdir(parents=True, exist_ok=True)
    if file_name is None:
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        file_name = f"capture-{timestamp}-{capture_id}.pcap"
    target = (root / file_name).resolve()
    target.relative_to(root.resolve())
    file_descriptor, temporary_name = tempfile.mkstemp(
        dir=str(root),
        prefix=f".{target.name}.",
        suffix=".tmp",
    )
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(file_descriptor, "wb") as output:
            output.write(struct.pack("<IHHIIII", 0xA1B2C3D4, 2, 4, 0, 0, 65_535, 1))
            for packet in packets:
                packet_bytes = packet_bytes_from_value(packet.get("binary"))
                timestamp = packet_timestamp_seconds(packet.get("ts"))
                seconds = int(timestamp)
                microseconds = int((timestamp - seconds) * 1_000_000)
                wirelen = packet.get("wirelen")
                if not isinstance(wirelen, int):
                    wirelen = len(packet_bytes)
                output.write(struct.pack("<IIII", seconds, microseconds, len(packet_bytes), wirelen))
                output.write(packet_bytes)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary_path, target)
    except Exception:
        temporary_path.unlink(missing_ok=True)
        raise
    return target


def capture_saved_file_record(target: Path, include_content: bool) -> dict[str, Any]:
    stats = target.stat()
    size_bytes = stats.st_size
    record: dict[str, Any] = {
        "path": str(target),
        "name": target.name,
        "size_bytes": size_bytes,
        "modified_time": datetime.fromtimestamp(stats.st_mtime, timezone.utc).isoformat(),
        "download_available": False,
        "content_base64": None,
        "download_error": None,
    }
    if size_bytes <= CAPTURE_PCAP_DOWNLOAD_MAX_BYTES:
        record["download_available"] = True
        if include_content:
            record["content_base64"] = base64.b64encode(target.read_bytes()).decode("ascii")
    else:
        record["download_error"] = f"capture PCAP exceeds {CAPTURE_PCAP_DOWNLOAD_MAX_BYTES} byte browser download limit"
    return record


def open_capture_file_with_command(command: list[str], cwd: Path) -> int:
    process = subprocess.Popen(
        command,
        cwd=str(cwd),
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        close_fds=True,
        start_new_session=True,
    )
    return process.pid


def packet_bytes_from_value(value: object) -> bytes:
    if isinstance(value, bytes):
        return value
    if isinstance(value, bytearray):
        return bytes(value)
    if isinstance(value, str):
        try:
            return base64.b64decode(value, validate=True)
        except (ValueError, binascii.Error):
            return value.encode("utf-8", errors="replace")
    return b""


def packet_timestamp_seconds(value: object) -> float:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    return 0.0


def clean_path_text(path: Path) -> bool:
    try:
        text = str(path)
    except TypeError:
        return False
    return bool(text) and "\x00" not in text
