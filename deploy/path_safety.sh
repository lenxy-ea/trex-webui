#!/usr/bin/env bash

TREX_MANAGED_MARKER_NAME=".trex-webui-managed"
TREX_MANAGED_MARKER_VALUE="trex-webui-managed-v1"
TREX_MANAGED_MARKER_MODE="644"
TREX_DEPLOY_LOCK_DEFAULT_PATH="/run/lock/trex-webui/deploy.lock"
TREX_DEPLOY_LOCK_PROTOCOL_VERSION="trex-webui-deploy-lock-v1"
TREX_MANAGED_API_ENV_FILE_DEFAULT="/etc/trex-webui/trex-webui.env"
TREX_MANAGED_API_ENV_MAX_BYTES=$((1024 * 1024))
TREX_MANAGED_API_ENV_PROTECTED_KEYS=(
  TREX_WEBUI_TREX_HOST
  TREX_WEBUI_TREX_SYNC_PORT
  TREX_WEBUI_TREX_ASYNC_PORT
  TREX_WEBUI_TREX_SCAPY_PORT
  TREX_WEBUI_TREX_DAEMON_PORT
  TREX_WEBUI_DAEMON_SUPERVISOR
  TREX_WEBUI_TREX_SCRIPTS_DIR
  TREX_WEBUI_TREX_DAEMON_BIN
  TREX_WEBUI_PROFILE_ROOTS
  TREX_WEBUI_RUNTIME_STATE_PATH
  TREX_WEBUI_DAEMON_GENERATION_PATH
)

trex_safety_error() {
  printf 'path safety error: %s\n' "$*" >&2
  return 1
}

trex_assert_managed_api_environment_file() {
  local path="${1:-$TREX_MANAGED_API_ENV_FILE_DEFAULT}"
  local allow_protected_keys="${2:-0}"
  [[ "$allow_protected_keys" == "0" || "$allow_protected_keys" == "1" ]] || \
    trex_safety_error "managed API environment protected-key policy must be 0 or 1" || return
  local canonical
  canonical="$(trex_canonical_path "$path" "managed API environment file")" || return
  [[ "$canonical" == "$path" ]] || \
    trex_safety_error "managed API environment file path must be canonical: $path" || return
  [[ -e "$path" || -L "$path" ]] || return 0
  command -v python3 >/dev/null 2>&1 || \
    trex_safety_error "python3 is required to validate the managed API environment file" || return

  python3 - "$path" "$TREX_MANAGED_API_ENV_MAX_BYTES" "$allow_protected_keys" \
    "${TREX_MANAGED_API_ENV_PROTECTED_KEYS[@]}" <<'PY'
from __future__ import annotations

import os
import re
import stat
import sys


path = sys.argv[1]
maximum_bytes = int(sys.argv[2])
allow_protected_keys = sys.argv[3] == "1"
protected = set(sys.argv[4:])
flags = os.O_RDONLY | os.O_CLOEXEC
if hasattr(os, "O_NOFOLLOW"):
    flags |= os.O_NOFOLLOW

try:
    descriptor = os.open(path, flags)
except OSError as exc:
    raise SystemExit(f"managed API environment file is missing or unsafe: {path}: {exc}")

try:
    metadata = os.fstat(descriptor)
    if not stat.S_ISREG(metadata.st_mode):
        raise SystemExit(f"managed API environment file must be a non-symlink regular file: {path}")
    if metadata.st_uid != 0 or metadata.st_gid != 0:
        raise SystemExit(f"managed API environment file must be owned by root:root: {path}")
    if stat.S_IMODE(metadata.st_mode) != 0o600:
        raise SystemExit(f"managed API environment file mode must be 0600: {path}")
    if metadata.st_size > maximum_bytes:
        raise SystemExit(f"managed API environment file exceeds {maximum_bytes} bytes: {path}")

    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = os.read(descriptor, min(65536, maximum_bytes + 1 - total))
        if not chunk:
            break
        chunks.append(chunk)
        total += len(chunk)
        if total > maximum_bytes:
            raise SystemExit(f"managed API environment file exceeds {maximum_bytes} bytes: {path}")
finally:
    os.close(descriptor)

try:
    content = b"".join(chunks).decode("utf-8")
except UnicodeDecodeError as exc:
    raise SystemExit(f"managed API environment file must be valid UTF-8: {path}: {exc}")
if "\x00" in content:
    raise SystemExit(f"managed API environment file must not contain NUL bytes: {path}")

assignment = re.compile(r"^[ \t]*([A-Za-z_][A-Za-z0-9_]*)[ \t]*=")
for line_number, physical_line in enumerate(content.splitlines(keepends=True), start=1):
    body = physical_line.rstrip("\r\n")
    stripped = body.strip()
    if not stripped or stripped.startswith("#") or stripped.startswith(";"):
        continue
    if body.endswith("\\"):
        raise SystemExit(
            f"managed API environment file must use one KEY=value assignment per line: "
            f"{path}:{line_number}"
        )
    match = assignment.match(body)
    if match is None:
        raise SystemExit(
            f"managed API environment file contains an unsupported assignment: "
            f"{path}:{line_number}"
        )
    key = match.group(1)
    if not allow_protected_keys and key in protected:
        raise SystemExit(
            f"managed API environment file must not override protected key {key}: "
            f"{path}:{line_number}"
        )
PY
}

