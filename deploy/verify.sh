#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
[[ -f "$SCRIPT_DIR/path_safety.sh" ]] || { printf 'error: missing %s/path_safety.sh\n' "$SCRIPT_DIR" >&2; exit 1; }
# shellcheck source=deploy/path_safety.sh
source "$SCRIPT_DIR/path_safety.sh"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVICE_PROJECT_ROOT=""
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
NGINX_CONF="/etc/nginx/conf.d/trex-webui.conf"
RECOVERY_V2_ROOT="$DAEMON_LIBEXEC_ROOT/recovery-v2"
RELEASE_BOOTSTRAP="$RECOVERY_V2_ROOT/bootstrap_release_infrastructure.py"
RELEASE_RECONCILER="$RECOVERY_V2_ROOT/release_transaction.py"
RELEASE_OVERVIEW_VALIDATOR="$DAEMON_LIBEXEC_ROOT/trex_overview_contract.py"
RELEASE_STATE_VALIDATOR="$DAEMON_LIBEXEC_ROOT/trex_persisted_state_contract.py"
RELEASE_ROLLBACK_DAEMON_PROBE="$DAEMON_LIBEXEC_ROOT/release_daemon_rpc_probe.py"
RELEASE_ROLLBACK_NATIVE_BOUNDARY="$DAEMON_LIBEXEC_ROOT/release_native_boundary.sh"
RELEASE_RECONCILER_UNIT="/etc/systemd/system/trex-webui-release-reconcile-v2.service"
RELEASE_RETRY_UNIT="/etc/systemd/system/trex-webui-release-retry-v2.service"
RELEASE_ACK_UNIT="/etc/systemd/system/trex-webui-release-consumer-ack-v2.service"
RELEASE_RECONCILER_NGINX_DROPIN="/etc/systemd/system/nginx.service.d/trex-webui-release-reconcile-v2.conf"
RELEASE_RECONCILER_API_DROPIN="/etc/systemd/system/trex-webui-api.service.d/trex-webui-release-reconcile-v2.conf"
RELEASE_RECONCILER_DAEMON_DROPIN="/etc/systemd/system/trex-daemon-server.service.d/trex-webui-release-reconcile-v2.conf"
RELEASE_STATE_ROOT="/var/lib/trex-webui-deploy"
RELEASE_INFRASTRUCTURE_COMMON_MANIFEST="$RELEASE_STATE_ROOT/infrastructure-v2-common.json"
RELEASE_INFRASTRUCTURE_MANAGED_MANIFEST="$RELEASE_STATE_ROOT/infrastructure-v2-managed-local.json"
LEGACY_RELEASE_BOOTSTRAP="$DAEMON_LIBEXEC_ROOT/bootstrap_release_infrastructure.py"
LEGACY_RELEASE_RECONCILER="$DAEMON_LIBEXEC_ROOT/release_transaction.py"
LEGACY_RELEASE_RECONCILER_UNIT="/etc/systemd/system/trex-webui-release-reconcile.service"
LEGACY_RELEASE_RETRY_UNIT="/etc/systemd/system/trex-webui-release-retry.service"
LEGACY_RELEASE_ACK_UNIT="/etc/systemd/system/trex-webui-release-consumer-ack.service"
LEGACY_RELEASE_RECONCILER_NGINX_DROPIN="/etc/systemd/system/nginx.service.d/trex-webui-release-reconcile.conf"
LEGACY_RELEASE_RECONCILER_API_DROPIN="/etc/systemd/system/trex-webui-api.service.d/trex-webui-release-reconcile.conf"
LEGACY_RELEASE_RECONCILER_DAEMON_DROPIN="/etc/systemd/system/trex-daemon-server.service.d/trex-webui-release-reconcile.conf"
LEGACY_RELEASE_RECONCILER_BRIDGE="/etc/systemd/system/trex-webui-release-reconcile.service.d/trex-webui-recovery-v2-bridge.conf"
LEGACY_RELEASE_RETRY_BRIDGE="/etc/systemd/system/trex-webui-release-retry.service.d/trex-webui-recovery-v2-bridge.conf"
LEGACY_RELEASE_ACK_BRIDGE="/etc/systemd/system/trex-webui-release-consumer-ack.service.d/trex-webui-recovery-v2-bridge.conf"
LEGACY_RELEASE_INFRASTRUCTURE_COMMON_MANIFEST="$RELEASE_STATE_ROOT/infrastructure-common.json"
LEGACY_RELEASE_INFRASTRUCTURE_MANAGED_MANIFEST="$RELEASE_STATE_ROOT/infrastructure-managed-local.json"
LEGACY_RELEASE_INFRASTRUCTURE=0
LEGACY_RELEASE_MANAGED_INFRASTRUCTURE=0
VERSIONED_WEB_SELINUX_PATTERN='/opt/trex-webui/releases/sha256-[0-9a-f]{64}/apps/web/dist(/.*)?'
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
  --service-project-root PATH
                       Stable validated project selector used by systemd/Nginx
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
      --service-project-root)
        SERVICE_PROJECT_ROOT="${2:-}"
        [[ -n "$SERVICE_PROJECT_ROOT" ]] || die "--service-project-root requires a value"
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

