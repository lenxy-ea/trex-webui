#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
[[ -f "$SCRIPT_DIR/path_safety.sh" ]] || { printf 'error: missing %s/path_safety.sh\n' "$SCRIPT_DIR" >&2; exit 1; }
# shellcheck source=deploy/path_safety.sh
source "$SCRIPT_DIR/path_safety.sh"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WEB_ROOT="/var/www/trex-webui/dist"
BASE_URL="http://127.0.0.1"
TIMEOUT_SECONDS=8
CHECK_SYSTEMD=1
CHECK_DAEMON=1
CHECK_SSE=1
CHECK_TREX=0
DAEMON_RPC_HOST="127.0.0.1"
DAEMON_RPC_PORT="8090"
DAEMON_RPC_URL="http://127.0.0.1:8090"
DAEMON_LOG="/var/log/trex/trex_daemon_server.log"
DAEMON_UNIT="/etc/systemd/system/trex-daemon-server.service"
DAEMON_LOGROTATE="/etc/logrotate.d/trex-daemon-server"
DAEMON_LIBEXEC_ROOT="${DAEMON_LIBEXEC_ROOT:-/usr/libexec/trex-webui}"
DAEMON_SUPERVISOR="${DAEMON_SUPERVISOR_TARGET:-$DAEMON_LIBEXEC_ROOT/trex_daemon_supervisor.py}"
DAEMON_RPC_PROBE="${DAEMON_RPC_PROBE_TARGET:-$DAEMON_LIBEXEC_ROOT/daemon_rpc_probe.py}"
DAEMON_NATIVE_BOUNDARY="${DAEMON_NATIVE_BOUNDARY_TARGET:-$DAEMON_LIBEXEC_ROOT/trex_native_boundary.sh}"
DAEMON_GENERATION="/run/trex-webui/daemon-generation"
NFTABLES_CONFIG="${NFTABLES_CONFIG_PATH:-/etc/sysconfig/nftables.conf}"
NFTABLES_DROPIN_ROOT="${NFTABLES_SYSTEMD_DROPIN_ROOT:-/etc/systemd/system/nftables.service.d}"
NFTABLES_DROPIN="${NFTABLES_SYSTEMD_DROPIN_TARGET:-$NFTABLES_DROPIN_ROOT/trex-webui-native-boundary.conf}"
API_ENV_FILE="$TREX_MANAGED_API_ENV_FILE_DEFAULT"
API_PROC_ROOT="/proc"
API_UNIT="/etc/systemd/system/trex-webui-api.service"
API_VENV_RELEASE_MARKER_NAME=".trex-webui-venv-release"
API_VENV_RUNTIME_MARKER_NAME=".trex-webui-venv-runtime"
API_VENV_RUNTIME_MARKER_VALUE="trex-webui-venv-runtime-v1"
VERIFIED_API_MAIN_PID=""
VERIFIED_API_RUNTIME=""
VERIFIED_API_NEED_RELOAD=""
VERIFIED_API_DISK_READONLY=""
VERIFIED_API_DISK_READWRITE=""
VERIFIED_DAEMON_SCRIPTS_DIR=""
VERIFIED_DAEMON_BIN=""
VERIFIED_PROFILE_ROOTS=""

usage() {
  cat <<'USAGE'
Usage: deploy/verify.sh [options]

Verify an installed TRex WebUI LAN deployment.

Options:
  --base-url URL       WebUI URL to verify. Default: http://127.0.0.1
  --project-root PATH  Project or extracted package root. Default: script parent directory
  --web-root PATH      Nginx static dist path. Default: /var/www/trex-webui/dist
  --timeout SECONDS    HTTP timeout. Default: 8
  --skip-systemd       Do not check systemd service states
  --skip-daemon        Do not check the managed daemon unit, loopback listener, RPC, or log permissions
  --skip-sse           Do not check the stats SSE proxy endpoint
  --trex               Also verify /api/system/overview succeeds against real TRex
  -h, --help           Show this help
USAGE
}

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

log() {
  printf '==> %s\n' "$*"
}

pass() {
  printf 'ok: %s\n' "$*"
}

have_cmd() {
  command -v "$1" >/dev/null 2>&1
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --base-url)
        BASE_URL="${2:-}"
        [[ -n "$BASE_URL" ]] || die "--base-url requires a value"
        shift 2
        ;;
      --project-root)
        PROJECT_ROOT="${2:-}"
        [[ -n "$PROJECT_ROOT" ]] || die "--project-root requires a value"
        shift 2
        ;;
      --web-root)
        WEB_ROOT="${2:-}"
        [[ -n "$WEB_ROOT" ]] || die "--web-root requires a value"
        shift 2
        ;;
      --timeout)
        TIMEOUT_SECONDS="${2:-}"
        [[ "$TIMEOUT_SECONDS" =~ ^[1-9][0-9]*$ ]] || die "--timeout must be a positive integer"
        shift 2
        ;;
      --skip-systemd)
        CHECK_SYSTEMD=0
        shift
        ;;
      --skip-daemon)
        CHECK_DAEMON=0
        shift
        ;;
      --skip-sse)
        CHECK_SSE=0
        shift
        ;;
      --trex)
        CHECK_TREX=1
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        die "unknown option: $1"
        ;;
    esac
  done
}

url_join() {
  local base="${1%/}"
  local path="$2"
  printf '%s/%s' "$base" "${path#/}"
}

curl_body() {
  local url="$1"
  curl -fsS --connect-timeout "$TIMEOUT_SECONDS" --max-time "$TIMEOUT_SECONDS" "$url"
}

curl_head() {
  local url="$1"
  curl -fsSI --connect-timeout "$TIMEOUT_SECONDS" --max-time "$TIMEOUT_SECONDS" "$url"
}

assert_managed_units_reloaded() {
  local api_need_reload="${1:-}"
  local daemon_need_reload="${2:-}"
  [[ "$api_need_reload" == "no" ]] || {
    printf 'path authority error: trex-webui-api.service has unapplied on-disk unit changes\n' >&2
    return 1
  }
  if [[ -n "$daemon_need_reload" ]]; then
    [[ "$daemon_need_reload" == "no" ]] || {
      printf 'path authority error: trex-daemon-server.service has unapplied on-disk unit changes\n' >&2
      return 1
    }
  fi
}

api_service_contract_error() {
  printf 'API service contract error: %s\n' "$*" >&2
  return 1
}