trex_assert_managed_api_process_environment() {
  local main_pid="${1:-}"
  local proc_root="${2:-/proc}"
  local expected_scripts_dir="${3:-}"
  local expected_daemon_bin="${4:-}"
  local expected_profile_roots="${5:-}"
  [[ "$main_pid" =~ ^[1-9][0-9]*$ ]] || \
    trex_safety_error "managed API MainPID is invalid: ${main_pid:-missing}" || return
  command -v python3 >/dev/null 2>&1 || \
    trex_safety_error "python3 is required to inspect the managed API process environment" || return

  python3 - \
    "$proc_root/$main_pid/environ" \
    "$expected_scripts_dir" \
    "$expected_daemon_bin" \
    "$expected_profile_roots" <<'PY'
from __future__ import annotations

import os
import sys


path = sys.argv[1]
expected = {
    "TREX_WEBUI_TREX_HOST": "127.0.0.1",
    "TREX_WEBUI_TREX_SYNC_PORT": "4501",
    "TREX_WEBUI_TREX_ASYNC_PORT": "4500",
    "TREX_WEBUI_TREX_SCAPY_PORT": "4507",
    "TREX_WEBUI_TREX_DAEMON_PORT": "8090",
    "TREX_WEBUI_DAEMON_SUPERVISOR": "systemd",
    "TREX_WEBUI_RUNTIME_STATE_PATH": "/var/lib/trex-webui/runtime-state.json",
    "TREX_WEBUI_DAEMON_GENERATION_PATH": "/run/trex-webui/daemon-generation",
}
for key, value in (
    ("TREX_WEBUI_TREX_SCRIPTS_DIR", sys.argv[2]),
    ("TREX_WEBUI_TREX_DAEMON_BIN", sys.argv[3]),
    ("TREX_WEBUI_PROFILE_ROOTS", sys.argv[4]),
):
    if value:
        expected[key] = value
flags = os.O_RDONLY | os.O_CLOEXEC
if hasattr(os, "O_NOFOLLOW"):
    flags |= os.O_NOFOLLOW
try:
    descriptor = os.open(path, flags)
except OSError as exc:
    raise SystemExit(f"managed API MainPID environment is not inspectable: {path}: {exc}")
try:
    payload = b""
    while len(payload) <= 1024 * 1024:
        chunk = os.read(descriptor, 65536)
        if not chunk:
            break
        payload += chunk
    if len(payload) > 1024 * 1024:
        raise SystemExit(f"managed API MainPID environment exceeds the inspection limit: {path}")
finally:
    os.close(descriptor)

expected_keys = {key.encode("ascii"): key for key in expected}
observed: dict[str, list[str]] = {}
for raw_entry in payload.split(b"\0"):
    if not raw_entry:
        continue
    raw_key, separator, raw_value = raw_entry.partition(b"=")
    if not separator:
        continue
    key = expected_keys.get(raw_key)
    if key is None:
        continue
    try:
        value = raw_value.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise SystemExit(
            f"managed API MainPID environment value is not valid UTF-8 for {key}: {path}: {exc}"
        )
    observed.setdefault(key, []).append(value)

for key, value in expected.items():
    values = observed.get(key, [])
    if values != [value]:
        actual = "missing" if not values else repr(values)
        raise SystemExit(
            f"managed API MainPID environment mismatch for {key}: "
            f"expected {value!r}, got {actual}"
        )
PY
}