resolve_versioned_service_path() {
  local logical_path="${1:-}"
  local selector_root="${2:-}"
  local label="${3:-versioned service path}"
  [[ "$selector_root" == "/opt/trex-webui/current" && \
    ( "$logical_path" == "$selector_root" || "$logical_path" == "$selector_root/"* ) ]] || {
    api_service_contract_error "$label is outside the supported release selector"
    return
  }
  [[ "$(realpath -ms -- "$logical_path")" == "$logical_path" ]] || {
    api_service_contract_error "$label is not logically canonical: $logical_path"
    return
  }
  [[ -L "$selector_root" ]] || {
    api_service_contract_error "release selector is missing: $selector_root"
    return
  }
  local target selected_root suffix actual canonical
  target="$(readlink -- "$selector_root")" || return
  [[ "$target" =~ ^releases/sha256-[0-9a-f]{64}$ ]] || {
    api_service_contract_error "release selector target is unsafe: $target"
    return
  }
  selected_root="$(dirname -- "$selector_root")/$target"
  [[ -d "$selected_root" && ! -L "$selected_root" ]] || {
    api_service_contract_error "selected release root is missing or unsafe: $selected_root"
    return
  }
  trex_assert_root_controlled_authority_path \
    "$selected_root" "selected release root" || return
  suffix="${logical_path#"$selector_root"}"
  actual="$selected_root$suffix"
  canonical="$(trex_canonical_path "$actual" "$label")" || return
  [[ "$canonical" == "$actual" ]] || {
    api_service_contract_error "$label escaped the selected release: $logical_path"
    return
  }
  trex_path_is_within "$actual" "$selected_root" || {
    api_service_contract_error "$label escaped the selected release: $logical_path"
    return
  }
  printf '%s\n' "$actual"
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
  local authority_runtime="$runtime_root"
  if [[ "$project_root" == "/opt/trex-webui/current" ]]; then
    authority_runtime="$(
      resolve_versioned_service_path "$runtime_root" "$project_root" "$label runtime root"
    )" || return
  fi
  trex_assert_root_controlled_authority_path "$authority_runtime" "$label runtime root" || return
  assert_api_runtime_tree "$authority_runtime" "$label runtime tree" || return
  if [[ -n "$runtime_suffix" ]]; then
    assert_api_versioned_runtime_markers "$authority_runtime" "$runtime_suffix" || return
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
    if [[ "$SERVICE_PROJECT_ROOT" == "/opt/trex-webui/current" && \
      ( "$path" == "$SERVICE_PROJECT_ROOT" || "$path" == "$SERVICE_PROJECT_ROOT/"* ) ]]; then
      resolve_versioned_service_path \
        "$path" "$SERVICE_PROJECT_ROOT" "systemd sandbox path" >/dev/null || return
    else
      path="$(trex_canonical_path "$path" "systemd sandbox path")" || return
    fi
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

systemd_word_list_has() {
  local value="${1:-}"
  local expected="${2:-}"
  [[ -n "$expected" && " $value " == *" $expected "* ]]
}

release_reconcile_contract_error() {
  printf 'release reconciliation contract error: %s\n' "$*" >&2
  return 1
}

assert_release_reconcile_unit_dependency() {
  local unit_path="${1:-}"
  local label="${2:-systemd unit}"
  local after_lines=()
  [[ -f "$unit_path" && ! -L "$unit_path" ]] || {
    release_reconcile_contract_error "$label is missing or unsafe: $unit_path"
    return
  }
  [[ "$(grep -Ec '^Requires=' "$unit_path")" -eq 1 && \
    "$(grep -Fxc 'Requires=trex-webui-release-reconcile-v2.service' "$unit_path")" -eq 1 ]] || {
    release_reconcile_contract_error \
      "$label must have exactly one release-reconciler Requires directive"
    return
  }
  mapfile -t after_lines < <(sed -n 's/^After=//p' "$unit_path")
  [[ "${#after_lines[@]}" -eq 1 ]] || {
    release_reconcile_contract_error "$label must have exactly one After directive"
    return
  }
  systemd_word_list_has \
    "${after_lines[0]}" \
    "trex-webui-release-reconcile-v2.service" || {
    release_reconcile_contract_error "$label is not ordered after release reconciliation"
    return
  }
}

assert_loaded_release_reconcile_dependency() {
  local unit_name="${1:-}"
  local label="${2:-systemd unit}"
  local requires after
  requires="$(systemctl show "$unit_name" --property=Requires --value)" || {
    release_reconcile_contract_error \
      "unable to inspect loaded $label Requires dependency"
    return
  }
  after="$(systemctl show "$unit_name" --property=After --value)" || {
    release_reconcile_contract_error \
      "unable to inspect loaded $label ordering"
    return
  }
  systemd_word_list_has "$requires" "trex-webui-release-reconcile-v2.service" || {
    release_reconcile_contract_error \
      "loaded $label does not propagate release reconciliation failures"
    return
  }
  systemd_word_list_has "$after" "trex-webui-release-reconcile-v2.service" || {
    release_reconcile_contract_error \
      "loaded $label is not ordered after release reconciliation"
    return
  }
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
  if [[ "$project_root" == "/opt/trex-webui/current" ]]; then
    assert_release_reconcile_unit_dependency \
      "$unit_path" \
      "on-disk API unit" || return
  fi

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

  if [[ "$project_root" == "/opt/trex-webui/current" && -L "$project_root" ]]; then
    canonical_project_root="$(realpath -- "$project_root")" || return
  else
    canonical_project_root="$(
      trex_canonical_path "$project_root" "API project root"
    )" || return
  fi
  if [[ "$canonical_project_root" != "$project_root" ]]; then
    [[ "$project_root" == "/opt/trex-webui/current" && -L "$project_root" && \
      "$(readlink -- "$project_root")" =~ ^releases/sha256-[0-9a-f]{64}$ ]] || {
      api_service_contract_error "API project root is not canonical: $project_root"
      return
    }
  fi

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

  if [[ "$project_root" == "/opt/trex-webui/current" ]]; then
    assert_loaded_release_reconcile_dependency \
      trex-webui-api.service \
      "API unit" || return
  fi

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
  if [[ -z "$SERVICE_PROJECT_ROOT" ]]; then
    SERVICE_PROJECT_ROOT="$PROJECT_ROOT"
  else
    [[ "$SERVICE_PROJECT_ROOT" == "/opt/trex-webui/current" ]] || \
      die "service project root must be /opt/trex-webui/current"
    [[ -L "$SERVICE_PROJECT_ROOT" ]] || die "service project selector is missing"
    [[ "$(readlink -- "$SERVICE_PROJECT_ROOT")" =~ ^releases/sha256-[0-9a-f]{64}$ ]] || \
      die "service project selector target is unsafe"
    [[ "$(realpath -- "$SERVICE_PROJECT_ROOT")" == "$PROJECT_ROOT" ]] || \
      die "service project selector does not resolve to the verified project root"
  fi
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

