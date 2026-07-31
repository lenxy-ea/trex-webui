#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
[[ -f "$SCRIPT_DIR/path_safety.sh" ]] || { printf 'error: missing %s/path_safety.sh\n' "$SCRIPT_DIR" >&2; exit 1; }
# shellcheck source=deploy/path_safety.sh
source "$SCRIPT_DIR/path_safety.sh"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

ARCHIVE=""
ARCHIVE_SHA256=""
ARCHIVE_EXPECTED_SHA256=""
ARCHIVE_STAGED_PATH=""
ARCHIVE_TOP=""
ARCHIVE_SOURCE_ROOT=""
INSTALL_ROOT=""
WEB_ROOT="/var/www/trex-webui/dist"
STATIC_BACKUP_ROOT="/var/www/trex-webui/backups"
SOURCE_BACKUP_ROOT="/var/backups/trex-webui/source"
DRY_RUN=0
RUN_BUILD=1
RUN_ENABLE=1
RUN_RESTART=1
RUN_VERIFY=0
VERIFY_BASE_URL="http://127.0.0.1"
VERIFY_TREX=0
INSTALL_NGINX=0
INSTALL_PYTHON_DEPS=0
PYTHON_DEPS_EXPLICIT=0
RUN_SELINUX=0
RUN_FIREWALLD=0
MANAGE_LOCAL_DAEMON=1
ALLOW_DAEMON_RUNTIME_RESTART=0
SYNC_METHOD="auto"
STAGING_ROOT=""
SOURCE_BACKUP_DIR=""
SOURCE_MUTATION_STARTED=0
INSTALL_ROOT_EXISTED=0
ARCHIVE_API_STATE_CAPTURED=0
ARCHIVE_API_SERVICE_MATCHED=0
ARCHIVE_API_WAS_ACTIVE=0
ARCHIVE_API_OLD_EXEC_PATH=""
ARCHIVE_API_MUTATION_GUARD_APPLIED=0
ARCHIVE_API_READINESS_URL="http://127.0.0.1:8080/api/health"
ARCHIVE_API_READINESS_ATTEMPTS=40
ARCHIVE_API_READINESS_INTERVAL_SECONDS="0.5"
VENV_RUNTIME_MARKER_NAME=".trex-webui-venv-runtime"
VENV_RUNTIME_MARKER_VALUE="trex-webui-venv-runtime-v1"
VENV_RELEASE_MARKER_NAME=".trex-webui-venv-release"
DAEMON_SYSTEMD_SERVICE_TARGET="/etc/systemd/system/trex-daemon-server.service"
DAEMON_LIBEXEC_ROOT="${DAEMON_LIBEXEC_ROOT:-/usr/libexec/trex-webui}"
DAEMON_SUPERVISOR_TARGET="${DAEMON_SUPERVISOR_TARGET:-$DAEMON_LIBEXEC_ROOT/trex_daemon_supervisor.py}"
DAEMON_RPC_PROBE_TARGET="${DAEMON_RPC_PROBE_TARGET:-$DAEMON_LIBEXEC_ROOT/daemon_rpc_probe.py}"
DAEMON_NATIVE_BOUNDARY_TARGET="${DAEMON_NATIVE_BOUNDARY_TARGET:-$DAEMON_LIBEXEC_ROOT/trex_native_boundary.sh}"
NFTABLES_CONFIG_PATH="${NFTABLES_CONFIG_PATH:-/etc/sysconfig/nftables.conf}"
NFTABLES_SYSTEMD_DROPIN_ROOT="${NFTABLES_SYSTEMD_DROPIN_ROOT:-/etc/systemd/system/nftables.service.d}"
NFTABLES_SYSTEMD_DROPIN_TARGET="${NFTABLES_SYSTEMD_DROPIN_TARGET:-$NFTABLES_SYSTEMD_DROPIN_ROOT/trex-webui-native-boundary.conf}"
TREX_DAEMON_SCRIPTS_DIR="${TREX_DAEMON_SCRIPTS_DIR:-/opt/trex-core/scripts}"
TREX_DAEMON_BIN="${TREX_DAEMON_BIN:-$TREX_DAEMON_SCRIPTS_DIR/trex_daemon_server}"
SERVICE_ENV_FILE="$TREX_MANAGED_API_ENV_FILE_DEFAULT"

cleanup_staging() {
  if [[ -n "${STAGING_ROOT:-}" && -e "$STAGING_ROOT" ]]; then
    trex_safe_remove_tree "$STAGING_ROOT" "upgrade staging directory" || return
  fi
}

rollback_install_root() {
  [[ "$SOURCE_MUTATION_STARTED" -eq 1 || "$ARCHIVE_API_MUTATION_GUARD_APPLIED" -eq 1 ]] || return 0

  local status=0 source_restored=1
  if [[ "$SOURCE_MUTATION_STARTED" -eq 1 ]]; then
    log "Restoring install source after failed archive upgrade"
    if [[ "$INSTALL_ROOT_EXISTED" -eq 1 ]]; then
      if [[ ! -d "$SOURCE_BACKUP_DIR" ]]; then
        printf 'error: source rollback backup is missing: %s\n' "$SOURCE_BACKUP_DIR" >&2
        source_restored=0
        status=1
      fi
      if [[ "$source_restored" -eq 1 && ! -d "$INSTALL_ROOT" ]]; then
        if ! mkdir -p "$INSTALL_ROOT" || ! trex_write_managed_marker "$INSTALL_ROOT"; then
          source_restored=0
          status=1
        fi
      fi
      if [[ "$source_restored" -eq 1 ]]; then
        if ! clear_install_root_preserving_runtimes || \
          ! cp -a "$SOURCE_BACKUP_DIR/." "$INSTALL_ROOT/"; then
          source_restored=0
          status=1
        fi
      fi
    elif [[ -e "$INSTALL_ROOT" || -L "$INSTALL_ROOT" ]]; then
      if ! trex_safe_remove_tree "$INSTALL_ROOT" "new install root rollback target" "/opt/trex-webui"; then
        source_restored=0
        status=1
      fi
    fi
    if [[ "$source_restored" -eq 1 ]]; then
      SOURCE_MUTATION_STARTED=0
    fi
  fi

  if [[ "$ARCHIVE_API_MUTATION_GUARD_APPLIED" -eq 1 ]]; then
    if [[ "$source_restored" -eq 0 && "$ARCHIVE_API_WAS_ACTIVE" -eq 1 ]]; then
      printf 'error: restored API remains stopped because source rollback was incomplete\n' >&2
      systemctl stop trex-webui-api.service >/dev/null 2>&1 || true
      status=1
    elif restore_archive_api_service_state; then
      ARCHIVE_API_MUTATION_GUARD_APPLIED=0
    else
      status=1
    fi
  fi
  return "$status"
}

upgrade_exit() {
  local status=$?
  trap - EXIT
  set +e
  if [[ "$status" -ne 0 ]]; then
    rollback_install_root || status=1
    cleanup_staging || status=1
    exit "$status"
  fi
  if ! cleanup_staging; then
    printf 'warning: upgrade committed, but verified archive staging cleanup was incomplete: %s\n' \
      "${STAGING_ROOT:-unknown}" >&2
  fi
  exit 0
}