trex_assert_managed_api_declared_environment() {
  local declared_environment="${1:-}"
  local expected_scripts_dir="${2:-}"
  local expected_daemon_bin="${3:-}"
  local expected_profile_roots="${4:-}"
  command -v python3 >/dev/null 2>&1 || \
    trex_safety_error "python3 is required to inspect the loaded API environment" || return

  python3 - \
    "$declared_environment" \
    "$expected_scripts_dir" \
    "$expected_daemon_bin" \
    "$expected_profile_roots" <<'PY'
from __future__ import annotations

import shlex
import sys


expected = {
    "TREX_WEBUI_TREX_HOST": "127.0.0.1",
    "TREX_WEBUI_TREX_SYNC_PORT": "4501",
    "TREX_WEBUI_TREX_ASYNC_PORT": "4500",
    "TREX_WEBUI_TREX_SCAPY_PORT": "4507",
    "TREX_WEBUI_TREX_DAEMON_PORT": "8090",
    "TREX_WEBUI_DAEMON_SUPERVISOR": "systemd",
    "TREX_WEBUI_TREX_SCRIPTS_DIR": sys.argv[2],
    "TREX_WEBUI_TREX_DAEMON_BIN": sys.argv[3],
    "TREX_WEBUI_PROFILE_ROOTS": sys.argv[4],
    "TREX_WEBUI_RUNTIME_STATE_PATH": "/var/lib/trex-webui/runtime-state.json",
    "TREX_WEBUI_DAEMON_GENERATION_PATH": "/run/trex-webui/daemon-generation",
}
if any(not value for value in expected.values()):
    raise SystemExit("loaded API environment expectation is incomplete")

observed: dict[str, list[str]] = {}
try:
    entries = shlex.split(sys.argv[1], posix=True)
except ValueError as exc:
    raise SystemExit(f"loaded API environment is not parseable: {exc}")
for entry in entries:
    key, separator, value = entry.partition("=")
    if separator and key in expected:
        observed.setdefault(key, []).append(value)

for key, value in expected.items():
    values = observed.get(key, [])
    if values != [value]:
        actual = "missing" if not values else repr(values)
        raise SystemExit(
            f"loaded API environment mismatch for {key}: "
            f"expected {value!r}, got {actual}"
        )
PY
}

trex_assert_root_controlled_tree() {
  local tree="${1:-}"
  local label="${2:-tree}"
  [[ -n "$tree" ]] || trex_safety_error "$label path is empty" || return
  command -v python3 >/dev/null 2>&1 || \
    trex_safety_error "python3 is required to inspect $label" || return

  python3 - "$tree" "$label" <<'PY'
from __future__ import annotations

import os
import stat
import sys
from pathlib import Path


tree = Path(sys.argv[1])
label = sys.argv[2]


def fail(message: str) -> None:
    raise SystemExit(f"{label} is not root-controlled: {message}")


def check_owned_readonly(path: Path, *, allow_link: bool = False) -> os.stat_result:
    try:
        metadata = path.lstat()
    except OSError as exc:
        fail(f"cannot inspect {path}: {exc}")
    if metadata.st_uid != 0:
        fail(f"{path} is not owned by root")
    if stat.S_ISLNK(metadata.st_mode):
        if allow_link:
            return metadata
        fail(f"{path} is a symbolic-link path component")
    if metadata.st_mode & 0o022:
        fail(f"{path} is writable by group or other")
    return metadata


absolute = tree.absolute()
current = Path("/")
check_owned_readonly(current)
for part in absolute.parts[1:]:
    current /= part
    check_owned_readonly(current)

root_metadata = tree.lstat()
if not stat.S_ISDIR(root_metadata.st_mode):
    fail(f"{tree} is not a directory")

for directory, directory_names, file_names in os.walk(tree, followlinks=False):
    directory_path = Path(directory)
    for name in [*directory_names, *file_names]:
        path = directory_path / name
        metadata = check_owned_readonly(path, allow_link=True)
        if stat.S_ISLNK(metadata.st_mode):
            try:
                target = Path(os.path.realpath(path))
            except OSError as exc:
                fail(f"cannot resolve symbolic link {path}: {exc}")

            # A missing target is safe only while its nearest existing parent
            # remains root-owned and non-writable. This accommodates optional
            # upstream build artifacts without granting an unprivileged writer
            # a future root execution path.
            existing = target
            while not os.path.lexists(existing):
                parent = existing.parent
                if parent == existing:
                    fail(f"symbolic link {path} has no inspectable target parent")
                existing = parent
            current = Path("/")
            check_owned_readonly(current)
            for part in existing.absolute().parts[1:]:
                current /= part
                check_owned_readonly(current)
            target_metadata = existing.lstat()
            if target.exists() and stat.S_ISDIR(target_metadata.st_mode):
                fail(f"symbolic link {path} points to a directory")
            if target.exists() and not stat.S_ISREG(target_metadata.st_mode):
                fail(f"symbolic link {path} points to a special file")
            continue
        if not (stat.S_ISDIR(metadata.st_mode) or stat.S_ISREG(metadata.st_mode)):
            fail(f"{path} is a special file")
PY
}