selinux_mode() {
  if have_cmd getenforce; then
    getenforce
    return
  fi
  if [[ -r /sys/fs/selinux/enforce ]]; then
    if [[ "$(< /sys/fs/selinux/enforce)" == "1" ]]; then
      printf 'Enforcing\n'
    else
      printf 'Permissive\n'
    fi
    return
  fi
  printf 'Disabled\n'
}

assert_selinux_type() {
  local path="$1"
  local expected_type="$2"
  local label="$3"
  local expected_context actual_context
  expected_context="$(matchpathcon -n -- "$path")" || {
    printf 'error: unable to resolve expected SELinux context for %s: %s\n' \
      "$label" "$path" >&2
    return 1
  }
  [[ "$expected_context" == *":$expected_type:"* ]] || {
    printf 'error: persisted SELinux policy gives %s the wrong type: %s\n' \
      "$label" "$expected_context" >&2
    return 1
  }
  actual_context="$(stat -c '%C' -- "$path")" || {
    printf 'error: unable to inspect actual SELinux context for %s: %s\n' \
      "$label" "$path" >&2
    return 1
  }
  [[ "$actual_context" == *":$expected_type:"* ]] || {
    printf 'error: actual SELinux context gives %s the wrong type: %s\n' \
      "$label" "$actual_context" >&2
    return 1
  }
}

assert_selinux_not_http_content() {
  local path="$1"
  local label="$2"
  local expected_context actual_context=""
  expected_context="$(matchpathcon -n -- "$path")" || {
    printf 'error: unable to resolve expected SELinux context for %s: %s\n' \
      "$label" "$path" >&2
    return 1
  }
  [[ "$expected_context" != *":httpd_sys_content_t:"* ]] || {
    printf 'error: versioned frontend SELinux policy escapes into %s: %s\n' \
      "$label" "$path" >&2
    return 1
  }
  if [[ -e "$path" || -L "$path" ]]; then
    actual_context="$(stat -c '%C' -- "$path")" || {
      printf 'error: unable to inspect actual SELinux context for %s: %s\n' \
        "$label" "$path" >&2
      return 1
    }
    [[ "$actual_context" != *":httpd_sys_content_t:"* ]] || {
      printf 'error: private %s is labeled as Nginx-readable content: %s\n' \
        "$label" "$path" >&2
      return 1
    }
    [[ "$actual_context" == "$expected_context" ]] || {
      printf 'error: actual SELinux context for %s does not match persisted policy: expected %s, got %s: %s\n' \
        "$label" "$expected_context" "$actual_context" "$path" >&2
      return 1
    }
  fi
}

assert_release_private_selinux() {
  local release_path="$1"
  local selector="$2"
  local artifact python_path venv_path
  for artifact in \
    "$release_path" \
    "$release_path/apps" \
    "$release_path/apps/web"; do
    [[ -d "$artifact" && ! -L "$artifact" ]] || {
      printf 'error: %s release service ancestor is missing or unsafe: %s\n' \
        "$selector" "$artifact" >&2
      return 1
    }
    assert_selinux_not_http_content "$artifact" \
      "$selector release service ancestor" || return 1
  done
  [[ -d "$release_path/apps/api" && ! -L "$release_path/apps/api" ]] || {
    printf 'error: %s release API tree is missing or unsafe: %s\n' \
      "$selector" "$release_path/apps/api" >&2
    return 1
  }
  while IFS= read -r -d '' artifact; do
    assert_selinux_not_http_content "$artifact" \
      "$selector release API tree" || return 1
  done < <(find "$release_path/apps/api" -xdev \
    \( -type d -o -type f \) -print0)
  assert_selinux_not_http_content "$release_path/.env" \
    "$selector release environment file" || return 1

  venv_path="$release_path/.venv"
  if [[ -e "$venv_path" || -L "$venv_path" ]]; then
    for artifact in "$venv_path" "$venv_path/bin"; do
      [[ -d "$artifact" && ! -L "$artifact" ]] || {
        printf 'error: %s release Python runtime ancestor is missing or unsafe: %s\n' \
          "$selector" "$artifact" >&2
        return 1
      }
      assert_selinux_not_http_content "$artifact" \
        "$selector release Python runtime ancestor" || return 1
    done
    python_path="$venv_path/bin/python"
    [[ -e "$python_path" || -L "$python_path" ]] || {
      printf 'error: %s release Python runtime is missing: %s\n' \
        "$selector" "$python_path" >&2
      return 1
    }
    # Inspect the link inode, not only its executable target. A staged virtualenv
    # can otherwise retain user_tmp_t on this path even though /usr/bin/python
    # has the expected executable label.
    assert_selinux_not_http_content "$python_path" \
      "$selector release Python runtime" || return 1
  fi
}

assert_exact_versioned_selinux_fcontext() {
  local local_rules
  have_cmd semanage || \
    die "semanage is required to verify persistent versioned SELinux policy"
  local_rules="$(LC_ALL=C semanage fcontext -l -C)" || \
    die "unable to inspect local SELinux file-context policy"
  python3 -c '
import sys

pattern = sys.argv[1]
records = []
for raw_line in sys.stdin:
    fields = raw_line.split()
    if not fields or not fields[0].startswith("/opt/trex-webui"):
        continue
    context = next((field for field in reversed(fields) if ":object_r:" in field), "")
    if context:
        records.append((fields[0], context))
exact = [context for spec, context in records if spec == pattern]
if len(exact) != 1 or ":httpd_sys_content_t:" not in exact[0]:
    raise SystemExit(
        "exact versioned frontend httpd_sys_content_t local fcontext is missing or duplicated"
    )
escaped = [
    spec
    for spec, context in records
    if spec != pattern and ":httpd_sys_content_t:" in context
]
if escaped:
    raise SystemExit(
        "broader or competing /opt/trex-webui httpd content rules are forbidden: "
        + ", ".join(escaped)
    )
' "$VERSIONED_WEB_SELINUX_PATTERN" <<<"$local_rules" || \
    die "versioned frontend SELinux policy is not exact and persistent"
}

