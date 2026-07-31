from __future__ import annotations

from app.core.settings import TrexEnvironment
from app.trex.capture_files import (
    CaptureFileError,
    CaptureFileOpener,
    capture_output_root,
    capture_saved_file_record,
    list_capture_files as _list_capture_files,
    resolve_capture_saved_file,
)
from app.trex.result import TrexCallResult


def capture_file_error_result(exc: CaptureFileError) -> TrexCallResult:
    return TrexCallResult(False, blocker=exc.blocker, error=exc.error)


def list_capture_files(env: TrexEnvironment) -> TrexCallResult:
    try:
        return TrexCallResult(True, data=_list_capture_files(env))
    except CaptureFileError as exc:
        return capture_file_error_result(exc)


def download_capture_file(env: TrexEnvironment, file_name: str) -> TrexCallResult:
    try:
        target = resolve_capture_saved_file(env, file_name)
    except CaptureFileError as exc:
        return capture_file_error_result(exc)
    return TrexCallResult(True, data={"accepted": True, "file": capture_saved_file_record(target, include_content=True)})


def open_capture_file(
    env: TrexEnvironment,
    file_name: str,
    capture_file_opener: CaptureFileOpener,
) -> TrexCallResult:
    command_error = env.configuration_errors.get("TREX_WEBUI_CAPTURE_OPEN_COMMAND")
    if command_error:
        return TrexCallResult(False, blocker="capture_open_command_invalid", error=command_error)
    if not env.capture_open_command:
        return TrexCallResult(
            False,
            blocker="capture_open_unconfigured",
            error="TREX_WEBUI_CAPTURE_OPEN_COMMAND is not configured",
        )
    try:
        target = resolve_capture_saved_file(env, file_name)
    except CaptureFileError as exc:
        return capture_file_error_result(exc)
    root = capture_output_root(env).resolve()
    command = [*env.capture_open_command, str(target)]
    try:
        pid = capture_file_opener(command, root)
    except FileNotFoundError as exc:
        return TrexCallResult(False, blocker="capture_open_command_missing", error=str(exc))
    except PermissionError as exc:
        return TrexCallResult(False, blocker="capture_open_permission_denied", error=str(exc))
    except OSError as exc:
        return TrexCallResult(False, blocker="capture_open_failed", error=str(exc))
    if not isinstance(pid, int) or isinstance(pid, bool) or pid < 0:
        return TrexCallResult(False, blocker="capture_open_failed", error="capture opener did not return a process id")
    return TrexCallResult(
        True,
        data={
            "accepted": True,
            "file": capture_saved_file_record(target, include_content=False),
            "command": command,
            "pid": pid,
        },
    )