trap upgrade_exit EXIT

usage() {
  cat <<'USAGE'
Usage: deploy/upgrade.sh [options]

Upgrade a TRex WebUI LAN deployment from the current checkout or a release archive.

Options:
  --archive PATH             Upgrade source tar.gz created by deploy/package.sh
  --sha256 HEX               Expected archive SHA-256; otherwise <archive>.sha256 is required
  --install-root PATH        Installed project path. Default: current checkout, or /opt/trex-webui with --archive
  --web-root PATH            Nginx static dist path. Default: /var/www/trex-webui/dist
  --backup-root PATH         Static dist backup directory. Default: /var/www/trex-webui/backups
  --source-backup-root PATH  Source backup directory for --archive upgrades. Default: /var/backups/trex-webui/source
  --dry-run                  Print the upgrade actions without changing the host
  --install-nginx            Pass through to deploy/install.sh
  --install-python-deps      Atomically stage and publish .venv from apps/api/requirements.lock
  --skip-python-deps         Do not install Python deps for --archive upgrades
  --skip-build               Do not build WebUI for checkout upgrades; archive upgrades always reuse packaged dist
  --skip-enable              Do not enable trex-daemon-server, trex-webui-api, or nginx
  --skip-restart             Do not restart services; incompatible with --verify, and archive mutation fails if the matching API is active
  --external-daemon          Do not install, enable, restart, or verify a local daemon
  --allow-daemon-runtime-restart
                              Permit maintenance that interrupts running/reserved/unknown daemon state
  --selinux                  Pass through to deploy/install.sh
  --firewalld                Pass through to deploy/install.sh
  --sync-method METHOD       Archive sync method: auto, rsync, or portable. Default: auto
  --verify                   Run deploy/verify.sh after install; requires restart
  --verify-base-url URL      URL used by --verify. Default: http://127.0.0.1
  --verify-trex              Include real TRex overview check during --verify
  -h, --help                 Show this help
USAGE
}

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

log() {
  printf '==> %s\n' "$*"
}

run() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '+'
    printf ' %q' "$@"
    printf '\n'
    return 0
  fi
  "$@"
}

have_cmd() {
  command -v "$1" >/dev/null 2>&1
}

timestamp() {
  date -u +%Y%m%dT%H%M%SZ
}