check_versioned_release_selinux() {
  local mode
  mode="$(selinux_mode)" || die "unable to inspect SELinux mode"
  [[ "$mode" =~ ^(Disabled|Permissive|Enforcing)$ ]] || \
    die "unexpected SELinux mode: $mode"
  [[ "$mode" != "Disabled" ]] || return 0
  have_cmd matchpathcon || \
    die "matchpathcon is required to verify versioned SELinux policy"
  assert_exact_versioned_selinux_fcontext

  local selector target release_path static_path artifact
  for selector in current previous; do
    if [[ ! -L "/opt/trex-webui/$selector" ]]; then
      [[ "$selector" == "previous" ]] && continue
      die "versioned current selector is missing during SELinux verification"
    fi
    target="$(readlink -- "/opt/trex-webui/$selector")" || \
      die "unable to inspect $selector selector during SELinux verification"
    [[ "$target" =~ ^releases/sha256-[0-9a-f]{64}$ ]] || \
      die "$selector selector is unsafe during SELinux verification"
    release_path="/opt/trex-webui/$target"
    [[ -d "$release_path" && ! -L "$release_path" && \
      "$(realpath -- "$release_path")" == "$release_path" ]] || \
      die "$selector release is unsafe during SELinux verification"
    if [[ "$selector" == "current" && "$release_path" != "$PROJECT_ROOT" ]]; then
      die "current SELinux release authority does not match the verified project root"
    fi
    static_path="$release_path/apps/web/dist"
    trex_assert_plain_static_tree "$static_path" "$selector release frontend" || \
      die "$selector release frontend tree is unsafe"
    while IFS= read -r -d '' artifact; do
      assert_selinux_type "$artifact" httpd_sys_content_t \
        "$selector release frontend" || \
        die "$selector release frontend SELinux label is not deployable"
    done < <(find "$static_path" -xdev \( -type d -o -type f \) -print0)
    assert_release_private_selinux "$release_path" "$selector" || \
      die "$selector release private SELinux boundary is unsafe"
  done
  pass "versioned frontend SELinux policy is persistent, exact, and applied"
}

assert_release_artifact_matches() {
  local source_path="$1"
  local installed_path="$2"
  local expected_mode="$3"
  local label="$4"
  [[ -f "$source_path" && ! -L "$source_path" ]] || \
    die "$label candidate source is missing or unsafe: $source_path"
  [[ -f "$installed_path" && ! -L "$installed_path" ]] || \
    die "$label installed artifact is missing or unsafe: $installed_path"
  [[ "$(stat -c '%u:%g %a %h' "$installed_path")" == "0:0 $expected_mode 1" ]] || \
    die "$label installed artifact must be root:root 0$expected_mode with one link"
  trex_assert_root_controlled_authority_path \
    "$installed_path" "$label installed artifact" || \
    die "$label installed authority is unsafe"
  cmp -s "$source_path" "$installed_path" || \
    die "$label installed artifact does not match the candidate bundle"
}

verify_release_infrastructure_manifests() {
  [[ "$EUID" -eq 0 ]] || \
    die "root is required to verify immutable release infrastructure manifests"
  local common_expected=(
    --expected "$RELEASE_BOOTSTRAP::0755::prerequisite"
    --expected "$RELEASE_RECONCILER::0755::prerequisite"
    --expected "$RELEASE_OVERVIEW_VALIDATOR::0755::prerequisite"
    --expected "$RELEASE_STATE_VALIDATOR::0755::prerequisite"
    --expected "$RELEASE_RECONCILER_UNIT::0644::prerequisite"
    --expected "$RELEASE_RETRY_UNIT::0644::prerequisite"
    --expected "$RELEASE_ACK_UNIT::0644::prerequisite"
    --expected "$LEGACY_RELEASE_RECONCILER_BRIDGE::0644::consumer-dropin"
    --expected "$LEGACY_RELEASE_RETRY_BRIDGE::0644::consumer-dropin"
    --expected "$LEGACY_RELEASE_ACK_BRIDGE::0644::consumer-dropin"
    --expected "$RELEASE_RECONCILER_API_DROPIN::0644::consumer-dropin"
    --expected "$RELEASE_RECONCILER_NGINX_DROPIN::0644::consumer-dropin"
  )
  /usr/bin/python3 "$RELEASE_BOOTSTRAP" \
    --manifest "$RELEASE_INFRASTRUCTURE_COMMON_MANIFEST" \
    --verify-installed "${common_expected[@]}" || \
    die "installed common recovery ABI v2 failed exact manifest verification"

  if [[ "$CHECK_DAEMON" -eq 1 || \
    -e "$RELEASE_INFRASTRUCTURE_MANAGED_MANIFEST" || \
    -L "$RELEASE_INFRASTRUCTURE_MANAGED_MANIFEST" ]]; then
    local managed_expected=(
      --expected "$RELEASE_ROLLBACK_DAEMON_PROBE::0755::prerequisite"
      --expected "$RELEASE_ROLLBACK_NATIVE_BOUNDARY::0755::prerequisite"
      --expected "$RELEASE_RECONCILER_DAEMON_DROPIN::0644::consumer-dropin"
    )
    /usr/bin/python3 "$RELEASE_BOOTSTRAP" \
      --manifest "$RELEASE_INFRASTRUCTURE_MANAGED_MANIFEST" \
      --verify-installed "${managed_expected[@]}" || \
      die "installed managed-local recovery ABI v2 failed exact manifest verification"
  fi

  LEGACY_RELEASE_INFRASTRUCTURE=0
  if [[ -e "$LEGACY_RELEASE_INFRASTRUCTURE_COMMON_MANIFEST" || \
    -L "$LEGACY_RELEASE_INFRASTRUCTURE_COMMON_MANIFEST" ]]; then
    LEGACY_RELEASE_INFRASTRUCTURE=1
    [[ -f "$LEGACY_RELEASE_BOOTSTRAP" && \
      ! -L "$LEGACY_RELEASE_BOOTSTRAP" && \
      "$(stat -c '%u:%g %a %h' "$LEGACY_RELEASE_BOOTSTRAP")" == "0:0 755 1" ]] || \
      die "immutable recovery ABI v1 bootstrap is missing or unsafe"
    trex_assert_root_controlled_authority_path \
      "$LEGACY_RELEASE_BOOTSTRAP" "recovery ABI v1 bootstrap" || \
      die "immutable recovery ABI v1 bootstrap authority is unsafe"
    local legacy_common_expected=(
      --expected "$LEGACY_RELEASE_BOOTSTRAP::0755::prerequisite"
      --expected "$LEGACY_RELEASE_RECONCILER::0755::prerequisite"
      --expected "$RELEASE_OVERVIEW_VALIDATOR::0755::prerequisite"
      --expected "$RELEASE_STATE_VALIDATOR::0755::prerequisite"
      --expected "$LEGACY_RELEASE_RECONCILER_UNIT::0644::prerequisite"
      --expected "$LEGACY_RELEASE_RETRY_UNIT::0644::prerequisite"
      --expected "$LEGACY_RELEASE_ACK_UNIT::0644::prerequisite"
      --expected "$LEGACY_RELEASE_RECONCILER_API_DROPIN::0644::consumer-dropin"
      --expected "$LEGACY_RELEASE_RECONCILER_NGINX_DROPIN::0644::consumer-dropin"
    )
    /usr/bin/python3 "$LEGACY_RELEASE_BOOTSTRAP" \
      --manifest "$LEGACY_RELEASE_INFRASTRUCTURE_COMMON_MANIFEST" \
      --verify-installed "${legacy_common_expected[@]}" || \
      die "immutable recovery ABI v1 common profile was not preserved exactly"
  fi

  LEGACY_RELEASE_MANAGED_INFRASTRUCTURE=0
  if [[ -e "$LEGACY_RELEASE_INFRASTRUCTURE_MANAGED_MANIFEST" || \
    -L "$LEGACY_RELEASE_INFRASTRUCTURE_MANAGED_MANIFEST" ]]; then
    [[ "$LEGACY_RELEASE_INFRASTRUCTURE" -eq 1 ]] || \
      die "recovery ABI v1 managed-local manifest exists without its common authority"
    LEGACY_RELEASE_MANAGED_INFRASTRUCTURE=1
    local legacy_managed_expected=(
      --expected "$RELEASE_ROLLBACK_DAEMON_PROBE::0755::prerequisite"
      --expected "$RELEASE_ROLLBACK_NATIVE_BOUNDARY::0755::prerequisite"
      --expected "$LEGACY_RELEASE_RECONCILER_DAEMON_DROPIN::0644::consumer-dropin"
    )
    /usr/bin/python3 "$LEGACY_RELEASE_BOOTSTRAP" \
      --manifest "$LEGACY_RELEASE_INFRASTRUCTURE_MANAGED_MANIFEST" \
      --verify-installed "${legacy_managed_expected[@]}" || \
      die "immutable recovery ABI v1 managed-local profile was not preserved exactly"
  fi
}