trex_assert_systemd_visible_path() {
  local path="${1:-}"
  local label="${2:-path}"
  case "$path" in
    /dev|/dev/*|/home|/home/*|/root|/root/*|/run/user|/run/user/*|/tmp|/tmp/*|/var/tmp|/var/tmp/*)
      trex_safety_error "$label is hidden by the managed API systemd sandbox: $path"
      return
      ;;
  esac
}

trex_assert_software_path() {
  local path="${1:-}"
  local label="${2:-software path}"
  case "$path" in
    /opt/*|/srv/*|/usr/local/*)
      ;;
    *)
      trex_safety_error "$label must be under /opt, /srv, or /usr/local: $path"
      return
      ;;
  esac
  trex_assert_systemd_visible_path "$path" "$label"
}

trex_canonical_path() {
  local input="${1:-}"
  local label="${2:-path}"
  [[ -n "$input" ]] || trex_safety_error "$label is empty" || return
  [[ "$input" != *[[:space:]]* ]] || trex_safety_error "$label must not contain whitespace" || return
  case "$input" in
    *[!A-Za-z0-9._/+-]*)
      trex_safety_error "$label contains a character unsafe for managed configuration: $input"
      return
      ;;
  esac
  command -v realpath >/dev/null 2>&1 || trex_safety_error "realpath is required" || return

  local canonical logical
  canonical="$(realpath -m -- "$input")" || trex_safety_error "cannot resolve $label: $input" || return
  logical="$(realpath -ms -- "$input")" || trex_safety_error "cannot normalize $label: $input" || return
  [[ "$canonical" == "$logical" ]] || trex_safety_error "$label contains a symbolic-link component: $input" || return
  [[ "$canonical" == /* ]] || trex_safety_error "$label did not resolve to an absolute path: $input" || return
  printf '%s\n' "$canonical"
}

trex_path_is_within() {
  local path="$1"
  local root="$2"
  [[ "$path" == "$root" || "$path" == "$root/"* ]]
}

trex_assert_not_broad_path() {
  local path="$1"
  local label="$2"
  case "$path" in
    /|/bin|/boot|/dev|/etc|/home|/lib|/lib64|/media|/mnt|/opt|/proc|/root|/run|/sbin|/srv|/sys|/tmp|/usr|/var|/var/backups|/var/log|/var/www)
      trex_safety_error "$label is too broad: $path"
      return
      ;;
  esac
}

trex_assert_root_controlled_authority_path() {
  local path="${1:-}"
  local label="${2:-managed authority path}"
  [[ -n "$path" ]] || trex_safety_error "$label is empty" || return
  command -v python3 >/dev/null 2>&1 || \
    trex_safety_error "python3 is required to validate $label" || return

  python3 - "$path" "$label" <<'PY'
from __future__ import annotations

import os
import stat
import sys
from pathlib import Path


path = Path(sys.argv[1])
label = sys.argv[2]
if not path.is_absolute():
    raise SystemExit(f"{label} must be absolute: {path}")

parts = path.parts
previous_metadata: os.stat_result | None = None
previous_component: Path | None = None
for index in range(1, len(parts) + 1):
    component = Path(*parts[:index])
    try:
        metadata = component.lstat()
    except FileNotFoundError:
        # Sticky directories protect existing root-owned entries, but do not
        # stop another user from creating a previously absent name.
        if previous_metadata is None or previous_metadata.st_mode & 0o022:
            raise SystemExit(
                f"{label} has a missing suffix below a writable authority "
                f"directory: {previous_component}"
            )
        break
    except OSError as exc:
        raise SystemExit(f"{label} is not inspectable at {component}: {exc}")

    if metadata.st_uid != 0:
        raise SystemExit(f"{label} is not root-controlled at {component}")
    if stat.S_ISLNK(metadata.st_mode):
        raise SystemExit(f"{label} has a symbolic-link component: {component}")

    is_last = index == len(parts)
    if not is_last and not stat.S_ISDIR(metadata.st_mode):
        raise SystemExit(f"{label} has a non-directory component: {component}")
    if is_last and not (
        stat.S_ISDIR(metadata.st_mode) or stat.S_ISREG(metadata.st_mode)
    ):
        raise SystemExit(f"{label} target is not a regular file or directory: {component}")

    if metadata.st_mode & 0o022:
        # Root-owned sticky directories such as /tmp do not let another user
        # rename or remove a root-owned child. This keeps root-created mktemp
        # fixtures safe without treating an ordinary writable parent as trust.
        if not (
            not is_last
            and stat.S_ISDIR(metadata.st_mode)
            and metadata.st_mode & stat.S_ISVTX
        ):
            raise SystemExit(
                f"{label} can be replaced by a non-root account at {component}"
            )
    previous_metadata = metadata
    previous_component = component
PY
}

trex_assert_managed_marker() {
  local owner="${1:-}"
  local marker="$owner/$TREX_MANAGED_MARKER_NAME"
  trex_assert_root_controlled_authority_path "$owner" "managed marker owner" || return
  command -v python3 >/dev/null 2>&1 || \
    trex_safety_error "python3 is required to validate managed marker" || return

  python3 - \
    "$marker" \
    "$TREX_MANAGED_MARKER_VALUE" \
    "$TREX_MANAGED_MARKER_MODE" <<'PY'
from __future__ import annotations

import os
import stat
import sys


path, expected_value, expected_mode_text = sys.argv[1:]
expected_mode = int(expected_mode_text, 8)
flags = os.O_RDONLY | os.O_CLOEXEC
if hasattr(os, "O_NONBLOCK"):
    flags |= os.O_NONBLOCK
if hasattr(os, "O_NOFOLLOW"):
    flags |= os.O_NOFOLLOW
try:
    descriptor = os.open(path, flags)
except OSError as exc:
    raise SystemExit(f"managed marker is missing or unsafe: {path}: {exc}")
try:
    metadata = os.fstat(descriptor)
    if not stat.S_ISREG(metadata.st_mode):
        raise SystemExit(f"managed marker must be a regular non-symlink file: {path}")
    if metadata.st_uid != 0 or metadata.st_gid != 0:
        raise SystemExit(f"managed marker must be owned by root:root: {path}")
    if stat.S_IMODE(metadata.st_mode) != expected_mode:
        raise SystemExit(
            f"managed marker mode must be {expected_mode_text}: {path}"
        )
    if metadata.st_nlink != 1:
        raise SystemExit(f"managed marker must have exactly one hard link: {path}")
    payload = os.read(descriptor, 4096)
    if os.read(descriptor, 1):
        raise SystemExit(f"managed marker is unexpectedly large: {path}")
finally:
    os.close(descriptor)

if payload != f"{expected_value}\n".encode("ascii"):
    raise SystemExit(f"managed marker has invalid content: {path}")
PY
}

trex_marker_owner() {
  local path="$1"
  local candidate="$path"
  if [[ ! -d "$candidate" ]]; then
    candidate="$(dirname -- "$candidate")"
  fi

  while [[ "$candidate" != "/" ]]; do
    local marker="$candidate/$TREX_MANAGED_MARKER_NAME"
    if [[ -e "$marker" || -L "$marker" ]]; then
      trex_assert_managed_marker "$candidate" || return
      printf '%s\n' "$candidate"
      return 0
    fi
    candidate="$(dirname -- "$candidate")"
  done
  return 1
}

trex_assert_managed_path() {
  local path="$1"
  local label="$2"
  shift 2
  trex_assert_not_broad_path "$path" "$label" || return

  local allowed_root
  for allowed_root in "$@"; do
    if trex_path_is_within "$path" "$allowed_root"; then
      return 0
    fi
  done

  local marker_owner
  marker_owner="$(trex_marker_owner "$path")" || {
    trex_safety_error "$label is outside the allowed prefixes and has no trusted $TREX_MANAGED_MARKER_NAME owner: $path"
    return
  }
  trex_path_is_within "$path" "$marker_owner" || trex_safety_error "$label escaped its managed marker owner: $path" || return
  trex_assert_root_controlled_authority_path "$path" "$label" || return
}

trex_assert_disjoint_paths() {
  local first="$1"
  local first_label="$2"
  local second="$3"
  local second_label="$4"
  if trex_path_is_within "$first" "$second" || trex_path_is_within "$second" "$first"; then
    trex_safety_error "$first_label and $second_label must not be equal, parent, or child paths: $first <> $second"
    return
  fi
}

trex_write_managed_marker() {
  local directory="$1"
  local canonical
  canonical="$(trex_canonical_path "$directory" "managed marker owner")" || return
  [[ "$canonical" == "$directory" ]] || \
    trex_safety_error "managed marker owner path must be canonical: $directory" || return
  [[ -d "$directory" ]] || trex_safety_error "cannot mark missing directory: $directory" || return
  [[ ! -L "$directory" ]] || trex_safety_error "cannot mark symbolic-link directory: $directory" || return
  trex_assert_root_controlled_authority_path "$directory" "managed marker owner" || return
  local marker="$directory/$TREX_MANAGED_MARKER_NAME"
  [[ ! -L "$marker" ]] || trex_safety_error "managed marker must not be a symbolic link: $marker" || return
  [[ ! -e "$marker" || -f "$marker" ]] || \
    trex_safety_error "managed marker target must be a regular file: $marker" || return
  local temporary_marker
  temporary_marker="$(mktemp --tmpdir="$directory" ".${TREX_MANAGED_MARKER_NAME}.new.XXXXXXXX")" || \
    trex_safety_error "cannot stage managed marker under $directory" || return
  if ! printf '%s\n' "$TREX_MANAGED_MARKER_VALUE" >"$temporary_marker" || \
    ! chown root:root "$temporary_marker" || \
    ! chmod "$TREX_MANAGED_MARKER_MODE" "$temporary_marker" || \
    ! mv -fT -- "$temporary_marker" "$marker"; then
    rm -f -- "$temporary_marker"
    trex_safety_error "cannot publish managed marker: $marker"
    return
  fi
  trex_assert_managed_marker "$directory"
}

trex_assert_plain_static_tree() {
  local tree="$1"
  local label="$2"
  [[ -d "$tree" && ! -L "$tree" ]] || trex_safety_error "$label must be a real directory: $tree" || return
  local unsafe_path
  unsafe_path="$(find -P "$tree" -mindepth 1 ! -type d ! -type f -print -quit)" || \
    trex_safety_error "cannot inspect $label: $tree" || return
  [[ -z "$unsafe_path" ]] || \
    trex_safety_error "$label contains a link or special file: $unsafe_path" || return
}

trex_secure_static_tree() {
  local tree="$1"
  local label="$2"
  trex_assert_plain_static_tree "$tree" "$label" || return
  chown -R root:root "$tree" || trex_safety_error "cannot secure ownership for $label: $tree" || return
  find -P "$tree" -type d -exec chmod 0755 '{}' + || \
    trex_safety_error "cannot secure directories for $label: $tree" || return
  find -P "$tree" -type f -exec chmod 0644 '{}' + || \
    trex_safety_error "cannot secure files for $label: $tree" || return
}

trex_atomic_exchange_directories() {
  local first="$1"
  local second="$2"
  if [[ "${DRY_RUN:-0}" -eq 1 ]]; then
    printf '+ atomically exchange directories %q and %q with renameat2(RENAME_EXCHANGE)\n' "$first" "$second"
    return 0
  fi
  command -v python3 >/dev/null 2>&1 || \
    trex_safety_error "python3 is required for atomic directory exchange" || return
  python3 - "$first" "$second" <<'PY'
from __future__ import annotations

import ctypes
import os
import stat
import sys


first, second = sys.argv[1:]
for path in (first, second):
    metadata = os.lstat(path)
    if not stat.S_ISDIR(metadata.st_mode):
        raise SystemExit(f"atomic exchange target is not a real directory: {path}")
if os.path.dirname(first) != os.path.dirname(second):
    raise SystemExit("atomic exchange targets must have the same parent directory")
if os.stat(first).st_dev != os.stat(second).st_dev:
    raise SystemExit("atomic exchange targets must be on the same filesystem")

libc = ctypes.CDLL(None, use_errno=True)
renameat2 = getattr(libc, "renameat2", None)
if renameat2 is None:
    raise SystemExit("renameat2 is unavailable; refusing a non-atomic directory switch")
renameat2.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
renameat2.restype = ctypes.c_int
at_fdcwd = -100
rename_exchange = 2
result = renameat2(
    at_fdcwd,
    os.fsencode(first),
    at_fdcwd,
    os.fsencode(second),
    rename_exchange,
)
if result != 0:
    error_number = ctypes.get_errno()
    raise OSError(error_number, os.strerror(error_number), f"{first} <-> {second}")
PY
}

trex_reject_mountpoint() {
  local path="$1"
  local label="$2"
  if command -v mountpoint >/dev/null 2>&1 && mountpoint -q -- "$path"; then
    trex_safety_error "$label must not be a mount point: $path"
    return
  fi
}

trex_safe_remove_tree() {
  local path="$1"
  local label="$2"
  shift 2
  [[ -e "$path" || -L "$path" ]] || return 0
  local canonical
  canonical="$(trex_canonical_path "$path" "$label")" || return
  trex_assert_managed_path "$canonical" "$label" "$@" || return
  trex_reject_mountpoint "$canonical" "$label" || return
  # Revalidate the marker and its non-replaceable authority chain immediately
  # before the destructive operation, rather than trusting an earlier layout
  # preflight.
  trex_assert_managed_path "$canonical" "$label" "$@" || return
  rm -rf -- "$canonical"
}

trex_safe_clear_directory() {
  local path="$1"
  local label="$2"
  shift 2
  local canonical
  canonical="$(trex_canonical_path "$path" "$label")" || return
  trex_assert_managed_path "$canonical" "$label" "$@" || return
  [[ -d "$canonical" ]] || trex_safety_error "$label is not a directory: $canonical" || return
  trex_reject_mountpoint "$canonical" "$label" || return
  trex_assert_managed_path "$canonical" "$label" "$@" || return

  local entry
  while IFS= read -r -d '' entry; do
    if [[ "$(basename -- "$entry")" == "$TREX_MANAGED_MARKER_NAME" ]]; then
      continue
    fi
    trex_reject_mountpoint "$entry" "$label child" || return
    rm -rf -- "$entry"
  done < <(find "$canonical" -mindepth 1 -maxdepth 1 -print0)
}

trex_assert_deployment_lock_parent() {
  local parent="$1"
  [[ -d "$parent" && ! -L "$parent" ]] || \
    trex_safety_error "deployment lock parent must be a real directory: $parent" || return
  [[ "$(stat -c '%u' -- "$parent")" == "0" ]] || \
    trex_safety_error "deployment lock parent must be owned by root: $parent" || return
  [[ "$(stat -c '%g' -- "$parent")" == "0" ]] || \
    trex_safety_error "deployment lock parent group must be root: $parent" || return
  [[ "$(stat -c '%a' -- "$parent")" == "700" ]] || \
    trex_safety_error "deployment lock parent mode must be 0700: $parent" || return
}

trex_assert_deployment_lock_file() {
  local lock_path="$1"
  [[ -f "$lock_path" && ! -L "$lock_path" ]] || \
    trex_safety_error "deployment lock must be a regular file: $lock_path" || return
  [[ "$(stat -c '%u' -- "$lock_path")" == "0" ]] || \
    trex_safety_error "deployment lock must be owned by root: $lock_path" || return
  [[ "$(stat -c '%g' -- "$lock_path")" == "0" ]] || \
    trex_safety_error "deployment lock group must be root: $lock_path" || return
  [[ "$(stat -c '%a' -- "$lock_path")" == "600" ]] || \
    trex_safety_error "deployment lock mode must be 0600: $lock_path" || return
  [[ "$(stat -c '%h' -- "$lock_path")" == "1" ]] || \
    trex_safety_error "deployment lock must not have hard links: $lock_path" || return
}

trex_resolve_deployment_lock_path() {
  local requested_path="${TREX_WEBUI_DEPLOY_LOCK_PATH:-$TREX_DEPLOY_LOCK_DEFAULT_PATH}"
  local lock_path
  lock_path="$(trex_canonical_path "$requested_path" "deployment lock path")" || return

  if [[ "$lock_path" != "$TREX_DEPLOY_LOCK_DEFAULT_PATH" ]]; then
    trex_assert_managed_path "$lock_path" "deployment lock path" || return
  fi
  printf '%s\n' "$lock_path"
}

trex_prepare_deployment_lock_file() {
  local lock_path="$1"
  local lock_parent
  lock_parent="$(dirname -- "$lock_path")"

  if [[ ! -e "$lock_parent" && ! -L "$lock_parent" ]]; then
    install -d -m 0700 -o root -g root -- "$lock_parent" || \
      trex_safety_error "cannot create deployment lock parent: $lock_parent" || return
  fi
  trex_assert_deployment_lock_parent "$lock_parent" || return

  if [[ ! -e "$lock_path" && ! -L "$lock_path" ]]; then
    if (umask 077; set -o noclobber; : >"$lock_path") 2>/dev/null; then
      chown root:root -- "$lock_path" || \
        trex_safety_error "cannot secure deployment lock ownership: $lock_path" || return
      chmod 0600 -- "$lock_path" || \
        trex_safety_error "cannot secure deployment lock mode: $lock_path" || return
    elif [[ ! -e "$lock_path" && ! -L "$lock_path" ]]; then
      trex_safety_error "cannot create deployment lock: $lock_path"
      return
    fi
  fi
  trex_assert_deployment_lock_file "$lock_path"
}

trex_validate_inherited_deployment_lock() {
  local lock_path="$1"
  local inherited_fd="${TREX_WEBUI_DEPLOY_LOCK_FD:-}"
  local inherited_protocol="${TREX_WEBUI_DEPLOY_LOCK_PROTOCOL:-}"

  [[ "$inherited_protocol" == "$TREX_DEPLOY_LOCK_PROTOCOL_VERSION" ]] || \
    trex_safety_error "inherited deployment lock protocol is invalid" || return
  [[ "$inherited_fd" =~ ^[0-9]+$ ]] && \
    [[ "$inherited_fd" != "0" && "$inherited_fd" != "1" && "$inherited_fd" != "2" ]] || \
    trex_safety_error "inherited deployment lock FD is invalid" || return
  [[ -e "/proc/self/fd/$inherited_fd" ]] || \
    trex_safety_error "inherited deployment lock FD is closed: $inherited_fd" || return

  trex_assert_deployment_lock_parent "$(dirname -- "$lock_path")" || return
  trex_assert_deployment_lock_file "$lock_path" || return
  [[ -f "/proc/self/fd/$inherited_fd" ]] || \
    trex_safety_error "inherited deployment lock FD is not a regular file: $inherited_fd" || return
  [[ "$(stat -Lc '%u' -- "/proc/self/fd/$inherited_fd")" == "0" ]] || \
    trex_safety_error "inherited deployment lock FD is not root-owned: $inherited_fd" || return
  [[ "$(stat -Lc '%g' -- "/proc/self/fd/$inherited_fd")" == "0" ]] || \
    trex_safety_error "inherited deployment lock FD group is not root: $inherited_fd" || return
  [[ "$(stat -Lc '%h' -- "/proc/self/fd/$inherited_fd")" == "1" ]] || \
    trex_safety_error "inherited deployment lock FD refers to a hard-linked file: $inherited_fd" || return
  [[ "$(stat -Lc '%a' -- "/proc/self/fd/$inherited_fd")" == "600" ]] || \
    trex_safety_error "inherited deployment lock FD mode is not 0600: $inherited_fd" || return

  local path_identity fd_identity
  path_identity="$(stat -c '%d:%i' -- "$lock_path")" || \
    trex_safety_error "cannot inspect deployment lock identity: $lock_path" || return
  fd_identity="$(stat -Lc '%d:%i' -- "/proc/self/fd/$inherited_fd")" || \
    trex_safety_error "cannot inspect inherited deployment lock FD identity: $inherited_fd" || return
  [[ "$fd_identity" == "$path_identity" ]] || \
    trex_safety_error "inherited deployment lock FD does not match lock path" || return

  flock -n "$inherited_fd" || \
    trex_safety_error "inherited deployment lock FD does not own the deployment lock" || return
}

trex_acquire_deployment_lock() {
  [[ "$EUID" == "0" ]] || trex_safety_error "deployment lock requires root" || return
  command -v flock >/dev/null 2>&1 || trex_safety_error "flock is required" || return
  command -v stat >/dev/null 2>&1 || trex_safety_error "stat is required" || return

  local lock_path
  lock_path="$(trex_resolve_deployment_lock_path)" || return

  if [[ -n "${TREX_WEBUI_DEPLOY_LOCK_FD:-}" || -n "${TREX_WEBUI_DEPLOY_LOCK_PROTOCOL:-}" ]]; then
    [[ -n "${TREX_WEBUI_DEPLOY_LOCK_FD:-}" && -n "${TREX_WEBUI_DEPLOY_LOCK_PROTOCOL:-}" ]] || \
      trex_safety_error "inherited deployment lock environment is incomplete" || return
    trex_validate_inherited_deployment_lock "$lock_path" || return
  else
    trex_prepare_deployment_lock_file "$lock_path" || return
    unset TREX_WEBUI_DEPLOY_LOCK_FD
    exec {TREX_WEBUI_DEPLOY_LOCK_FD}<"$lock_path" || \
      trex_safety_error "cannot open deployment lock: $lock_path" || return
    TREX_WEBUI_DEPLOY_LOCK_PROTOCOL="$TREX_DEPLOY_LOCK_PROTOCOL_VERSION"
    if ! trex_validate_inherited_deployment_lock "$lock_path"; then
      local opened_fd="$TREX_WEBUI_DEPLOY_LOCK_FD"
      exec {opened_fd}<&-
      unset TREX_WEBUI_DEPLOY_LOCK_FD
      unset TREX_WEBUI_DEPLOY_LOCK_PROTOCOL
      return 1
    fi
  fi

  TREX_WEBUI_DEPLOY_LOCK_PATH="$lock_path"
  TREX_WEBUI_DEPLOY_LOCK_PROTOCOL="$TREX_DEPLOY_LOCK_PROTOCOL_VERSION"
  export TREX_WEBUI_DEPLOY_LOCK_FD
  export TREX_WEBUI_DEPLOY_LOCK_PATH
  export TREX_WEBUI_DEPLOY_LOCK_PROTOCOL
}