assert_api_runtime_tree() {
  local runtime_root="${1:-}"
  local label="${2:-API runtime}"
  command -v python3 >/dev/null 2>&1 || {
    api_service_contract_error "python3 is required to inspect $label"
    return
  }

  python3 - "$runtime_root" "$label" <<'PY'
from __future__ import annotations

import os
import stat
import sys
from pathlib import Path


root = Path(sys.argv[1])
label = sys.argv[2]
maximum_entries = 250_000


def fail(message: str) -> None:
    raise SystemExit(f"{label} is not root-controlled: {message}")


def inspect_entry(path: Path, *, allow_symlink: bool = True) -> os.stat_result:
    try:
        metadata = path.lstat()
    except OSError as exc:
        fail(f"cannot inspect {path}: {exc}")
    if metadata.st_uid != 0 or metadata.st_gid != 0:
        fail(f"{path} is not owned by root:root")
    if stat.S_ISLNK(metadata.st_mode):
        if not allow_symlink:
            fail(f"{path} is a symbolic-link path component")
        return metadata
    if metadata.st_mode & 0o022:
        fail(f"{path} is writable by group or other")
    if not (stat.S_ISDIR(metadata.st_mode) or stat.S_ISREG(metadata.st_mode)):
        fail(f"{path} is a special file")
    return metadata


def inspect_resolved_target(link: Path) -> None:
    try:
        target = Path(os.path.realpath(link))
    except OSError as exc:
        fail(f"cannot resolve symbolic link {link}: {exc}")
    if not target.exists():
        fail(f"symbolic link {link} has a missing target: {target}")
    current = Path("/")
    inspect_entry(current, allow_symlink=False)
    for part in target.absolute().parts[1:]:
        current /= part
        inspect_entry(current, allow_symlink=False)
    target_metadata = target.stat()
    if not (
        stat.S_ISDIR(target_metadata.st_mode)
        or stat.S_ISREG(target_metadata.st_mode)
    ):
        fail(f"symbolic link {link} points to a special file: {target}")
    if stat.S_ISDIR(target_metadata.st_mode):
        try:
            target.relative_to(root)
        except ValueError:
            fail(f"directory symbolic link {link} escapes the runtime: {target}")


root_metadata = inspect_entry(root, allow_symlink=False)
if not stat.S_ISDIR(root_metadata.st_mode):
    fail(f"{root} is not a directory")

entries = 0
for directory, directory_names, file_names in os.walk(root, followlinks=False):
    directory_path = Path(directory)
    for name in [*directory_names, *file_names]:
        entries += 1
        if entries > maximum_entries:
            fail(f"{root} exceeds the {maximum_entries}-entry inspection limit")
        path = directory_path / name
        metadata = inspect_entry(path)
        if stat.S_ISLNK(metadata.st_mode):
            inspect_resolved_target(path)
PY
}

assert_api_versioned_runtime_markers() {
  local runtime_root="${1:-}"
  local runtime_suffix="${2:-}"
  command -v python3 >/dev/null 2>&1 || {
    api_service_contract_error "python3 is required to inspect API runtime markers"
    return
  }
  trex_assert_managed_marker "$runtime_root" || return

  python3 - \
    "$runtime_root/$API_VENV_RUNTIME_MARKER_NAME" \
    "$API_VENV_RUNTIME_MARKER_VALUE" \
    "$runtime_root/$API_VENV_RELEASE_MARKER_NAME" \
    "trex-webui-venv-release-$runtime_suffix" <<'PY'
from __future__ import annotations

import os
import stat
import sys


def read_marker(path: str, expected: str) -> None:
    flags = os.O_RDONLY | os.O_CLOEXEC
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        descriptor = os.open(path, flags)
    except OSError as exc:
        raise SystemExit(f"API runtime marker is missing or unsafe: {path}: {exc}")
    try:
        metadata = os.fstat(descriptor)
        if not stat.S_ISREG(metadata.st_mode):
            raise SystemExit(f"API runtime marker must be a regular file: {path}")
        if metadata.st_uid != 0 or metadata.st_gid != 0:
            raise SystemExit(f"API runtime marker must be owned by root:root: {path}")
        if stat.S_IMODE(metadata.st_mode) != 0o644:
            raise SystemExit(f"API runtime marker mode must be 0644: {path}")
        if metadata.st_nlink != 1:
            raise SystemExit(f"API runtime marker must have one hard link: {path}")
        payload = os.read(descriptor, 4096)
        if os.read(descriptor, 1):
            raise SystemExit(f"API runtime marker is unexpectedly large: {path}")
    finally:
        os.close(descriptor)
    if payload != f"{expected}\n".encode("ascii"):
        raise SystemExit(f"API runtime marker has invalid content: {path}")


read_marker(sys.argv[1], sys.argv[2])
read_marker(sys.argv[3], sys.argv[4])
PY
}

assert_api_runtime_exec() {
  local exec_path="${1:-}"
  local project_root="${2:-}"
  local label="${3:-API runtime}"
  local runtime_root runtime_suffix=""

  if [[ "$exec_path" == "$project_root/.venv/bin/python" ]]; then
    runtime_root="$project_root/.venv"
  else
    case "$exec_path" in
      "$project_root"/.venv.runtime-*/bin/python)
        runtime_root="${exec_path%/bin/python}"
        runtime_suffix="${runtime_root#"$project_root/.venv.runtime-"}"
        [[ "$runtime_suffix" =~ ^[0-9]{8}T[0-9]{6}Z-[1-9][0-9]*$ ]] || {
          api_service_contract_error \
            "$label has an invalid versioned runtime path: $exec_path"
          return
        }
        ;;
      *)
        api_service_contract_error \
          "$label points outside supported project virtualenvs: ${exec_path:-missing}"
        return
        ;;
    esac
  fi

  [[ -d "$runtime_root" && ! -L "$runtime_root" ]] || {
    api_service_contract_error "$label runtime root is missing or unsafe: $runtime_root"
    return
  }
  [[ -x "$exec_path" ]] || {
    api_service_contract_error "$label interpreter is missing or not executable: $exec_path"
    return
  }
  trex_assert_root_controlled_authority_path "$runtime_root" "$label runtime root" || return
  assert_api_runtime_tree "$runtime_root" "$label runtime tree" || return
  if [[ -n "$runtime_suffix" ]]; then
    assert_api_versioned_runtime_markers "$runtime_root" "$runtime_suffix" || return
  fi
}