assert_loaded_release_consumer_dropins() {
  local unit_name="$1"
  local label="$2"
  local v2_dropin="$3"
  local legacy_dropin="$4"
  local require_legacy="${5:-$LEGACY_RELEASE_INFRASTRUCTURE}"
  local dropin_value path
  local dropins=()
  dropin_value="$(systemctl show "$unit_name" --property=DropInPaths --value)" || \
    die "unable to inspect loaded $label release drop-ins"
  read -r -a dropins <<<"$dropin_value"
  [[ " ${dropins[*]} " == *" $v2_dropin "* ]] || \
    die "loaded $label is missing its direct recovery ABI v2 dependency"
  if [[ "$require_legacy" -eq 1 ]]; then
    [[ " ${dropins[*]} " == *" $legacy_dropin "* ]] || \
      die "loaded $label discarded its immutable recovery ABI v1 dependency"
    [[ "${#dropins[@]}" -eq 2 ]] || \
      die "loaded $label has unexpected release dependency drop-ins"
  else
    [[ "${#dropins[@]}" -eq 1 ]] || \
      die "loaded $label has unexpected release dependency drop-ins"
  fi
  for path in "${dropins[@]}"; do
    [[ "$path" == "$v2_dropin" || \
      ( "$require_legacy" -eq 1 && "$path" == "$legacy_dropin" ) ]] || \
      die "loaded $label has unmanaged release dependency authority: $path"
  done
}

assert_loaded_recovery_v2_unit() {
  local unit_name="$1"
  local unit_path="$2"
  local expected_argv="$3"
  local label="$4"
  local load_state fragment need_reload dropins start_value restart
  local start_exec="" start_argv=""
  load_state="$(systemctl show "$unit_name" --property=LoadState --value)" || \
    die "unable to inspect loaded $label LoadState"
  fragment="$(systemctl show "$unit_name" --property=FragmentPath --value)" || \
    die "unable to inspect loaded $label FragmentPath"
  need_reload="$(systemctl show "$unit_name" --property=NeedDaemonReload --value)" || \
    die "unable to inspect loaded $label reload authority"
  dropins="$(systemctl show "$unit_name" --property=DropInPaths --value)" || \
    die "unable to inspect loaded $label drop-in authority"
  start_value="$(systemctl show "$unit_name" --property=ExecStart --value)" || \
    die "unable to inspect loaded $label ExecStart"
  restart="$(systemctl show "$unit_name" --property=Restart --value)" || \
    die "unable to inspect loaded $label restart policy"
  [[ "$load_state" == "loaded" && "$fragment" == "$unit_path" && \
    "$need_reload" == "no" && -z "$dropins" && "$restart" == "on-failure" ]] || \
    die "loaded $label differs from its fixed recovery ABI v2 unit authority"
  parse_loaded_exec_value "$start_value" start_exec start_argv || \
    die "loaded $label ExecStart is not parseable"
  [[ "$start_exec" == "/usr/bin/python3.11" && \
    "$start_argv" == "$expected_argv" ]] || \
    die "loaded $label does not execute the exact recovery ABI v2 engine command"
}