archive_api_loaded_exec_path() {
  local value exec_path argv expected_argv runtime_suffix
  value="$(systemctl show trex-webui-api.service --property=ExecStart --value)" || return
  [[ -n "$value" && "$value" != *$'\n'* ]] || return 1

  exec_path="$(sed -n 's/^[^{]*{[[:space:]]*path=\([^ ;}]*\)[[:space:]]*;.*/\1/p' <<<"$value")"
  argv="$(sed -n \
    's/^[^{]*{[^}]*[[:space:]]argv\[\]=\(.*\)[[:space:]];[[:space:]]ignore_errors=.*/\1/p' \
    <<<"$value")"
  [[ "$exec_path" == /* && -n "$argv" ]] || return 1
  case "$exec_path" in
    "$INSTALL_ROOT/.venv/bin/python")
      ;;
    "$INSTALL_ROOT"/.venv.runtime-*/bin/python)
      runtime_suffix="${exec_path#"$INSTALL_ROOT/.venv.runtime-"}"
      runtime_suffix="${runtime_suffix%/bin/python}"
      [[ -n "$runtime_suffix" && "$runtime_suffix" != */* ]] || return 1
      ;;
    *)
      return 1
      ;;
  esac

  expected_argv="$exec_path -m uvicorn app.main:app --app-dir $INSTALL_ROOT/apps/api --host 127.0.0.1 --port 8080"
  [[ "$argv" == "$expected_argv" ]] || return 1
  printf '%s\n' "$exec_path"
}

capture_archive_api_service_state() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '+ inspect loaded trex-webui-api.service for exact WorkingDirectory, ExecStart, and --app-dir ownership of %q; if active, require restart permission before source mutation\n' \
      "$INSTALL_ROOT"
    return 0
  fi

  have_cmd systemctl || die "systemctl is required to guard archive source mutation"
  ARCHIVE_API_STATE_CAPTURED=1
  ARCHIVE_API_SERVICE_MATCHED=0
  ARCHIVE_API_WAS_ACTIVE=0
  ARCHIVE_API_OLD_EXEC_PATH=""

  local load_state working_directory
  load_state="$(systemctl show trex-webui-api.service --property=LoadState --value)" || \
    die "unable to inspect trex-webui-api.service before archive source mutation"
  if [[ "$load_state" != "loaded" ]]; then
    log "No loaded trex-webui-api.service targets archive install root $INSTALL_ROOT"
    return 0
  fi

  working_directory="$(systemctl show trex-webui-api.service --property=WorkingDirectory --value)" || \
    die "unable to inspect trex-webui-api.service WorkingDirectory before archive source mutation"
  if [[ "$working_directory" != "$INSTALL_ROOT" ]]; then
    log "Loaded trex-webui-api.service belongs to $working_directory, not archive install root $INSTALL_ROOT; leaving it untouched"
    return 0
  fi

  ARCHIVE_API_OLD_EXEC_PATH="$(archive_api_loaded_exec_path)" || \
    die "trex-webui-api.service has the archive install root WorkingDirectory but no exact matching ExecStart/--app-dir contract"
  [[ -n "$ARCHIVE_API_OLD_EXEC_PATH" ]] || \
    die "trex-webui-api.service has no parseable interpreter for archive source mutation"
  ARCHIVE_API_SERVICE_MATCHED=1

  if systemctl is-active --quiet trex-webui-api.service; then
    ARCHIVE_API_WAS_ACTIVE=1
    [[ "$RUN_RESTART" -eq 1 ]] || \
      die "--skip-restart cannot mutate $INSTALL_ROOT while its matching trex-webui-api.service is active"
  fi
}

stop_archive_api_service_for_source_mutation() {
  [[ "$ARCHIVE_API_SERVICE_MATCHED" -eq 1 ]] || return 0
  [[ "$ARCHIVE_API_STATE_CAPTURED" -eq 1 ]] || \
    die "archive API service state was not captured before source mutation"

  local load_state working_directory current_exec
  load_state="$(systemctl show trex-webui-api.service --property=LoadState --value)" || \
    die "unable to revalidate trex-webui-api.service before archive source mutation"
  working_directory="$(systemctl show trex-webui-api.service --property=WorkingDirectory --value)" || \
    die "unable to revalidate trex-webui-api.service WorkingDirectory before archive source mutation"
  current_exec="$(archive_api_loaded_exec_path)" || \
    die "trex-webui-api.service ExecStart/--app-dir changed before archive source mutation"
  [[ "$load_state" == "loaded" && "$working_directory" == "$INSTALL_ROOT" && \
    "$current_exec" == "$ARCHIVE_API_OLD_EXEC_PATH" ]] || \
    die "trex-webui-api.service identity changed before archive source mutation"

  ARCHIVE_API_MUTATION_GUARD_APPLIED=1
  log "Stopping the matching API before archive source mutation"
  systemctl stop trex-webui-api.service || \
    die "unable to stop trex-webui-api.service before archive source mutation"
  if systemctl is-active --quiet trex-webui-api.service; then
    die "trex-webui-api.service remained active; refusing archive source mutation"
  fi
}

wait_for_restored_archive_api_readiness() {
  have_cmd curl || {
    printf 'error: curl is required to verify the restored API after archive rollback\n' >&2
    return 1
  }

  local attempt response=""
  for ((attempt = 1; attempt <= ARCHIVE_API_READINESS_ATTEMPTS; attempt += 1)); do
    response=""
    if response="$(curl -fsS --noproxy '*' \
      --connect-timeout 1 --max-time 1 \
      -H 'Accept: application/json' \
      "$ARCHIVE_API_READINESS_URL" 2>/dev/null)" && \
      grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"' <<<"$response" && \
      systemctl is-active --quiet trex-webui-api.service; then
      log "Restored API readiness confirmed after archive rollback"
      return 0
    fi

    if systemctl is-failed --quiet trex-webui-api.service; then
      break
    fi
    if ((attempt < ARCHIVE_API_READINESS_ATTEMPTS)); then
      sleep "$ARCHIVE_API_READINESS_INTERVAL_SECONDS"
    fi
  done

  printf 'error: restored trex-webui-api.service did not become ready at %s after %s attempts\n' \
    "$ARCHIVE_API_READINESS_URL" "$ARCHIVE_API_READINESS_ATTEMPTS" >&2
  systemctl status trex-webui-api.service --no-pager >&2 || true
  return 1
}

archive_api_main_pid_exec_path() {
  local main_pid process_exec
  main_pid="$(systemctl show trex-webui-api.service --property=MainPID --value)" || return
  [[ "$main_pid" =~ ^[1-9][0-9]*$ && -r "/proc/$main_pid/cmdline" ]] || {
    printf 'error: restored API MainPID is missing after archive rollback readiness: %s\n' \
      "${main_pid:-missing}" >&2
    return 1
  }
  IFS= read -r -d '' process_exec <"/proc/$main_pid/cmdline" || {
    printf 'error: unable to read restored API MainPID command line: %s\n' "$main_pid" >&2
    return 1
  }
  printf '%s\n' "$process_exec"
}

verify_restored_archive_api_identity() {
  local expected_exec="$1"
  local load_state working_directory loaded_exec process_exec

  systemctl is-active --quiet trex-webui-api.service || {
    printf 'error: restored trex-webui-api.service is not active after readiness succeeded\n' >&2
    return 1
  }
  load_state="$(systemctl show trex-webui-api.service --property=LoadState --value)" || return
  working_directory="$(systemctl show trex-webui-api.service --property=WorkingDirectory --value)" || return
  loaded_exec="$(archive_api_loaded_exec_path)" || {
    printf 'error: restored API loaded ExecStart/--app-dir contract is invalid\n' >&2
    return 1
  }
  [[ "$load_state" == "loaded" && "$working_directory" == "$INSTALL_ROOT" ]] || {
    printf 'error: restored API loaded unit no longer targets install root %s\n' "$INSTALL_ROOT" >&2
    return 1
  }
  [[ "$loaded_exec" == "$expected_exec" ]] || {
    printf 'error: restored API loaded ExecStart mismatch: expected %s, got %s\n' \
      "$expected_exec" "${loaded_exec:-missing}" >&2
    return 1
  }

  process_exec="$(archive_api_main_pid_exec_path)" || return
  [[ "$process_exec" == "$expected_exec" ]] || {
    printf 'error: restored API MainPID interpreter mismatch: expected %s, got %s\n' \
      "$expected_exec" "${process_exec:-missing}" >&2
    return 1
  }
  log "Restored API loaded ExecStart and MainPID use $expected_exec"
}

restore_archive_api_service_state() {
  [[ "$ARCHIVE_API_SERVICE_MATCHED" -eq 1 ]] || return 0
  have_cmd systemctl || {
    printf 'error: systemctl is required to restore API state after archive rollback\n' >&2
    return 1
  }

  if [[ "$ARCHIVE_API_WAS_ACTIVE" -eq 0 ]]; then
    log "Keeping the API stopped because it was inactive before the archive transaction"
    systemctl stop trex-webui-api.service || return
    if systemctl is-active --quiet trex-webui-api.service; then
      printf 'error: trex-webui-api.service became active during inactive-state rollback\n' >&2
      return 1
    fi
    return 0
  fi

  [[ -n "$ARCHIVE_API_OLD_EXEC_PATH" ]] || {
    printf 'error: prior API interpreter is unavailable for archive rollback\n' >&2
    return 1
  }
  log "Reloading the restored unit and restarting the API after archive rollback"
  systemctl daemon-reload || return
  systemctl restart trex-webui-api.service || return
  wait_for_restored_archive_api_readiness || return
  verify_restored_archive_api_identity "$ARCHIVE_API_OLD_EXEC_PATH"
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --archive)
        ARCHIVE="${2:-}"
        [[ -n "$ARCHIVE" ]] || die "--archive requires a value"
        shift 2
        ;;
      --sha256)
        ARCHIVE_SHA256="${2:-}"
        [[ "$ARCHIVE_SHA256" =~ ^[[:xdigit:]]{64}$ ]] || die "--sha256 must be exactly 64 hexadecimal characters"
        ARCHIVE_SHA256="${ARCHIVE_SHA256,,}"
        shift 2
        ;;
      --install-root)
        INSTALL_ROOT="${2:-}"
        [[ -n "$INSTALL_ROOT" ]] || die "--install-root requires a value"
        shift 2
        ;;
      --web-root)
        WEB_ROOT="${2:-}"
        [[ -n "$WEB_ROOT" ]] || die "--web-root requires a value"
        shift 2
        ;;
      --backup-root)
        STATIC_BACKUP_ROOT="${2:-}"
        [[ -n "$STATIC_BACKUP_ROOT" ]] || die "--backup-root requires a value"
        shift 2
        ;;
      --source-backup-root)
        SOURCE_BACKUP_ROOT="${2:-}"
        [[ -n "$SOURCE_BACKUP_ROOT" ]] || die "--source-backup-root requires a value"
        shift 2
        ;;
      --dry-run)
        DRY_RUN=1
        shift
        ;;
      --install-nginx)
        INSTALL_NGINX=1
        shift
        ;;
      --install-python-deps)
        INSTALL_PYTHON_DEPS=1
        PYTHON_DEPS_EXPLICIT=1
        shift
        ;;
      --skip-python-deps)
        INSTALL_PYTHON_DEPS=0
        PYTHON_DEPS_EXPLICIT=1
        shift
        ;;
      --skip-build)
        RUN_BUILD=0
        shift
        ;;
      --skip-enable)
        RUN_ENABLE=0
        shift
        ;;
      --skip-restart)
        RUN_RESTART=0
        shift
        ;;
      --external-daemon)
        MANAGE_LOCAL_DAEMON=0
        shift
        ;;
      --allow-daemon-runtime-restart)
        ALLOW_DAEMON_RUNTIME_RESTART=1
        shift
        ;;
      --selinux)
        RUN_SELINUX=1
        shift
        ;;
      --firewalld)
        RUN_FIREWALLD=1
        shift
        ;;
      --sync-method)
        SYNC_METHOD="${2:-}"
        [[ "$SYNC_METHOD" =~ ^(auto|rsync|portable)$ ]] || die "--sync-method must be auto, rsync, or portable"
        shift 2
        ;;
      --verify)
        RUN_VERIFY=1
        shift
        ;;
      --verify-base-url)
        VERIFY_BASE_URL="${2:-}"
        [[ -n "$VERIFY_BASE_URL" ]] || die "--verify-base-url requires a value"
        shift 2
        ;;
      --verify-trex)
        RUN_VERIFY=1
        VERIFY_TREX=1
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
  if [[ "$RUN_VERIFY" -eq 1 && "$RUN_RESTART" -eq 0 ]]; then
    die "--verify cannot be combined with --skip-restart because verification must inspect the newly activated API runtime"
  fi
}

normalize_paths() {
  if [[ -n "$ARCHIVE" ]]; then
    [[ -f "$ARCHIVE" ]] || die "archive not found: $ARCHIVE"
    ARCHIVE="$(trex_canonical_path "$ARCHIVE" "release archive")" || die "unsafe release archive path"
    INSTALL_ROOT="${INSTALL_ROOT:-/opt/trex-webui}"
    if [[ "$PYTHON_DEPS_EXPLICIT" -eq 0 ]]; then
      INSTALL_PYTHON_DEPS=1
    fi
  else
    [[ -z "$ARCHIVE_SHA256" ]] || die "--sha256 requires --archive"
    INSTALL_ROOT="${INSTALL_ROOT:-$PROJECT_ROOT}"
  fi

  PROJECT_ROOT="$(trex_canonical_path "$PROJECT_ROOT" "upgrade project root")" || die "unsafe project root"
  INSTALL_ROOT="$(trex_canonical_path "$INSTALL_ROOT" "install root")" || die "unsafe install root"
  WEB_ROOT="$(trex_canonical_path "$WEB_ROOT" "web root")" || die "unsafe web root"
  STATIC_BACKUP_ROOT="$(trex_canonical_path "$STATIC_BACKUP_ROOT" "static backup root")" || die "unsafe static backup root"
  SOURCE_BACKUP_ROOT="$(trex_canonical_path "$SOURCE_BACKUP_ROOT" "source backup root")" || die "unsafe source backup root"
  DAEMON_SYSTEMD_SERVICE_TARGET="$(trex_canonical_path "$DAEMON_SYSTEMD_SERVICE_TARGET" "daemon systemd service target")" || die "unsafe daemon systemd service target"
  DAEMON_LIBEXEC_ROOT="$(trex_canonical_path "$DAEMON_LIBEXEC_ROOT" "daemon libexec root")" || die "unsafe daemon libexec root"
  DAEMON_SUPERVISOR_TARGET="$(trex_canonical_path "$DAEMON_SUPERVISOR_TARGET" "daemon supervisor target")" || die "unsafe daemon supervisor target"
  DAEMON_RPC_PROBE_TARGET="$(trex_canonical_path "$DAEMON_RPC_PROBE_TARGET" "daemon RPC probe target")" || die "unsafe daemon RPC probe target"
  DAEMON_NATIVE_BOUNDARY_TARGET="$(trex_canonical_path "$DAEMON_NATIVE_BOUNDARY_TARGET" "daemon native boundary target")" || die "unsafe daemon native boundary target"
  NFTABLES_CONFIG_PATH="$(trex_canonical_path "$NFTABLES_CONFIG_PATH" "nftables service configuration")" || die "unsafe nftables service configuration"
  NFTABLES_SYSTEMD_DROPIN_ROOT="$(trex_canonical_path "$NFTABLES_SYSTEMD_DROPIN_ROOT" "nftables systemd drop-in root")" || die "unsafe nftables systemd drop-in root"
  NFTABLES_SYSTEMD_DROPIN_TARGET="$(trex_canonical_path "$NFTABLES_SYSTEMD_DROPIN_TARGET" "nftables systemd drop-in target")" || die "unsafe nftables systemd drop-in target"
  TREX_DAEMON_SCRIPTS_DIR="$(trex_canonical_path "$TREX_DAEMON_SCRIPTS_DIR" "TRex daemon scripts directory")" || die "unsafe TRex daemon scripts directory"
  TREX_DAEMON_BIN="$(trex_canonical_path "$TREX_DAEMON_BIN" "TRex daemon executable")" || die "unsafe TRex daemon executable"

  trex_assert_managed_path "$INSTALL_ROOT" "install root" "/opt/trex-webui" || die "unsafe install root"
  trex_assert_managed_path "$WEB_ROOT" "web root" "/var/www/trex-webui" || die "unsafe web root"
  trex_assert_managed_path "$STATIC_BACKUP_ROOT" "static backup root" "/var/www/trex-webui" || die "unsafe static backup root"
  trex_assert_managed_path "$SOURCE_BACKUP_ROOT" "source backup root" "/var/backups/trex-webui" || die "unsafe source backup root"
  trex_assert_managed_path "$DAEMON_LIBEXEC_ROOT" "daemon libexec root" "/usr/libexec/trex-webui" || die "unsafe daemon libexec root"
  trex_assert_managed_path "$NFTABLES_SYSTEMD_DROPIN_ROOT" "nftables systemd drop-in root" "/etc/systemd/system" || die "unsafe nftables systemd drop-in root"
  trex_path_is_within "$DAEMON_SUPERVISOR_TARGET" "$DAEMON_LIBEXEC_ROOT" || die "daemon supervisor target escaped its libexec root"
  trex_path_is_within "$DAEMON_RPC_PROBE_TARGET" "$DAEMON_LIBEXEC_ROOT" || die "daemon RPC probe target escaped its libexec root"
  trex_path_is_within "$DAEMON_NATIVE_BOUNDARY_TARGET" "$DAEMON_LIBEXEC_ROOT" || die "daemon native boundary target escaped its libexec root"
  trex_path_is_within "$NFTABLES_SYSTEMD_DROPIN_TARGET" "$NFTABLES_SYSTEMD_DROPIN_ROOT" || die "nftables systemd drop-in escaped its root"
  trex_path_is_within "$TREX_DAEMON_BIN" "$TREX_DAEMON_SCRIPTS_DIR" || \
    die "daemon executable escaped its scripts directory"

  trex_assert_disjoint_paths "$INSTALL_ROOT" "install root" "$WEB_ROOT" "web root" || die "overlapping upgrade paths"
  trex_assert_disjoint_paths "$INSTALL_ROOT" "install root" "$STATIC_BACKUP_ROOT" "static backup root" || die "overlapping upgrade paths"
  trex_assert_disjoint_paths "$INSTALL_ROOT" "install root" "$SOURCE_BACKUP_ROOT" "source backup root" || die "overlapping upgrade paths"
  trex_assert_disjoint_paths "$WEB_ROOT" "web root" "$STATIC_BACKUP_ROOT" "static backup root" || die "overlapping upgrade paths"
  trex_assert_disjoint_paths "$WEB_ROOT" "web root" "$SOURCE_BACKUP_ROOT" "source backup root" || die "overlapping upgrade paths"
  trex_assert_disjoint_paths "$STATIC_BACKUP_ROOT" "static backup root" "$SOURCE_BACKUP_ROOT" "source backup root" || die "overlapping upgrade paths"
  if [[ "$MANAGE_LOCAL_DAEMON" -eq 1 ]]; then
    trex_assert_software_path \
      "$TREX_DAEMON_SCRIPTS_DIR" \
      "TRex daemon scripts directory" || die "unsafe TRex daemon scripts directory"
    trex_assert_software_path \
      "$TREX_DAEMON_BIN" \
      "TRex daemon executable" || die "unsafe TRex daemon executable"
    local protected_path protected_label
    while IFS='|' read -r protected_path protected_label; do
      trex_assert_disjoint_paths \
        "$TREX_DAEMON_SCRIPTS_DIR" "TRex daemon scripts directory" \
        "$protected_path" "$protected_label" || die "overlapping TRex daemon scripts path"
    done <<EOF
$INSTALL_ROOT|install root
$WEB_ROOT|web root
$STATIC_BACKUP_ROOT|static backup root
$SOURCE_BACKUP_ROOT|source backup root
/var/lib/trex-webui|service state root
/var/log/trex|TRex log root
$DAEMON_LIBEXEC_ROOT|daemon libexec root
EOF
    if [[ "$DRY_RUN" -eq 0 ]]; then
      [[ -d "$TREX_DAEMON_SCRIPTS_DIR" && ! -L "$TREX_DAEMON_SCRIPTS_DIR" ]] || \
        die "TRex daemon scripts directory is missing or unsafe: $TREX_DAEMON_SCRIPTS_DIR"
      [[ -f "$TREX_DAEMON_BIN" && ! -L "$TREX_DAEMON_BIN" && -x "$TREX_DAEMON_BIN" ]] || \
        die "TRex daemon executable is missing or unsafe: $TREX_DAEMON_BIN"
      trex_assert_root_controlled_tree \
        "$TREX_DAEMON_SCRIPTS_DIR" \
        "TRex daemon scripts tree" || \
        die "TRex daemon scripts tree is not safe for root execution"
    fi
  fi
}

read_archive_sidecar_digest() {
  local sidecar="$ARCHIVE.sha256"
  [[ -f "$sidecar" && ! -L "$sidecar" ]] || die "archive checksum sidecar not found or unsafe: $sidecar"
  local lines=()
  mapfile -t lines <"$sidecar"
  [[ "${#lines[@]}" -eq 1 ]] || die "archive checksum sidecar must contain exactly one line: $sidecar"

  local digest listed_name extra
  read -r digest listed_name extra <<<"${lines[0]}"
  [[ -z "${extra:-}" ]] || die "archive checksum sidecar has unexpected fields: $sidecar"
  [[ "$digest" =~ ^[[:xdigit:]]{64}$ ]] || die "archive checksum sidecar has an invalid digest: $sidecar"
  listed_name="${listed_name#\*}"
  [[ "$listed_name" == "$(basename -- "$ARCHIVE")" ]] || die "archive checksum sidecar names a different file: $listed_name"
  printf '%s\n' "${digest,,}"
}

verify_archive_checksum() {
  command -v sha256sum >/dev/null 2>&1 || die "sha256sum is required for archive upgrades"
  [[ -n "$ARCHIVE_STAGED_PATH" && -f "$ARCHIVE_STAGED_PATH" && ! -L "$ARCHIVE_STAGED_PATH" ]] || \
    die "staged release archive is missing or unsafe"
  [[ "$ARCHIVE_EXPECTED_SHA256" =~ ^[0-9a-f]{64}$ ]] || \
    die "expected archive SHA-256 was not captured before staging"
  local actual
  actual="$(sha256sum -- "$ARCHIVE_STAGED_PATH")"
  actual="${actual%% *}"
  [[ "$actual" == "$ARCHIVE_EXPECTED_SHA256" ]] || \
    die "archive SHA-256 mismatch: expected $ARCHIVE_EXPECTED_SHA256, got $actual"
  log "Verified archive SHA-256 $actual"
}

stage_archive() {
  if [[ -z "$ARCHIVE" ]]; then
    return 0
  fi

  ARCHIVE_EXPECTED_SHA256="$ARCHIVE_SHA256"
  if [[ -z "$ARCHIVE_EXPECTED_SHA256" ]]; then
    ARCHIVE_EXPECTED_SHA256="$(read_archive_sidecar_digest)"
  fi

  STAGING_ROOT="$(mktemp -d -t trex-webui-upgrade.XXXXXX)"
  trex_write_managed_marker "$STAGING_ROOT"
  ARCHIVE_STAGED_PATH="$STAGING_ROOT/release-archive.tar.gz"
  log "Copying release archive into private staging"
  cp --reflink=never -- "$ARCHIVE" "$ARCHIVE_STAGED_PATH" || \
    die "unable to copy release archive into private staging"
  [[ -f "$ARCHIVE_STAGED_PATH" && ! -L "$ARCHIVE_STAGED_PATH" ]] || \
    die "staged release archive is not a regular file"
  chmod 0400 "$ARCHIVE_STAGED_PATH"
}

check_archive() {
  if [[ -z "$ARCHIVE" ]]; then
    return 0
  fi
  verify_archive_checksum
  have_cmd python3.11 || die "python3.11 is required to validate release archives"
  if [[ "$DRY_RUN" -eq 0 && "$SYNC_METHOD" == "rsync" ]]; then
    have_cmd rsync || die "--sync-method rsync requested but rsync was not found"
  fi
  ARCHIVE_TOP="$(python3.11 "$SCRIPT_DIR/archive_safety.py" "$ARCHIVE_STAGED_PATH")" || \
    die "release archive failed safety validation"
  log "Validated release archive root $ARCHIVE_TOP"
}

require_root_for_archive() {
  if [[ -z "$ARCHIVE" || "$DRY_RUN" -eq 1 ]]; then
    return
  fi
  if [[ "$(id -u)" -ne 0 ]]; then
    die "root is required for --archive upgrades into $INSTALL_ROOT; rerun with sudo or use --dry-run"
  fi
}

backup_install_root() {
  if [[ -z "$ARCHIVE" ]]; then
    return 0
  fi
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '+ backup existing %q under %q\n' "$INSTALL_ROOT" "$SOURCE_BACKUP_ROOT"
    printf '+ on any later failure restore %q from that source backup\n' "$INSTALL_ROOT"
    return
  fi
  if [[ ! -d "$INSTALL_ROOT" ]]; then
    [[ ! -e "$INSTALL_ROOT" && ! -L "$INSTALL_ROOT" ]] || die "install root is not a directory: $INSTALL_ROOT"
    INSTALL_ROOT_EXISTED=0
    return 0
  fi
  INSTALL_ROOT_EXISTED=1

  SOURCE_BACKUP_DIR="$SOURCE_BACKUP_ROOT/$(basename "$INSTALL_ROOT")-$(timestamp)-$$"
  log "Backing up current install tree to $SOURCE_BACKUP_DIR"
  run mkdir -p "$SOURCE_BACKUP_ROOT"
  trex_write_managed_marker "$SOURCE_BACKUP_ROOT"
  run mkdir "$SOURCE_BACKUP_DIR"
  trex_write_managed_marker "$SOURCE_BACKUP_DIR"
  run cp -a "$INSTALL_ROOT/." "$SOURCE_BACKUP_DIR/"
  local runtime_copy
  while IFS= read -r -d '' runtime_copy; do
    trex_safe_remove_tree "$runtime_copy" "runtime omitted from source rollback backup" "$SOURCE_BACKUP_ROOT"
  done < <(find -P "$SOURCE_BACKUP_DIR" -mindepth 1 -maxdepth 1 -name '.venv.runtime-*' -print0)
}

assert_preserved_project_runtime() {
  local runtime_path="$1"
  local runtime_name runtime_suffix release_marker mode owner
  runtime_name="$(basename -- "$runtime_path")"
  runtime_suffix="${runtime_name#.venv.runtime-}"
  [[ "$runtime_name" == .venv.runtime-* && -n "$runtime_suffix" ]] || \
    die "invalid versioned runtime name: $runtime_path"
  [[ -d "$runtime_path" && ! -L "$runtime_path" ]] || \
    die "versioned runtime must be a real directory before archive sync: $runtime_path"
  trex_reject_mountpoint "$runtime_path" "versioned runtime" || die "unsafe versioned runtime"

  owner="$(stat -c '%u:%g' "$runtime_path")"
  [[ "$owner" == "0:0" ]] || die "versioned runtime must be root-owned before archive sync: $runtime_path"
  mode="$(stat -c '%a' "$runtime_path")"
  (( (8#$mode & 8#022) == 0 )) || \
    die "versioned runtime must not be group/other writable before archive sync: $runtime_path"

  local managed_marker="$runtime_path/$TREX_MANAGED_MARKER_NAME"
  local runtime_marker="$runtime_path/$VENV_RUNTIME_MARKER_NAME"
  release_marker="$runtime_path/$VENV_RELEASE_MARKER_NAME"
  [[ -f "$managed_marker" && ! -L "$managed_marker" && \
    "$(<"$managed_marker")" == "$TREX_MANAGED_MARKER_VALUE" ]] || \
    die "versioned runtime has no trusted managed marker: $runtime_path"
  [[ -f "$runtime_marker" && ! -L "$runtime_marker" && \
    "$(<"$runtime_marker")" == "$VENV_RUNTIME_MARKER_VALUE" ]] || \
    die "versioned runtime has no trusted runtime marker: $runtime_path"
  [[ -f "$release_marker" && ! -L "$release_marker" && \
    "$(<"$release_marker")" == "trex-webui-venv-release-$runtime_suffix" ]] || \
    die "versioned runtime release marker does not match its directory: $runtime_path"
}

validate_preserved_project_runtimes() {
  [[ -d "$INSTALL_ROOT" ]] || return 0
  local runtime_path
  while IFS= read -r -d '' runtime_path; do
    assert_preserved_project_runtime "$runtime_path"
  done < <(find -P "$INSTALL_ROOT" -mindepth 1 -maxdepth 1 -name '.venv.runtime-*' -print0)
}

clear_install_root_preserving_runtimes() {
  local entry name
  while IFS= read -r -d '' entry; do
    name="$(basename -- "$entry")"
    if [[ "$name" == "$TREX_MANAGED_MARKER_NAME" || "$name" == .venv.runtime-* ]]; then
      continue
    fi
    trex_safe_remove_tree "$entry" "portable sync install-root child" "/opt/trex-webui"
  done < <(find -P "$INSTALL_ROOT" -mindepth 1 -maxdepth 1 -print0)
}

archive_sync_method() {
  if [[ "$SYNC_METHOD" == "auto" ]]; then
    if have_cmd rsync; then
      printf 'rsync'
    else
      printf 'portable'
    fi
    return
  fi
  printf '%s' "$SYNC_METHOD"
}

sync_archive_source_portable() {
  local source_root="$1"
  local preserve_root="$STAGING_ROOT/preserve"
  local preserve_paths=(
    ".venv"
    ".env"
    ".logs"
    "node_modules"
    "apps/web/node_modules"
  )
  local path source_path preserve_path preserve_dir

  run mkdir -p "$preserve_root"

  for path in "${preserve_paths[@]}"; do
    source_path="$INSTALL_ROOT/$path"
    preserve_path="$preserve_root/$path"
    if [[ -e "$source_path" || -L "$source_path" ]]; then
      preserve_dir="$(dirname "$preserve_path")"
      run mkdir -p "$preserve_dir"
      run mv "$source_path" "$preserve_path"
    fi
  done

  clear_install_root_preserving_runtimes
  run cp -a "$source_root/." "$INSTALL_ROOT/"

  for path in "${preserve_paths[@]}"; do
    preserve_path="$preserve_root/$path"
    source_path="$INSTALL_ROOT/$path"
    if [[ -e "$preserve_path" || -L "$preserve_path" ]]; then
      trex_safe_remove_tree "$source_path" "preserved install path replacement" "/opt/trex-webui"
      run mkdir -p "$(dirname "$source_path")"
      run mv "$preserve_path" "$source_path"
    fi
  done
}

sync_archive_source() {
  if [[ -z "$ARCHIVE" ]]; then
    return 0
  fi

  local top source_root sync_method
  top="$ARCHIVE_TOP"
  sync_method="$(archive_sync_method)"

  if [[ "$DRY_RUN" -eq 1 ]]; then
    if [[ "$sync_method" == "rsync" ]]; then
      printf '+ rsync -a --delete --exclude .trex-webui-managed --exclude .venv --exclude .venv.runtime-* --exclude .env --exclude .logs --exclude node_modules --exclude apps/web/node_modules %q/ %q/\n' "$top" "$INSTALL_ROOT"
    else
      printf '+ portable sync %q/ -> %q/ preserving the ownership marker plus .venv .venv.runtime-* .env .logs node_modules apps/web/node_modules\n' "$top" "$INSTALL_ROOT"
      printf '+ safely clear marker-owned install root %q\n' "$INSTALL_ROOT"
      printf '+ cp -a %q/. %q/\n' "$top" "$INSTALL_ROOT"
    fi
    return
  fi

  source_root="$ARCHIVE_SOURCE_ROOT"
  [[ -d "$source_root" ]] || die "extracted package root not found: $source_root"

  log "Syncing release source to $INSTALL_ROOT"
  SOURCE_MUTATION_STARTED=1
  run mkdir -p "$INSTALL_ROOT"
  trex_write_managed_marker "$INSTALL_ROOT"
  if [[ "$sync_method" == "rsync" ]]; then
    run rsync -a --delete \
      --exclude .trex-webui-managed \
      --exclude .venv \
      --exclude '.venv.runtime-*' \
      --exclude .env \
      --exclude .logs \
      --exclude node_modules \
      --exclude apps/web/node_modules \
      "$source_root/" "$INSTALL_ROOT/"
  else
    sync_archive_source_portable "$source_root"
  fi
}

extract_and_verify_archive() {
  if [[ -z "$ARCHIVE" ]]; then
    return 0
  fi
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '+ tar --extract --gzip --no-same-owner --same-permissions --file <private-staged-archive> --directory <marker-owned-temp-dir>\n'
    printf '+ python3.11 %q verify-tree <marker-owned-temp-dir>/%q\n' "$SCRIPT_DIR/archive_safety.py" "$ARCHIVE_TOP"
    return 0
  fi

  [[ -n "$STAGING_ROOT" && -d "$STAGING_ROOT" && ! -L "$STAGING_ROOT" ]] || \
    die "archive staging root is missing or unsafe"
  [[ -f "$ARCHIVE_STAGED_PATH" && ! -L "$ARCHIVE_STAGED_PATH" ]] || \
    die "staged release archive is missing or unsafe"
  log "Extracting the verified private archive copy"
  run tar --extract --gzip --no-same-owner --same-permissions \
    --file "$ARCHIVE_STAGED_PATH" --directory "$STAGING_ROOT"
  ARCHIVE_SOURCE_ROOT="$STAGING_ROOT/$ARCHIVE_TOP"
  [[ -d "$ARCHIVE_SOURCE_ROOT" ]] || die "extracted package root not found: $ARCHIVE_SOURCE_ROOT"

  local digest
  digest="$(python3.11 "$SCRIPT_DIR/archive_safety.py" verify-tree "$ARCHIVE_SOURCE_ROOT")" || \
    die "extracted release payload failed identity verification"
  log "Verified extracted release payload SHA-256 $digest"
}

install_args() {
  local args=(
    "$INSTALL_ROOT/deploy/install.sh"
    "--project-root"
    "$INSTALL_ROOT"
    "--web-root"
    "$WEB_ROOT"
    "--backup-root"
    "$STATIC_BACKUP_ROOT"
  )

  if [[ "$DRY_RUN" -eq 1 ]]; then
    args+=("--dry-run")
  fi
  if [[ -n "$ARCHIVE" || "$RUN_BUILD" -eq 0 ]]; then
    args+=("--skip-build")
  fi
  if [[ "$INSTALL_PYTHON_DEPS" -eq 1 ]]; then
    args+=("--install-python-deps")
  fi
  if [[ "$RUN_ENABLE" -eq 0 ]]; then
    args+=("--skip-enable")
  fi
  if [[ "$RUN_RESTART" -eq 0 ]]; then
    args+=("--skip-restart")
  fi
  if [[ "$MANAGE_LOCAL_DAEMON" -eq 0 ]]; then
    args+=("--external-daemon")
  fi
  if [[ "$ALLOW_DAEMON_RUNTIME_RESTART" -eq 1 ]]; then
    args+=("--allow-daemon-runtime-restart")
  fi
  if [[ "$INSTALL_NGINX" -eq 1 ]]; then
    args+=("--install-nginx")
  fi
  if [[ "$RUN_SELINUX" -eq 1 ]]; then
    args+=("--selinux")
  fi
  if [[ "$RUN_FIREWALLD" -eq 1 ]]; then
    args+=("--firewalld")
  fi
  if [[ "$RUN_VERIFY" -eq 1 ]]; then
    args+=("--verify" "--verify-base-url" "$VERIFY_BASE_URL")
  fi
  if [[ "$VERIFY_TREX" -eq 1 ]]; then
    args+=("--verify-trex")
  fi

  printf '%s\0' "${args[@]}"
}

run_install() {
  if [[ "$DRY_RUN" -eq 0 ]]; then
    [[ -x "$INSTALL_ROOT/deploy/install.sh" ]] || die "missing executable install script: $INSTALL_ROOT/deploy/install.sh"
  fi
  local args=()
  while IFS= read -r -d '' item; do
    args+=("$item")
  done < <(install_args)
  log "Running deployment installer"
  run "${args[@]}"
}

preflight_archive_daemon_runtime() {
  [[ -n "$ARCHIVE" && "$MANAGE_LOCAL_DAEMON" -eq 1 && "$RUN_RESTART" -eq 1 ]] || return 0
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '+ before archive source mutation, refuse unmanaged daemon unit authority and require Idle(1)/unreserved when the new unit needs restart\n'
    return 0
  fi

  local load_state fragment_path source_unit source_probe source_supervisor source_boundary source_dropin
  local rendered_unit rendered_dropin
  load_state="$(systemctl show trex-daemon-server.service --property=LoadState --value)" || \
    die "unable to inspect daemon authority before archive source mutation"
  fragment_path="$(systemctl show trex-daemon-server.service --property=FragmentPath --value)" || \
    die "unable to inspect daemon fragment before archive source mutation"
  if [[ "$load_state" == "loaded" && "$fragment_path" != "$DAEMON_SYSTEMD_SERVICE_TARGET" ]]; then
    die "refusing archive upgrade over unmanaged trex-daemon-server.service from ${fragment_path:-unknown}"
  fi
  if [[ -e "$DAEMON_SYSTEMD_SERVICE_TARGET" || -L "$DAEMON_SYSTEMD_SERVICE_TARGET" ]]; then
    [[ -f "$DAEMON_SYSTEMD_SERVICE_TARGET" && ! -L "$DAEMON_SYSTEMD_SERVICE_TARGET" ]] || \
      die "existing daemon unit target is unsafe: $DAEMON_SYSTEMD_SERVICE_TARGET"
    grep -Fqx '# Managed by TRex WebUI deploy/install.sh.' "$DAEMON_SYSTEMD_SERVICE_TARGET" || \
      die "refusing archive upgrade over unmarked daemon unit: $DAEMON_SYSTEMD_SERVICE_TARGET"
  fi
  source_unit="$ARCHIVE_SOURCE_ROOT/deploy/systemd/trex-daemon-server.service"
  source_dropin="$ARCHIVE_SOURCE_ROOT/deploy/systemd/nftables-trex-webui.conf"
  source_probe="$ARCHIVE_SOURCE_ROOT/deploy/daemon_rpc_probe.py"
  source_supervisor="$ARCHIVE_SOURCE_ROOT/deploy/trex_daemon_supervisor.py"
  source_boundary="$ARCHIVE_SOURCE_ROOT/deploy/trex_native_boundary.sh"
  [[ -f "$source_unit" && -f "$source_dropin" && -f "$source_probe" && \
    -f "$source_supervisor" && \
    -x "$source_boundary" ]] || \
    die "archive is missing the daemon supervisor unit, nftables integration, launcher, strict RPC probe, or native boundary"
  if [[ -e "$NFTABLES_SYSTEMD_DROPIN_TARGET" || -L "$NFTABLES_SYSTEMD_DROPIN_TARGET" ]]; then
    [[ -f "$NFTABLES_SYSTEMD_DROPIN_TARGET" && ! -L "$NFTABLES_SYSTEMD_DROPIN_TARGET" ]] || \
      die "existing nftables integration drop-in is unsafe: $NFTABLES_SYSTEMD_DROPIN_TARGET"
    grep -Fqx '# Managed by TRex WebUI deploy/install.sh.' "$NFTABLES_SYSTEMD_DROPIN_TARGET" || \
      die "refusing archive upgrade over an unmarked nftables integration drop-in"
  fi
  "$source_boundary" check-service "$NFTABLES_CONFIG_PATH" || \
    die "archive managed-local boundary is not supported by this host"
  systemctl is-active --quiet trex-daemon-server.service || return 0

  rendered_unit="$STAGING_ROOT/trex-daemon-server.rendered.service"
  rendered_dropin="$STAGING_ROOT/nftables-trex-webui.rendered.conf"
  local escaped_install_root escaped_scripts escaped_bin escaped_supervisor escaped_probe escaped_boundary
  local escaped_nftables_config
  local bin_placeholder='@@TREX_DAEMON_BIN@@'
  local supervisor_placeholder='@@TREX_DAEMON_SUPERVISOR@@'
  local probe_placeholder='@@TREX_DAEMON_RPC_PROBE@@'
  local boundary_placeholder='@@TREX_DAEMON_NATIVE_BOUNDARY@@'
  escaped_install_root="$(printf '%s' "$INSTALL_ROOT" | sed 's/[\/&|]/\\&/g')"
  escaped_scripts="$(printf '%s' "$TREX_DAEMON_SCRIPTS_DIR" | sed 's/[\/&|]/\\&/g')"
  escaped_bin="$(printf '%s' "$TREX_DAEMON_BIN" | sed 's/[\/&|]/\\&/g')"
  escaped_supervisor="$(printf '%s' "$DAEMON_SUPERVISOR_TARGET" | sed 's/[\/&|]/\\&/g')"
  escaped_probe="$(printf '%s' "$DAEMON_RPC_PROBE_TARGET" | sed 's/[\/&|]/\\&/g')"
  escaped_boundary="$(printf '%s' "$DAEMON_NATIVE_BOUNDARY_TARGET" | sed 's/[\/&|]/\\&/g')"
  escaped_nftables_config="$(printf '%s' "$NFTABLES_CONFIG_PATH" | sed 's/[\/&|]/\\&/g')"
  sed \
    -e "s|/opt/trex-core/scripts/trex_daemon_server|$bin_placeholder|g" \
    -e "s|/usr/libexec/trex-webui/trex_daemon_supervisor.py|$supervisor_placeholder|g" \
    -e "s|/usr/libexec/trex-webui/daemon_rpc_probe.py|$probe_placeholder|g" \
    -e "s|/usr/libexec/trex-webui/trex_native_boundary.sh|$boundary_placeholder|g" \
    -e "s|/opt/trex-core/scripts|$escaped_scripts|g" \
    -e "s|/opt/trex-webui|$escaped_install_root|g" \
    -e "s|$bin_placeholder|$escaped_bin|g" \
    -e "s|$supervisor_placeholder|$escaped_supervisor|g" \
    -e "s|$probe_placeholder|$escaped_probe|g" \
    -e "s|$boundary_placeholder|$escaped_boundary|g" \
    "$source_unit" >"$rendered_unit"
  sed \
    -e "s|/usr/libexec/trex-webui/trex_native_boundary.sh|$escaped_boundary|g" \
    -e "s|/etc/sysconfig/nftables.conf|$escaped_nftables_config|g" \
    "$source_dropin" >"$rendered_dropin"

  local restart_required=1 loaded_post
  if cmp -s "$DAEMON_SYSTEMD_SERVICE_TARGET" "$rendered_unit" && \
    cmp -s "$DAEMON_SUPERVISOR_TARGET" "$source_supervisor" && \
    cmp -s "$DAEMON_RPC_PROBE_TARGET" "$source_probe" && \
    cmp -s "$DAEMON_NATIVE_BOUNDARY_TARGET" "$source_boundary" && \
    cmp -s "$NFTABLES_SYSTEMD_DROPIN_TARGET" "$rendered_dropin" && \
    [[ "$(systemctl show trex-daemon-server.service --property=NeedDaemonReload --value)" == "no" ]] && \
    [[ "$(systemctl show nftables.service --property=NeedDaemonReload --value)" == "no" ]] && \
    [[ "$(systemctl show trex-daemon-server.service --property=KillMode --value)" == "mixed" ]] && \
    [[ "$(systemctl show trex-daemon-server.service --property=Restart --value)" == "on-failure" ]]; then
    loaded_post="$(systemctl show trex-daemon-server.service --property=ExecStartPost --value)" || true
    if [[ "$loaded_post" == *"daemon_rpc_probe.py"* && "$loaded_post" == *" ready"* ]] && \
      "$source_boundary" verify >/dev/null 2>&1 && \
      /usr/bin/python3 "$source_probe" --host 127.0.0.1 --port 8090 --timeout 1 ready >/dev/null 2>&1; then
      restart_required=0
    fi
  fi
  [[ "$restart_required" -eq 1 ]] || return 0
  if [[ "$ALLOW_DAEMON_RUNTIME_RESTART" -eq 1 ]]; then
    printf 'warning: archive maintenance override permits daemon restart without preserving active TRex/reservation state\n' >&2
    return 0
  fi
  /usr/bin/python3 "$source_probe" \
    --host 127.0.0.1 \
    --port 8090 \
    --timeout 5 \
    safe-restart || \
    die "archive upgrade would restart an unsafe/unknown daemon; stop traffic/cancel reservation first, or explicitly use --allow-daemon-runtime-restart"
}

preflight_managed_api_environment() {
  local allow_protected_keys=0
  [[ "$MANAGE_LOCAL_DAEMON" -eq 1 ]] || allow_protected_keys=1
  trex_assert_managed_api_environment_file "$SERVICE_ENV_FILE" "$allow_protected_keys" || \
    die "API environment file failed authority validation before upgrade"
  if [[ "$DRY_RUN" -eq 1 && "$MANAGE_LOCAL_DAEMON" -eq 1 ]]; then
    printf '+ require optional %q to be root:root 0600, regular/non-symlink, and free of managed TRex authority keys before upgrade mutation\n' \
      "$SERVICE_ENV_FILE"
  fi
}

main() {
  parse_args "$@"
  normalize_paths
  if [[ -z "$ARCHIVE" ]]; then
    printf 'warning: checkout upgrade cannot roll back source changes made before this command; use --archive for rollback-backed production upgrades\n' >&2
  fi
  require_root_for_archive
  preflight_managed_api_environment
  if [[ "$DRY_RUN" -eq 0 ]]; then
    trex_acquire_deployment_lock || die "another deployment transaction is active or the deployment lock is unsafe"
  fi
  stage_archive
  check_archive
  extract_and_verify_archive
  validate_preserved_project_runtimes
  preflight_archive_daemon_runtime
  if [[ -n "$ARCHIVE" ]]; then
    capture_archive_api_service_state
  fi
  backup_install_root
  if [[ -n "$ARCHIVE" && "$DRY_RUN" -eq 0 ]]; then
    stop_archive_api_service_for_source_mutation
  fi
  sync_archive_source
  run_install
  log "TRex WebUI upgrade complete"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
