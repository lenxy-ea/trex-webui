from __future__ import annotations

import ast
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SUPPORTED_PROFILE_SUFFIXES = {
    ".py": "python",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".json": "json",
    ".pcap": "pcap",
    ".cap": "pcap",
}
TEXT_PROFILE_SUFFIXES = {".py", ".yaml", ".yml", ".json"}
DEFAULT_PROFILE_PREVIEW_BYTES = 8192
PROFILE_PATH_ERROR = "profile path must be clean non-empty text"
PROFILE_ROOT_PATH_ERROR = "profile root path must be clean non-empty text"
PROFILE_NAME_ERROR = "profile name must be a clean .yaml or .yml file name"
PROFILE_COPY_NAME_ERROR = "profile copy name must be a clean supported profile file name"


def profile_record(path: Path, root: Path) -> dict[str, Any]:
    stats = path.stat()
    suffix = path.suffix.lower()
    return {
        "name": path.name,
        "path": str(path),
        "relative_path": path.relative_to(root).as_posix(),
        "root": str(root),
        "suffix": suffix,
        "kind": SUPPORTED_PROFILE_SUFFIXES.get(suffix, "unknown"),
        "size_bytes": stats.st_size,
        "modified_time": datetime.fromtimestamp(stats.st_mtime, timezone.utc).isoformat(),
        "previewable": suffix in TEXT_PROFILE_SUFFIXES,
        "tunables": _python_profile_tunables(path) if suffix == ".py" else [],
    }


def matching_root(path: Path, roots: list[Path]) -> Path | None:
    for root in roots:
        resolved_root, _ = safe_resolve(root, PROFILE_ROOT_PATH_ERROR)
        if resolved_root is None:
            continue
        try:
            path.relative_to(resolved_root)
            return resolved_root
        except ValueError:
            continue
    return None


def is_allowed_path(path: Path, roots: list[Path]) -> bool:
    for root in roots:
        try:
            resolved_root, _ = safe_resolve(root, PROFILE_ROOT_PATH_ERROR)
            if resolved_root is None:
                continue
            path.relative_to(resolved_root)
            return True
        except (OSError, ValueError):
            continue
    return False


def clean_profile_path_text(value: object) -> bool:
    return isinstance(value, str) and value.strip() != "" and value == value.strip() and "\x00" not in value


def writable_profile_root(roots: list[Path]) -> tuple[Path | None, str | None]:
    if not roots:
        return None, "no profile roots configured"
    for root in reversed(roots):
        resolved, error = safe_resolve(root, PROFILE_ROOT_PATH_ERROR)
        if resolved is not None:
            return resolved, None
        if error and not path_exists(root):
            try:
                return root.resolve(strict=False), None
            except (OSError, ValueError):
                pass
    return None, PROFILE_ROOT_PATH_ERROR


def normalize_profile_file_name(value: str) -> str | None:
    if not isinstance(value, str):
        return None
    candidate = value.strip()
    if candidate == "" or candidate != value or "\x00" in candidate or "/" in candidate or "\\" in candidate:
        return None
    path = Path(candidate)
    if path.name in {".", ".."}:
        return None
    if path.suffix == "":
        candidate = f"{candidate}.yaml"
        path = Path(candidate)
    if path.suffix.lower() not in {".yaml", ".yml"}:
        return None
    return path.name


def normalize_profile_copy_file_name(value: object, default_suffix: str) -> str | None:
    if not isinstance(value, str):
        return None
    candidate = value.strip()
    if candidate == "" or candidate != value or "\x00" in candidate or "/" in candidate or "\\" in candidate:
        return None
    path = Path(candidate)
    if path.name in {".", ".."}:
        return None
    if path.suffix == "":
        candidate = f"{candidate}{default_suffix}"
        path = Path(candidate)
    if path.suffix.lower() not in SUPPORTED_PROFILE_SUFFIXES:
        return None
    return path.name


def next_profile_copy_path(root: Path, source_name: str) -> Path:
    source = Path(source_name)
    stem = source.stem or "profile"
    suffix = source.suffix or ".yaml"
    candidate = root / f"{stem}-copy{suffix}"
    index = 2
    while candidate.exists():
        candidate = root / f"{stem}-copy-{index}{suffix}"
        index += 1
    return candidate


def valid_profile_root(path: Path) -> bool:
    resolved, _ = safe_resolve(path, PROFILE_ROOT_PATH_ERROR)
    return resolved is not None


def profile_root_errors(roots: list[Path]) -> list[str]:
    errors: list[str] = []
    for root in roots:
        resolved, error = safe_resolve(root, PROFILE_ROOT_PATH_ERROR)
        if resolved is None:
            errors.append(error or PROFILE_ROOT_PATH_ERROR)
    return errors


def safe_resolve(path: Path, clean_error: str) -> tuple[Path | None, str | None]:
    if not _clean_path_text(path):
        return None, clean_error
    try:
        return path.expanduser().resolve(), None
    except (OSError, ValueError) as exc:
        return None, str(exc)


def path_exists(path: Path) -> bool:
    if not _clean_path_text(path):
        return False
    try:
        return path.exists()
    except (OSError, ValueError):
        return False


def _clean_path_text(path: Path) -> bool:
    value = str(path)
    return value.strip() != "" and value == value.strip() and "\x00" not in value


def _python_profile_tunables(path: Path) -> list[dict[str, Any]]:
    try:
        source = path.read_text(encoding="utf-8", errors="ignore")
        tree = ast.parse(source)
    except (OSError, SyntaxError, ValueError):
        return []

    tunables: list[dict[str, Any]] = []
    seen: set[str] = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call) or not _is_argparse_add_argument_call(node):
            continue
        name = _argparse_long_option_name(node)
        if name is None or name in seen:
            continue
        seen.add(name)
        tunable: dict[str, Any] = {
            "name": name,
            "required": _ast_keyword_bool(node, "required", False),
        }
        default_value = _ast_keyword_literal(node, "default")
        if default_value is not None:
            tunable["default"] = default_value
        choices_value = _ast_keyword_literal(node, "choices")
        if isinstance(choices_value, (list, tuple, set)):
            tunable["choices"] = sorted(choices_value, key=lambda value: str(value))
        tunable_type = _ast_keyword_type_name(node, "type")
        if tunable_type is not None:
            tunable["type"] = tunable_type
        tunables.append(tunable)
    return tunables


def _is_argparse_add_argument_call(node: ast.Call) -> bool:
    return isinstance(node.func, ast.Attribute) and node.func.attr == "add_argument"


def _argparse_long_option_name(node: ast.Call) -> str | None:
    for argument in node.args:
        if isinstance(argument, ast.Constant) and isinstance(argument.value, str) and argument.value.startswith("--"):
            return argument.value[2:]
    return None


def _ast_keyword_bool(node: ast.Call, name: str, default: bool) -> bool:
    value = _ast_keyword_literal(node, name)
    return value if isinstance(value, bool) else default


def _ast_keyword_literal(node: ast.Call, name: str) -> Any:
    for keyword in node.keywords:
        if keyword.arg == name:
            try:
                return ast.literal_eval(keyword.value)
            except (ValueError, TypeError):
                return None
    return None


def _ast_keyword_type_name(node: ast.Call, name: str) -> str | None:
    for keyword in node.keywords:
        if keyword.arg != name:
            continue
        if isinstance(keyword.value, ast.Name):
            return keyword.value.id
        if isinstance(keyword.value, ast.Attribute):
            return keyword.value.attr
    return None