assert_loaded_legacy_bridge_unit() {
  local unit_name="$1"
  local unit_path="$2"
  local bridge_path="$3"
  local v2_unit="$4"
  local label="$5"
  local load_state fragment need_reload dropins start_value start_post restart
  local requires after active_state sub_state main_pid job
  local start_path_count start_exec="" start_argv=""
  load_state="$(systemctl show "$unit_name" --property=LoadState --value)" || \
    die "unable to inspect loaded $label LoadState"
  fragment="$(systemctl show "$unit_name" --property=FragmentPath --value)" || \
    die "unable to inspect loaded $label FragmentPath"
  need_reload="$(systemctl show "$unit_name" --property=NeedDaemonReload --value)" || \
    die "unable to inspect loaded $label reload authority"
  dropins="$(systemctl show "$unit_name" --property=DropInPaths --value)" || \
    die "unable to inspect loaded $label drop-in authority"
  start_value="$(systemctl show "$unit_name" --property=ExecStart --value)" || \
    die "unable to inspect loaded $label ExecStart"
  start_post="$(systemctl show "$unit_name" --property=ExecStartPost --value)" || \
    die "unable to inspect loaded $label ExecStartPost"
  restart="$(systemctl show "$unit_name" --property=Restart --value)" || \
    die "unable to inspect loaded $label restart policy"
  requires="$(systemctl show "$unit_name" --property=Requires --value)" || \
    die "unable to inspect loaded $label Requires authority"
  after="$(systemctl show "$unit_name" --property=After --value)" || \
    die "unable to inspect loaded $label ordering authority"
  active_state="$(systemctl show "$unit_name" --property=ActiveState --value)" || \
    die "unable to inspect loaded $label active state"
  sub_state="$(systemctl show "$unit_name" --property=SubState --value)" || \
    die "unable to inspect loaded $label substate"
  main_pid="$(systemctl show "$unit_name" --property=MainPID --value)" || \
    die "unable to inspect loaded $label MainPID"
  job="$(systemctl show "$unit_name" --property=Job --value)" || \
    die "unable to inspect loaded $label job"
  [[ "$load_state" == "loaded" && "$fragment" == "$unit_path" && \
    "$need_reload" == "no" && "$dropins" == "$bridge_path" && \
    -z "$start_post" && "$restart" == "no" && \
    "$active_state" == "inactive" && "$sub_state" == "dead" && \
    "$main_pid" == "0" && -z "$job" ]] || \
    die "loaded $label is not exactly quarantined by its recovery ABI v2 bridge"
  parse_loaded_exec_value "$start_value" start_exec start_argv || \
    die "loaded $label ExecStart is not parseable"
  start_path_count="$(grep -o 'path=' <<<"$start_value" | wc -l)"
  [[ "$start_path_count" -eq 1 && \
    "$start_exec" == "/usr/bin/true" && "$start_argv" == "/usr/bin/true" && \
    "$start_value" != *"$LEGACY_RELEASE_RECONCILER"* && \
    "$start_value" != *"$RELEASE_RECONCILER"* ]] || \
    die "loaded $label retains executable recovery semantics"
  systemd_word_list_has "$requires" "$v2_unit" || \
    die "loaded $label does not propagate its recovery ABI v2 bridge failure"
  systemd_word_list_has "$after" "$v2_unit" || \
    die "loaded $label is not ordered after its recovery ABI v2 bridge target"
}