parse_loaded_exec_value() {
  local value="${1:-}"
  local path_name="$2"
  local argv_name="$3"
  local -n path_ref="$path_name"
  local -n argv_ref="$argv_name"

  [[ -n "$value" && "$value" != *$'\n'* ]] || return 1
  path_ref="$(sed -n 's/^[^{]*{[[:space:]]*path=\([^ ;}]*\)[[:space:]]*;.*/\1/p' <<<"$value")"
  argv_ref="$(sed -n \
    's/^[^{]*{[^}]*[[:space:]]argv\[\]=\(.*\)[[:space:]];[[:space:]]ignore_errors=.*/\1/p' \
    <<<"$value")"
  [[ "$path_ref" == /* && -n "$argv_ref" ]]
}

assert_api_main_pid_command() {
  local cmdline_path="${1:-}"
  local expected_exec="${2:-}"
  local project_root="${3:-}"
  command -v python3 >/dev/null 2>&1 || {
    api_service_contract_error "python3 is required to inspect API MainPID"
    return
  }

  python3 - "$cmdline_path" "$expected_exec" "$project_root" <<'PY'
from __future__ import annotations

import os
import stat
import sys


path, expected_exec, project_root = sys.argv[1:]
flags = os.O_RDONLY | os.O_CLOEXEC
if hasattr(os, "O_NOFOLLOW"):
    flags |= os.O_NOFOLLOW
try:
    descriptor = os.open(path, flags)
except OSError as exc:
    raise SystemExit(f"API MainPID cmdline is not inspectable: {path}: {exc}")
try:
    metadata = os.fstat(descriptor)
    if not stat.S_ISREG(metadata.st_mode):
        raise SystemExit(f"API MainPID cmdline is not a regular proc file: {path}")
    payload = b""
    while len(payload) <= 1024 * 1024:
        chunk = os.read(descriptor, 65536)
        if not chunk:
            break
        payload += chunk
    if len(payload) > 1024 * 1024:
        raise SystemExit(f"API MainPID cmdline exceeds the inspection limit: {path}")
finally:
    os.close(descriptor)

raw_arguments = payload.split(b"\0")
if raw_arguments and raw_arguments[-1] == b"":
    raw_arguments.pop()
if not raw_arguments or any(not argument for argument in raw_arguments):
    raise SystemExit("API MainPID cmdline contains missing arguments")
try:
    arguments = [argument.decode("utf-8") for argument in raw_arguments]
except UnicodeDecodeError as exc:
    raise SystemExit(f"API MainPID cmdline is not valid UTF-8: {exc}")
expected = [
    expected_exec,
    "-m",
    "uvicorn",
    "app.main:app",
    "--app-dir",
    f"{project_root}/apps/api",
    "--host",
    "127.0.0.1",
    "--port",
    "8080",
]
if arguments != expected:
    raise SystemExit(
        f"API MainPID command mismatch: expected {expected!r}, got {arguments!r}"
    )
PY
}

normalize_systemd_path_list() {
  local value="${1:-}"
  local result_name="$2"
  local -n result_ref="$result_name"
  local raw path
  local raw_paths=()
  result_ref=()
  read -r -a raw_paths <<<"$value"
  for raw in "${raw_paths[@]}"; do
    path="$raw"
    [[ "$path" != [+\!]* ]] || {
      api_service_contract_error "systemd path uses an unsafe prefix: $raw"
      return
    }
    if [[ "$path" == -* ]]; then
      path="${path#-}"
    fi
    [[ "$path" == /* ]] || {
      api_service_contract_error "systemd path is not absolute: $raw"
      return
    }
    path="$(trex_canonical_path "$path" "systemd sandbox path")" || return
    result_ref+=("$path")
  done
}

assert_api_sandbox_paths() {
  local readonly_value="${1:-}"
  local readwrite_value="${2:-}"
  local project_root="${3:-}"
  local readonly_paths=() readwrite_paths=()
  local path protected marker_owner project_present=0

  normalize_systemd_path_list "$readonly_value" readonly_paths || return
  normalize_systemd_path_list "$readwrite_value" readwrite_paths || return
  [[ "${#readonly_paths[@]}" -gt 0 ]] || {
    api_service_contract_error "ReadOnlyPaths is empty"
    return
  }
  [[ "${#readwrite_paths[@]}" -gt 0 ]] || {
    api_service_contract_error "ReadWritePaths is empty"
    return
  }

  for path in "${readonly_paths[@]}"; do
    [[ "$path" != "$project_root" ]] || project_present=1
  done
  [[ "$project_present" -eq 1 ]] || {
    api_service_contract_error "ReadOnlyPaths does not protect project root $project_root"
    return
  }

  for path in "${readwrite_paths[@]}"; do
    trex_assert_not_broad_path "$path" "API writable sandbox path" || return
    trex_assert_systemd_visible_path "$path" "API writable sandbox path" || return
    for protected in "${readonly_paths[@]}"; do
      if trex_path_is_within "$path" "$protected" || \
        trex_path_is_within "$protected" "$path"; then
        api_service_contract_error \
          "ReadWritePaths overlaps protected source path: $path <> $protected"
        return
      fi
    done

    if trex_path_is_within "$path" "/var/lib/trex-webui" || \
      trex_path_is_within "$path" "/var/log/trex/captures" || \
      trex_path_is_within "$path" "/var/log/trex/reports" || \
      trex_path_is_within "$path" "/var/log/trex/config-versions"; then
      continue
    fi
    marker_owner="$(trex_marker_owner "$path")" || {
      api_service_contract_error \
        "custom ReadWritePaths entry has no trusted managed owner: $path"
      return
    }
    trex_assert_not_broad_path "$marker_owner" "custom API writable authority" || return
    trex_path_is_within "$path" "$marker_owner" || {
      api_service_contract_error \
        "custom ReadWritePaths entry escaped its managed owner: $path"
      return
    }
  done
}

unit_exact_line() {
  local unit_path="$1"
  local expected="$2"
  [[ "$(grep -Fxc -- "$expected" "$unit_path")" -eq 1 ]]
}

assert_api_disk_unit_contract() {
  local project_root="${1:-}"
  local unit_path="${2:-}"
  local start_lines=() pre_lines=() readonly_lines=() readwrite_lines=()
  local start_exec expected_start expected_pre line

  [[ -f "$unit_path" && ! -L "$unit_path" ]] || {
    api_service_contract_error "on-disk API unit is missing or unsafe: $unit_path"
    return
  }
  [[ "$(stat -c '%u:%g %a %h' "$unit_path")" == "0:0 644 1" ]] || {
    api_service_contract_error "on-disk API unit must be root:root 0644 with one hard link"
    return
  }
  trex_assert_root_controlled_authority_path "$unit_path" "on-disk API unit" || return

  for line in \
    "User=trex-webui" \
    "Group=trex-webui" \
    "WorkingDirectory=$project_root" \
    "Type=simple" \
    "Restart=on-failure" \
    "UMask=0027" \
    "NoNewPrivileges=true" \
    "CapabilityBoundingSet=" \
    "AmbientCapabilities=" \
    "PrivateTmp=true" \
    "PrivateDevices=true" \
    "DevicePolicy=closed" \
    "ProtectSystem=strict" \
    "ProtectHome=true" \
    "ProtectHostname=true" \
    "ProtectClock=true" \
    "ProtectKernelTunables=true" \
    "ProtectKernelModules=true" \
    "ProtectKernelLogs=true" \
    "ProtectControlGroups=true" \
    "ProtectProc=invisible" \
    "ProcSubset=pid" \
    "RestrictNamespaces=true" \
    "RestrictRealtime=true" \
    "RestrictSUIDSGID=true" \
    "LockPersonality=true" \
    "RemoveIPC=true" \
    "KeyringMode=private" \
    "SystemCallArchitectures=native" \
    "SystemCallFilter=~@clock @cpu-emulation @debug @module @mount @obsolete @privileged @raw-io @reboot @swap" \
    "SystemCallErrorNumber=EPERM"; do
    unit_exact_line "$unit_path" "$line" || {
      api_service_contract_error \
        "on-disk API unit is missing the exact security directive: $line"
      return
    }
  done

  mapfile -t start_lines < <(sed -n 's/^ExecStart=//p' "$unit_path")
  mapfile -t pre_lines < <(sed -n 's/^ExecStartPre=//p' "$unit_path")
  mapfile -t readonly_lines < <(sed -n 's/^ReadOnlyPaths=//p' "$unit_path")
  mapfile -t readwrite_lines < <(sed -n 's/^ReadWritePaths=//p' "$unit_path")
  [[ "${#start_lines[@]}" -eq 1 && "${#pre_lines[@]}" -eq 1 && \
    "${#readonly_lines[@]}" -eq 1 && "${#readwrite_lines[@]}" -eq 1 ]] || {
    api_service_contract_error \
      "on-disk API unit must have one ExecStart, ExecStartPre, ReadOnlyPaths, and ReadWritePaths"
    return
  }
  start_exec="${start_lines[0]%% *}"
  expected_start="$start_exec -m uvicorn app.main:app --app-dir $project_root/apps/api --host 127.0.0.1 --port 8080"
  expected_pre="$start_exec -c \"import fastapi, httptools, uvicorn, uvicorn.supervisors.statreload, uvloop, watchfiles.run, websockets\""
  [[ "${start_lines[0]}" == "$expected_start" && "${pre_lines[0]}" == "$expected_pre" ]] || {
    api_service_contract_error \
      "on-disk API ExecStartPre/ExecStart does not match the loopback uvicorn contract"
    return
  }
  unit_exact_line "$unit_path" "RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6" || {
    api_service_contract_error \
      "on-disk API unit has an unexpected RestrictAddressFamilies contract"
    return
  }
  assert_api_sandbox_paths \
    "${readonly_lines[0]}" \
    "${readwrite_lines[0]}" \
    "$project_root" || return
  VERIFIED_API_DISK_READONLY="${readonly_lines[0]}"
  VERIFIED_API_DISK_READWRITE="${readwrite_lines[0]}"
  assert_api_runtime_exec "$start_exec" "$project_root" "on-disk API unit" || return
  VERIFIED_API_RUNTIME="$start_exec"
}

assert_systemd_path_subset() {
  local required_value="${1:-}"
  local observed_value="${2:-}"
  local label="${3:-systemd path authority}"
  local required=() observed=()
  local path candidate found

  normalize_systemd_path_list "$required_value" required || return
  normalize_systemd_path_list "$observed_value" observed || return
  for path in "${required[@]}"; do
    found=0
    for candidate in "${observed[@]}"; do
      if [[ "$path" == "$candidate" ]]; then
        found=1
        break
      fi
    done
    [[ "$found" -eq 1 ]] || {
      api_service_contract_error \
        "loaded $label dropped the on-disk path authority: $path"
      return
    }
  done
}

assert_api_loaded_sandbox_contract() {
  local project_root="${1:-}"
  local property value
  local -A expected=(
    [Type]="simple"
    [User]="trex-webui"
    [Group]="trex-webui"
    [WorkingDirectory]="$project_root"
    [Restart]="on-failure"
    [UMask]="0027"
    [NoNewPrivileges]="yes"
    [CapabilityBoundingSet]=""
    [AmbientCapabilities]=""
    [PrivateTmp]="yes"
    [PrivateDevices]="yes"
    [DevicePolicy]="closed"
    [ProtectSystem]="strict"
    [ProtectHome]="yes"
    [ProtectHostname]="yes"
    [ProtectClock]="yes"
    [ProtectKernelTunables]="yes"
    [ProtectKernelModules]="yes"
    [ProtectKernelLogs]="yes"
    [ProtectControlGroups]="yes"
    [ProtectProc]="invisible"
    [ProcSubset]="pid"
    [RestrictNamespaces]="yes"
    [RestrictRealtime]="yes"
    [RestrictSUIDSGID]="yes"
    [LockPersonality]="yes"
    [RemoveIPC]="yes"
    [KeyringMode]="private"
    [SystemCallArchitectures]="native"
  )

  for property in "${!expected[@]}"; do
    value="$(systemctl show trex-webui-api.service --property="$property" --value)" || {
      api_service_contract_error "unable to inspect loaded API $property"
      return
    }
    [[ "$value" == "${expected[$property]}" ]] || {
      api_service_contract_error \
        "loaded API $property mismatch: expected ${expected[$property]@Q}, got ${value@Q}"
      return
    }
  done

  value="$(
    systemctl show trex-webui-api.service --property=RestrictAddressFamilies --value
  )" || {
    api_service_contract_error "unable to inspect loaded API RestrictAddressFamilies"
    return
  }
  API_AF_VALUE="$value" python3 - <<'PY' || {
import os

actual = os.environ["API_AF_VALUE"].split()
expected = ["AF_INET", "AF_INET6", "AF_UNIX"]
if sorted(actual) != expected or len(actual) != len(set(actual)):
    raise SystemExit(
        f"loaded API RestrictAddressFamilies mismatch: expected {expected!r}, "
        f"got {actual!r}"
    )
PY
    return
  }

  value="$(
    systemctl show trex-webui-api.service --property=SystemCallErrorNumber --value
  )" || {
    api_service_contract_error "unable to inspect loaded API SystemCallErrorNumber"
    return
  }
  [[ "$value" == "1" || "$value" == "EPERM" ]] || {
    api_service_contract_error \
      "loaded API SystemCallErrorNumber must fail denied calls with EPERM"
    return
  }
  value="$(
    systemctl show trex-webui-api.service --property=SystemCallFilter --value
  )" || {
    api_service_contract_error "unable to inspect loaded API SystemCallFilter"
    return
  }
  [[ "${value:0:1}" == "~" ]] || {
    api_service_contract_error "loaded API SystemCallFilter is not a deny filter"
    return
  }
  local syscall filtered_syscalls=" ${value:1} "
  for syscall in \
    clock_settime \
    modify_ldt \
    ptrace \
    init_module \
    mount \
    _sysctl \
    setuid \
    iopl \
    reboot \
    swapon; do
    [[ "$filtered_syscalls" == *" $syscall "* ]] || {
      api_service_contract_error \
        "loaded API SystemCallFilter does not deny $syscall"
      return
    }
  done

  local readonly_value readwrite_value
  readonly_value="$(
    systemctl show trex-webui-api.service --property=ReadOnlyPaths --value
  )" || {
    api_service_contract_error "unable to inspect loaded API ReadOnlyPaths"
    return
  }
  readwrite_value="$(
    systemctl show trex-webui-api.service --property=ReadWritePaths --value
  )" || {
    api_service_contract_error "unable to inspect loaded API ReadWritePaths"
    return
  }
  assert_api_sandbox_paths "$readonly_value" "$readwrite_value" "$project_root" || return
  assert_systemd_path_subset \
    "$VERIFIED_API_DISK_READONLY" \
    "$readonly_value" \
    "ReadOnlyPaths" || return
  assert_systemd_path_subset \
    "$VERIFIED_API_DISK_READWRITE" \
    "$readwrite_value" \
    "ReadWritePaths"
}

assert_managed_api_service_contract() {
  local project_root="${1:-$PROJECT_ROOT}"
  local unit_path="${2:-$API_UNIT}"
  local proc_root="${3:-$API_PROC_ROOT}"
  local load_state fragment_path need_reload start_value pre_value
  local start_exec start_argv pre_exec pre_argv main_pid disk_runtime
  local canonical_project_root

  canonical_project_root="$(
    trex_canonical_path "$project_root" "API project root"
  )" || return
  [[ "$canonical_project_root" == "$project_root" ]] || {
    api_service_contract_error "API project root is not canonical: $project_root"
    return
  }

  assert_api_disk_unit_contract "$project_root" "$unit_path" || return
  disk_runtime="$VERIFIED_API_RUNTIME"

  load_state="$(
    systemctl show trex-webui-api.service --property=LoadState --value
  )" || {
    api_service_contract_error "unable to inspect loaded API LoadState"
    return
  }
  [[ "$load_state" == "loaded" ]] || {
    api_service_contract_error "loaded API unit has LoadState=${load_state:-missing}"
    return
  }
  fragment_path="$(
    systemctl show trex-webui-api.service --property=FragmentPath --value
  )" || {
    api_service_contract_error "unable to inspect loaded API FragmentPath"
    return
  }
  [[ "$fragment_path" == "$unit_path" ]] || {
    api_service_contract_error \
      "loaded API FragmentPath mismatch: expected $unit_path, got ${fragment_path:-missing}"
    return
  }
  need_reload="$(
    systemctl show trex-webui-api.service --property=NeedDaemonReload --value
  )" || {
    api_service_contract_error "unable to inspect loaded API reload state"
    return
  }
  [[ "$need_reload" == "no" ]] || {
    api_service_contract_error "trex-webui-api.service has unapplied on-disk changes"
    return
  }
  VERIFIED_API_NEED_RELOAD="$need_reload"

  assert_api_loaded_sandbox_contract "$project_root" || return
  start_value="$(
    systemctl show trex-webui-api.service --property=ExecStart --value
  )" || {
    api_service_contract_error "unable to inspect loaded API ExecStart"
    return
  }
  pre_value="$(
    systemctl show trex-webui-api.service --property=ExecStartPre --value
  )" || {
    api_service_contract_error "unable to inspect loaded API ExecStartPre"
    return
  }
  parse_loaded_exec_value "$start_value" start_exec start_argv || {
    api_service_contract_error "loaded API ExecStart is not parseable"
    return
  }
  parse_loaded_exec_value "$pre_value" pre_exec pre_argv || {
    api_service_contract_error "loaded API ExecStartPre is not parseable"
    return
  }
  [[ "$start_exec" == "$pre_exec" && "$start_exec" == "$disk_runtime" ]] || {
    api_service_contract_error \
      "on-disk and loaded API interpreters disagree: $disk_runtime <> $pre_exec <> $start_exec"
    return
  }
  [[ "$start_argv" == "$start_exec -m uvicorn app.main:app --app-dir $project_root/apps/api --host 127.0.0.1 --port 8080" ]] || {
    api_service_contract_error "loaded API ExecStart command is not exact"
    return
  }
  [[ "$pre_argv" == "$pre_exec -c import fastapi, httptools, uvicorn, uvicorn.supervisors.statreload, uvloop, watchfiles.run, websockets" ]] || {
    api_service_contract_error "loaded API ExecStartPre command is not exact"
    return
  }
  assert_api_runtime_exec "$start_exec" "$project_root" "loaded API unit" || return

  main_pid="$(
    systemctl show trex-webui-api.service --property=MainPID --value
  )" || {
    api_service_contract_error "unable to inspect API MainPID"
    return
  }
  [[ "$main_pid" =~ ^[1-9][0-9]*$ ]] || {
    api_service_contract_error "API MainPID is invalid: ${main_pid:-missing}"
    return
  }
  assert_api_main_pid_command \
    "$proc_root/$main_pid/cmdline" \
    "$start_exec" \
    "$project_root" || return

  VERIFIED_API_MAIN_PID="$main_pid"
  VERIFIED_API_RUNTIME="$start_exec"
}

managed_daemon_bin_from_cmdline() {
  local cmdline_path="${1:-}"
  [[ -n "$cmdline_path" ]] || {
    printf 'path authority error: managed daemon cmdline path is missing\n' >&2
    return 1
  }
  command -v python3 >/dev/null 2>&1 || {
    printf 'path authority error: python3 is required to inspect the managed daemon cmdline\n' >&2
    return 1
  }

  python3 - "$cmdline_path" <<'PY'
from __future__ import annotations

import os
import sys


path = sys.argv[1]
flags = os.O_RDONLY | os.O_CLOEXEC
if hasattr(os, "O_NOFOLLOW"):
    flags |= os.O_NOFOLLOW
try:
    descriptor = os.open(path, flags)
except OSError as exc:
    raise SystemExit(f"managed daemon cmdline is not inspectable: {path}: {exc}")
try:
    payload = b""
    while len(payload) <= 1024 * 1024:
        chunk = os.read(descriptor, 65536)
        if not chunk:
            break
        payload += chunk
    if len(payload) > 1024 * 1024:
        raise SystemExit(f"managed daemon cmdline exceeds the inspection limit: {path}")
finally:
    os.close(descriptor)

arguments = [value for value in payload.split(b"\0") if value]
matches = [index for index, value in enumerate(arguments) if value == b"--daemon-bin"]
if len(matches) != 1 or matches[0] + 1 >= len(arguments):
    raise SystemExit("managed daemon MainPID has no unique --daemon-bin argument")
try:
    value = arguments[matches[0] + 1].decode("utf-8")
except UnicodeDecodeError as exc:
    raise SystemExit(f"managed daemon --daemon-bin argument is not valid UTF-8: {exc}")
if not value.startswith("/") or "\n" in value or "\r" in value:
    raise SystemExit("managed daemon MainPID has an unsafe --daemon-bin argument")
print(value)
PY
}

assert_managed_api_path_authority() {
  local declared_environment="${1:-}"
  local api_unit_path="${2:-}"
  local api_main_pid="${3:-}"
  local proc_root="${4:-/proc}"
  local expected_scripts_dir="${5:-}"
  local expected_daemon_bin="${6:-}"
  local expected_profile_roots="${7:-}"
  local assignment

  [[ -f "$api_unit_path" && ! -L "$api_unit_path" ]] || {
    printf 'path authority error: managed API unit is missing or unsafe: %s\n' \
      "${api_unit_path:-missing}" >&2
    return 1
  }
  trex_assert_managed_api_declared_environment \
    "$declared_environment" \
    "$expected_scripts_dir" \
    "$expected_daemon_bin" \
    "$expected_profile_roots" || return
  for assignment in \
    "TREX_WEBUI_TREX_SCRIPTS_DIR=$expected_scripts_dir" \
    "TREX_WEBUI_TREX_DAEMON_BIN=$expected_daemon_bin" \
    "TREX_WEBUI_PROFILE_ROOTS=$expected_profile_roots"; do
    [[ "$(grep -Fxc "Environment=$assignment" "$api_unit_path")" -eq 1 ]] || {
      printf 'path authority error: managed API unit does not persist the exact %s authority\n' \
        "$assignment" >&2
      return 1
    }
  done
  trex_assert_managed_api_process_environment \
    "$api_main_pid" \
    "$proc_root" \
    "$expected_scripts_dir" \
    "$expected_daemon_bin" \
    "$expected_profile_roots"
}

assert_managed_api_environment_payload() {
  local body="${1:-}"
  local expected_scripts_dir="${2:-}"
  local expected_daemon_bin="${3:-}"
  local expected_profile_roots="${4:-}"
  command -v python3 >/dev/null 2>&1 || {
    printf 'path authority error: python3 is required to validate the API environment payload\n' >&2
    return 1
  }

  python3 -c '
import json
import sys

payload = json.load(sys.stdin)
expected = {
    "host": "127.0.0.1",
    "host_valid": True,
    "daemon_port": 8090,
    "daemon_supervisor": "systemd",
    "scripts_dir_path_valid": True,
    "daemon_bin_path_valid": True,
    "config_path_valid": True,
    "daemon_log_path_valid": True,
    "scripts_dir_exists": True,
    "daemon_bin_exists": True,
    "runtime_state_path": "/var/lib/trex-webui/runtime-state.json",
    "runtime_state_path_valid": True,
    "runtime_state_parent_exists": True,
    "configuration_errors": {},
}
scripts_dir, daemon_bin, profile_roots = sys.argv[1:]
if scripts_dir or daemon_bin or profile_roots:
    if not scripts_dir or not daemon_bin or not profile_roots:
        raise SystemExit("incomplete verified daemon path authority")
    expected["scripts_dir"] = scripts_dir
    expected["daemon_bin"] = daemon_bin
    expected_roots = profile_roots.split(":")
    expected["profile_roots"] = expected_roots
    expected["profile_roots_existing"] = expected_roots
actual = {key: payload.get(key) for key in expected}
if actual != expected:
    raise SystemExit(
        f"managed daemon/API authority mismatch: expected {expected!r}, got {actual!r}"
    )
' \
    "$expected_scripts_dir" \
    "$expected_daemon_bin" \
    "$expected_profile_roots" <<<"$body"
}

check_layout() {
  PROJECT_ROOT="$(trex_canonical_path "$PROJECT_ROOT" "project root")" || \
    die "unsafe project root"
  WEB_ROOT="$(trex_canonical_path "$WEB_ROOT" "web root")" || die "unsafe web root"
  if [[ "$CHECK_DAEMON" -eq 1 ]]; then
    DAEMON_LIBEXEC_ROOT="$(
      trex_canonical_path "$DAEMON_LIBEXEC_ROOT" "daemon libexec root"
    )" || die "unsafe daemon libexec root"
    DAEMON_SUPERVISOR="$(
      trex_canonical_path "$DAEMON_SUPERVISOR" "daemon supervisor"
    )" || die "unsafe daemon supervisor"
    DAEMON_RPC_PROBE="$(
      trex_canonical_path "$DAEMON_RPC_PROBE" "daemon RPC probe"
    )" || die "unsafe daemon RPC probe"
    DAEMON_NATIVE_BOUNDARY="$(
      trex_canonical_path "$DAEMON_NATIVE_BOUNDARY" "daemon native boundary"
    )" || die "unsafe daemon native boundary"
    NFTABLES_CONFIG="$(
      trex_canonical_path "$NFTABLES_CONFIG" "nftables configuration"
    )" || die "unsafe nftables configuration"
    NFTABLES_DROPIN_ROOT="$(
      trex_canonical_path "$NFTABLES_DROPIN_ROOT" "nftables drop-in root"
    )" || die "unsafe nftables drop-in root"
    NFTABLES_DROPIN="$(
      trex_canonical_path "$NFTABLES_DROPIN" "nftables integration drop-in"
    )" || die "unsafe nftables integration drop-in"
    trex_path_is_within "$DAEMON_SUPERVISOR" "$DAEMON_LIBEXEC_ROOT" || \
      die "daemon supervisor escaped its libexec root"
    trex_path_is_within "$DAEMON_RPC_PROBE" "$DAEMON_LIBEXEC_ROOT" || \
      die "daemon RPC probe escaped its libexec root"
    trex_path_is_within "$DAEMON_NATIVE_BOUNDARY" "$DAEMON_LIBEXEC_ROOT" || \
      die "daemon native boundary escaped its libexec root"
    trex_path_is_within "$NFTABLES_DROPIN" "$NFTABLES_DROPIN_ROOT" || \
      die "nftables integration drop-in escaped its root"
    trex_assert_managed_path \
      "$DAEMON_LIBEXEC_ROOT" \
      "daemon libexec root" \
      "/usr/libexec/trex-webui" || die "unsafe daemon libexec root"
    trex_assert_managed_path \
      "$NFTABLES_DROPIN_ROOT" \
      "nftables drop-in root" \
      "/etc/systemd/system" || die "unsafe nftables drop-in root"
  fi
  [[ -d "$PROJECT_ROOT" ]] || die "project root not found: $PROJECT_ROOT"
  [[ -d "$WEB_ROOT" ]] || die "web root not found: $WEB_ROOT"
  [[ -f "$WEB_ROOT/index.html" ]] || die "missing $WEB_ROOT/index.html"
  [[ -f "$PROJECT_ROOT/apps/api/requirements.txt" ]] || die "missing apps/api/requirements.txt under $PROJECT_ROOT"
  [[ -f "$PROJECT_ROOT/apps/api/requirements.lock" ]] || die "missing apps/api/requirements.lock under $PROJECT_ROOT"
  [[ -f "$PROJECT_ROOT/deploy/systemd/trex-webui-api.service" ]] || \
    die "missing API systemd template under $PROJECT_ROOT"
  [[ -f "$PROJECT_ROOT/deploy/systemd/trex-daemon-server.service" ]] || \
    die "missing daemon systemd template under $PROJECT_ROOT"
  [[ -f "$PROJECT_ROOT/deploy/trex_daemon_supervisor.py" ]] || \
    die "missing daemon supervisor source under $PROJECT_ROOT"
  [[ -f "$PROJECT_ROOT/deploy/daemon_rpc_probe.py" ]] || \
    die "missing daemon RPC probe source under $PROJECT_ROOT"
  [[ -f "$PROJECT_ROOT/deploy/trex_native_boundary.sh" ]] || \
    die "missing daemon native boundary source under $PROJECT_ROOT"
  [[ -f "$PROJECT_ROOT/deploy/systemd/nftables-trex-webui.conf" ]] || \
    die "missing nftables integration source under $PROJECT_ROOT"
  pass "deployment paths exist"
}

check_systemd() {
  if [[ "$CHECK_SYSTEMD" -eq 0 ]]; then
    return
  fi
  have_cmd systemctl || die "systemctl not found; rerun with --skip-systemd on non-systemd hosts"
  systemctl is-active --quiet trex-webui-api.service || die "trex-webui-api.service is not active"
  assert_managed_api_service_contract "$PROJECT_ROOT" "$API_UNIT" "$API_PROC_ROOT" || \
    die "managed API systemd, on-disk unit, runtime, and MainPID authorities disagree"
  if [[ "$CHECK_DAEMON" -eq 1 ]]; then
    systemctl is-active --quiet trex-daemon-server.service || die "trex-daemon-server.service is not active"
    local daemon_need_reload
    daemon_need_reload="$(
      systemctl show trex-daemon-server.service --property=NeedDaemonReload --value
    )" || die "unable to inspect daemon unit reload state"
    assert_managed_units_reloaded "$VERIFIED_API_NEED_RELOAD" "$daemon_need_reload" || \
      die "managed service unit path authority has not been loaded"
    trex_assert_managed_api_environment_file "$API_ENV_FILE" || \
      die "managed API environment file failed authority validation"
    trex_assert_managed_api_process_environment \
      "$VERIFIED_API_MAIN_PID" \
      "$API_PROC_ROOT" || \
      die "managed API MainPID is not pinned to the exact local TRex authority"
  fi
  systemctl is-active --quiet nginx.service || systemctl is-active --quiet nginx || die "nginx service is not active"
  pass "systemd services are active and the API runtime contract is exact"
}

check_daemon_boundary() {
  if [[ "$CHECK_DAEMON" -eq 0 ]]; then
    return
  fi

  have_cmd ss || die "ss is required to verify the daemon listener boundary"
  have_cmd curl || die "curl is required to verify daemon RPC"
  local listeners=() endpoint body request
  mapfile -t listeners < <(ss -H -ltn "sport = :$DAEMON_RPC_PORT" | awk '{print $4}')
  [[ "${#listeners[@]}" -gt 0 ]] || die "TRex daemon has no TCP listener on port $DAEMON_RPC_PORT"
  for endpoint in "${listeners[@]}"; do
    [[ "$endpoint" == "$DAEMON_RPC_HOST:$DAEMON_RPC_PORT" ]] || \
      die "TRex daemon RPC is not loopback-only: $endpoint"
  done

  request='{"jsonrpc":"2.0","id":"deploy-verify","method":"connectivity_check","params":{}}'
  body="$(curl -fsS --noproxy '*' \
    --connect-timeout "$TIMEOUT_SECONDS" \
    --max-time "$TIMEOUT_SECONDS" \
    -H 'Accept: application/json' \
    -H 'Content-Type: application/json' \
    --data "$request" \
    "$DAEMON_RPC_URL")" || die "TRex daemon connectivity_check RPC failed"
  grep -Eq '"jsonrpc"[[:space:]]*:[[:space:]]*"2\.0"' <<<"$body" || \
    die "TRex daemon RPC returned an invalid JSON-RPC version"
  grep -Eq '"id"[[:space:]]*:[[:space:]]*"deploy-verify"' <<<"$body" || \
    die "TRex daemon RPC returned a mismatched request id"
  grep -Eq '"result"[[:space:]]*:[[:space:]]*true' <<<"$body" || \
    die "TRex daemon connectivity_check did not return true"
  ! grep -Eq '"error"[[:space:]]*:' <<<"$body" || die "TRex daemon RPC returned an error outcome"

  [[ -f "$DAEMON_NATIVE_BOUNDARY" && ! -L "$DAEMON_NATIVE_BOUNDARY" && \
    -x "$DAEMON_NATIVE_BOUNDARY" ]] || \
    die "installed daemon native boundary is missing, unsafe, or not executable"
  "$DAEMON_NATIVE_BOUNDARY" verify || \
    die "managed TRex native ports 4500/4501/4507 are not fail-closed outside loopback"
  "$DAEMON_NATIVE_BOUNDARY" check-service "$NFTABLES_CONFIG" || \
    die "nftables.service cannot atomically reload its config with the native-port boundary"
  [[ -f "$NFTABLES_DROPIN" && ! -L "$NFTABLES_DROPIN" ]] || \
    die "installed nftables integration drop-in is missing or unsafe"
  [[ "$(stat -c '%U:%G %a' "$NFTABLES_DROPIN")" == "root:root 644" ]] || \
    die "installed nftables integration drop-in must be root:root 0644"
  grep -Fqx '# Managed by TRex WebUI deploy/install.sh.' "$NFTABLES_DROPIN" || \
    die "installed nftables integration drop-in is not installer-managed"
  cmp -s "$NFTABLES_DROPIN" "$PROJECT_ROOT/deploy/systemd/nftables-trex-webui.conf" || \
    die "installed nftables integration drop-in does not match the release source"

  [[ -f "$DAEMON_LOG" && ! -L "$DAEMON_LOG" ]] || die "daemon log is missing or unsafe: $DAEMON_LOG"
  [[ "$(stat -c '%U:%G %a' "$DAEMON_LOG")" == "root:trex-webui 640" ]] || \
    die "daemon log ownership/mode must be root:trex-webui 0640"
  if have_cmd runuser && getent passwd trex-webui >/dev/null 2>&1; then
    runuser -u trex-webui -- test -r "$DAEMON_LOG" || \
      die "trex-webui service identity cannot read the daemon log"
  fi

  local runtime source_runtime
  for runtime in "$DAEMON_SUPERVISOR" "$DAEMON_RPC_PROBE" "$DAEMON_NATIVE_BOUNDARY"; do
    if [[ "$runtime" == "$DAEMON_SUPERVISOR" ]]; then
      source_runtime="$PROJECT_ROOT/deploy/trex_daemon_supervisor.py"
    elif [[ "$runtime" == "$DAEMON_RPC_PROBE" ]]; then
      source_runtime="$PROJECT_ROOT/deploy/daemon_rpc_probe.py"
    else
      source_runtime="$PROJECT_ROOT/deploy/trex_native_boundary.sh"
    fi
    [[ -f "$runtime" && ! -L "$runtime" && -x "$runtime" ]] || \
      die "installed daemon runtime is missing, unsafe, or not executable: $runtime"
    [[ "$(stat -c '%U:%G %a' "$runtime")" == "root:root 755" ]] || \
      die "installed daemon runtime must be root:root 0755: $runtime"
    grep -Fqx '# Managed by TRex WebUI deploy/install.sh.' "$runtime" || \
      die "installed daemon runtime is not installer-managed: $runtime"
    cmp -s "$runtime" "$source_runtime" || \
      die "installed daemon runtime does not match the release source: $runtime"
  done

  if [[ "$CHECK_SYSTEMD" -eq 1 ]]; then
    local exec_start exec_start_pre exec_start_post restart_policy kill_mode fragment_path main_pid main_cmdline
    local daemon_part_of nft_exec_start nft_exec_reload nft_need_reload
    local daemon_working_directory canonical_daemon_bin api_main_pid expected_profile_roots
    local api_fragment_path declared_api_environment
    fragment_path="$(systemctl show trex-daemon-server.service --property=FragmentPath --value)" || \
      die "unable to inspect managed daemon unit authority"
    [[ "$fragment_path" == "$DAEMON_UNIT" ]] || \
      die "daemon service is not loaded from the managed unit: ${fragment_path:-missing}"
    grep -Fqx '# Managed by TRex WebUI deploy/install.sh.' "$DAEMON_UNIT" || \
      die "daemon unit is not marked as installer-managed"
    exec_start="$(systemctl show trex-daemon-server.service --property=ExecStart --value)" || \
      die "unable to inspect managed daemon ExecStart"
    [[ "$exec_start" == *"/usr/bin/python3 -I $DAEMON_SUPERVISOR --daemon-bin "* && \
      "$exec_start" == *" --generation-file $DAEMON_GENERATION -- --daemon-port $DAEMON_RPC_PORT --trex-host $DAEMON_RPC_HOST start-live"* ]] || \
      die "managed daemon ExecStart is not the supervised foreground loopback contract"
    daemon_working_directory="$(
      systemctl show trex-daemon-server.service --property=WorkingDirectory --value
    )" || die "unable to inspect managed daemon working directory"
    daemon_working_directory="$(
      trex_canonical_path "$daemon_working_directory" "managed daemon working directory"
    )" || die "managed daemon working directory is unsafe"
    exec_start_pre="$(systemctl show trex-daemon-server.service --property=ExecStartPre --value)" || \
      die "unable to inspect managed daemon ExecStartPre"
    [[ "$exec_start_pre" == *"$DAEMON_NATIVE_BOUNDARY apply"* ]] || \
      die "managed daemon does not publish the native-port boundary before startup"
    restart_policy="$(systemctl show trex-daemon-server.service --property=Restart --value)" || \
      die "unable to inspect managed daemon restart policy"
    [[ "$restart_policy" == "on-failure" ]] || \
      die "managed daemon restart policy is not on-failure"
    kill_mode="$(systemctl show trex-daemon-server.service --property=KillMode --value)" || \
      die "unable to inspect managed daemon KillMode"
    [[ "$kill_mode" == "mixed" ]] || die "managed daemon KillMode is not mixed"
    [[ -f "$DAEMON_GENERATION" && ! -L "$DAEMON_GENERATION" ]] || \
      die "managed daemon generation is missing, unsafe, or not a regular file"
    [[ "$(stat -c '%U:%G %a' "$DAEMON_GENERATION")" == "root:root 644" ]] || \
      die "managed daemon generation must be root:root 0644"
    /usr/bin/python3 - "$DAEMON_GENERATION" <<'PY' || \
      die "managed daemon generation is not a canonical UUID"
import sys
import uuid
from pathlib import Path

value = Path(sys.argv[1]).read_text(encoding="ascii").strip()
parsed = uuid.UUID(value)
if str(parsed) != value:
    raise SystemExit("daemon generation is not canonical")
PY
    exec_start_post="$(systemctl show trex-daemon-server.service --property=ExecStartPost --value)" || \
      die "unable to inspect managed daemon readiness command"
    [[ "$exec_start_post" == *"$DAEMON_NATIVE_BOUNDARY verify"* && \
      "$exec_start_post" == *"$DAEMON_RPC_PROBE"* && "$exec_start_post" == *" ready"* ]] || \
      die "managed daemon has no strict native-boundary and RPC ExecStartPost verification"
    daemon_part_of="$(systemctl show trex-daemon-server.service --property=PartOf --value)" || \
      die "unable to inspect managed daemon nftables lifecycle coupling"
    [[ " $daemon_part_of " == *" nftables.service "* ]] || \
      die "managed daemon is not stopped/restarted with nftables.service"
    nft_need_reload="$(systemctl show nftables.service --property=NeedDaemonReload --value)" || \
      die "unable to inspect loaded nftables.service configuration"
    [[ "$nft_need_reload" == "no" ]] || \
      die "nftables.service has not loaded the managed native-boundary integration"
    nft_exec_start="$(systemctl show nftables.service --property=ExecStart --value)" || \
      die "unable to inspect loaded nftables.service ExecStart"
    [[ "$nft_exec_start" == *"$DAEMON_NATIVE_BOUNDARY service-start $NFTABLES_CONFIG"* ]] || \
      die "loaded nftables.service start is not the atomic native-boundary transaction"
    nft_exec_reload="$(systemctl show nftables.service --property=ExecReload --value)" || \
      die "unable to inspect loaded nftables.service ExecReload"
    [[ "$nft_exec_reload" == *"$DAEMON_NATIVE_BOUNDARY service-reload $NFTABLES_CONFIG"* ]] || \
      die "loaded nftables.service reload is not the atomic native-boundary transaction"
    main_pid="$(systemctl show trex-daemon-server.service --property=MainPID --value)" || \
      die "unable to inspect managed daemon MainPID"
    [[ "$main_pid" =~ ^[1-9][0-9]*$ && -r "$API_PROC_ROOT/$main_pid/cmdline" ]] || \
      die "managed daemon MainPID is not inspectable"
    main_cmdline="$(tr '\0' ' ' <"$API_PROC_ROOT/$main_pid/cmdline")"
    local running_daemon_bin
    running_daemon_bin="$(
      managed_daemon_bin_from_cmdline "$API_PROC_ROOT/$main_pid/cmdline"
    )" || die "managed daemon MainPID has no valid daemon executable authority"
    canonical_daemon_bin="$(
      trex_canonical_path "$running_daemon_bin" "managed daemon executable"
    )" || die "managed daemon executable authority is unsafe"
    [[ "$canonical_daemon_bin" == "$running_daemon_bin" ]] || \
      die "managed daemon executable authority is not canonical: $running_daemon_bin"
    trex_path_is_within "$running_daemon_bin" "$daemon_working_directory" || \
      die "managed daemon executable escaped its working directory"
    trex_assert_root_controlled_tree \
      "$daemon_working_directory" \
      "managed daemon scripts tree" || \
      die "managed daemon scripts tree is not safe for root execution"
    [[ -f "$running_daemon_bin" && ! -L "$running_daemon_bin" && -x "$running_daemon_bin" ]] || \
      die "managed daemon executable is missing, unsafe, or not executable: $running_daemon_bin"
    grep -Fq -- "$DAEMON_SUPERVISOR" <<<"$main_cmdline" && \
      grep -Fq -- "--daemon-bin $running_daemon_bin" <<<"$main_cmdline" && \
      grep -Fq -- "--daemon-bin $running_daemon_bin --generation-file $DAEMON_GENERATION" <<<"$exec_start" || \
      die "managed daemon MainPID is not the project supervisor launcher"

    expected_profile_roots="$daemon_working_directory/stl:$PROJECT_ROOT/profiles:/var/lib/trex-webui/profiles"
    api_fragment_path="$(
      systemctl show trex-webui-api.service --property=FragmentPath --value
    )" || die "unable to inspect managed API unit authority"
    [[ "$api_fragment_path" == "$API_UNIT" ]] || \
      die "API service is not loaded from the managed unit: ${api_fragment_path:-missing}"
    [[ -f "$API_UNIT" && ! -L "$API_UNIT" ]] || \
      die "managed API unit is missing or unsafe: $API_UNIT"
    declared_api_environment="$(
      systemctl show trex-webui-api.service --property=Environment --value
    )" || die "unable to inspect loaded API environment authority"
    api_main_pid="$(systemctl show trex-webui-api.service --property=MainPID --value)" || \
      die "unable to inspect managed API MainPID for TRex path authority"
    assert_managed_api_path_authority \
      "$declared_api_environment" \
      "$API_UNIT" \
      "$api_main_pid" \
      "$API_PROC_ROOT" \
      "$daemon_working_directory" \
      "$running_daemon_bin" \
      "$expected_profile_roots" || \
      die "managed API does not share the daemon's exact TRex path authority"
    VERIFIED_DAEMON_SCRIPTS_DIR="$daemon_working_directory"
    VERIFIED_DAEMON_BIN="$running_daemon_bin"
    VERIFIED_PROFILE_ROOTS="$expected_profile_roots"
  fi
  [[ -f "$DAEMON_LOGROTATE" && ! -L "$DAEMON_LOGROTATE" ]] || \
    die "daemon logrotate policy is missing or unsafe"
  grep -Fqx '    copytruncate' "$DAEMON_LOGROTATE" || \
    die "daemon logrotate policy must use copytruncate for systemd append descriptors"
  pass "privileged daemon is active, RPC-ready, and native ports are loopback-confined"
}

check_static_assets() {
  local index_file="$WEB_ROOT/index.html"
  local asset
  mapfile -t assets < <(grep -o 'assets/[^"'"'"' >]*' "$index_file" | sort -u)
  [[ "${#assets[@]}" -gt 0 ]] || die "index.html does not reference built assets"
  for asset in "${assets[@]}"; do
    [[ -f "$WEB_ROOT/$asset" ]] || die "missing static asset: $WEB_ROOT/$asset"
    curl_head "$(url_join "$BASE_URL" "$asset")" >/dev/null || die "asset is not reachable through nginx: $asset"
  done
  pass "static assets are present and reachable (${#assets[@]})"
}

check_web_entry() {
  local body
  body="$(curl_body "$BASE_URL/")" || die "WebUI root is not reachable: $BASE_URL/"
  grep -q 'id="root"' <<<"$body" || die "WebUI root did not return the React mount point"
  pass "WebUI root responds"
}

check_api_health() {
  local body
  body="$(curl_body "$(url_join "$BASE_URL" "/api/health")")" || die "/api/health failed"
  grep -q '"status"[[:space:]]*:[[:space:]]*"ok"' <<<"$body" || die "/api/health did not report ok: $body"
  pass "API health responds"
}

check_api_environment_contract() {
  local body
  body="$(curl_body "$(url_join "$BASE_URL" "/api/system/environment")")" || die "/api/system/environment failed"
  for key in host_valid scripts_dir_path_valid daemon_bin_path_valid config_path_valid daemon_log_path_valid runtime_state_path runtime_state_path_valid runtime_state_parent_exists configuration_errors; do
    grep -q "\"$key\"" <<<"$body" || die "/api/system/environment missing key: $key"
  done
  if [[ "$CHECK_DAEMON" -eq 1 ]]; then
    assert_managed_api_environment_payload \
      "$body" \
      "$VERIFIED_DAEMON_SCRIPTS_DIR" \
      "$VERIFIED_DAEMON_BIN" \
      "$VERIFIED_PROFILE_ROOTS" || \
      die "/api/system/environment is not pinned to the local managed daemon"
  fi
  pass "API environment contract is current"
}

check_sse_proxy() {
  if [[ "$CHECK_SSE" -eq 0 ]]; then
    return
  fi
  local header_file body_file error_file status
  header_file="$(mktemp)"
  body_file="$(mktemp)"
  error_file="$(mktemp)"
  set +e
  curl -fsS -N \
    -H 'Accept: text/event-stream' \
    --connect-timeout "$TIMEOUT_SECONDS" \
    --max-time 4 \
    -D "$header_file" \
    "$(url_join "$BASE_URL" "/api/trex/stats/stream")" \
    >"$body_file" \
    2>"$error_file"
  status=$?
  set -e
  if [[ "$status" -ne 0 && "$status" -ne 28 ]]; then
    cat "$error_file" >&2
    rm -f "$header_file" "$body_file" "$error_file"
    die "stats SSE endpoint failed with curl status $status"
  fi
  grep -q '^HTTP/.* 200' "$header_file" || {
    cat "$error_file" >&2
    rm -f "$header_file" "$body_file" "$error_file"
    die "stats SSE endpoint did not return HTTP 200"
  }
  if [[ ! -s "$body_file" ]]; then
    cat "$error_file" >&2
    rm -f "$header_file" "$body_file" "$error_file"
    die "stats SSE endpoint returned headers but no event bytes before timeout"
  fi
  rm -f "$header_file" "$body_file" "$error_file"
  pass "stats SSE endpoint streams through nginx"
}

check_trex_overview() {
  if [[ "$CHECK_TREX" -eq 0 ]]; then
    return
  fi
  local body
  body="$(curl_body "$(url_join "$BASE_URL" "/api/system/overview")")" || die "/api/system/overview failed"
  grep -q '"ok"[[:space:]]*:[[:space:]]*true' <<<"$body" || die "/api/system/overview did not report ok"
  grep -q '"port_ids"' <<<"$body" || die "/api/system/overview missing port_ids"
  pass "real TRex overview responds"
}

main() {
  parse_args "$@"
  have_cmd curl || die "curl is required"
  log "Verifying TRex WebUI deployment at $BASE_URL"
  check_layout
  check_systemd
  check_daemon_boundary
  check_static_assets
  check_web_entry
  check_api_health
  check_api_environment_contract
  check_sse_proxy
  check_trex_overview
  log "TRex WebUI deployment verification passed"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