check_versioned_release_consumers() {
  [[ "$SERVICE_PROJECT_ROOT" == "/opt/trex-webui/current" ]] || return 0
  [[ "$DAEMON_LIBEXEC_ROOT" == "/usr/libexec/trex-webui" && \
    "$RECOVERY_V2_ROOT" == "/usr/libexec/trex-webui/recovery-v2" && \
    "$RELEASE_BOOTSTRAP" == "/usr/libexec/trex-webui/recovery-v2/bootstrap_release_infrastructure.py" && \
    "$RELEASE_RECONCILER" == "/usr/libexec/trex-webui/recovery-v2/release_transaction.py" && \
    "$RELEASE_RECONCILER_UNIT" == "/etc/systemd/system/trex-webui-release-reconcile-v2.service" && \
    "$RELEASE_RETRY_UNIT" == "/etc/systemd/system/trex-webui-release-retry-v2.service" && \
    "$RELEASE_ACK_UNIT" == "/etc/systemd/system/trex-webui-release-consumer-ack-v2.service" && \
    "$RELEASE_RECONCILER_API_DROPIN" == "/etc/systemd/system/trex-webui-api.service.d/trex-webui-release-reconcile-v2.conf" && \
    "$RELEASE_RECONCILER_NGINX_DROPIN" == "/etc/systemd/system/nginx.service.d/trex-webui-release-reconcile-v2.conf" && \
    "$RELEASE_RECONCILER_DAEMON_DROPIN" == "/etc/systemd/system/trex-daemon-server.service.d/trex-webui-release-reconcile-v2.conf" && \
    "$LEGACY_RELEASE_RECONCILER_BRIDGE" == "/etc/systemd/system/trex-webui-release-reconcile.service.d/trex-webui-recovery-v2-bridge.conf" && \
    "$LEGACY_RELEASE_RETRY_BRIDGE" == "/etc/systemd/system/trex-webui-release-retry.service.d/trex-webui-recovery-v2-bridge.conf" && \
    "$LEGACY_RELEASE_ACK_BRIDGE" == "/etc/systemd/system/trex-webui-release-consumer-ack.service.d/trex-webui-recovery-v2-bridge.conf" && \
    "$RELEASE_STATE_ROOT" == "/var/lib/trex-webui-deploy" && \
    "$RELEASE_INFRASTRUCTURE_COMMON_MANIFEST" == "/var/lib/trex-webui-deploy/infrastructure-v2-common.json" && \
    "$RELEASE_INFRASTRUCTURE_MANAGED_MANIFEST" == "/var/lib/trex-webui-deploy/infrastructure-v2-managed-local.json" ]] || \
    die "versioned verification requires the exact fixed recovery ABI v2 targets"
  local previous=""
  previous="$(readlink -- "/opt/trex-webui/previous" 2>/dev/null || true)"
  if [[ -n "$previous" ]]; then
    [[ "$previous" =~ ^releases/sha256-[0-9a-f]{64}$ ]] || \
      die "previous release selector target is unsafe"
    [[ -d "/opt/trex-webui/$previous" && ! -L "/opt/trex-webui/$previous" ]] || \
      die "previous release selector is incomplete"
  fi

  [[ -f "$NGINX_CONF" && ! -L "$NGINX_CONF" ]] || \
    die "versioned Nginx configuration is missing or unsafe"
  [[ "$(stat -c '%u:%g %a %h' "$NGINX_CONF")" == "0:0 644 1" ]] || \
    die "versioned Nginx configuration has unsafe ownership or mode"
  trex_assert_root_controlled_authority_path \
    "$NGINX_CONF" "versioned Nginx configuration" || \
    die "versioned Nginx configuration authority is unsafe"
  [[ "$(grep -Fxc '    root /opt/trex-webui/current/apps/web/dist;' "$NGINX_CONF")" -eq 1 ]] || \
    die "Nginx does not consume the atomic current release selector"

  assert_release_artifact_matches \
    "$PROJECT_ROOT/deploy/bootstrap_release_infrastructure.py" \
    "$RELEASE_BOOTSTRAP" 755 "recovery ABI v2 bootstrap"
  assert_release_artifact_matches \
    "$PROJECT_ROOT/deploy/release_transaction.py" \
    "$RELEASE_RECONCILER" 755 "recovery ABI v2 engine"
  assert_release_artifact_matches \
    "$PROJECT_ROOT/deploy/trex_overview_contract.py" \
    "$RELEASE_OVERVIEW_VALIDATOR" 755 "recovery ABI v2 overview validator"
  assert_release_artifact_matches \
    "$PROJECT_ROOT/deploy/trex_persisted_state_contract.py" \
    "$RELEASE_STATE_VALIDATOR" 755 "recovery ABI v2 persisted-state validator"
  assert_release_artifact_matches \
    "$PROJECT_ROOT/deploy/systemd/trex-webui-release-reconcile-v2.service" \
    "$RELEASE_RECONCILER_UNIT" 644 "recovery ABI v2 reconciler unit"
  assert_release_artifact_matches \
    "$PROJECT_ROOT/deploy/systemd/trex-webui-release-retry-v2.service" \
    "$RELEASE_RETRY_UNIT" 644 "recovery ABI v2 retry unit"
  assert_release_artifact_matches \
    "$PROJECT_ROOT/deploy/systemd/trex-webui-release-consumer-ack-v2.service" \
    "$RELEASE_ACK_UNIT" 644 "recovery ABI v2 acknowledgement unit"
  assert_release_artifact_matches \
    "$PROJECT_ROOT/deploy/systemd/trex-webui-release-reconcile-v2.conf" \
    "$RELEASE_RECONCILER_API_DROPIN" 644 "API recovery ABI v2 dependency"
  assert_release_artifact_matches \
    "$PROJECT_ROOT/deploy/systemd/trex-webui-release-reconcile-v2.conf" \
    "$RELEASE_RECONCILER_NGINX_DROPIN" 644 "Nginx recovery ABI v2 dependency"
  assert_release_artifact_matches \
    "$PROJECT_ROOT/deploy/systemd/trex-webui-release-reconcile-v1-bridge-v2.conf" \
    "$LEGACY_RELEASE_RECONCILER_BRIDGE" 644 "recovery ABI v1 reconciler bridge"
  assert_release_artifact_matches \
    "$PROJECT_ROOT/deploy/systemd/trex-webui-release-retry-v1-bridge-v2.conf" \
    "$LEGACY_RELEASE_RETRY_BRIDGE" 644 "recovery ABI v1 retry bridge"
  assert_release_artifact_matches \
    "$PROJECT_ROOT/deploy/systemd/trex-webui-release-consumer-ack-v1-bridge-v2.conf" \
    "$LEGACY_RELEASE_ACK_BRIDGE" 644 "recovery ABI v1 acknowledgement bridge"
  if [[ "$CHECK_DAEMON" -eq 1 || \
    -e "$RELEASE_INFRASTRUCTURE_MANAGED_MANIFEST" || \
    -L "$RELEASE_INFRASTRUCTURE_MANAGED_MANIFEST" ]]; then
    assert_release_artifact_matches \
      "$PROJECT_ROOT/deploy/daemon_rpc_probe.py" \
      "$RELEASE_ROLLBACK_DAEMON_PROBE" 755 \
      "recovery ABI v2 rollback daemon probe"
    assert_release_artifact_matches \
      "$PROJECT_ROOT/deploy/trex_native_boundary.sh" \
      "$RELEASE_ROLLBACK_NATIVE_BOUNDARY" 755 \
      "recovery ABI v2 rollback native boundary"
    assert_release_artifact_matches \
      "$PROJECT_ROOT/deploy/systemd/trex-webui-release-reconcile-v2.conf" \
      "$RELEASE_RECONCILER_DAEMON_DROPIN" 644 \
      "daemon recovery ABI v2 dependency"
  fi
  verify_release_infrastructure_manifests
  if [[ "$LEGACY_RELEASE_INFRASTRUCTURE" -eq 0 ]]; then
    local legacy_artifact
    for legacy_artifact in \
      "$LEGACY_RELEASE_BOOTSTRAP" \
      "$LEGACY_RELEASE_RECONCILER" \
      "$LEGACY_RELEASE_RECONCILER_UNIT" \
      "$LEGACY_RELEASE_RETRY_UNIT" \
      "$LEGACY_RELEASE_ACK_UNIT" \
      "$LEGACY_RELEASE_RECONCILER_API_DROPIN" \
      "$LEGACY_RELEASE_RECONCILER_NGINX_DROPIN" \
      "$LEGACY_RELEASE_RECONCILER_DAEMON_DROPIN"; do
      [[ ! -e "$legacy_artifact" && ! -L "$legacy_artifact" ]] || \
        die "unmanifested recovery ABI v1 artifact remains installed: $legacy_artifact"
    done
  elif [[ "$LEGACY_RELEASE_MANAGED_INFRASTRUCTURE" -eq 0 ]]; then
    [[ ! -e "$LEGACY_RELEASE_RECONCILER_DAEMON_DROPIN" && \
      ! -L "$LEGACY_RELEASE_RECONCILER_DAEMON_DROPIN" ]] || \
      die "unmanifested managed-local recovery ABI v1 drop-in remains installed"
  fi
  [[ -d "$RELEASE_STATE_ROOT" && ! -L "$RELEASE_STATE_ROOT" ]] || \
    die "root-only release transaction state directory is missing or unsafe"
  [[ "$(stat -c '%u:%g %a' "$RELEASE_STATE_ROOT")" == "0:0 700" ]] || \
    die "release transaction state directory must be root:root 0700"
  [[ -f "$RELEASE_STATE_ROOT/transaction.json" && \
    ! -L "$RELEASE_STATE_ROOT/transaction.json" ]] || \
    die "durable release transaction journal is missing or unsafe"
  [[ "$(stat -c '%u:%g %a %h' "$RELEASE_STATE_ROOT/transaction.json")" == "0:0 600 1" ]] || \
    die "release transaction journal must be root:root 0600 with one link"
  check_versioned_release_selinux
  pass "API and Nginx consume the atomic release selector"
}

check_systemd() {
  if [[ "$CHECK_SYSTEMD" -eq 0 ]]; then
    return
  fi
  have_cmd systemctl || die "systemctl not found; rerun with --skip-systemd on non-systemd hosts"
  systemctl is-active --quiet trex-webui-api.service || die "trex-webui-api.service is not active"
  assert_managed_api_service_contract "$SERVICE_PROJECT_ROOT" "$API_UNIT" "$API_PROC_ROOT" || \
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
  if [[ "$SERVICE_PROJECT_ROOT" == "/opt/trex-webui/current" ]]; then
    assert_loaded_recovery_v2_unit \
      trex-webui-release-reconcile-v2.service \
      "$RELEASE_RECONCILER_UNIT" \
      "/usr/bin/python3.11 $RELEASE_RECONCILER --deployment-lock /run/lock/trex-webui/deploy.lock --supervise-errors reconcile" \
      "recovery ABI v2 reconciler"
    assert_loaded_recovery_v2_unit \
      trex-webui-release-retry-v2.service \
      "$RELEASE_RETRY_UNIT" \
      "/usr/bin/python3.11 $RELEASE_RECONCILER --deployment-lock /run/lock/trex-webui/deploy.lock --retry-on-lock-busy reconcile" \
      "recovery ABI v2 retry service"
    assert_loaded_recovery_v2_unit \
      trex-webui-release-consumer-ack-v2.service \
      "$RELEASE_ACK_UNIT" \
      "/usr/bin/python3.11 $RELEASE_RECONCILER ack-consumers" \
      "recovery ABI v2 acknowledgement service"
    if [[ "$LEGACY_RELEASE_INFRASTRUCTURE" -eq 1 ]]; then
      assert_loaded_legacy_bridge_unit \
        trex-webui-release-reconcile.service \
        "$LEGACY_RELEASE_RECONCILER_UNIT" \
        "$LEGACY_RELEASE_RECONCILER_BRIDGE" \
        trex-webui-release-reconcile-v2.service \
        "recovery ABI v1 reconciler"
      assert_loaded_legacy_bridge_unit \
        trex-webui-release-retry.service \
        "$LEGACY_RELEASE_RETRY_UNIT" \
        "$LEGACY_RELEASE_RETRY_BRIDGE" \
        trex-webui-release-retry-v2.service \
        "recovery ABI v1 retry service"
      assert_loaded_legacy_bridge_unit \
        trex-webui-release-consumer-ack.service \
        "$LEGACY_RELEASE_ACK_UNIT" \
        "$LEGACY_RELEASE_ACK_BRIDGE" \
        trex-webui-release-consumer-ack-v2.service \
        "recovery ABI v1 acknowledgement service"
    fi
    assert_loaded_release_consumer_dropins \
      trex-webui-api.service \
      "API unit" \
      "$RELEASE_RECONCILER_API_DROPIN" \
      "$LEGACY_RELEASE_RECONCILER_API_DROPIN"
    assert_loaded_release_reconcile_dependency \
      nginx.service \
      "Nginx unit" || \
      die "Nginx release reconciliation dependency is not loaded"
    assert_loaded_release_consumer_dropins \
      nginx.service \
      "Nginx unit" \
      "$RELEASE_RECONCILER_NGINX_DROPIN" \
      "$LEGACY_RELEASE_RECONCILER_NGINX_DROPIN"
    if [[ "$CHECK_DAEMON" -eq 1 ]]; then
      [[ -f "$DAEMON_UNIT" && ! -L "$DAEMON_UNIT" ]] || \
        die "versioned daemon unit is missing or unsafe: $DAEMON_UNIT"
      [[ "$(stat -c '%u:%g %a %h' "$DAEMON_UNIT")" == "0:0 644 1" ]] || \
        die "versioned daemon unit must be root:root 0644 with one hard link"
      trex_assert_root_controlled_authority_path \
        "$DAEMON_UNIT" \
        "versioned daemon unit" || \
        die "versioned daemon unit authority is unsafe"
      assert_release_reconcile_unit_dependency \
        "$DAEMON_UNIT" \
        "on-disk daemon unit" || \
        die "on-disk daemon release reconciliation dependency is incomplete"
      assert_loaded_release_reconcile_dependency \
        trex-daemon-server.service \
        "daemon unit" || \
        die "daemon release reconciliation dependency is not loaded"
      assert_loaded_release_consumer_dropins \
        trex-daemon-server.service \
        "daemon unit" \
        "$RELEASE_RECONCILER_DAEMON_DROPIN" \
        "$LEGACY_RELEASE_RECONCILER_DAEMON_DROPIN" \
        "$LEGACY_RELEASE_MANAGED_INFRASTRUCTURE"
    fi
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

    expected_profile_roots="$daemon_working_directory/stl:$SERVICE_PROJECT_ROOT/profiles:/var/lib/trex-webui/profiles"
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
  python3.11 "$SCRIPT_DIR/trex_overview_contract.py" <<<"$body" || \
    die "/api/system/overview failed the strict real-TRex contract"
  pass "real TRex overview responds"
}

main() {
  parse_args "$@"
  have_cmd curl || die "curl is required"
  log "Verifying TRex WebUI deployment at $BASE_URL"
  check_layout
  check_versioned_release_consumers
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
