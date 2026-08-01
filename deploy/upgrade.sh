#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
[[ -f "$SCRIPT_DIR/path_safety.sh" ]] || { printf 'error: missing %s/path_safety.sh\n' "$SCRIPT_DIR" >&2; exit 1; }
# shellcheck source=deploy/path_safety.sh
source "$SCRIPT_DIR/path_safety.sh"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

ARCHIVE=""
ROLLBACK_PREVIOUS=0
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
ARCHIVE_DAEMON_OVERRIDE_CONSUMED=0
ARCHIVE_DAEMON_MUTATION_EXPECTED=0
ARCHIVE_DAEMON_WAS_ACTIVE_FOR_PREFLIGHT=0
SYNC_METHOD="auto"
STAGING_ROOT=""
SOURCE_BACKUP_DIR=""
SOURCE_MUTATION_STARTED=0
INSTALL_ROOT_EXISTED=0
ARCHIVE_API_STATE_CAPTURED=0
ARCHIVE_API_SERVICE_MATCHED=0
ARCHIVE_API_WAS_ACTIVE=0
ARCHIVE_API_OLD_EXEC_PATH=""
ARCHIVE_API_OLD_PROJECT_ROOT=""
ARCHIVE_API_OLD_MAIN_PID=""
ARCHIVE_API_MUTATION_GUARD_APPLIED=0
ARCHIVE_API_READINESS_URL="http://127.0.0.1:8080/api/health"
ARCHIVE_API_READINESS_ATTEMPTS=40
ARCHIVE_API_READINESS_INTERVAL_SECONDS="0.5"
VENV_RUNTIME_MARKER_NAME=".trex-webui-venv-runtime"
VENV_RUNTIME_MARKER_VALUE="trex-webui-venv-runtime-v1"
VENV_RELEASE_MARKER_NAME=".trex-webui-venv-release"
DAEMON_SYSTEMD_SERVICE_TARGET="/etc/systemd/system/trex-daemon-server.service"
DAEMON_LOGROTATE_TARGET="${DAEMON_LOGROTATE_TARGET:-/etc/logrotate.d/trex-daemon-server}"
SYSTEMD_SERVICE_TARGET="/etc/systemd/system/trex-webui-api.service"
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
SERVICE_RUNTIME_STATE_PATH="/var/lib/trex-webui/runtime-state.json"
RELEASE_STATE_ROOT="${RELEASE_STATE_ROOT:-}"
RECOVERY_V2_ROOT="${RECOVERY_V2_ROOT:-$DAEMON_LIBEXEC_ROOT/recovery-v2}"
RELEASE_RECONCILER_TARGET="${RELEASE_RECONCILER_TARGET:-$RECOVERY_V2_ROOT/release_transaction.py}"
RELEASE_BOOTSTRAP_TARGET="${RELEASE_BOOTSTRAP_TARGET:-$RECOVERY_V2_ROOT/bootstrap_release_infrastructure.py}"
TREX_OVERVIEW_VALIDATOR_TARGET="${TREX_OVERVIEW_VALIDATOR_TARGET:-$DAEMON_LIBEXEC_ROOT/trex_overview_contract.py}"
TREX_PERSISTED_STATE_VALIDATOR_TARGET="${TREX_PERSISTED_STATE_VALIDATOR_TARGET:-$DAEMON_LIBEXEC_ROOT/trex_persisted_state_contract.py}"
RELEASE_RECONCILER_UNIT_TARGET="${RELEASE_RECONCILER_UNIT_TARGET:-/etc/systemd/system/trex-webui-release-reconcile-v2.service}"
RELEASE_RECONCILER_RETRY_UNIT_TARGET="${RELEASE_RECONCILER_RETRY_UNIT_TARGET:-/etc/systemd/system/trex-webui-release-retry-v2.service}"
RELEASE_RECONCILER_ACK_UNIT_TARGET="${RELEASE_RECONCILER_ACK_UNIT_TARGET:-/etc/systemd/system/trex-webui-release-consumer-ack-v2.service}"
RELEASE_RECONCILER_NGINX_DROPIN_ROOT="${RELEASE_RECONCILER_NGINX_DROPIN_ROOT:-/etc/systemd/system/nginx.service.d}"
RELEASE_RECONCILER_NGINX_DROPIN_TARGET="${RELEASE_RECONCILER_NGINX_DROPIN_TARGET:-$RELEASE_RECONCILER_NGINX_DROPIN_ROOT/trex-webui-release-reconcile-v2.conf}"
RELEASE_RECONCILER_API_DROPIN_ROOT="${RELEASE_RECONCILER_API_DROPIN_ROOT:-/etc/systemd/system/trex-webui-api.service.d}"
RELEASE_RECONCILER_API_DROPIN_TARGET="${RELEASE_RECONCILER_API_DROPIN_TARGET:-$RELEASE_RECONCILER_API_DROPIN_ROOT/trex-webui-release-reconcile-v2.conf}"
RELEASE_RECONCILER_DAEMON_DROPIN_ROOT="${RELEASE_RECONCILER_DAEMON_DROPIN_ROOT:-/etc/systemd/system/trex-daemon-server.service.d}"
RELEASE_RECONCILER_DAEMON_DROPIN_TARGET="${RELEASE_RECONCILER_DAEMON_DROPIN_TARGET:-$RELEASE_RECONCILER_DAEMON_DROPIN_ROOT/trex-webui-release-reconcile-v2.conf}"
LEGACY_RELEASE_BOOTSTRAP_TARGET="${LEGACY_RELEASE_BOOTSTRAP_TARGET:-$DAEMON_LIBEXEC_ROOT/bootstrap_release_infrastructure.py}"
LEGACY_RELEASE_RECONCILER_TARGET="${LEGACY_RELEASE_RECONCILER_TARGET:-$DAEMON_LIBEXEC_ROOT/release_transaction.py}"
LEGACY_RELEASE_RECONCILER_UNIT_TARGET="${LEGACY_RELEASE_RECONCILER_UNIT_TARGET:-/etc/systemd/system/trex-webui-release-reconcile.service}"
LEGACY_RELEASE_RECONCILER_RETRY_UNIT_TARGET="${LEGACY_RELEASE_RECONCILER_RETRY_UNIT_TARGET:-/etc/systemd/system/trex-webui-release-retry.service}"
LEGACY_RELEASE_RECONCILER_ACK_UNIT_TARGET="${LEGACY_RELEASE_RECONCILER_ACK_UNIT_TARGET:-/etc/systemd/system/trex-webui-release-consumer-ack.service}"
LEGACY_RELEASE_RECONCILER_NGINX_DROPIN_TARGET="${LEGACY_RELEASE_RECONCILER_NGINX_DROPIN_TARGET:-$RELEASE_RECONCILER_NGINX_DROPIN_ROOT/trex-webui-release-reconcile.conf}"
LEGACY_RELEASE_RECONCILER_API_DROPIN_TARGET="${LEGACY_RELEASE_RECONCILER_API_DROPIN_TARGET:-$RELEASE_RECONCILER_API_DROPIN_ROOT/trex-webui-release-reconcile.conf}"
LEGACY_RELEASE_RECONCILER_DAEMON_DROPIN_TARGET="${LEGACY_RELEASE_RECONCILER_DAEMON_DROPIN_TARGET:-$RELEASE_RECONCILER_DAEMON_DROPIN_ROOT/trex-webui-release-reconcile.conf}"
LEGACY_RELEASE_RECONCILER_BRIDGE_ROOT="${LEGACY_RELEASE_RECONCILER_BRIDGE_ROOT:-/etc/systemd/system/trex-webui-release-reconcile.service.d}"
LEGACY_RELEASE_RECONCILER_RETRY_BRIDGE_ROOT="${LEGACY_RELEASE_RECONCILER_RETRY_BRIDGE_ROOT:-/etc/systemd/system/trex-webui-release-retry.service.d}"
LEGACY_RELEASE_RECONCILER_ACK_BRIDGE_ROOT="${LEGACY_RELEASE_RECONCILER_ACK_BRIDGE_ROOT:-/etc/systemd/system/trex-webui-release-consumer-ack.service.d}"
LEGACY_RELEASE_RECONCILER_BRIDGE_TARGET="${LEGACY_RELEASE_RECONCILER_BRIDGE_TARGET:-$LEGACY_RELEASE_RECONCILER_BRIDGE_ROOT/trex-webui-recovery-v2-bridge.conf}"
LEGACY_RELEASE_RECONCILER_RETRY_BRIDGE_TARGET="${LEGACY_RELEASE_RECONCILER_RETRY_BRIDGE_TARGET:-$LEGACY_RELEASE_RECONCILER_RETRY_BRIDGE_ROOT/trex-webui-recovery-v2-bridge.conf}"
LEGACY_RELEASE_RECONCILER_ACK_BRIDGE_TARGET="${LEGACY_RELEASE_RECONCILER_ACK_BRIDGE_TARGET:-$LEGACY_RELEASE_RECONCILER_ACK_BRIDGE_ROOT/trex-webui-recovery-v2-bridge.conf}"
RELEASE_ROLLBACK_DAEMON_PROBE_TARGET="${RELEASE_ROLLBACK_DAEMON_PROBE_TARGET:-$DAEMON_LIBEXEC_ROOT/release_daemon_rpc_probe.py}"
RELEASE_ROLLBACK_NATIVE_BOUNDARY_TARGET="${RELEASE_ROLLBACK_NATIVE_BOUNDARY_TARGET:-$DAEMON_LIBEXEC_ROOT/release_native_boundary.sh}"
RELEASE_INFRASTRUCTURE_COMMON_MANIFEST="${RELEASE_INFRASTRUCTURE_COMMON_MANIFEST:-}"
RELEASE_INFRASTRUCTURE_MANAGED_MANIFEST="${RELEASE_INFRASTRUCTURE_MANAGED_MANIFEST:-}"
LEGACY_RELEASE_INFRASTRUCTURE_COMMON_MANIFEST="${LEGACY_RELEASE_INFRASTRUCTURE_COMMON_MANIFEST:-}"
LEGACY_RELEASE_INFRASTRUCTURE_MANAGED_MANIFEST="${LEGACY_RELEASE_INFRASTRUCTURE_MANAGED_MANIFEST:-}"
VERSIONED_WEB_SELINUX_PATTERN='/opt/trex-webui/releases/sha256-[0-9a-f]{64}/apps/web/dist(/.*)?'
NGINX_CONF_TARGET="${NGINX_CONF_TARGET:-/etc/nginx/conf.d/trex-webui.conf}"
RELEASE_TRANSACTION_ENGINE=""
RELEASE_TRANSACTION_ID=""
RELEASE_CANDIDATE_DIGEST=""
RELEASE_PROJECT_ROOT=""
RELEASE_CURRENT_BEFORE=""
RELEASE_TRANSACTION_PREPARED=0
RELEASE_TRANSACTION_ACTIVATED=0
RELEASE_TRANSACTION_COMMITTED=0
ROLLBACK_NGINX_WAS_ACTIVE=0
ROLLBACK_NGINX_MUTATION_GUARD_APPLIED=0
BASELINE_API_UNIT_SIGNATURE=""
BASELINE_SERVICE_ENV_SIGNATURE=""
BASELINE_RELEASE_ENV_SIGNATURE=""

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
    if [[ "$RELEASE_TRANSACTION_PREPARED" -eq 1 ]]; then
      rollback_versioned_release || status=1
    else
      rollback_install_root || status=1
    fi
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
  --rollback-previous        Reactivate the retained N-1 release, verify API/Nginx, then commit
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

release_engine() {
  python3.11 "$RELEASE_TRANSACTION_ENGINE" \
    --install-root "$INSTALL_ROOT" \
    --state-root "$RELEASE_STATE_ROOT" \
    "$@"
}

release_json_field() {
  local field="$1"
  python3.11 -c 'import json,sys; value=json.load(sys.stdin).get(sys.argv[1]); assert isinstance(value,str) and value; print(value)' "$field"
}

release_json_optional_field() {
  local field="$1"
  python3.11 -c '
import json
import sys

value = json.load(sys.stdin).get(sys.argv[1])
assert value is None or (isinstance(value, str) and value)
print("" if value is None else value)
' "$field"
}

prepare_versioned_release() {
  [[ -n "$ARCHIVE" ]] || return 0
  RELEASE_TRANSACTION_ENGINE="$ARCHIVE_SOURCE_ROOT/deploy/release_transaction.py"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    RELEASE_CANDIDATE_DIGEST="$(printf '%064d' 0)"
    RELEASE_PROJECT_ROOT="$INSTALL_ROOT/releases/sha256-$RELEASE_CANDIDATE_DIGEST"
    RELEASE_CURRENT_BEFORE=""
    if [[ -L "$INSTALL_ROOT/current" && \
      "$(readlink -- "$INSTALL_ROOT/current")" =~ ^releases/sha256-([0-9a-f]{64})$ ]]; then
      RELEASE_CURRENT_BEFORE="${BASH_REMATCH[1]}"
    fi
    printf '+ prepare content-addressed release from %q under %q, persist its journal under %q, and record post-readiness consumer-enable intent\n' \
      "$ARCHIVE_SOURCE_ROOT" "$INSTALL_ROOT/releases" "$RELEASE_STATE_ROOT"
    return
  fi
  [[ -f "$RELEASE_TRANSACTION_ENGINE" && ! -L "$RELEASE_TRANSACTION_ENGINE" && \
    -x "$RELEASE_TRANSACTION_ENGINE" ]] || die "release transaction engine is missing or unsafe"
  install -d -o root -g root -m 0755 "$INSTALL_ROOT"
  # From this point on the engine may have persisted an incomplete journal.
  # Reconcile it even if prepare dies before it can print transaction metadata.
  RELEASE_TRANSACTION_PREPARED=1
  RELEASE_TRANSACTION_COMMITTED=0
  local host_profile="common"
  [[ "$MANAGE_LOCAL_DAEMON" -eq 1 ]] && host_profile="managed-local"
  local prepared prepare_args=(
    prepare --source "$ARCHIVE_SOURCE_ROOT" --host-profile "$host_profile"
    --transaction-kind archive
    --rollback-consumer trex-webui-api.service
    --rollback-consumer nginx.service
  )
  if [[ "$MANAGE_LOCAL_DAEMON" -eq 1 && \
    "$ARCHIVE_DAEMON_MUTATION_EXPECTED" -eq 1 ]]; then
    prepare_args+=(--rollback-consumer trex-daemon-server.service)
    # Preserve canonical plan ordering required by the durable journal.
    prepare_args=(
      prepare --source "$ARCHIVE_SOURCE_ROOT" --host-profile "$host_profile"
      --transaction-kind archive
      --rollback-consumer trex-daemon-server.service
      --rollback-consumer trex-webui-api.service
      --rollback-consumer nginx.service
    )
  fi
  if [[ "$RUN_ENABLE" -eq 1 && \
    "$INSTALL_ROOT" == "/opt/trex-webui" && \
    "$RELEASE_STATE_ROOT" == "/var/lib/trex-webui-deploy" ]]; then
    if [[ "$MANAGE_LOCAL_DAEMON" -eq 1 ]]; then
      prepare_args+=(--enable-consumer trex-daemon-server.service)
      if [[ "$RUN_RESTART" -eq 1 ]]; then
        prepare_args+=(--start-consumer trex-daemon-server.service)
      fi
    fi
    prepare_args+=(
      --enable-consumer trex-webui-api.service
      --enable-consumer nginx.service
    )
    if [[ "$RUN_RESTART" -eq 1 ]]; then
      prepare_args+=(
        --start-consumer trex-webui-api.service
        --start-consumer nginx.service
      )
    fi
  fi
  prepared="$(release_engine "${prepare_args[@]}")" || \
    die "unable to prepare content-addressed release"
  RELEASE_TRANSACTION_ID="$(release_json_field transaction_id <<<"$prepared")" || \
    die "prepared release omitted its transaction id"
  RELEASE_CANDIDATE_DIGEST="$(release_json_field candidate <<<"$prepared")" || \
    die "prepared release omitted its payload digest"
  RELEASE_CURRENT_BEFORE="$(release_json_optional_field current_before <<<"$prepared")" || \
    die "prepared release omitted its prior current authority"
  RELEASE_PROJECT_ROOT="$INSTALL_ROOT/releases/sha256-$RELEASE_CANDIDATE_DIGEST"
  [[ -d "$RELEASE_PROJECT_ROOT" && ! -L "$RELEASE_PROJECT_ROOT" ]] || \
    die "prepared content-addressed release is missing"
}

arm_versioned_release_consumers() {
  local mode="${1:-archive}"
  [[ "$RELEASE_TRANSACTION_PREPARED" -eq 1 ]] || return 0
  local args=(arm-consumers --transaction-id "$RELEASE_TRANSACTION_ID")
  if [[ "$mode" != "legacy-baseline" ]]; then
    if [[ "$mode" == "archive" && "$MANAGE_LOCAL_DAEMON" -eq 1 && \
      "$ARCHIVE_DAEMON_MUTATION_EXPECTED" -eq 1 ]]; then
      args+=(--consumer trex-daemon-server.service)
    fi
    args+=(--consumer trex-webui-api.service --consumer nginx.service)
  fi
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '+ durably arm exact consumer rollback scope immediately before the first service mutation\n'
    return 0
  fi
  release_engine "${args[@]}" >/dev/null || \
    die "unable to durably arm release consumer rollback authority"
}

attach_candidate_dotenv() {
  [[ -n "$ARCHIVE" ]] || return 0
  local source=""
  if [[ -L "$INSTALL_ROOT/current" && -f "$INSTALL_ROOT/current/.env" ]]; then
    source="$(realpath -- "$INSTALL_ROOT/current/.env")" || \
      die "unable to resolve the selected runtime configuration"
  elif [[ ! -L "$INSTALL_ROOT/current" && -f "$INSTALL_ROOT/.env" ]]; then
    source="$INSTALL_ROOT/.env"
  fi
  [[ -n "$source" ]] || return 0
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '+ attach trusted optional runtime configuration %q to the prepared candidate\n' \
      "$source"
    return 0
  fi
  release_engine attach-dotenv \
    --transaction-id "$RELEASE_TRANSACTION_ID" \
    --source "$source" >/dev/null || \
    die "unable to preserve the optional project .env in the candidate release"
}

upgrade_selinux_mode() {
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

prelabel_versioned_release_for_selinux() {
  local mode
  mode="$(upgrade_selinux_mode)" || die "unable to inspect SELinux mode"
  [[ "$mode" =~ ^(Disabled|Permissive|Enforcing)$ ]] || \
    die "unexpected SELinux mode: $mode"
  if [[ "$RUN_SELINUX" -eq 0 && "$mode" == "Disabled" ]]; then
    return 0
  fi
  have_cmd semanage || \
    die "versioned release activation requires semanage when SELinux is enabled"
  have_cmd matchpathcon || \
    die "versioned release activation requires matchpathcon when SELinux is enabled"
  have_cmd restorecon || \
    die "versioned release activation requires restorecon when SELinux is enabled"
  have_cmd setsebool || \
    die "versioned release activation requires setsebool when SELinux is enabled"
  [[ -n "$RELEASE_PROJECT_ROOT" ]] || \
    die "versioned SELinux prelabel requires a prepared candidate release"

  log "Persisting and applying the exact versioned frontend SELinux policy before selector activation"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    run semanage fcontext -a -t httpd_sys_content_t "$VERSIONED_WEB_SELINUX_PATTERN"
    printf '+ if the exact local fcontext already exists, modify it to httpd_sys_content_t\n'
  elif ! semanage fcontext -a -t httpd_sys_content_t \
    "$VERSIONED_WEB_SELINUX_PATTERN" 2>/dev/null; then
    semanage fcontext -m -t httpd_sys_content_t \
      "$VERSIONED_WEB_SELINUX_PATTERN" || \
      die "unable to persist the versioned frontend SELinux file-context rule"
  fi

  local release_paths=("$RELEASE_PROJECT_ROOT")
  local selector selector_target selector_path known_path duplicate
  local release_path expected_context
  for selector in current previous; do
    if [[ ! -L "$INSTALL_ROOT/$selector" ]]; then
      if [[ "$selector" == "current" && "$DRY_RUN" -eq 0 && \
        -n "$RELEASE_CURRENT_BEFORE" ]]; then
        die "prepared current release selector disappeared before SELinux prelabel"
      fi
      continue
    fi
    selector_target="$(readlink -- "$INSTALL_ROOT/$selector")" || \
      die "unable to inspect $selector before SELinux prelabel"
    [[ "$selector_target" =~ ^releases/sha256-[0-9a-f]{64}$ ]] || \
      die "$selector selector is unsafe before SELinux prelabel"
    if [[ "$selector" == "current" && "$DRY_RUN" -eq 0 ]]; then
      [[ -n "$RELEASE_CURRENT_BEFORE" && \
        "$selector_target" == "releases/sha256-$RELEASE_CURRENT_BEFORE" ]] || \
        die "current selector does not match the prepared release transaction"
    fi
    selector_path="$INSTALL_ROOT/$selector_target"
    [[ -d "$selector_path" && ! -L "$selector_path" && \
      "$(realpath -- "$selector_path")" == "$selector_path" ]] || \
      die "$selector release target is unsafe before SELinux prelabel"
    duplicate=0
    for known_path in "${release_paths[@]}"; do
      if [[ "$known_path" == "$selector_path" ]]; then
        duplicate=1
        break
      fi
    done
    if [[ "$duplicate" -eq 0 ]]; then
      release_paths+=("$selector_path")
    fi
  done
  for release_path in "${release_paths[@]}"; do
    local service_ancestor
    for service_ancestor in \
      "$release_path" \
      "$release_path/apps" \
      "$release_path/apps/web"; do
      if [[ "$DRY_RUN" -eq 0 ]]; then
        [[ -d "$service_ancestor" && ! -L "$service_ancestor" ]] || \
          die "versioned release service ancestor is missing or unsafe: $service_ancestor"
      fi
      # Directory modes are deliberately excluded from the content digest.
      # Normalize only these root-created selector ancestors so a legacy
      # snapshot made under a private operator umask remains traversable by
      # the API service and Nginx after selection.
      run chmod 0755 "$service_ancestor"
    done
    if [[ "$DRY_RUN" -eq 1 ]]; then
      run restorecon -RF "$release_path"
      continue
    fi
    [[ -d "$release_path/apps/web/dist" && \
      ! -L "$release_path/apps/web/dist" ]] || \
      die "versioned frontend tree is missing or unsafe before activation: $release_path"
    expected_context="$(matchpathcon "$release_path/apps/web/dist")" || \
      die "unable to resolve the persisted frontend SELinux context"
    [[ "$expected_context" == *":httpd_sys_content_t:"* ]] || \
      die "persisted SELinux policy does not select the versioned frontend tree"
    # Archive extraction and venv staging happen below private temporary
    # directories, whose user_tmp_t label is otherwise inherited across the
    # atomic rename. Restore the complete release tree: the exact fcontext
    # rule still grants httpd_sys_content_t only to apps/web/dist, while API
    # source and the Python runtime recover their policy-derived private labels.
    run restorecon -RF "$release_path"
  done
  run sync --file-system "$INSTALL_ROOT"
  run setsebool -P httpd_can_network_connect 1
  # SELinux local fcontext and persistent boolean stores may live on a
  # different filesystem from both /opt and /etc.  Do not arm or switch the
  # selector until all policy stores and restored xattrs are durable.
  run sync
}

prepare_legacy_baseline() {
  [[ -n "$ARCHIVE" && "$INSTALL_ROOT" == "/opt/trex-webui" ]] || return 0
  [[ ! -e "$INSTALL_ROOT/current" && ! -L "$INSTALL_ROOT/current" ]] || return 0
  local legacy_api="$INSTALL_ROOT/apps/api"
  if [[ ! -d "$legacy_api" ]]; then
    log "No legacy installation requires a first-migration rollback baseline"
    return 0
  fi
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '+ snapshot the serving legacy API, static tree, profiles, and exact Python runtime as the initial content-addressed current release\n'
    return 0
  fi

  local runtime_root static_root snapshot prepared
  if [[ "$ARCHIVE_API_SERVICE_MATCHED" -eq 1 ]]; then
    [[ "$ARCHIVE_API_OLD_PROJECT_ROOT" == "$INSTALL_ROOT" ]] || \
      die "legacy API authority is not rooted at the in-place installation"
    runtime_root="${ARCHIVE_API_OLD_EXEC_PATH%/bin/python}"
  else
    runtime_root="$INSTALL_ROOT/.venv"
  fi
  [[ -d "$runtime_root" && ! -L "$runtime_root" ]] || \
    die "legacy installation has no complete Python runtime for crash-safe migration"
  [[ -d "$WEB_ROOT" && ! -L "$WEB_ROOT" && -f "$WEB_ROOT/index.html" ]] || \
    die "legacy installation has no complete canonical served frontend for crash-safe migration"
  static_root="$WEB_ROOT"

  RELEASE_TRANSACTION_ENGINE="$ARCHIVE_SOURCE_ROOT/deploy/release_transaction.py"
  snapshot="$STAGING_ROOT/legacy-serving-baseline"
  restart_legacy_api_and_prove_disk_authority
  assert_legacy_nginx_serving_authority "$static_root"
  log "Capturing the serving legacy installation as the first rollback release"
  release_engine snapshot-legacy \
    --destination "$snapshot" \
    --static-root "$static_root" \
    --runtime-root "$runtime_root" >/dev/null || \
    die "unable to capture a complete legacy rollback baseline"
  restart_legacy_api_and_prove_disk_authority
  assert_legacy_api_disk_matches_loaded_process
  assert_legacy_nginx_serving_authority "$static_root"
  release_engine verify-legacy-snapshot \
    --snapshot "$snapshot" \
    --static-root "$static_root" \
    --runtime-root "$runtime_root" >/dev/null || \
    die "legacy API/static/profiles/runtime/config changed after cold-start rollback proof"

  RELEASE_TRANSACTION_PREPARED=1
  RELEASE_TRANSACTION_COMMITTED=0
  local legacy_host_profile="common"
  [[ "$MANAGE_LOCAL_DAEMON" -eq 1 ]] && legacy_host_profile="managed-local"
  prepared="$(release_engine prepare --source "$snapshot" \
    --host-profile "$legacy_host_profile" \
    --transaction-kind legacy-baseline)" || \
    die "unable to prepare the legacy rollback baseline"
  RELEASE_TRANSACTION_ID="$(release_json_field transaction_id <<<"$prepared")" || \
    die "legacy baseline omitted its transaction id"
  arm_versioned_release_consumers legacy-baseline
  activate_versioned_release
  commit_versioned_release
  log "Committed the legacy installation as the initial current release"
  # The baseline is now a terminal serving release. The candidate transaction
  # starts with its own journal and failure state.
  RELEASE_TRANSACTION_PREPARED=0
  RELEASE_TRANSACTION_ACTIVATED=0
  RELEASE_TRANSACTION_COMMITTED=0
  RELEASE_TRANSACTION_ID=""
}

activate_versioned_release() {
  [[ "$RELEASE_TRANSACTION_PREPARED" -eq 1 ]] || return 0
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '+ atomically select the prepared candidate at %q/current and retain N-1 at previous\n' \
      "$INSTALL_ROOT"
    return
  fi
  release_engine activate --transaction-id "$RELEASE_TRANSACTION_ID" >/dev/null || \
    die "unable to activate prepared content-addressed release"
  RELEASE_TRANSACTION_ACTIVATED=1
}

commit_versioned_release() {
  [[ "$RELEASE_TRANSACTION_PREPARED" -eq 1 ]] || return 0
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '+ commit the release selector only after installer readiness and deploy/verify.sh pass\n'
    return
  fi
  local commit_output status_output phase transaction_id
  if ! commit_output="$(release_engine commit --transaction-id "$RELEASE_TRANSACTION_ID")"; then
    # The durable commit precedes retention pruning. A cleanup error must not
    # turn an already committed serving release into an implicit rollback.
    status_output="$(release_engine status 2>/dev/null)" || \
      die "unable to commit or inspect the content-addressed release"
    read -r phase transaction_id < <(
      python3.11 -c '
import json,sys
status=json.load(sys.stdin)
transaction=status.get("transaction") or {}
print(transaction.get("phase", ""), transaction.get("transaction_id", ""))
' <<<"$status_output"
    )
    if [[ "$transaction_id" != "$RELEASE_TRANSACTION_ID" ]]; then
      die "unable to commit verified content-addressed release"
    fi
    if [[ "$phase" == "finalizing_consumer_enable" ]]; then
      # Selector commit intent is already durable and must never be converted
      # back into an implicit rollback. Boot reconciliation will idempotently
      # finish consumer enablement and queue this boot's starts.
      RELEASE_TRANSACTION_COMMITTED=1
      die "release commit intent is durable, but consumer enable publication requires reconciliation"
    fi
    [[ "$phase" == "committed" ]] || \
      die "unable to commit verified content-addressed release"
    printf 'warning: release selector committed, but retention cleanup requires reconciliation\n' >&2
  fi
  RELEASE_TRANSACTION_COMMITTED=1
}

rollback_versioned_release() {
  [[ "$RELEASE_TRANSACTION_PREPARED" -eq 1 ]] || return 0
  [[ "$RELEASE_TRANSACTION_COMMITTED" -eq 0 ]] || return 0
  log "Reconciling the interrupted content-addressed release"
  local reconciled phase attempt
  reconciled="$(release_engine reconcile)" || return
  phase="$(release_json_field phase <<<"$reconciled")" || return
  if [[ "$phase" == "starting_baseline_consumers" ]]; then
    for ((attempt = 1; attempt <= ARCHIVE_API_READINESS_ATTEMPTS; attempt += 1)); do
      if reconciled="$(release_engine ack-consumers 2>/dev/null)"; then
        phase="$(release_json_field phase <<<"$reconciled")" || return
        [[ "$phase" == "rolled_back" ]] && break
      fi
      ((attempt < ARCHIVE_API_READINESS_ATTEMPTS)) && \
        sleep "$ARCHIVE_API_READINESS_INTERVAL_SECONDS"
    done
    [[ "$phase" == "rolled_back" ]] || {
      printf 'error: restored release consumers did not become ready for durable acknowledgement\n' >&2
      return 1
    }
  fi
  [[ "$phase" == "rolled_back" ]] || return 1
  RELEASE_TRANSACTION_ACTIVATED=0
  # After arm succeeds, the outer journal's immediately-before-mutation
  # active-state snapshot is the sole service restoration authority.
  ARCHIVE_API_MUTATION_GUARD_APPLIED=0
  ROLLBACK_NGINX_MUTATION_GUARD_APPLIED=0
}

legacy_release_infrastructure_present() {
  local path
  for path in \
    "$LEGACY_RELEASE_INFRASTRUCTURE_COMMON_MANIFEST" \
    "$LEGACY_RELEASE_INFRASTRUCTURE_MANAGED_MANIFEST" \
    "$LEGACY_RELEASE_BOOTSTRAP_TARGET" \
    "$LEGACY_RELEASE_RECONCILER_TARGET" \
    "$LEGACY_RELEASE_RECONCILER_UNIT_TARGET" \
    "$LEGACY_RELEASE_RECONCILER_RETRY_UNIT_TARGET" \
    "$LEGACY_RELEASE_RECONCILER_ACK_UNIT_TARGET" \
    "$LEGACY_RELEASE_RECONCILER_API_DROPIN_TARGET" \
    "$LEGACY_RELEASE_RECONCILER_NGINX_DROPIN_TARGET" \
    "$LEGACY_RELEASE_RECONCILER_DAEMON_DROPIN_TARGET"; do
    if [[ -e "$path" || -L "$path" ]]; then
      return 0
    fi
  done
  return 1
}

verify_legacy_release_infrastructure_exact() {
  legacy_release_infrastructure_present || return 0
  [[ -f "$LEGACY_RELEASE_INFRASTRUCTURE_COMMON_MANIFEST" && \
    ! -L "$LEGACY_RELEASE_INFRASTRUCTURE_COMMON_MANIFEST" ]] || \
    die "partial recovery ABI v1 found without its common immutable manifest"
  [[ -f "$LEGACY_RELEASE_BOOTSTRAP_TARGET" && \
    ! -L "$LEGACY_RELEASE_BOOTSTRAP_TARGET" && \
    -x "$LEGACY_RELEASE_BOOTSTRAP_TARGET" && \
    "$(stat -c '%u:%g %a %h' "$LEGACY_RELEASE_BOOTSTRAP_TARGET")" == "0:0 755 1" ]] || \
    die "recovery ABI v1 verifier is missing or unsafe"
  local legacy_common_expected=(
    --expected "$LEGACY_RELEASE_BOOTSTRAP_TARGET::0755::prerequisite"
    --expected "$LEGACY_RELEASE_RECONCILER_TARGET::0755::prerequisite"
    --expected "$TREX_OVERVIEW_VALIDATOR_TARGET::0755::prerequisite"
    --expected "$TREX_PERSISTED_STATE_VALIDATOR_TARGET::0755::prerequisite"
    --expected "$LEGACY_RELEASE_RECONCILER_UNIT_TARGET::0644::prerequisite"
    --expected "$LEGACY_RELEASE_RECONCILER_RETRY_UNIT_TARGET::0644::prerequisite"
    --expected "$LEGACY_RELEASE_RECONCILER_ACK_UNIT_TARGET::0644::prerequisite"
    --expected "$LEGACY_RELEASE_RECONCILER_API_DROPIN_TARGET::0644::consumer-dropin"
    --expected "$LEGACY_RELEASE_RECONCILER_NGINX_DROPIN_TARGET::0644::consumer-dropin"
  )
  /usr/bin/python3 "$LEGACY_RELEASE_BOOTSTRAP_TARGET" \
    --manifest "$LEGACY_RELEASE_INFRASTRUCTURE_COMMON_MANIFEST" \
    --verify-installed "${legacy_common_expected[@]}" || \
    die "recovery ABI v1 common infrastructure failed exact verification"

  local legacy_managed_present=0 path
  for path in \
    "$LEGACY_RELEASE_INFRASTRUCTURE_MANAGED_MANIFEST" \
    "$RELEASE_ROLLBACK_DAEMON_PROBE_TARGET" \
    "$RELEASE_ROLLBACK_NATIVE_BOUNDARY_TARGET" \
    "$LEGACY_RELEASE_RECONCILER_DAEMON_DROPIN_TARGET"; do
    if [[ -e "$path" || -L "$path" ]]; then
      legacy_managed_present=1
      break
    fi
  done
  if [[ "$legacy_managed_present" -eq 1 ]]; then
    [[ -f "$LEGACY_RELEASE_INFRASTRUCTURE_MANAGED_MANIFEST" && \
      ! -L "$LEGACY_RELEASE_INFRASTRUCTURE_MANAGED_MANIFEST" ]] || \
      die "partial managed-local recovery ABI v1 found without its immutable manifest"
    local legacy_managed_expected=(
      --expected "$RELEASE_ROLLBACK_DAEMON_PROBE_TARGET::0755::prerequisite"
      --expected "$RELEASE_ROLLBACK_NATIVE_BOUNDARY_TARGET::0755::prerequisite"
      --expected "$LEGACY_RELEASE_RECONCILER_DAEMON_DROPIN_TARGET::0644::consumer-dropin"
    )
    /usr/bin/python3 "$LEGACY_RELEASE_BOOTSTRAP_TARGET" \
      --manifest "$LEGACY_RELEASE_INFRASTRUCTURE_MANAGED_MANIFEST" \
      --verify-installed "${legacy_managed_expected[@]}" || \
      die "recovery ABI v1 managed-local infrastructure failed exact verification"
  fi
}

assert_legacy_release_units_quiescent() {
  local unit expected_fragment load_state fragment active_state sub_state job
  while IFS='|' read -r unit expected_fragment; do
    load_state="$(systemctl show "$unit" --property=LoadState --value)" || \
      die "unable to inspect recovery ABI v1 unit $unit"
    [[ "$load_state" == "loaded" ]] || \
      die "recovery ABI v1 unit $unit is not loaded for migration"
    fragment="$(systemctl show "$unit" --property=FragmentPath --value)" || \
      die "unable to inspect recovery ABI v1 unit $unit fragment"
    active_state="$(systemctl show "$unit" --property=ActiveState --value)" || \
      die "unable to inspect recovery ABI v1 unit $unit activity"
    sub_state="$(systemctl show "$unit" --property=SubState --value)" || \
      die "unable to inspect recovery ABI v1 unit $unit substate"
    job="$(systemctl show "$unit" --property=Job --value)" || \
      die "unable to inspect recovery ABI v1 unit $unit job"
    [[ "$fragment" == "$expected_fragment" && \
      "$active_state" == "inactive" && "$sub_state" == "dead" && -z "$job" ]] || \
      die "recovery ABI v1 unit $unit must be canonical, inactive, and job-free before migration"
  done <<EOF
trex-webui-release-reconcile.service|$LEGACY_RELEASE_RECONCILER_UNIT_TARGET
trex-webui-release-retry.service|$LEGACY_RELEASE_RECONCILER_RETRY_UNIT_TARGET
trex-webui-release-consumer-ack.service|$LEGACY_RELEASE_RECONCILER_ACK_UNIT_TARGET
EOF
}

verify_legacy_terminal_handoff_to_v2() {
  local source_v2_engine="$RELEASE_RECONCILER_TARGET"
  if [[ -n "$ARCHIVE_SOURCE_ROOT" ]]; then
    source_v2_engine="$ARCHIVE_SOURCE_ROOT/deploy/release_transaction.py"
  fi
  [[ -f "$source_v2_engine" && ! -L "$source_v2_engine" && -x "$source_v2_engine" ]] || \
    die "recovery ABI v2 handoff engine is missing or unsafe"
  local legacy_status v2_status
  legacy_status="$(/usr/bin/python3.11 "$LEGACY_RELEASE_RECONCILER_TARGET" \
    --install-root "$INSTALL_ROOT" --state-root "$RELEASE_STATE_ROOT" status)" || \
    die "recovery ABI v1 cannot read the durable release journal"
  v2_status="$(/usr/bin/python3.11 "$source_v2_engine" \
    --install-root "$INSTALL_ROOT" --state-root "$RELEASE_STATE_ROOT" status)" || \
    die "candidate recovery ABI v2 cannot read the durable release journal"
  /usr/bin/python3.11 - "$legacy_status" "$v2_status" <<'PY' || \
    die "recovery ABI v1 to v2 terminal handoff precondition failed"
import json
import sys

legacy = json.loads(sys.argv[1])
candidate = json.loads(sys.argv[2])
if legacy != candidate:
    raise SystemExit("v1 and v2 interpret the durable release state differently")
transaction = candidate.get("transaction")
if transaction is None:
    raise SystemExit("v1 recovery authority exists without a terminal journal")
if transaction.get("phase") not in {"committed", "rolled_back"}:
    raise SystemExit("release journal is not terminal")
if transaction.get("rollback_authority_retired") is not True:
    raise SystemExit("terminal rollback authority is not retired")
for key in (
    "consumer_mutation_armed",
    "daemon_mutation_started",
    "rollback_restored",
):
    if transaction.get(key) is not False:
        raise SystemExit(f"terminal journal retained mutation authority: {key}")
for key in (
    "consumer_active_before",
    "consumer_baseline",
    "consumer_enable",
    "consumer_start",
    "host_artifacts",
):
    if transaction.get(key) != []:
        raise SystemExit(f"terminal journal retained rollback data: {key}")
if transaction.get("native_boundary") is not None:
    raise SystemExit("terminal journal retained native-boundary authority")
if transaction["phase"] == "rolled_back":
    if candidate.get("current") != transaction.get("current_before"):
        raise SystemExit("rolled-back current selector differs from the journal")
    if candidate.get("previous") != transaction.get("previous_before"):
        raise SystemExit("rolled-back previous selector differs from the journal")
PY
}

preflight_recovery_v2_migration() {
  [[ ! -e "$RELEASE_INFRASTRUCTURE_COMMON_MANIFEST" && \
    ! -L "$RELEASE_INFRASTRUCTURE_COMMON_MANIFEST" ]] || return 0
  legacy_release_infrastructure_present || return 0
  verify_legacy_release_infrastructure_exact
  assert_legacy_release_units_quiescent
  verify_legacy_terminal_handoff_to_v2
}

bootstrap_release_reconciler() {
  [[ -n "$ARCHIVE" ]] || return 0
  if [[ "$INSTALL_ROOT" != "/opt/trex-webui" ]]; then
    log "Skipping host reconciler publication for non-production fixture root $INSTALL_ROOT"
    return 0
  fi
  local source_bootstrap="$ARCHIVE_SOURCE_ROOT/deploy/bootstrap_release_infrastructure.py"
  local source_engine="$ARCHIVE_SOURCE_ROOT/deploy/release_transaction.py"
  local source_overview_validator="$ARCHIVE_SOURCE_ROOT/deploy/trex_overview_contract.py"
  local source_state_validator="$ARCHIVE_SOURCE_ROOT/deploy/trex_persisted_state_contract.py"
  local source_daemon_probe="$ARCHIVE_SOURCE_ROOT/deploy/daemon_rpc_probe.py"
  local source_native_boundary="$ARCHIVE_SOURCE_ROOT/deploy/trex_native_boundary.sh"
  local source_unit="$ARCHIVE_SOURCE_ROOT/deploy/systemd/trex-webui-release-reconcile-v2.service"
  local source_retry_unit="$ARCHIVE_SOURCE_ROOT/deploy/systemd/trex-webui-release-retry-v2.service"
  local source_ack_unit="$ARCHIVE_SOURCE_ROOT/deploy/systemd/trex-webui-release-consumer-ack-v2.service"
  local source_dropin="$ARCHIVE_SOURCE_ROOT/deploy/systemd/trex-webui-release-reconcile-v2.conf"
  local source_reconcile_bridge="$ARCHIVE_SOURCE_ROOT/deploy/systemd/trex-webui-release-reconcile-v1-bridge-v2.conf"
  local source_retry_bridge="$ARCHIVE_SOURCE_ROOT/deploy/systemd/trex-webui-release-retry-v1-bridge-v2.conf"
  local source_ack_bridge="$ARCHIVE_SOURCE_ROOT/deploy/systemd/trex-webui-release-consumer-ack-v1-bridge-v2.conf"
  local source
  for source in \
    "$source_bootstrap" "$source_engine" "$source_overview_validator" \
    "$source_state_validator" "$source_daemon_probe" "$source_native_boundary" \
    "$source_unit" "$source_retry_unit" "$source_ack_unit" "$source_dropin" \
    "$source_reconcile_bridge" "$source_retry_bridge" "$source_ack_bridge"; do
    [[ -f "$source" && ! -L "$source" ]] || \
      die "archive fixed release infrastructure is missing or unsafe: $source"
  done
  [[ -x "$source_bootstrap" && -x "$source_engine" && \
    -x "$source_daemon_probe" && -x "$source_native_boundary" ]] || \
    die "archive fixed release infrastructure executables have unsafe modes"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '+ exact-verify terminal recovery ABI v1 state, then publish or exact-verify recovery ABI v2 and quarantine v1 semantics\n'
    if [[ "$MANAGE_LOCAL_DAEMON" -eq 1 ]]; then
      printf '+ publish or exact-verify the fixed managed-local rollback helpers/drop-in and durable manifest\n'
    fi
    printf '+ daemon-reload, durably enable the reconciler, and queue its lock-aware retry loop\n'
    return 0
  fi
  preflight_recovery_v2_migration
  local engine_parent unit_parent
  engine_parent="$(dirname -- "$RELEASE_RECONCILER_TARGET")"
  unit_parent="$(dirname -- "$RELEASE_RECONCILER_UNIT_TARGET")"
  install -d -o root -g root -m 0755 \
    "$engine_parent" \
    "$unit_parent" \
    "$RELEASE_RECONCILER_NGINX_DROPIN_ROOT" \
    "$RELEASE_RECONCILER_API_DROPIN_ROOT" \
    "$LEGACY_RELEASE_RECONCILER_BRIDGE_ROOT" \
    "$LEGACY_RELEASE_RECONCILER_RETRY_BRIDGE_ROOT" \
    "$LEGACY_RELEASE_RECONCILER_ACK_BRIDGE_ROOT"
  install -d -o root -g root -m 0700 "$RELEASE_STATE_ROOT"
  local common_artifacts=(
    --artifact "$source_bootstrap::$RELEASE_BOOTSTRAP_TARGET::0755"
    --artifact "$source_engine::$RELEASE_RECONCILER_TARGET::0755"
    --artifact "$source_overview_validator::$TREX_OVERVIEW_VALIDATOR_TARGET::0755"
    --artifact "$source_state_validator::$TREX_PERSISTED_STATE_VALIDATOR_TARGET::0755"
    --artifact "$source_unit::$RELEASE_RECONCILER_UNIT_TARGET::0644"
    --artifact "$source_retry_unit::$RELEASE_RECONCILER_RETRY_UNIT_TARGET::0644"
    --artifact "$source_ack_unit::$RELEASE_RECONCILER_ACK_UNIT_TARGET::0644"
    --consumer-dropin "$source_reconcile_bridge::$LEGACY_RELEASE_RECONCILER_BRIDGE_TARGET::0644"
    --consumer-dropin "$source_retry_bridge::$LEGACY_RELEASE_RECONCILER_RETRY_BRIDGE_TARGET::0644"
    --consumer-dropin "$source_ack_bridge::$LEGACY_RELEASE_RECONCILER_ACK_BRIDGE_TARGET::0644"
    --consumer-dropin "$source_dropin::$RELEASE_RECONCILER_API_DROPIN_TARGET::0644"
    --consumer-dropin "$source_dropin::$RELEASE_RECONCILER_NGINX_DROPIN_TARGET::0644"
  )
  /usr/bin/python3 "$source_bootstrap" \
    --manifest "$RELEASE_INFRASTRUCTURE_COMMON_MANIFEST" \
    "${common_artifacts[@]}" || \
    die "unable to publish the fixed common release infrastructure"
  if [[ "$MANAGE_LOCAL_DAEMON" -eq 1 ]]; then
    install -d -o root -g root -m 0755 "$RELEASE_RECONCILER_DAEMON_DROPIN_ROOT"
    local managed_artifacts=(
      --artifact "$source_daemon_probe::$RELEASE_ROLLBACK_DAEMON_PROBE_TARGET::0755"
      --artifact "$source_native_boundary::$RELEASE_ROLLBACK_NATIVE_BOUNDARY_TARGET::0755"
      --consumer-dropin "$source_dropin::$RELEASE_RECONCILER_DAEMON_DROPIN_TARGET::0644"
    )
    /usr/bin/python3 "$source_bootstrap" \
      --manifest "$RELEASE_INFRASTRUCTURE_MANAGED_MANIFEST" \
      "${managed_artifacts[@]}" || \
      die "unable to publish the fixed managed-local release infrastructure"
  fi
  # Persist the newly-created /var/lib state-root directory entry, immutable
  # manifests, and artifacts before /etc enablement or any selector/service
  # mutation can become durable on a different filesystem.
  sync --file-system "$RELEASE_STATE_ROOT" || \
    die "unable to persist the fixed release infrastructure state"
  arm_installed_release_reconciler
}

have_cmd() {
  command -v "$1" >/dev/null 2>&1
}

assert_loaded_unit_disk_authority() {
  local unit="$1"
  local canonical_fragment="$2"
  local label="$3"
  local load_state fragment_path need_reload dropins owner mode
  local legacy_dropin="" v2_dropin=""

  load_state="$(systemctl show "$unit" --property=LoadState --value)" || \
    die "unable to inspect $label LoadState"
  [[ "$load_state" == "loaded" ]] || return 0
  fragment_path="$(systemctl show "$unit" --property=FragmentPath --value)" || \
    die "unable to inspect $label FragmentPath"
  need_reload="$(systemctl show "$unit" --property=NeedDaemonReload --value)" || \
    die "unable to inspect $label NeedDaemonReload"
  dropins="$(systemctl show "$unit" --property=DropInPaths --value)" || \
    die "unable to inspect $label DropInPaths"
  [[ "$fragment_path" == "$canonical_fragment" ]] || \
    die "$label is loaded from non-canonical fragment ${fragment_path:-unknown}"
  if [[ "$need_reload" != "no" ]]; then
    assert_pending_recovery_v2_generation_matches_archive
  fi
  case "$unit" in
    trex-webui-api.service)
      legacy_dropin="$LEGACY_RELEASE_RECONCILER_API_DROPIN_TARGET"
      v2_dropin="$RELEASE_RECONCILER_API_DROPIN_TARGET"
      ;;
    trex-daemon-server.service)
      legacy_dropin="$LEGACY_RELEASE_RECONCILER_DAEMON_DROPIN_TARGET"
      v2_dropin="$RELEASE_RECONCILER_DAEMON_DROPIN_TARGET"
      ;;
  esac
  assert_loaded_dropins_are_known "$label" "$dropins" "$legacy_dropin" "$v2_dropin"
  [[ -f "$canonical_fragment" && ! -L "$canonical_fragment" ]] || \
    die "$label canonical fragment is missing or unsafe"
  read -r owner mode < <(stat -Lc '%u %a' -- "$canonical_fragment") || \
    die "unable to inspect $label canonical fragment"
  [[ "$owner" == "0" && $((8#$mode & 0022)) -eq 0 ]] || \
    die "$label canonical fragment is not root-controlled"
}

assert_loaded_unit_not_stale() {
  local unit="$1"
  local label="$2"
  local load_state need_reload
  load_state="$(systemctl show "$unit" --property=LoadState --value)" || \
    die "unable to inspect $label LoadState"
  [[ "$load_state" == "loaded" ]] || return 0
  need_reload="$(systemctl show "$unit" --property=NeedDaemonReload --value)" || \
    die "unable to inspect $label NeedDaemonReload"
  [[ "$need_reload" == "no" ]] || \
    die "$label disk authority differs from the loaded systemd manager state; run daemon-reload and prove it healthy before upgrading"
}

assert_legacy_nginx_serving_authority() {
  local static_root="$1"
  local nginx_dump response roots=()
  [[ "$static_root" == "$WEB_ROOT" ]] || \
    die "legacy Nginx snapshot root is not the canonical web root"
  [[ -f "$NGINX_CONF_TARGET" && ! -L "$NGINX_CONF_TARGET" ]] || \
    die "legacy managed Nginx configuration is missing or unsafe"
  trex_assert_root_controlled_authority_path "$NGINX_CONF_TARGET" \
    "legacy managed Nginx configuration" || \
    die "legacy managed Nginx configuration is not root-controlled"
  mapfile -t roots < <(
    sed 's/[[:space:]]*#.*$//' "$NGINX_CONF_TARGET" | \
      awk '$1 == "root" { value=$2; sub(/;$/, "", value); print value }'
  )
  [[ "${#roots[@]}" -eq 1 && "${roots[0]}" == "$static_root" ]] || \
    die "legacy managed Nginx configuration must select exactly the canonical static root"
  nginx -t || die "legacy Nginx disk configuration is invalid before migration"
  nginx_dump="$(nginx -T 2>&1)" || \
    die "unable to inspect the complete legacy Nginx disk authority"
  [[ "$(grep -Fc "configuration file $NGINX_CONF_TARGET:" <<<"$nginx_dump")" -eq 1 ]] || \
    die "legacy managed Nginx configuration is not uniquely loaded from its canonical path"
  systemctl is-active --quiet nginx.service || \
    systemctl is-active --quiet nginx || \
    die "legacy Nginx is not active; there is no serving frontend authority to snapshot"
  # Converge the live master onto the already validated disk configuration so
  # the host-artifact journal and the bytes observed through HTTP describe one
  # authority, not stale in-memory and on-disk generations.
  systemctl reload nginx || \
    die "unable to converge legacy Nginx onto its validated disk configuration"
  systemctl is-active --quiet nginx.service || \
    systemctl is-active --quiet nginx || \
    die "legacy Nginx became inactive while converging disk authority"
  response="$(mktemp -t trex-webui-legacy-index.XXXXXX)" || \
    die "unable to stage legacy frontend authority proof"
  if ! curl -fsS --noproxy '*' --connect-timeout 2 --max-time 8 \
    --output "$response" "http://127.0.0.1/"; then
    rm -f -- "$response"
    die "legacy Nginx frontend authority request failed"
  fi
  if ! cmp -s "$response" "$static_root/index.html"; then
    rm -f -- "$response"
    die "legacy Nginx did not serve the exact frontend selected for rollback snapshot"
  fi
  rm -f -- "$response"
}

timestamp() {
  date -u +%Y%m%dT%H%M%SZ
}

archive_api_loaded_exec_path() {
  local project_root="${1:-$INSTALL_ROOT}"
  local value exec_path argv expected_argv runtime_suffix
  value="$(systemctl show trex-webui-api.service --property=ExecStart --value)" || return
  [[ -n "$value" && "$value" != *$'\n'* ]] || return 1

  exec_path="$(sed -n 's/^[^{]*{[[:space:]]*path=\([^ ;}]*\)[[:space:]]*;.*/\1/p' <<<"$value")"
  argv="$(sed -n \
    's/^[^{]*{[^}]*[[:space:]]argv\[\]=\(.*\)[[:space:]];[[:space:]]ignore_errors=.*/\1/p' \
    <<<"$value")"
  [[ "$exec_path" == /* && -n "$argv" ]] || return 1
  case "$exec_path" in
    "$project_root/.venv/bin/python")
      ;;
    "$project_root"/.venv.runtime-*/bin/python)
      runtime_suffix="${exec_path#"$project_root/.venv.runtime-"}"
      runtime_suffix="${runtime_suffix%/bin/python}"
      [[ -n "$runtime_suffix" && "$runtime_suffix" != */* ]] || return 1
      ;;
    *)
      return 1
      ;;
  esac

  expected_argv="$exec_path -m uvicorn app.main:app --app-dir $project_root/apps/api --host 127.0.0.1 --port 8080"
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
  ARCHIVE_API_OLD_PROJECT_ROOT=""
  ARCHIVE_API_OLD_MAIN_PID=""

  local load_state working_directory
  load_state="$(systemctl show trex-webui-api.service --property=LoadState --value)" || \
    die "unable to inspect trex-webui-api.service before archive source mutation"
  if [[ "$load_state" != "loaded" ]]; then
    log "No loaded trex-webui-api.service targets archive install root $INSTALL_ROOT"
    return 0
  fi
  assert_loaded_unit_disk_authority \
    trex-webui-api.service "$SYSTEMD_SERVICE_TARGET" \
    "trex-webui-api.service"

  working_directory="$(systemctl show trex-webui-api.service --property=WorkingDirectory --value)" || \
    die "unable to inspect trex-webui-api.service WorkingDirectory before archive source mutation"
  if [[ "$working_directory" == "$INSTALL_ROOT" ]]; then
    ARCHIVE_API_OLD_PROJECT_ROOT="$INSTALL_ROOT"
  elif [[ "$working_directory" == "$INSTALL_ROOT/current" && \
    -L "$INSTALL_ROOT/current" && \
    "$(readlink -- "$INSTALL_ROOT/current")" =~ ^releases/sha256-[0-9a-f]{64}$ ]]; then
    ARCHIVE_API_OLD_PROJECT_ROOT="$INSTALL_ROOT/current"
  else
    if [[ -n "$ARCHIVE" && "$INSTALL_ROOT" == "/opt/trex-webui" ]]; then
      die "canonical trex-webui-api.service is loaded from foreign WorkingDirectory $working_directory"
    fi
    log "Loaded trex-webui-api.service belongs to $working_directory, not archive install root $INSTALL_ROOT; leaving it untouched"
    return 0
  fi

  ARCHIVE_API_OLD_EXEC_PATH="$(archive_api_loaded_exec_path "$ARCHIVE_API_OLD_PROJECT_ROOT")" || \
    die "trex-webui-api.service has the archive install root WorkingDirectory but no exact matching ExecStart/--app-dir contract"
  [[ -n "$ARCHIVE_API_OLD_EXEC_PATH" ]] || \
    die "trex-webui-api.service has no parseable interpreter for archive source mutation"
  ARCHIVE_API_SERVICE_MATCHED=1

  if systemctl is-active --quiet trex-webui-api.service; then
    ARCHIVE_API_WAS_ACTIVE=1
    if [[ "$ARCHIVE_API_OLD_PROJECT_ROOT" == "$INSTALL_ROOT" ]]; then
      ARCHIVE_API_OLD_MAIN_PID="$(systemctl show trex-webui-api.service --property=MainPID --value)" || \
        die "unable to capture trex-webui-api.service MainPID"
      [[ "$ARCHIVE_API_OLD_MAIN_PID" =~ ^[1-9][0-9]*$ && \
        -r "/proc/$ARCHIVE_API_OLD_MAIN_PID/stat" ]] || \
        die "active legacy trex-webui-api.service has no stable MainPID"
    fi
    [[ "$RUN_RESTART" -eq 1 ]] || \
      die "--skip-restart cannot mutate $INSTALL_ROOT while its matching trex-webui-api.service is active"
  fi
}

legacy_api_tree_not_newer_than_process() {
  local main_pid="$1"
  local api_tree="$2"
  local dotenv_path="${3:-}"
  python3.11 - "$main_pid" "$api_tree" "$dotenv_path" <<'PY'
from __future__ import annotations

import os
import stat
import sys
from pathlib import Path


pid_text, api_text, dotenv_text = sys.argv[1:]
if not pid_text.isdecimal() or int(pid_text) <= 0:
    raise SystemExit("legacy API MainPID is invalid")
pid = int(pid_text)
stat_payload = Path(f"/proc/{pid}/stat").read_text(encoding="ascii")
tail = stat_payload.rsplit(")", 1)
if len(tail) != 2:
    raise SystemExit("legacy API process start metadata is invalid")
fields = tail[1].split()
if len(fields) <= 19:
    raise SystemExit("legacy API process start metadata is incomplete")
start_ticks = int(fields[19])
clock_ticks = os.sysconf("SC_CLK_TCK")
boot_seconds = None
for line in Path("/proc/stat").read_text(encoding="ascii").splitlines():
    if line.startswith("btime "):
        boot_seconds = int(line.split()[1])
        break
if boot_seconds is None:
    raise SystemExit("kernel boot timestamp is unavailable")
# One second covers coarse source timestamp filesystems without permitting an
# operator edit made after a settled service start.
cutoff_ns = int((boot_seconds + start_ticks / clock_ticks + 1.0) * 1_000_000_000)

paths: list[Path] = []
api_root = Path(api_text)
if not api_root.is_dir() or api_root.is_symlink():
    raise SystemExit(f"legacy API source root is unsafe: {api_root}")
for directory, names, filenames in os.walk(api_root, topdown=True, followlinks=False):
    directory_path = Path(directory)
    for name in [*names, *filenames]:
        path = directory_path / name
        metadata = path.lstat()
        if stat.S_ISLNK(metadata.st_mode):
            raise SystemExit(f"legacy API source contains a symbolic link: {path}")
        if stat.S_ISREG(metadata.st_mode):
            paths.append(path)
dotenv = Path(dotenv_text) if dotenv_text else None
if dotenv is not None and (dotenv.exists() or dotenv.is_symlink()):
    metadata = dotenv.lstat()
    if not stat.S_ISREG(metadata.st_mode) or dotenv.is_symlink():
        raise SystemExit(f"legacy runtime configuration is unsafe: {dotenv}")
    paths.append(dotenv)
for path in paths:
    if path.stat().st_mtime_ns > cutoff_ns:
        raise SystemExit(
            "legacy serving source changed after the API process started: "
            f"{path}; restart the API, verify readiness, then retry the archive upgrade"
        )
PY
}

assert_legacy_api_disk_matches_loaded_process() {
  [[ "$ARCHIVE_API_WAS_ACTIVE" -eq 1 ]] || return 0
  local current_pid process_exec
  current_pid="$(systemctl show trex-webui-api.service --property=MainPID --value)" || \
    die "unable to revalidate the legacy API MainPID"
  [[ "$current_pid" == "$ARCHIVE_API_OLD_MAIN_PID" ]] || \
    die "legacy API restarted while its rollback baseline was being captured"
  process_exec="$(archive_api_main_pid_exec_path)" || \
    die "unable to revalidate the legacy API process executable"
  [[ "$process_exec" == "$ARCHIVE_API_OLD_EXEC_PATH" ]] || \
    die "legacy API process identity changed before rollback baseline capture"
  legacy_api_tree_not_newer_than_process \
    "$current_pid" \
    "$INSTALL_ROOT/apps/api" \
    "$INSTALL_ROOT/.env" || \
    die "legacy on-disk API/configuration does not match the loaded serving process"
}

restart_legacy_api_and_prove_disk_authority() {
  [[ "$ARCHIVE_API_SERVICE_MATCHED" -eq 1 && \
    "$ARCHIVE_API_OLD_PROJECT_ROOT" == "$INSTALL_ROOT" && \
    "$ARCHIVE_API_WAS_ACTIVE" -eq 1 ]] || \
    die "first migration requires an active canonical legacy API to prove a restartable rollback baseline"
  assert_loaded_unit_disk_authority \
    trex-webui-api.service "$SYSTEMD_SERVICE_TARGET" \
    "trex-webui-api.service"
  log "Restarting the legacy API to prove its on-disk rollback authority"
  systemctl restart trex-webui-api.service || \
    die "legacy API cannot cold-start from the on-disk rollback authority"
  wait_for_restored_archive_api_readiness || \
    die "legacy API failed readiness after cold-start authority convergence"
  capture_archive_api_service_state
  [[ "$ARCHIVE_API_SERVICE_MATCHED" -eq 1 && \
    "$ARCHIVE_API_OLD_PROJECT_ROOT" == "$INSTALL_ROOT" && \
    "$ARCHIVE_API_WAS_ACTIVE" -eq 1 ]] || \
    die "legacy API identity changed during cold-start authority convergence"
  verify_restored_archive_api_identity \
    "$ARCHIVE_API_OLD_EXEC_PATH" "$INSTALL_ROOT" || \
    die "legacy API process does not match its loaded disk authority"
  assert_legacy_api_disk_matches_loaded_process
}

stop_archive_api_service_for_source_mutation() {
  [[ "$ARCHIVE_API_SERVICE_MATCHED" -eq 1 ]] || return 0
  [[ "$ARCHIVE_API_STATE_CAPTURED" -eq 1 ]] || \
    die "archive API service state was not captured before source mutation"

  local load_state working_directory current_exec
  local expected_project_root="${ARCHIVE_API_OLD_PROJECT_ROOT:-$INSTALL_ROOT}"
  load_state="$(systemctl show trex-webui-api.service --property=LoadState --value)" || \
    die "unable to revalidate trex-webui-api.service before archive source mutation"
  working_directory="$(systemctl show trex-webui-api.service --property=WorkingDirectory --value)" || \
    die "unable to revalidate trex-webui-api.service WorkingDirectory before archive source mutation"
  current_exec="$(archive_api_loaded_exec_path "$expected_project_root")" || \
    die "trex-webui-api.service ExecStart/--app-dir changed before archive source mutation"
  [[ "$load_state" == "loaded" && "$working_directory" == "$expected_project_root" && \
    "$current_exec" == "$ARCHIVE_API_OLD_EXEC_PATH" ]] || \
    die "trex-webui-api.service identity changed before archive source mutation"

  ARCHIVE_API_MUTATION_GUARD_APPLIED=1
  log "Stopping the matching API before archive source mutation"
  systemctl stop trex-webui-api.service || \
    die "unable to stop trex-webui-api.service before archive source mutation"
  assert_systemd_unit_quiescent \
    trex-webui-api.service "trex-webui-api.service" || \
    die "trex-webui-api.service retained active work; refusing archive source mutation"
}

assert_systemd_unit_quiescent() {
  local unit="$1"
  local label="$2"
  local active_state job
  active_state="$(systemctl show "$unit" --property=ActiveState --value)" || \
    return 1
  job="$(systemctl show "$unit" --property=Job --value)" || return 1
  [[ "$active_state" == "inactive" && -z "$job" ]]
}

stop_archive_nginx_for_selector_mutation() {
  ROLLBACK_NGINX_MUTATION_GUARD_APPLIED=1
  log "Stopping Nginx before changing the atomic release selector"
  systemctl stop nginx.service || \
    die "unable to stop nginx.service before release selector mutation"
  assert_systemd_unit_quiescent nginx.service "nginx.service" || \
    die "nginx.service retained active work; refusing release selector mutation"
}

stop_versioned_release_consumers_for_selector_mutation() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '+ after durable consumer arm, stop API and Nginx and prove both inactive with no queued jobs before selector mutation\n'
    return 0
  fi
  # The durable journal captured the exact active subset immediately before
  # this boundary.  From here onward it is the sole authority for restoring
  # service state after any crash or shell failure.
  stop_archive_nginx_for_selector_mutation
  stop_archive_api_service_for_source_mutation
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
  local expected_project_root="${2:-${ARCHIVE_API_OLD_PROJECT_ROOT:-$INSTALL_ROOT}}"
  local load_state working_directory loaded_exec process_exec

  systemctl is-active --quiet trex-webui-api.service || {
    printf 'error: restored trex-webui-api.service is not active after readiness succeeded\n' >&2
    return 1
  }
  load_state="$(systemctl show trex-webui-api.service --property=LoadState --value)" || return
  working_directory="$(systemctl show trex-webui-api.service --property=WorkingDirectory --value)" || return
  loaded_exec="$(archive_api_loaded_exec_path "$expected_project_root")" || {
    printf 'error: restored API loaded ExecStart/--app-dir contract is invalid\n' >&2
    return 1
  }
  [[ "$load_state" == "loaded" && "$working_directory" == "$expected_project_root" ]] || {
    printf 'error: restored API loaded unit no longer targets prior project root %s\n' \
      "$expected_project_root" >&2
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
  local restored_project_root="${ARCHIVE_API_OLD_PROJECT_ROOT:-$INSTALL_ROOT}"
  local restored_exec="$ARCHIVE_API_OLD_EXEC_PATH"
  log "Reloading the restored unit and restarting the API after archive rollback"
  systemctl daemon-reload || return
  if [[ "$restored_project_root" == "$INSTALL_ROOT" && \
    -L "$INSTALL_ROOT/current" && \
    "$(systemctl show trex-webui-api.service --property=WorkingDirectory --value)" == "$INSTALL_ROOT/current" ]]; then
    # The candidate installer may have completed before the outer selector
    # commit failed. Its release-invariant unit is safe with the imported
    # legacy baseline selected at current, even though the old in-place unit
    # backup has already been retired.
    restored_project_root="$INSTALL_ROOT/current"
    restored_exec="$(archive_api_loaded_exec_path "$restored_project_root")" || {
      printf 'error: stable rollback unit does not match the imported legacy baseline\n' >&2
      return 1
    }
  fi
  systemctl restart trex-webui-api.service || return
  wait_for_restored_archive_api_readiness || return
  verify_restored_archive_api_identity "$restored_exec" "$restored_project_root"
}

parse_args() {
  local seen_archive=0 seen_sha256=0 seen_rollback_previous=0
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --archive)
        [[ "$seen_archive" -eq 0 ]] || die "--archive may be specified only once"
        seen_archive=1
        ARCHIVE="${2:-}"
        [[ -n "$ARCHIVE" ]] || die "--archive requires a value"
        shift 2
        ;;
      --rollback-previous)
        [[ "$seen_rollback_previous" -eq 0 ]] || \
          die "--rollback-previous may be specified only once"
        seen_rollback_previous=1
        ROLLBACK_PREVIOUS=1
        shift
        ;;
      --sha256)
        [[ "$seen_sha256" -eq 0 ]] || die "--sha256 may be specified only once"
        seen_sha256=1
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
  if [[ "$ROLLBACK_PREVIOUS" -eq 1 ]]; then
    [[ -z "$ARCHIVE" && -z "$ARCHIVE_SHA256" ]] || \
      die "--rollback-previous cannot be combined with --archive or --sha256"
    [[ "$RUN_RESTART" -eq 1 ]] || \
      die "--rollback-previous requires service restart and readiness verification"
    [[ "$INSTALL_NGINX" -eq 0 && "$INSTALL_PYTHON_DEPS" -eq 0 && \
      "$RUN_SELINUX" -eq 0 && "$RUN_FIREWALLD" -eq 0 ]] || \
      die "--rollback-previous cannot install packages, dependencies, or host policy"
    [[ "$MANAGE_LOCAL_DAEMON" -eq 1 ]] || \
      die "--rollback-previous requires the installer-managed local daemon"
  fi
}

normalize_paths() {
  if [[ "$ROLLBACK_PREVIOUS" -eq 1 ]]; then
    INSTALL_ROOT="${INSTALL_ROOT:-/opt/trex-webui}"
    RELEASE_STATE_ROOT="${RELEASE_STATE_ROOT:-/var/lib/trex-webui-deploy}"
  elif [[ -n "$ARCHIVE" ]]; then
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
  if [[ -n "$ARCHIVE" && -z "$RELEASE_STATE_ROOT" ]]; then
    if [[ "$INSTALL_ROOT" == "/opt/trex-webui" ]]; then
      RELEASE_STATE_ROOT="/var/lib/trex-webui-deploy"
    else
      RELEASE_STATE_ROOT="$(dirname -- "$INSTALL_ROOT")/.$(basename -- "$INSTALL_ROOT")-release-state"
    fi
  fi
  RELEASE_INFRASTRUCTURE_COMMON_MANIFEST="${RELEASE_INFRASTRUCTURE_COMMON_MANIFEST:-$RELEASE_STATE_ROOT/infrastructure-v2-common.json}"
  RELEASE_INFRASTRUCTURE_MANAGED_MANIFEST="${RELEASE_INFRASTRUCTURE_MANAGED_MANIFEST:-$RELEASE_STATE_ROOT/infrastructure-v2-managed-local.json}"
  LEGACY_RELEASE_INFRASTRUCTURE_COMMON_MANIFEST="${LEGACY_RELEASE_INFRASTRUCTURE_COMMON_MANIFEST:-$RELEASE_STATE_ROOT/infrastructure-common.json}"
  LEGACY_RELEASE_INFRASTRUCTURE_MANAGED_MANIFEST="${LEGACY_RELEASE_INFRASTRUCTURE_MANAGED_MANIFEST:-$RELEASE_STATE_ROOT/infrastructure-managed-local.json}"
  WEB_ROOT="$(trex_canonical_path "$WEB_ROOT" "web root")" || die "unsafe web root"
  STATIC_BACKUP_ROOT="$(trex_canonical_path "$STATIC_BACKUP_ROOT" "static backup root")" || die "unsafe static backup root"
  SOURCE_BACKUP_ROOT="$(trex_canonical_path "$SOURCE_BACKUP_ROOT" "source backup root")" || die "unsafe source backup root"
  NGINX_CONF_TARGET="$(trex_canonical_path "$NGINX_CONF_TARGET" "Nginx configuration target")" || die "unsafe Nginx configuration target"
  SYSTEMD_SERVICE_TARGET="$(trex_canonical_path "$SYSTEMD_SERVICE_TARGET" "API systemd service target")" || die "unsafe API systemd service target"
  SERVICE_ENV_FILE="$(trex_canonical_path "$SERVICE_ENV_FILE" "API environment file")" || die "unsafe API environment file"
  DAEMON_SYSTEMD_SERVICE_TARGET="$(trex_canonical_path "$DAEMON_SYSTEMD_SERVICE_TARGET" "daemon systemd service target")" || die "unsafe daemon systemd service target"
  DAEMON_LIBEXEC_ROOT="$(trex_canonical_path "$DAEMON_LIBEXEC_ROOT" "daemon libexec root")" || die "unsafe daemon libexec root"
  RECOVERY_V2_ROOT="$(trex_canonical_path "$RECOVERY_V2_ROOT" "recovery ABI v2 root")" || die "unsafe recovery ABI v2 root"
  DAEMON_SUPERVISOR_TARGET="$(trex_canonical_path "$DAEMON_SUPERVISOR_TARGET" "daemon supervisor target")" || die "unsafe daemon supervisor target"
  DAEMON_RPC_PROBE_TARGET="$(trex_canonical_path "$DAEMON_RPC_PROBE_TARGET" "daemon RPC probe target")" || die "unsafe daemon RPC probe target"
  DAEMON_NATIVE_BOUNDARY_TARGET="$(trex_canonical_path "$DAEMON_NATIVE_BOUNDARY_TARGET" "daemon native boundary target")" || die "unsafe daemon native boundary target"
  RELEASE_RECONCILER_TARGET="$(trex_canonical_path "$RELEASE_RECONCILER_TARGET" "release reconciler target")" || die "unsafe release reconciler target"
  RELEASE_BOOTSTRAP_TARGET="$(trex_canonical_path "$RELEASE_BOOTSTRAP_TARGET" "release infrastructure bootstrap target")" || die "unsafe release infrastructure bootstrap target"
  TREX_OVERVIEW_VALIDATOR_TARGET="$(trex_canonical_path "$TREX_OVERVIEW_VALIDATOR_TARGET" "TRex overview validator target")" || die "unsafe TRex overview validator target"
  TREX_PERSISTED_STATE_VALIDATOR_TARGET="$(trex_canonical_path "$TREX_PERSISTED_STATE_VALIDATOR_TARGET" "persisted state validator target")" || die "unsafe persisted state validator target"
  RELEASE_RECONCILER_UNIT_TARGET="$(trex_canonical_path "$RELEASE_RECONCILER_UNIT_TARGET" "release reconciler unit target")" || die "unsafe release reconciler unit target"
  RELEASE_RECONCILER_RETRY_UNIT_TARGET="$(trex_canonical_path "$RELEASE_RECONCILER_RETRY_UNIT_TARGET" "release retry unit target")" || die "unsafe release retry unit target"
  RELEASE_RECONCILER_ACK_UNIT_TARGET="$(trex_canonical_path "$RELEASE_RECONCILER_ACK_UNIT_TARGET" "release consumer acknowledgement unit target")" || die "unsafe release consumer acknowledgement unit target"
  RELEASE_RECONCILER_NGINX_DROPIN_ROOT="$(trex_canonical_path "$RELEASE_RECONCILER_NGINX_DROPIN_ROOT" "release reconciler Nginx drop-in root")" || die "unsafe release reconciler Nginx drop-in root"
  RELEASE_RECONCILER_NGINX_DROPIN_TARGET="$(trex_canonical_path "$RELEASE_RECONCILER_NGINX_DROPIN_TARGET" "release reconciler Nginx drop-in target")" || die "unsafe release reconciler Nginx drop-in target"
  RELEASE_RECONCILER_API_DROPIN_ROOT="$(trex_canonical_path "$RELEASE_RECONCILER_API_DROPIN_ROOT" "release reconciler API drop-in root")" || die "unsafe release reconciler API drop-in root"
  RELEASE_RECONCILER_API_DROPIN_TARGET="$(trex_canonical_path "$RELEASE_RECONCILER_API_DROPIN_TARGET" "release reconciler API drop-in target")" || die "unsafe release reconciler API drop-in target"
  RELEASE_RECONCILER_DAEMON_DROPIN_ROOT="$(trex_canonical_path "$RELEASE_RECONCILER_DAEMON_DROPIN_ROOT" "release reconciler daemon drop-in root")" || die "unsafe release reconciler daemon drop-in root"
  RELEASE_RECONCILER_DAEMON_DROPIN_TARGET="$(trex_canonical_path "$RELEASE_RECONCILER_DAEMON_DROPIN_TARGET" "release reconciler daemon drop-in target")" || die "unsafe release reconciler daemon drop-in target"
  LEGACY_RELEASE_BOOTSTRAP_TARGET="$(trex_canonical_path "$LEGACY_RELEASE_BOOTSTRAP_TARGET" "legacy release bootstrap target")" || die "unsafe legacy release bootstrap target"
  LEGACY_RELEASE_RECONCILER_TARGET="$(trex_canonical_path "$LEGACY_RELEASE_RECONCILER_TARGET" "legacy release reconciler target")" || die "unsafe legacy release reconciler target"
  LEGACY_RELEASE_RECONCILER_UNIT_TARGET="$(trex_canonical_path "$LEGACY_RELEASE_RECONCILER_UNIT_TARGET" "legacy release reconciler unit target")" || die "unsafe legacy release reconciler unit target"
  LEGACY_RELEASE_RECONCILER_RETRY_UNIT_TARGET="$(trex_canonical_path "$LEGACY_RELEASE_RECONCILER_RETRY_UNIT_TARGET" "legacy release retry unit target")" || die "unsafe legacy release retry unit target"
  LEGACY_RELEASE_RECONCILER_ACK_UNIT_TARGET="$(trex_canonical_path "$LEGACY_RELEASE_RECONCILER_ACK_UNIT_TARGET" "legacy release acknowledgement unit target")" || die "unsafe legacy release acknowledgement unit target"
  LEGACY_RELEASE_RECONCILER_NGINX_DROPIN_TARGET="$(trex_canonical_path "$LEGACY_RELEASE_RECONCILER_NGINX_DROPIN_TARGET" "legacy Nginx release drop-in target")" || die "unsafe legacy Nginx release drop-in target"
  LEGACY_RELEASE_RECONCILER_API_DROPIN_TARGET="$(trex_canonical_path "$LEGACY_RELEASE_RECONCILER_API_DROPIN_TARGET" "legacy API release drop-in target")" || die "unsafe legacy API release drop-in target"
  LEGACY_RELEASE_RECONCILER_DAEMON_DROPIN_TARGET="$(trex_canonical_path "$LEGACY_RELEASE_RECONCILER_DAEMON_DROPIN_TARGET" "legacy daemon release drop-in target")" || die "unsafe legacy daemon release drop-in target"
  LEGACY_RELEASE_RECONCILER_BRIDGE_ROOT="$(trex_canonical_path "$LEGACY_RELEASE_RECONCILER_BRIDGE_ROOT" "legacy reconciler bridge root")" || die "unsafe legacy reconciler bridge root"
  LEGACY_RELEASE_RECONCILER_RETRY_BRIDGE_ROOT="$(trex_canonical_path "$LEGACY_RELEASE_RECONCILER_RETRY_BRIDGE_ROOT" "legacy retry bridge root")" || die "unsafe legacy retry bridge root"
  LEGACY_RELEASE_RECONCILER_ACK_BRIDGE_ROOT="$(trex_canonical_path "$LEGACY_RELEASE_RECONCILER_ACK_BRIDGE_ROOT" "legacy acknowledgement bridge root")" || die "unsafe legacy acknowledgement bridge root"
  LEGACY_RELEASE_RECONCILER_BRIDGE_TARGET="$(trex_canonical_path "$LEGACY_RELEASE_RECONCILER_BRIDGE_TARGET" "legacy reconciler bridge target")" || die "unsafe legacy reconciler bridge target"
  LEGACY_RELEASE_RECONCILER_RETRY_BRIDGE_TARGET="$(trex_canonical_path "$LEGACY_RELEASE_RECONCILER_RETRY_BRIDGE_TARGET" "legacy retry bridge target")" || die "unsafe legacy retry bridge target"
  LEGACY_RELEASE_RECONCILER_ACK_BRIDGE_TARGET="$(trex_canonical_path "$LEGACY_RELEASE_RECONCILER_ACK_BRIDGE_TARGET" "legacy acknowledgement bridge target")" || die "unsafe legacy acknowledgement bridge target"
  RELEASE_ROLLBACK_DAEMON_PROBE_TARGET="$(trex_canonical_path "$RELEASE_ROLLBACK_DAEMON_PROBE_TARGET" "stable rollback daemon probe target")" || die "unsafe stable rollback daemon probe target"
  RELEASE_ROLLBACK_NATIVE_BOUNDARY_TARGET="$(trex_canonical_path "$RELEASE_ROLLBACK_NATIVE_BOUNDARY_TARGET" "stable rollback native boundary target")" || die "unsafe stable rollback native boundary target"
  RELEASE_INFRASTRUCTURE_COMMON_MANIFEST="$(trex_canonical_path "$RELEASE_INFRASTRUCTURE_COMMON_MANIFEST" "common release infrastructure manifest")" || die "unsafe common release infrastructure manifest"
  RELEASE_INFRASTRUCTURE_MANAGED_MANIFEST="$(trex_canonical_path "$RELEASE_INFRASTRUCTURE_MANAGED_MANIFEST" "managed release infrastructure manifest")" || die "unsafe managed release infrastructure manifest"
  LEGACY_RELEASE_INFRASTRUCTURE_COMMON_MANIFEST="$(trex_canonical_path "$LEGACY_RELEASE_INFRASTRUCTURE_COMMON_MANIFEST" "legacy common release infrastructure manifest")" || die "unsafe legacy common release infrastructure manifest"
  LEGACY_RELEASE_INFRASTRUCTURE_MANAGED_MANIFEST="$(trex_canonical_path "$LEGACY_RELEASE_INFRASTRUCTURE_MANAGED_MANIFEST" "legacy managed release infrastructure manifest")" || die "unsafe legacy managed release infrastructure manifest"
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
  trex_path_is_within "$RECOVERY_V2_ROOT" "$DAEMON_LIBEXEC_ROOT" || die "recovery ABI v2 root escaped its libexec root"
  trex_assert_managed_path "$NFTABLES_SYSTEMD_DROPIN_ROOT" "nftables systemd drop-in root" "/etc/systemd/system" || die "unsafe nftables systemd drop-in root"
  trex_path_is_within "$DAEMON_SUPERVISOR_TARGET" "$DAEMON_LIBEXEC_ROOT" || die "daemon supervisor target escaped its libexec root"
  trex_path_is_within "$DAEMON_RPC_PROBE_TARGET" "$DAEMON_LIBEXEC_ROOT" || die "daemon RPC probe target escaped its libexec root"
  trex_path_is_within "$DAEMON_NATIVE_BOUNDARY_TARGET" "$DAEMON_LIBEXEC_ROOT" || die "daemon native boundary target escaped its libexec root"
  trex_path_is_within "$RELEASE_RECONCILER_TARGET" "$DAEMON_LIBEXEC_ROOT" || \
    die "release reconciler target escaped its libexec root"
  trex_path_is_within "$RELEASE_BOOTSTRAP_TARGET" "$DAEMON_LIBEXEC_ROOT" || \
    die "release infrastructure bootstrap target escaped its libexec root"
  trex_path_is_within "$RELEASE_RECONCILER_TARGET" "$RECOVERY_V2_ROOT" || \
    die "release reconciler target escaped its recovery ABI root"
  trex_path_is_within "$RELEASE_BOOTSTRAP_TARGET" "$RECOVERY_V2_ROOT" || \
    die "release infrastructure bootstrap target escaped its recovery ABI root"
  trex_path_is_within "$LEGACY_RELEASE_RECONCILER_TARGET" "$DAEMON_LIBEXEC_ROOT" || \
    die "legacy release reconciler target escaped its libexec root"
  trex_path_is_within "$LEGACY_RELEASE_BOOTSTRAP_TARGET" "$DAEMON_LIBEXEC_ROOT" || \
    die "legacy release bootstrap target escaped its libexec root"
  trex_path_is_within "$TREX_OVERVIEW_VALIDATOR_TARGET" "$DAEMON_LIBEXEC_ROOT" || \
    die "TRex overview validator target escaped its libexec root"
  trex_path_is_within "$TREX_PERSISTED_STATE_VALIDATOR_TARGET" "$DAEMON_LIBEXEC_ROOT" || \
    die "persisted state validator target escaped its libexec root"
  trex_path_is_within "$RELEASE_ROLLBACK_DAEMON_PROBE_TARGET" "$DAEMON_LIBEXEC_ROOT" || \
    die "stable rollback daemon probe target escaped its libexec root"
  trex_path_is_within "$RELEASE_ROLLBACK_NATIVE_BOUNDARY_TARGET" "$DAEMON_LIBEXEC_ROOT" || \
    die "stable rollback native boundary target escaped its libexec root"
  trex_path_is_within \
    "$RELEASE_RECONCILER_NGINX_DROPIN_TARGET" \
    "$RELEASE_RECONCILER_NGINX_DROPIN_ROOT" || \
    die "release reconciler Nginx drop-in escaped its root"
  trex_assert_managed_path \
    "$RELEASE_RECONCILER_NGINX_DROPIN_ROOT" \
    "release reconciler Nginx drop-in root" \
    "/etc/systemd/system" || die "unsafe release reconciler Nginx drop-in root"
  trex_path_is_within \
    "$RELEASE_RECONCILER_API_DROPIN_TARGET" \
    "$RELEASE_RECONCILER_API_DROPIN_ROOT" || \
    die "release reconciler API drop-in escaped its root"
  trex_assert_managed_path \
    "$RELEASE_RECONCILER_API_DROPIN_ROOT" \
    "release reconciler API drop-in root" \
    "/etc/systemd/system" || die "unsafe release reconciler API drop-in root"
  trex_path_is_within \
    "$RELEASE_RECONCILER_DAEMON_DROPIN_TARGET" \
    "$RELEASE_RECONCILER_DAEMON_DROPIN_ROOT" || \
    die "release reconciler daemon drop-in escaped its root"
  trex_assert_managed_path \
    "$RELEASE_RECONCILER_DAEMON_DROPIN_ROOT" \
    "release reconciler daemon drop-in root" \
    "/etc/systemd/system" || die "unsafe release reconciler daemon drop-in root"
  trex_path_is_within "$LEGACY_RELEASE_RECONCILER_NGINX_DROPIN_TARGET" "$RELEASE_RECONCILER_NGINX_DROPIN_ROOT" || \
    die "legacy Nginx release drop-in escaped its root"
  trex_path_is_within "$LEGACY_RELEASE_RECONCILER_API_DROPIN_TARGET" "$RELEASE_RECONCILER_API_DROPIN_ROOT" || \
    die "legacy API release drop-in escaped its root"
  trex_path_is_within "$LEGACY_RELEASE_RECONCILER_DAEMON_DROPIN_TARGET" "$RELEASE_RECONCILER_DAEMON_DROPIN_ROOT" || \
    die "legacy daemon release drop-in escaped its root"
  local bridge_root bridge_target
  while IFS='|' read -r bridge_root bridge_target; do
    trex_assert_managed_path "$bridge_root" "legacy recovery bridge root" "/etc/systemd/system" || \
      die "unsafe legacy recovery bridge root"
    trex_path_is_within "$bridge_target" "$bridge_root" || \
      die "legacy recovery bridge target escaped its root"
  done <<EOF
$LEGACY_RELEASE_RECONCILER_BRIDGE_ROOT|$LEGACY_RELEASE_RECONCILER_BRIDGE_TARGET
$LEGACY_RELEASE_RECONCILER_RETRY_BRIDGE_ROOT|$LEGACY_RELEASE_RECONCILER_RETRY_BRIDGE_TARGET
$LEGACY_RELEASE_RECONCILER_ACK_BRIDGE_ROOT|$LEGACY_RELEASE_RECONCILER_ACK_BRIDGE_TARGET
EOF
  trex_path_is_within "$NFTABLES_SYSTEMD_DROPIN_TARGET" "$NFTABLES_SYSTEMD_DROPIN_ROOT" || die "nftables systemd drop-in escaped its root"
  trex_path_is_within "$TREX_DAEMON_BIN" "$TREX_DAEMON_SCRIPTS_DIR" || \
    die "daemon executable escaped its scripts directory"

  trex_assert_disjoint_paths "$INSTALL_ROOT" "install root" "$WEB_ROOT" "web root" || die "overlapping upgrade paths"
  trex_assert_disjoint_paths "$INSTALL_ROOT" "install root" "$STATIC_BACKUP_ROOT" "static backup root" || die "overlapping upgrade paths"
  trex_assert_disjoint_paths "$INSTALL_ROOT" "install root" "$SOURCE_BACKUP_ROOT" "source backup root" || die "overlapping upgrade paths"
  trex_assert_disjoint_paths "$WEB_ROOT" "web root" "$STATIC_BACKUP_ROOT" "static backup root" || die "overlapping upgrade paths"
  trex_assert_disjoint_paths "$WEB_ROOT" "web root" "$SOURCE_BACKUP_ROOT" "source backup root" || die "overlapping upgrade paths"
  trex_assert_disjoint_paths "$STATIC_BACKUP_ROOT" "static backup root" "$SOURCE_BACKUP_ROOT" "source backup root" || die "overlapping upgrade paths"
  if [[ -n "$ARCHIVE" || "$ROLLBACK_PREVIOUS" -eq 1 ]]; then
    RELEASE_STATE_ROOT="$(trex_canonical_path "$RELEASE_STATE_ROOT" "release transaction state root")" || \
      die "unsafe release transaction state root"
    trex_assert_not_broad_path "$RELEASE_STATE_ROOT" "release transaction state root" || \
      die "unsafe release transaction state root"
    trex_assert_managed_path \
      "$RELEASE_STATE_ROOT" \
      "release transaction state root" \
      "/var/lib/trex-webui-deploy" || die "unsafe release transaction state root"
    trex_assert_disjoint_paths \
      "$INSTALL_ROOT" "install root" \
      "$RELEASE_STATE_ROOT" "release transaction state root" || die "overlapping release paths"
    trex_assert_disjoint_paths \
      "$WEB_ROOT" "web root" \
      "$RELEASE_STATE_ROOT" "release transaction state root" || die "overlapping release paths"
    trex_path_is_within \
      "$RELEASE_INFRASTRUCTURE_COMMON_MANIFEST" \
      "$RELEASE_STATE_ROOT" || die "common release infrastructure manifest escaped the state root"
    trex_path_is_within \
      "$RELEASE_INFRASTRUCTURE_MANAGED_MANIFEST" \
      "$RELEASE_STATE_ROOT" || die "managed release infrastructure manifest escaped the state root"
    trex_path_is_within \
      "$LEGACY_RELEASE_INFRASTRUCTURE_COMMON_MANIFEST" \
      "$RELEASE_STATE_ROOT" || die "legacy common release infrastructure manifest escaped the state root"
    trex_path_is_within \
      "$LEGACY_RELEASE_INFRASTRUCTURE_MANAGED_MANIFEST" \
      "$RELEASE_STATE_ROOT" || die "legacy managed release infrastructure manifest escaped the state root"
    if [[ "$INSTALL_ROOT" == "/opt/trex-webui" ]]; then
      [[ "$RELEASE_STATE_ROOT" == "/var/lib/trex-webui-deploy" ]] || \
        die "production archive upgrades require root-only state at /var/lib/trex-webui-deploy"
      [[ "$WEB_ROOT" == "/var/www/trex-webui/dist" && \
        "$STATIC_BACKUP_ROOT" == "/var/www/trex-webui/backups" && \
        "$SOURCE_BACKUP_ROOT" == "/var/backups/trex-webui/source" && \
        "$NGINX_CONF_TARGET" == "/etc/nginx/conf.d/trex-webui.conf" && \
        "$DAEMON_SYSTEMD_SERVICE_TARGET" == "/etc/systemd/system/trex-daemon-server.service" && \
        "$DAEMON_LIBEXEC_ROOT" == "/usr/libexec/trex-webui" && \
        "$DAEMON_SUPERVISOR_TARGET" == "/usr/libexec/trex-webui/trex_daemon_supervisor.py" && \
        "$DAEMON_RPC_PROBE_TARGET" == "/usr/libexec/trex-webui/daemon_rpc_probe.py" && \
        "$DAEMON_NATIVE_BOUNDARY_TARGET" == "/usr/libexec/trex-webui/trex_native_boundary.sh" && \
        "$SYSTEMD_SERVICE_TARGET" == "/etc/systemd/system/trex-webui-api.service" && \
        "$NFTABLES_SYSTEMD_DROPIN_ROOT" == "/etc/systemd/system/nftables.service.d" && \
        "$NFTABLES_SYSTEMD_DROPIN_TARGET" == "/etc/systemd/system/nftables.service.d/trex-webui-native-boundary.conf" && \
        "$SERVICE_ENV_FILE" == "/etc/trex-webui/trex-webui.env" && \
        "$RECOVERY_V2_ROOT" == "/usr/libexec/trex-webui/recovery-v2" && \
        "$RELEASE_RECONCILER_TARGET" == "/usr/libexec/trex-webui/recovery-v2/release_transaction.py" && \
        "$RELEASE_BOOTSTRAP_TARGET" == "/usr/libexec/trex-webui/recovery-v2/bootstrap_release_infrastructure.py" && \
        "$TREX_OVERVIEW_VALIDATOR_TARGET" == "/usr/libexec/trex-webui/trex_overview_contract.py" && \
        "$TREX_PERSISTED_STATE_VALIDATOR_TARGET" == "/usr/libexec/trex-webui/trex_persisted_state_contract.py" && \
        "$RELEASE_ROLLBACK_DAEMON_PROBE_TARGET" == "/usr/libexec/trex-webui/release_daemon_rpc_probe.py" && \
        "$RELEASE_ROLLBACK_NATIVE_BOUNDARY_TARGET" == "/usr/libexec/trex-webui/release_native_boundary.sh" && \
        "$RELEASE_RECONCILER_UNIT_TARGET" == "/etc/systemd/system/trex-webui-release-reconcile-v2.service" && \
        "$RELEASE_RECONCILER_RETRY_UNIT_TARGET" == "/etc/systemd/system/trex-webui-release-retry-v2.service" && \
        "$RELEASE_RECONCILER_ACK_UNIT_TARGET" == "/etc/systemd/system/trex-webui-release-consumer-ack-v2.service" && \
        "$RELEASE_RECONCILER_NGINX_DROPIN_ROOT" == "/etc/systemd/system/nginx.service.d" && \
        "$RELEASE_RECONCILER_NGINX_DROPIN_TARGET" == "/etc/systemd/system/nginx.service.d/trex-webui-release-reconcile-v2.conf" && \
        "$RELEASE_RECONCILER_API_DROPIN_ROOT" == "/etc/systemd/system/trex-webui-api.service.d" && \
        "$RELEASE_RECONCILER_API_DROPIN_TARGET" == "/etc/systemd/system/trex-webui-api.service.d/trex-webui-release-reconcile-v2.conf" && \
        "$RELEASE_RECONCILER_DAEMON_DROPIN_ROOT" == "/etc/systemd/system/trex-daemon-server.service.d" && \
        "$RELEASE_RECONCILER_DAEMON_DROPIN_TARGET" == "/etc/systemd/system/trex-daemon-server.service.d/trex-webui-release-reconcile-v2.conf" && \
        "$LEGACY_RELEASE_BOOTSTRAP_TARGET" == "/usr/libexec/trex-webui/bootstrap_release_infrastructure.py" && \
        "$LEGACY_RELEASE_RECONCILER_TARGET" == "/usr/libexec/trex-webui/release_transaction.py" && \
        "$LEGACY_RELEASE_RECONCILER_UNIT_TARGET" == "/etc/systemd/system/trex-webui-release-reconcile.service" && \
        "$LEGACY_RELEASE_RECONCILER_RETRY_UNIT_TARGET" == "/etc/systemd/system/trex-webui-release-retry.service" && \
        "$LEGACY_RELEASE_RECONCILER_ACK_UNIT_TARGET" == "/etc/systemd/system/trex-webui-release-consumer-ack.service" && \
        "$LEGACY_RELEASE_RECONCILER_NGINX_DROPIN_TARGET" == "/etc/systemd/system/nginx.service.d/trex-webui-release-reconcile.conf" && \
        "$LEGACY_RELEASE_RECONCILER_API_DROPIN_TARGET" == "/etc/systemd/system/trex-webui-api.service.d/trex-webui-release-reconcile.conf" && \
        "$LEGACY_RELEASE_RECONCILER_DAEMON_DROPIN_TARGET" == "/etc/systemd/system/trex-daemon-server.service.d/trex-webui-release-reconcile.conf" && \
        "$LEGACY_RELEASE_RECONCILER_BRIDGE_ROOT" == "/etc/systemd/system/trex-webui-release-reconcile.service.d" && \
        "$LEGACY_RELEASE_RECONCILER_BRIDGE_TARGET" == "/etc/systemd/system/trex-webui-release-reconcile.service.d/trex-webui-recovery-v2-bridge.conf" && \
        "$LEGACY_RELEASE_RECONCILER_RETRY_BRIDGE_ROOT" == "/etc/systemd/system/trex-webui-release-retry.service.d" && \
        "$LEGACY_RELEASE_RECONCILER_RETRY_BRIDGE_TARGET" == "/etc/systemd/system/trex-webui-release-retry.service.d/trex-webui-recovery-v2-bridge.conf" && \
        "$LEGACY_RELEASE_RECONCILER_ACK_BRIDGE_ROOT" == "/etc/systemd/system/trex-webui-release-consumer-ack.service.d" && \
        "$LEGACY_RELEASE_RECONCILER_ACK_BRIDGE_TARGET" == "/etc/systemd/system/trex-webui-release-consumer-ack.service.d/trex-webui-recovery-v2-bridge.conf" && \
        "$RELEASE_INFRASTRUCTURE_COMMON_MANIFEST" == "/var/lib/trex-webui-deploy/infrastructure-v2-common.json" && \
        "$RELEASE_INFRASTRUCTURE_MANAGED_MANIFEST" == "/var/lib/trex-webui-deploy/infrastructure-v2-managed-local.json" && \
        "$LEGACY_RELEASE_INFRASTRUCTURE_COMMON_MANIFEST" == "/var/lib/trex-webui-deploy/infrastructure-common.json" && \
        "$LEGACY_RELEASE_INFRASTRUCTURE_MANAGED_MANIFEST" == "/var/lib/trex-webui-deploy/infrastructure-managed-local.json" ]] || \
        die "production archive upgrades require the exact canonical host-artifact transaction targets"
    fi
  fi
  if [[ "$ROLLBACK_PREVIOUS" -eq 1 ]]; then
    [[ "$INSTALL_ROOT" == "/opt/trex-webui" && \
      "$RELEASE_STATE_ROOT" == "/var/lib/trex-webui-deploy" ]] || \
      die "N-1 rollback is supported only for the production content-addressed layout"
  fi
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
  if [[ -z "$ARCHIVE" && "$ROLLBACK_PREVIOUS" -eq 0 || "$DRY_RUN" -eq 1 ]]; then
    return
  fi
  if [[ "$(id -u)" -ne 0 ]]; then
    die "root is required for archive upgrades and N-1 rollback into $INSTALL_ROOT; rerun with sudo or use --dry-run"
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
  local installer_root="$INSTALL_ROOT"
  if [[ -n "$ARCHIVE" ]]; then
    installer_root="$RELEASE_PROJECT_ROOT"
  fi
  local args=(
    "$installer_root/deploy/install.sh"
    "--project-root"
    "$installer_root"
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
  if [[ -n "$ARCHIVE" ]]; then
    args+=("--versioned-release")
  if [[ "$RUN_ENABLE" -eq 1 ]]; then
      args+=("--defer-consumer-enable")
    fi
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
  if [[ -n "$ARCHIVE" && "$MANAGE_LOCAL_DAEMON" -eq 1 && "$RUN_RESTART" -eq 1 ]]; then
    args+=("--expected-daemon-restart" "$ARCHIVE_DAEMON_MUTATION_EXPECTED")
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
  local installer_root="$INSTALL_ROOT"
  if [[ -n "$ARCHIVE" ]]; then
    installer_root="$RELEASE_PROJECT_ROOT"
  fi
  if [[ "$DRY_RUN" -eq 0 ]]; then
    [[ -x "$installer_root/deploy/install.sh" ]] || \
      die "missing executable install script: $installer_root/deploy/install.sh"
  fi
  local args=()
  while IFS= read -r -d '' item; do
    args+=("$item")
  done < <(install_args)
  log "Running deployment installer"
  run "${args[@]}"
}

preflight_archive_daemon_runtime() {
  ARCHIVE_DAEMON_MUTATION_EXPECTED=0
  ARCHIVE_DAEMON_WAS_ACTIVE_FOR_PREFLIGHT=0
  [[ -n "$ARCHIVE" && "$MANAGE_LOCAL_DAEMON" -eq 1 && "$RUN_RESTART" -eq 1 ]] || return 0
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '+ before archive source mutation, refuse unmanaged daemon unit authority and require Idle(1)/unreserved when the new unit needs restart\n'
    return 0
  fi

  local load_state fragment_path source_unit source_probe source_supervisor source_boundary source_dropin
  local rendered_unit rendered_dropin
  local rendered_project_root="$INSTALL_ROOT/current"
  load_state="$(systemctl show trex-daemon-server.service --property=LoadState --value)" || \
    die "unable to inspect daemon authority before archive source mutation"
  fragment_path="$(systemctl show trex-daemon-server.service --property=FragmentPath --value)" || \
    die "unable to inspect daemon fragment before archive source mutation"
  if [[ "$load_state" == "loaded" && "$fragment_path" != "$DAEMON_SYSTEMD_SERVICE_TARGET" ]]; then
    die "refusing archive upgrade over unmanaged trex-daemon-server.service from ${fragment_path:-unknown}"
  fi
  if [[ "$load_state" == "loaded" ]]; then
    assert_loaded_unit_disk_authority \
      trex-daemon-server.service "$DAEMON_SYSTEMD_SERVICE_TARGET" \
      "trex-daemon-server.service"
  fi
  assert_loaded_unit_not_stale nftables.service "nftables.service"
  if [[ -e "$NFTABLES_SYSTEMD_DROPIN_TARGET" || -L "$NFTABLES_SYSTEMD_DROPIN_TARGET" ]]; then
    local nftables_dropins
    [[ -f "$NFTABLES_SYSTEMD_DROPIN_TARGET" && ! -L "$NFTABLES_SYSTEMD_DROPIN_TARGET" ]] || \
      die "existing nftables integration drop-in is unsafe"
    nftables_dropins="$(systemctl show nftables.service --property=DropInPaths --value)" || \
      die "unable to inspect nftables.service drop-in authority"
    [[ " $nftables_dropins " == *" $NFTABLES_SYSTEMD_DROPIN_TARGET "* ]] || \
      die "managed nftables drop-in exists on disk but is not loaded by systemd"
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
  if ! systemctl is-active --quiet trex-daemon-server.service; then
    ARCHIVE_DAEMON_MUTATION_EXPECTED=1
    # An inactive daemon needs candidate host publication/start recovery, but
    # no disruptive runtime override.  Never let unused broad consent cross
    # the prepare boundary into the candidate installer.
    ALLOW_DAEMON_RUNTIME_RESTART=0
    return 0
  fi
  ARCHIVE_DAEMON_WAS_ACTIVE_FOR_PREFLIGHT=1

  rendered_unit="$STAGING_ROOT/trex-daemon-server.rendered.service"
  rendered_dropin="$STAGING_ROOT/nftables-trex-webui.rendered.conf"
  local escaped_install_root escaped_scripts escaped_bin escaped_supervisor escaped_probe escaped_boundary
  local escaped_nftables_config
  local bin_placeholder='@@TREX_DAEMON_BIN@@'
  local supervisor_placeholder='@@TREX_DAEMON_SUPERVISOR@@'
  local probe_placeholder='@@TREX_DAEMON_RPC_PROBE@@'
  local boundary_placeholder='@@TREX_DAEMON_NATIVE_BOUNDARY@@'
  escaped_install_root="$(printf '%s' "$rendered_project_root" | sed 's/[\/&|]/\\&/g')"
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
  if [[ "$restart_required" -eq 0 ]]; then
    # The loaded daemon authority already matches the candidate.  The
    # operator's optional override was unnecessary and must not be forwarded
    # to any journaled/candidate operation.
    ALLOW_DAEMON_RUNTIME_RESTART=0
    return 0
  fi
  ARCHIVE_DAEMON_MUTATION_EXPECTED=1
  # Prefer the ordinary strict boundary even when the operator supplied an
  # override.  Broad consent authorizes exactly one pre-prepare convergence
  # only when the live daemon is actually unsafe.
  if /usr/bin/python3 "$source_probe" \
    --host 127.0.0.1 \
    --port 8090 \
    --timeout 5 \
    safe-restart; then
    ALLOW_DAEMON_RUNTIME_RESTART=0
    return 0
  fi
  if [[ "$ALLOW_DAEMON_RUNTIME_RESTART" -eq 1 ]]; then
    printf 'warning: archive maintenance override permits daemon restart without preserving active TRex/reservation state\n' >&2
    # Consume disruptive consent before any journal/host mutation. Once the
    # existing generation cold-starts cleanly, every later boundary is strict
    # and neither the candidate installer nor rollback inherits broad consent.
    systemctl restart trex-daemon-server.service || \
      die "maintenance override could not cold-restart the existing daemon before release prepare"
    /usr/bin/python3 "$source_probe" \
      --host 127.0.0.1 --port 8090 --timeout 20 ready || \
      die "maintenance override daemon failed readiness before release prepare"
    "$source_boundary" verify || \
      die "maintenance override daemon changed the native boundary before release prepare"
    /usr/bin/python3 "$source_probe" \
      --host 127.0.0.1 --port 8090 --timeout 5 safe-restart || \
      die "maintenance override did not converge the daemon to safe restart state"
    ARCHIVE_DAEMON_OVERRIDE_CONSUMED=1
    ALLOW_DAEMON_RUNTIME_RESTART=0
  else
    die "archive upgrade would restart an unsafe/unknown daemon; stop traffic/cancel reservation first, or explicitly use --allow-daemon-runtime-restart"
  fi
}

converge_archive_daemon_runtime_after_recovery_barrier() {
  [[ -n "$ARCHIVE" && "$MANAGE_LOCAL_DAEMON" -eq 1 && \
    "$RUN_RESTART" -eq 1 && "$ARCHIVE_DAEMON_MUTATION_EXPECTED" -eq 1 && \
    "$ARCHIVE_DAEMON_WAS_ACTIVE_FOR_PREFLIGHT" -eq 1 ]] || return 0
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '+ after fixed recovery is durable and consumer rollback is armed, cold-restart and prove the existing daemon authority\n'
    return 0
  fi
  # This is deliberately the first daemon mutation.  The candidate journal
  # has already captured the exact active state and native boundary, while the
  # independent retry unit is waiting on the outer deployment lock.
  systemctl restart trex-daemon-server.service || \
    die "existing daemon host integration cannot cold-start after recovery arm"
  /usr/bin/python3 "$DAEMON_RPC_PROBE_TARGET" \
    --host 127.0.0.1 --port 8090 --timeout 20 ready || \
    die "existing daemon host integration failed readiness after cold restart"
  "$DAEMON_NATIVE_BOUNDARY_TARGET" verify || \
    die "existing daemon native boundary failed after cold restart"
}

mark_archive_daemon_mutation_started() {
  [[ -n "$ARCHIVE" && "$MANAGE_LOCAL_DAEMON" -eq 1 && \
    "$RUN_RESTART" -eq 1 && "$ARCHIVE_DAEMON_MUTATION_EXPECTED" -eq 1 ]] || return 0
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '+ fsync managed daemon mutation intent immediately before the first possible daemon/host mutation\n'
    return 0
  fi
  release_engine mark-daemon-mutation-started \
    --transaction-id "$RELEASE_TRANSACTION_ID" >/dev/null || \
    die "unable to durably arm managed daemon mutation recovery"
}

post_fence_archive_runtime_preflight() {
  [[ -n "$ARCHIVE" && "$MANAGE_LOCAL_DAEMON" -eq 1 && \
    "$RUN_RESTART" -eq 1 ]] || return 0
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '+ after Nginx and API are fenced, verify persisted runtime, daemon safe-restart, and the native boundary through fixed validators\n'
    return 0
  fi
  /usr/bin/python3 "$TREX_PERSISTED_STATE_VALIDATOR_TARGET" \
    "$SERVICE_RUNTIME_STATE_PATH" || \
    die "canonical runtime state is not quiescent after fencing API control"
  if [[ "$ARCHIVE_DAEMON_MUTATION_EXPECTED" -eq 1 && \
    "$ARCHIVE_DAEMON_WAS_ACTIVE_FOR_PREFLIGHT" -eq 1 ]]; then
    /usr/bin/python3 "$RELEASE_ROLLBACK_DAEMON_PROBE_TARGET" \
      --host 127.0.0.1 --port 8090 --timeout 5 safe-restart || \
      die "daemon runtime changed before the armed archive mutation boundary"
  fi
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

require_archive_transaction_contract() {
  [[ -n "$ARCHIVE" ]] || return 0
  if [[ "$DRY_RUN" -eq 1 || "$INSTALL_ROOT" != "/opt/trex-webui" ]]; then
    return 0
  fi
  [[ "$RUN_RESTART" -eq 1 ]] || \
    die "archive releases require restart/readiness before an atomic commit"
  [[ "$INSTALL_PYTHON_DEPS" -eq 1 ]] || \
    die "archive releases require a candidate-owned Python runtime; remove --skip-python-deps"
  # Archive activation is not complete until the full deployment verifier has
  # observed the candidate API and its static files through the live service.
  RUN_VERIFY=1
}

require_production_archive_host_authority() {
  [[ -n "$ARCHIVE" && "$DRY_RUN" -eq 0 ]] || return 0
  [[ "$INSTALL_ROOT" == "/opt/trex-webui" && \
    "$RELEASE_STATE_ROOT" == "/var/lib/trex-webui-deploy" ]] || \
    die "non-dry-run archive upgrades require the production install/state authority pair"
}

assert_loaded_dropins_are_known() {
  local label="$1"
  local observed_list="$2"
  shift 2
  local observed expected matched
  for observed in $observed_list; do
    matched=0
    for expected in "$@"; do
      if [[ -n "$expected" && "$observed" == "$expected" ]]; then
        matched=1
        break
      fi
    done
    [[ "$matched" -eq 1 && -f "$observed" && ! -L "$observed" && \
      "$(stat -c '%u:%g %a %h' "$observed")" == "0:0 644 1" ]] || \
      die "$label has unmanaged or unsafe loaded drop-in authority: $observed"
  done
}

assert_dropin_directory_has_only_known_conf() {
  local root="$1"
  shift
  [[ -e "$root" || -L "$root" ]] || return 0
  [[ -d "$root" && ! -L "$root" ]] || die "unsafe systemd drop-in directory: $root"
  local observed expected matched
  while IFS= read -r -d '' observed; do
    matched=0
    for expected in "$@"; do
      if [[ -n "$expected" && "$observed" == "$expected" ]]; then
        matched=1
        break
      fi
    done
    [[ "$matched" -eq 1 && -f "$observed" && ! -L "$observed" && \
      "$(stat -c '%u:%g %a %h' "$observed")" == "0:0 644 1" ]] || \
      die "systemd drop-in directory contains unmanaged authority: $observed"
  done < <(find -P "$root" -mindepth 1 -maxdepth 1 -name '*.conf' -print0)
}

assert_pending_recovery_v2_generation_matches_archive() {
  [[ -n "$ARCHIVE_SOURCE_ROOT" ]] || \
    die "systemd has pending disk authority outside an archive recovery migration"
  local source target found=0
  while IFS='|' read -r source target; do
    if [[ -e "$target" || -L "$target" ]]; then
      found=1
      if [[ ! -f "$target" || -L "$target" || \
        "$(stat -c '%u:%g %a %h' "$target")" != "0:0 644 1" || \
        ! -f "$source" || -L "$source" ]] || ! cmp -s "$source" "$target"; then
        die "pending recovery ABI v2 disk artifact differs from this verified archive: $target"
      fi
    fi
  done <<EOF
$ARCHIVE_SOURCE_ROOT/deploy/systemd/trex-webui-release-reconcile-v2.service|$RELEASE_RECONCILER_UNIT_TARGET
$ARCHIVE_SOURCE_ROOT/deploy/systemd/trex-webui-release-retry-v2.service|$RELEASE_RECONCILER_RETRY_UNIT_TARGET
$ARCHIVE_SOURCE_ROOT/deploy/systemd/trex-webui-release-consumer-ack-v2.service|$RELEASE_RECONCILER_ACK_UNIT_TARGET
$ARCHIVE_SOURCE_ROOT/deploy/systemd/trex-webui-release-reconcile-v1-bridge-v2.conf|$LEGACY_RELEASE_RECONCILER_BRIDGE_TARGET
$ARCHIVE_SOURCE_ROOT/deploy/systemd/trex-webui-release-retry-v1-bridge-v2.conf|$LEGACY_RELEASE_RECONCILER_RETRY_BRIDGE_TARGET
$ARCHIVE_SOURCE_ROOT/deploy/systemd/trex-webui-release-consumer-ack-v1-bridge-v2.conf|$LEGACY_RELEASE_RECONCILER_ACK_BRIDGE_TARGET
$ARCHIVE_SOURCE_ROOT/deploy/systemd/trex-webui-release-reconcile-v2.conf|$RELEASE_RECONCILER_API_DROPIN_TARGET
$ARCHIVE_SOURCE_ROOT/deploy/systemd/trex-webui-release-reconcile-v2.conf|$RELEASE_RECONCILER_NGINX_DROPIN_TARGET
EOF
  if [[ "$MANAGE_LOCAL_DAEMON" -eq 1 && \
    ( -e "$RELEASE_RECONCILER_DAEMON_DROPIN_TARGET" || \
      -L "$RELEASE_RECONCILER_DAEMON_DROPIN_TARGET" ) ]]; then
    found=1
    if [[ ! -f "$RELEASE_RECONCILER_DAEMON_DROPIN_TARGET" || \
      -L "$RELEASE_RECONCILER_DAEMON_DROPIN_TARGET" || \
      "$(stat -c '%u:%g %a %h' "$RELEASE_RECONCILER_DAEMON_DROPIN_TARGET")" != "0:0 644 1" ]] || \
      ! cmp -s "$ARCHIVE_SOURCE_ROOT/deploy/systemd/trex-webui-release-reconcile-v2.conf" \
        "$RELEASE_RECONCILER_DAEMON_DROPIN_TARGET"; then
      die "pending managed daemon recovery ABI v2 drop-in differs from this verified archive"
    fi
  fi
  [[ "$found" -eq 1 ]] || \
    die "systemd reports pending disk authority without a recovery ABI v2 artifact"
}

preflight_release_systemd_shadow_authority() {
  [[ "$DRY_RUN" -eq 0 && "$INSTALL_ROOT" == "/opt/trex-webui" && \
    ( -n "$ARCHIVE" || "$ROLLBACK_PREVIOUS" -eq 1 ) ]] || return 0
  assert_dropin_directory_has_only_known_conf \
    "$RELEASE_RECONCILER_API_DROPIN_ROOT" \
    "$LEGACY_RELEASE_RECONCILER_API_DROPIN_TARGET" \
    "$RELEASE_RECONCILER_API_DROPIN_TARGET"
  assert_dropin_directory_has_only_known_conf \
    "$RELEASE_RECONCILER_NGINX_DROPIN_ROOT" \
    "$LEGACY_RELEASE_RECONCILER_NGINX_DROPIN_TARGET" \
    "$RELEASE_RECONCILER_NGINX_DROPIN_TARGET"
  assert_dropin_directory_has_only_known_conf \
    "$LEGACY_RELEASE_RECONCILER_BRIDGE_ROOT" \
    "$LEGACY_RELEASE_RECONCILER_BRIDGE_TARGET"
  assert_dropin_directory_has_only_known_conf \
    "$LEGACY_RELEASE_RECONCILER_RETRY_BRIDGE_ROOT" \
    "$LEGACY_RELEASE_RECONCILER_RETRY_BRIDGE_TARGET"
  assert_dropin_directory_has_only_known_conf \
    "$LEGACY_RELEASE_RECONCILER_ACK_BRIDGE_ROOT" \
    "$LEGACY_RELEASE_RECONCILER_ACK_BRIDGE_TARGET"
  if [[ "$MANAGE_LOCAL_DAEMON" -eq 1 ]]; then
    assert_dropin_directory_has_only_known_conf \
      "$RELEASE_RECONCILER_DAEMON_DROPIN_ROOT" \
      "$LEGACY_RELEASE_RECONCILER_DAEMON_DROPIN_TARGET" \
      "$RELEASE_RECONCILER_DAEMON_DROPIN_TARGET"
  fi

  local unit expected_fragment allowed_dropin load_state fragment need_reload dropins
  local pending_reload=0
  while IFS='|' read -r unit expected_fragment allowed_dropin; do
    load_state="$(systemctl show "$unit" --property=LoadState --value)" || \
      die "unable to inspect fixed release unit $unit before host mutation"
    if [[ "$load_state" == "not-found" ]]; then
      continue
    fi
    [[ "$load_state" == "loaded" ]] || \
      die "fixed release unit $unit has unexpected LoadState $load_state"
    fragment="$(systemctl show "$unit" --property=FragmentPath --value)" || \
      die "unable to inspect fixed release unit $unit FragmentPath"
    need_reload="$(systemctl show "$unit" --property=NeedDaemonReload --value)" || \
      die "unable to inspect fixed release unit $unit disk authority"
    dropins="$(systemctl show "$unit" --property=DropInPaths --value)" || \
      die "unable to inspect fixed release unit $unit drop-in authority"
    [[ "$fragment" == "$expected_fragment" ]] || \
      die "fixed release unit $unit is loaded from non-canonical authority"
    assert_loaded_dropins_are_known "$unit" "$dropins" "$allowed_dropin"
    [[ "$need_reload" == "no" ]] || pending_reload=1
  done <<EOF
trex-webui-release-reconcile.service|$LEGACY_RELEASE_RECONCILER_UNIT_TARGET|$LEGACY_RELEASE_RECONCILER_BRIDGE_TARGET
trex-webui-release-retry.service|$LEGACY_RELEASE_RECONCILER_RETRY_UNIT_TARGET|$LEGACY_RELEASE_RECONCILER_RETRY_BRIDGE_TARGET
trex-webui-release-consumer-ack.service|$LEGACY_RELEASE_RECONCILER_ACK_UNIT_TARGET|$LEGACY_RELEASE_RECONCILER_ACK_BRIDGE_TARGET
trex-webui-release-reconcile-v2.service|$RELEASE_RECONCILER_UNIT_TARGET|
trex-webui-release-retry-v2.service|$RELEASE_RECONCILER_RETRY_UNIT_TARGET|
trex-webui-release-consumer-ack-v2.service|$RELEASE_RECONCILER_ACK_UNIT_TARGET|
EOF

  local legacy_dropin v2_dropin
  for unit in trex-webui-api.service trex-daemon-server.service nginx.service; do
    case "$unit" in
      trex-webui-api.service)
        legacy_dropin="$LEGACY_RELEASE_RECONCILER_API_DROPIN_TARGET"
        v2_dropin="$RELEASE_RECONCILER_API_DROPIN_TARGET"
        ;;
      trex-daemon-server.service)
        legacy_dropin="$LEGACY_RELEASE_RECONCILER_DAEMON_DROPIN_TARGET"
        v2_dropin="$RELEASE_RECONCILER_DAEMON_DROPIN_TARGET"
        ;;
      nginx.service)
        legacy_dropin="$LEGACY_RELEASE_RECONCILER_NGINX_DROPIN_TARGET"
        v2_dropin="$RELEASE_RECONCILER_NGINX_DROPIN_TARGET"
        ;;
    esac
    if [[ "$unit" == "trex-daemon-server.service" && \
      "$MANAGE_LOCAL_DAEMON" -eq 0 ]]; then
      [[ ! -e "$legacy_dropin" && ! -L "$legacy_dropin" && \
        ! -e "$v2_dropin" && ! -L "$v2_dropin" ]] || \
        die "external-daemon mode found a managed release dependency drop-in"
      load_state="$(systemctl show "$unit" --property=LoadState --value)" || \
        die "unable to inspect external daemon release drop-in authority"
      if [[ "$load_state" == "loaded" ]]; then
        dropins="$(systemctl show "$unit" --property=DropInPaths --value)" || \
          die "unable to inspect external daemon release drop-in authority"
        [[ " $dropins " != *" $legacy_dropin "* && \
          " $dropins " != *" $v2_dropin "* ]] || \
          die "external-daemon mode has a managed release dependency loaded"
      fi
      continue
    fi
    load_state="$(systemctl show "$unit" --property=LoadState --value)" || \
      die "unable to inspect consumer unit $unit before host mutation"
    [[ "$load_state" == "loaded" || "$load_state" == "not-found" ]] || \
      die "consumer unit $unit has unexpected LoadState $load_state"
    [[ "$load_state" == "loaded" ]] || continue
    need_reload="$(systemctl show "$unit" --property=NeedDaemonReload --value)" || \
      die "unable to inspect consumer unit $unit disk authority"
    dropins="$(systemctl show "$unit" --property=DropInPaths --value)" || \
      die "unable to inspect consumer unit $unit drop-in authority"
    assert_loaded_dropins_are_known "$unit" "$dropins" "$legacy_dropin" "$v2_dropin"
    [[ "$need_reload" == "no" ]] || pending_reload=1
  done
  if [[ "$pending_reload" -eq 1 ]]; then
    assert_pending_recovery_v2_generation_matches_archive
  fi
}

arm_installed_release_reconciler() {
  RELEASE_TRANSACTION_ENGINE="$RELEASE_RECONCILER_TARGET"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '+ validate and reload the transient installed release reconciler, then run it while the outer deployment lock is held\n'
    return 0
  fi
  [[ -f "$RELEASE_RECONCILER_TARGET" && ! -L "$RELEASE_RECONCILER_TARGET" && \
    -x "$RELEASE_RECONCILER_TARGET" ]] || \
    die "installed release reconciler is missing or unsafe"
  [[ "$(stat -c '%u:%g %a %h' "$RELEASE_RECONCILER_TARGET")" == "0:0 755 1" ]] || \
    die "installed release reconciler must be root:root 0755 with one link"
  [[ -f "$RELEASE_BOOTSTRAP_TARGET" && ! -L "$RELEASE_BOOTSTRAP_TARGET" && \
    -x "$RELEASE_BOOTSTRAP_TARGET" && \
    "$(stat -c '%u:%g %a %h' "$RELEASE_BOOTSTRAP_TARGET")" == "0:0 755 1" ]] || \
    die "installed release infrastructure verifier is missing or unsafe"
  local common_expected=(
    --expected "$RELEASE_BOOTSTRAP_TARGET::0755::prerequisite"
    --expected "$RELEASE_RECONCILER_TARGET::0755::prerequisite"
    --expected "$TREX_OVERVIEW_VALIDATOR_TARGET::0755::prerequisite"
    --expected "$TREX_PERSISTED_STATE_VALIDATOR_TARGET::0755::prerequisite"
    --expected "$RELEASE_RECONCILER_UNIT_TARGET::0644::prerequisite"
    --expected "$RELEASE_RECONCILER_RETRY_UNIT_TARGET::0644::prerequisite"
    --expected "$RELEASE_RECONCILER_ACK_UNIT_TARGET::0644::prerequisite"
    --expected "$LEGACY_RELEASE_RECONCILER_BRIDGE_TARGET::0644::consumer-dropin"
    --expected "$LEGACY_RELEASE_RECONCILER_RETRY_BRIDGE_TARGET::0644::consumer-dropin"
    --expected "$LEGACY_RELEASE_RECONCILER_ACK_BRIDGE_TARGET::0644::consumer-dropin"
    --expected "$RELEASE_RECONCILER_API_DROPIN_TARGET::0644::consumer-dropin"
    --expected "$RELEASE_RECONCILER_NGINX_DROPIN_TARGET::0644::consumer-dropin"
  )
  /usr/bin/python3 "$RELEASE_BOOTSTRAP_TARGET" \
    --manifest "$RELEASE_INFRASTRUCTURE_COMMON_MANIFEST" \
    --verify-installed "${common_expected[@]}" || \
    die "installed common release infrastructure failed exact manifest verification"
  if [[ "$MANAGE_LOCAL_DAEMON" -eq 1 ]]; then
    local managed_expected=(
      --expected "$RELEASE_ROLLBACK_DAEMON_PROBE_TARGET::0755::prerequisite"
      --expected "$RELEASE_ROLLBACK_NATIVE_BOUNDARY_TARGET::0755::prerequisite"
      --expected "$RELEASE_RECONCILER_DAEMON_DROPIN_TARGET::0644::consumer-dropin"
    )
    /usr/bin/python3 "$RELEASE_BOOTSTRAP_TARGET" \
      --manifest "$RELEASE_INFRASTRUCTURE_MANAGED_MANIFEST" \
      --verify-installed "${managed_expected[@]}" || \
      die "installed managed-local release infrastructure failed exact manifest verification"
  fi
  [[ -f "$RELEASE_RECONCILER_UNIT_TARGET" && ! -L "$RELEASE_RECONCILER_UNIT_TARGET" ]] || \
    die "installed release reconciler unit is missing or unsafe"
  [[ "$(stat -c '%u:%g %a %h' "$RELEASE_RECONCILER_UNIT_TARGET")" == "0:0 644 1" ]] || \
    die "installed release reconciler unit must be root:root 0644 with one link"
  grep -Fqx 'Type=oneshot' "$RELEASE_RECONCILER_UNIT_TARGET" || \
    die "installed release reconciler is not a transient oneshot"
  ! grep -Fq 'RemainAfterExit=yes' "$RELEASE_RECONCILER_UNIT_TARGET" || \
    die "installed release reconciler would suppress recovery on later consumer starts"
  grep -Fq -- '--deployment-lock /run/lock/trex-webui/deploy.lock --supervise-errors reconcile' \
    "$RELEASE_RECONCILER_UNIT_TARGET" || \
    die "installed release reconciler does not supervise boot recovery under the outer deployment lock"
  grep -Fqx 'TimeoutStartSec=infinity' "$RELEASE_RECONCILER_UNIT_TARGET" || \
    die "installed release reconciler can time out while consumers wait"
  [[ -f "$RELEASE_RECONCILER_RETRY_UNIT_TARGET" && \
    ! -L "$RELEASE_RECONCILER_RETRY_UNIT_TARGET" && \
    "$(stat -c '%u:%g %a %h' "$RELEASE_RECONCILER_RETRY_UNIT_TARGET")" == "0:0 644 1" ]] || \
    die "installed release retry unit is missing or unsafe"
  grep -Fq -- '--retry-on-lock-busy reconcile' \
    "$RELEASE_RECONCILER_RETRY_UNIT_TARGET" || \
    die "installed release retry unit does not retry the outer deployment lock"
  grep -Fqx 'Restart=on-failure' "$RELEASE_RECONCILER_RETRY_UNIT_TARGET" || \
    die "installed release retry unit is not persistent"
  grep -Fqx 'StartLimitIntervalSec=0' "$RELEASE_RECONCILER_RETRY_UNIT_TARGET" || \
    die "installed release retry unit has a bounded retry window"
  [[ -f "$RELEASE_RECONCILER_ACK_UNIT_TARGET" && \
    ! -L "$RELEASE_RECONCILER_ACK_UNIT_TARGET" && \
    "$(stat -c '%u:%g %a %h' "$RELEASE_RECONCILER_ACK_UNIT_TARGET")" == "0:0 644 1" ]] || \
    die "installed release acknowledgement unit is missing or unsafe"
  verify_legacy_release_infrastructure_exact
  if legacy_release_infrastructure_present; then
    # The v2 manifest can survive a crash immediately before daemon-reload.
    # Re-prove both the terminal handoff and that no v1 command or
    # acknowledgement job was started in that disk/manager gap before
    # replacing the loaded graph with inert bridges.
    verify_legacy_terminal_handoff_to_v2
    assert_legacy_release_units_quiescent
  fi
  systemctl daemon-reload || die "unable to reload the installed release reconciler"
  assert_loaded_release_infrastructure_unit \
    trex-webui-release-reconcile-v2.service \
    "$RELEASE_RECONCILER_UNIT_TARGET" \
    "release reconciler" \
    "$RELEASE_RECONCILER_TARGET --deployment-lock /run/lock/trex-webui/deploy.lock --supervise-errors reconcile"
  assert_loaded_release_infrastructure_unit \
    trex-webui-release-retry-v2.service \
    "$RELEASE_RECONCILER_RETRY_UNIT_TARGET" \
    "release retry" \
    "$RELEASE_RECONCILER_TARGET --deployment-lock /run/lock/trex-webui/deploy.lock --retry-on-lock-busy reconcile"
  assert_loaded_release_infrastructure_unit \
    trex-webui-release-consumer-ack-v2.service \
    "$RELEASE_RECONCILER_ACK_UNIT_TARGET" \
    "release consumer acknowledgement" \
    "$RELEASE_RECONCILER_TARGET ack-consumers"
  if legacy_release_infrastructure_present; then
    assert_loaded_legacy_release_bridge \
      trex-webui-release-reconcile.service \
      "$LEGACY_RELEASE_RECONCILER_UNIT_TARGET" \
      "$LEGACY_RELEASE_RECONCILER_BRIDGE_TARGET" \
      trex-webui-release-reconcile-v2.service \
      "legacy release reconciler bridge"
    assert_loaded_legacy_release_bridge \
      trex-webui-release-retry.service \
      "$LEGACY_RELEASE_RECONCILER_RETRY_UNIT_TARGET" \
      "$LEGACY_RELEASE_RECONCILER_RETRY_BRIDGE_TARGET" \
      trex-webui-release-retry-v2.service \
      "legacy release retry bridge"
    assert_loaded_legacy_release_bridge \
      trex-webui-release-consumer-ack.service \
      "$LEGACY_RELEASE_RECONCILER_ACK_UNIT_TARGET" \
      "$LEGACY_RELEASE_RECONCILER_ACK_BRIDGE_TARGET" \
      trex-webui-release-consumer-ack-v2.service \
      "legacy release acknowledgement bridge"
    verify_legacy_release_infrastructure_exact
  fi
  /usr/bin/python3 "$RELEASE_BOOTSTRAP_TARGET" \
    --manifest "$RELEASE_INFRASTRUCTURE_COMMON_MANIFEST" \
    --verify-installed "${common_expected[@]}" || \
    die "recovery ABI v2 changed across daemon-reload"
  if [[ "$MANAGE_LOCAL_DAEMON" -eq 1 ]]; then
    /usr/bin/python3 "$RELEASE_BOOTSTRAP_TARGET" \
      --manifest "$RELEASE_INFRASTRUCTURE_MANAGED_MANIFEST" \
      --verify-installed "${managed_expected[@]}" || \
      die "managed-local recovery ABI v2 changed across daemon-reload"
  fi
  assert_loaded_consumer_recovery_authority \
    trex-webui-api.service \
    "$LEGACY_RELEASE_RECONCILER_API_DROPIN_TARGET" \
    "$RELEASE_RECONCILER_API_DROPIN_TARGET" \
    "API recovery barrier"
  assert_loaded_consumer_recovery_authority \
    nginx.service \
    "$LEGACY_RELEASE_RECONCILER_NGINX_DROPIN_TARGET" \
    "$RELEASE_RECONCILER_NGINX_DROPIN_TARGET" \
    "Nginx recovery barrier"
  if [[ "$MANAGE_LOCAL_DAEMON" -eq 1 ]]; then
    assert_loaded_consumer_recovery_authority \
      trex-daemon-server.service \
      "$LEGACY_RELEASE_RECONCILER_DAEMON_DROPIN_TARGET" \
      "$RELEASE_RECONCILER_DAEMON_DROPIN_TARGET" \
      "daemon recovery barrier"
  fi
  systemctl enable trex-webui-release-reconcile-v2.service || \
    die "unable to durably enable boot-time release reconciliation"
  sync --file-system /etc/systemd/system || \
    die "unable to persist boot-time release reconciliation enablement"
  systemctl is-enabled --quiet trex-webui-release-reconcile-v2.service || \
    die "boot-time release reconciliation enablement did not persist"
  systemctl restart trex-webui-release-reconcile-v2.service || \
    die "unable to arm release reconciliation before selector mutation"
  systemctl start --no-block trex-webui-release-retry-v2.service || \
    die "unable to queue independent reconciliation retry before selector mutation"
  local retry_active retry_substate retry_job retry_attempt
  for ((retry_attempt = 1; retry_attempt <= 40; retry_attempt += 1)); do
    retry_active="$(systemctl show trex-webui-release-retry-v2.service --property=ActiveState --value)" || \
      die "unable to inspect queued release retry state"
    retry_substate="$(systemctl show trex-webui-release-retry-v2.service --property=SubState --value)" || \
      die "unable to inspect queued release retry substate"
    retry_job="$(systemctl show trex-webui-release-retry-v2.service --property=Job --value)" || \
      die "unable to inspect queued release retry job"
    if [[ "$retry_active" =~ ^(active|activating)$ || \
      "$retry_substate" == "auto-restart" || -n "$retry_job" ]]; then
      break
    fi
    ((retry_attempt < 40)) && sleep 0.05
  done
  [[ "$retry_active" =~ ^(active|activating)$ || \
    "$retry_substate" == "auto-restart" || -n "$retry_job" ]] || \
    die "independent release retry was not durably queued"
}

assert_loaded_release_infrastructure_unit() {
  local unit="$1"
  local expected_fragment="$2"
  local label="$3"
  local expected_exec="$4"
  local load_state fragment need_reload dropins loaded_exec restart
  load_state="$(systemctl show "$unit" --property=LoadState --value)" || \
    die "unable to inspect $label LoadState"
  fragment="$(systemctl show "$unit" --property=FragmentPath --value)" || \
    die "unable to inspect $label FragmentPath"
  need_reload="$(systemctl show "$unit" --property=NeedDaemonReload --value)" || \
    die "unable to inspect $label NeedDaemonReload"
  dropins="$(systemctl show "$unit" --property=DropInPaths --value)" || \
    die "unable to inspect $label DropInPaths"
  loaded_exec="$(systemctl show "$unit" --property=ExecStart --value)" || \
    die "unable to inspect $label ExecStart"
  restart="$(systemctl show "$unit" --property=Restart --value)" || \
    die "unable to inspect $label Restart policy"
  [[ "$load_state" == "loaded" && "$fragment" == "$expected_fragment" && \
    "$need_reload" == "no" && -z "$dropins" && \
    "$loaded_exec" == *"$expected_exec"* && "$restart" == "on-failure" ]] || \
    die "$label loaded authority differs from its fixed ABI artifact"
}

assert_loaded_consumer_recovery_authority() {
  local unit="$1"
  local legacy_dropin="$2"
  local v2_dropin="$3"
  local label="$4"
  local load_state need_reload dropins expected_count=1
  load_state="$(systemctl show "$unit" --property=LoadState --value)" || \
    die "unable to inspect $label LoadState"
  if [[ "$load_state" == "not-found" ]]; then
    # A first archive installation publishes the immutable recovery provider
    # and direct dependency files before install.sh creates the consumers.
    # Their later daemon-reload/start is verified by the candidate installer
    # and deploy/verify.sh; there is no loaded graph to inspect yet.
    return 0
  fi
  [[ "$load_state" == "loaded" ]] || \
    die "$label consumer has unexpected LoadState $load_state"
  need_reload="$(systemctl show "$unit" --property=NeedDaemonReload --value)" || \
    die "unable to inspect $label NeedDaemonReload"
  dropins="$(systemctl show "$unit" --property=DropInPaths --value)" || \
    die "unable to inspect $label DropInPaths"
  [[ "$need_reload" == "no" && " $dropins " == *" $v2_dropin "* ]] || \
    die "$label did not load the canonical recovery ABI v2 dependency"
  if [[ -e "$legacy_dropin" || -L "$legacy_dropin" ]]; then
    expected_count=2
    [[ " $dropins " == *" $legacy_dropin "* ]] || \
      die "$label dropped the immutable recovery ABI v1 compatibility barrier"
  fi
  assert_loaded_dropins_are_known "$label" "$dropins" "$legacy_dropin" "$v2_dropin"
  set -- $dropins
  [[ "$#" -eq "$expected_count" ]] || \
    die "$label loaded duplicate or incomplete recovery dependencies"
}

assert_loaded_legacy_release_bridge() {
  local unit="$1"
  local expected_fragment="$2"
  local expected_dropin="$3"
  local required_v2_unit="$4"
  local label="$5"
  local load_state fragment need_reload dropins loaded_exec loaded_exec_post
  local restart requires after active_state sub_state main_pid job
  load_state="$(systemctl show "$unit" --property=LoadState --value)" || \
    die "unable to inspect $label LoadState"
  fragment="$(systemctl show "$unit" --property=FragmentPath --value)" || \
    die "unable to inspect $label FragmentPath"
  need_reload="$(systemctl show "$unit" --property=NeedDaemonReload --value)" || \
    die "unable to inspect $label NeedDaemonReload"
  dropins="$(systemctl show "$unit" --property=DropInPaths --value)" || \
    die "unable to inspect $label DropInPaths"
  loaded_exec="$(systemctl show "$unit" --property=ExecStart --value)" || \
    die "unable to inspect $label ExecStart"
  loaded_exec_post="$(systemctl show "$unit" --property=ExecStartPost --value)" || \
    die "unable to inspect $label ExecStartPost"
  restart="$(systemctl show "$unit" --property=Restart --value)" || \
    die "unable to inspect $label Restart"
  requires="$(systemctl show "$unit" --property=Requires --value)" || \
    die "unable to inspect $label Requires"
  after="$(systemctl show "$unit" --property=After --value)" || \
    die "unable to inspect $label After"
  active_state="$(systemctl show "$unit" --property=ActiveState --value)" || \
    die "unable to inspect $label ActiveState"
  sub_state="$(systemctl show "$unit" --property=SubState --value)" || \
    die "unable to inspect $label SubState"
  main_pid="$(systemctl show "$unit" --property=MainPID --value)" || \
    die "unable to inspect $label MainPID"
  job="$(systemctl show "$unit" --property=Job --value)" || \
    die "unable to inspect $label Job"
  [[ "$load_state" == "loaded" && "$fragment" == "$expected_fragment" && \
    "$need_reload" == "no" && "$dropins" == "$expected_dropin" && \
    "$loaded_exec" == *"path=/usr/bin/true"* && \
    "$loaded_exec" != *"$LEGACY_RELEASE_RECONCILER_TARGET"* && \
    -z "$loaded_exec_post" && "$restart" == "no" && \
    "$active_state" == "inactive" && "$sub_state" == "dead" && \
    "$main_pid" == "0" && -z "$job" && \
    " $requires " == *" $required_v2_unit "* && \
    " $after " == *" $required_v2_unit "* ]] || \
    die "$label did not quarantine recovery ABI v1 behind the canonical v2 authority"
}

prepare_previous_release() {
  RELEASE_TRANSACTION_ENGINE="$RELEASE_RECONCILER_TARGET"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    RELEASE_CANDIDATE_DIGEST="$(printf '%064d' 0)"
    RELEASE_PROJECT_ROOT="$INSTALL_ROOT/releases/sha256-$RELEASE_CANDIDATE_DIGEST"
    RELEASE_TRANSACTION_PREPARED=1
    RELEASE_CURRENT_BEFORE=""
    if [[ -L "$INSTALL_ROOT/current" && \
      "$(readlink -- "$INSTALL_ROOT/current")" =~ ^releases/sha256-([0-9a-f]{64})$ ]]; then
      RELEASE_CURRENT_BEFORE="${BASH_REMATCH[1]}"
    fi
    printf '+ prepare the validated previous selector as a durable N-1 transaction\n'
    return 0
  fi
  RELEASE_TRANSACTION_PREPARED=1
  RELEASE_TRANSACTION_COMMITTED=0
  local prepared
  local prepare_args=(prepare-previous)
  if [[ "$INSTALL_ROOT" == "/opt/trex-webui" && \
    "$RELEASE_STATE_ROOT" == "/var/lib/trex-webui-deploy" ]]; then
    prepare_args+=(--host-profile common)
  fi
  prepared="$(release_engine "${prepare_args[@]}")" || \
    die "unable to prepare the retained N-1 release"
  RELEASE_TRANSACTION_ID="$(release_json_field transaction_id <<<"$prepared")" || \
    die "N-1 rollback preparation omitted its transaction id"
  RELEASE_CANDIDATE_DIGEST="$(release_json_field candidate <<<"$prepared")" || \
    die "N-1 rollback preparation omitted its candidate digest"
  RELEASE_CURRENT_BEFORE="$(release_json_optional_field current_before <<<"$prepared")" || \
    die "N-1 rollback preparation omitted its prior current authority"
  RELEASE_PROJECT_ROOT="$INSTALL_ROOT/releases/sha256-$RELEASE_CANDIDATE_DIGEST"
  [[ -d "$RELEASE_PROJECT_ROOT" && ! -L "$RELEASE_PROJECT_ROOT" ]] || \
    die "retained N-1 release is missing"
  [[ -x "$RELEASE_PROJECT_ROOT/.venv/bin/python" ]] || \
    die "retained N-1 release has no executable API runtime"
  [[ -f "$RELEASE_PROJECT_ROOT/apps/web/dist/index.html" && \
    ! -L "$RELEASE_PROJECT_ROOT/apps/web/dist/index.html" ]] || \
    die "retained N-1 release has no safe frontend entrypoint"
}

preflight_previous_release_consumers() {
  have_cmd systemctl || die "systemctl is required for N-1 rollback"
  have_cmd curl || die "curl is required for N-1 rollback readiness verification"
  have_cmd nginx || die "nginx is required for N-1 rollback configuration verification"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '+ require active selector-based API and Nginx consumers before N-1 mutation\n'
    return 0
  fi
  preflight_release_systemd_shadow_authority
  [[ -f "$NGINX_CONF_TARGET" && ! -L "$NGINX_CONF_TARGET" ]] || \
    die "managed Nginx configuration is missing or unsafe"
  [[ "$(stat -c '%u:%g %a %h' "$NGINX_CONF_TARGET")" == "0:0 644 1" ]] || \
    die "managed Nginx configuration must be root:root 0644 with one link"
  [[ "$(grep -Fxc '    root /opt/trex-webui/current/apps/web/dist;' "$NGINX_CONF_TARGET")" -eq 1 ]] || \
    die "Nginx does not consume the atomic current selector"
  capture_archive_api_service_state
  [[ "$ARCHIVE_API_SERVICE_MATCHED" -eq 1 && \
    "$ARCHIVE_API_OLD_PROJECT_ROOT" == "$INSTALL_ROOT/current" ]] || \
    die "trex-webui-api.service does not consume the atomic current selector"
  [[ "$ARCHIVE_API_WAS_ACTIVE" -eq 1 ]] || \
    die "trex-webui-api.service must be active before N-1 rollback"
  if systemctl is-active --quiet nginx.service || systemctl is-active --quiet nginx; then
    ROLLBACK_NGINX_WAS_ACTIVE=1
  else
    die "nginx must be active before N-1 rollback"
  fi
  nginx -t || die "Nginx configuration is invalid before N-1 rollback"
}

validate_previous_release_runtime_evidence() {
  local runtime_payload="$1"
  local capture_payload="$2"
  local quick_validation_payload="$3"
  python3.11 - "$runtime_payload" "$capture_payload" "$quick_validation_payload" <<'PY'
from __future__ import annotations

import json
import sys


def fail(message: str) -> None:
    raise SystemExit(f"N-1 rollback runtime preflight failed: {message}")


def payload(index: int, label: str) -> dict[str, object]:
    try:
        value = json.loads(sys.argv[index])
    except (json.JSONDecodeError, UnicodeError) as exc:
        fail(f"{label} evidence is not valid JSON: {exc}")
    if not isinstance(value, dict) or value.get("ok") is not True:
        fail(f"{label} evidence did not report ok")
    data = value.get("data")
    if not isinstance(data, dict):
        fail(f"{label} evidence omitted its canonical data object")
    return data


runtime = payload(1, "traffic runtime")
if runtime.get("live_state_sampled") is not True:
    fail("traffic runtime did not sample live state")
if runtime.get("mutation_intent") is not None:
    fail("traffic mutation recovery is still pending")
session = runtime.get("session")
if session is not None:
    if not isinstance(session, dict) or session.get("state") != "stopped":
        fail("canonical traffic session is active or unknown")
records = runtime.get("port_states")
if not isinstance(records, list):
    fail("traffic runtime omitted typed port state evidence")
seen: set[int] = set()
for record in records:
    if not isinstance(record, dict):
        fail("traffic runtime contains an invalid port record")
    port = record.get("port")
    if isinstance(port, bool) or not isinstance(port, int) or port < 0 or port in seen:
        fail("traffic runtime contains an invalid or duplicate port identity")
    seen.add(port)
    if record.get("state") != "stopped":
        fail(f"port {port} is active or unknown")
    if record.get("ownership") != "none":
        fail(f"port {port} ownership is not released")
available = runtime.get("available_ports")
if (
    not isinstance(available, list)
    or any(isinstance(port, bool) or not isinstance(port, int) or port < 0 for port in available)
    or len(available) != len(set(available))
    or set(available) != seen
):
    fail("available ports do not exactly match stopped, unowned live evidence")

capture = payload(2, "capture")
captures = capture.get("captures")
if not isinstance(captures, list) or captures:
    fail("managed or external capture recorders are still active")
usage = capture.get("port_usage")
if not isinstance(usage, list):
    fail("capture port usage evidence is missing or invalid")
for record in usage:
    if not isinstance(record, dict):
        fail("capture port usage evidence contains an invalid record")
    for key in ("rx_recorder_ids", "tx_recorder_ids"):
        identifiers = record.get(key)
        if not isinstance(identifiers, list) or identifiers:
            fail("capture recorder ownership is not released")
service_mode = capture.get("service_mode")
if not isinstance(service_mode, dict):
    fail("capture service-mode evidence is missing or invalid")
identifiers = service_mode.get("managed_capture_ids")
if not isinstance(identifiers, list) or identifiers:
    fail("managed capture ownership is not released")

quick_validation = payload(3, "quick validation")
if quick_validation.get("active") is not False:
    fail("quick validation is still active or unknown")
if quick_validation.get("recovery_required") is not False:
    fail("quick-validation recovery is still pending")
PY
}

preflight_previous_release_runtime() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '+ require canonical live traffic idle/unowned, no mutation recovery, no captures, and no quick-validation recovery before stopping the API\n'
    return 0
  fi
  local runtime_payload capture_payload quick_validation_payload
  local quick_validation_body quick_validation_status
  release_engine status >/dev/null || \
    die "selected release authority is invalid before N-1 runtime sampling"
  runtime_payload="$(curl -fsS --noproxy '*' --connect-timeout 2 --max-time 8 \
    "http://127.0.0.1/api/trex/traffic/runtime")" || \
    die "unable to sample canonical traffic runtime before N-1 rollback"
  capture_payload="$(curl -fsS --noproxy '*' --connect-timeout 2 --max-time 8 \
    "http://127.0.0.1/api/trex/capture/status")" || \
    die "unable to sample capture authority before N-1 rollback"
  quick_validation_body="$(mktemp -t trex-webui-qv-preflight.XXXXXX)" || \
    die "unable to stage quick-validation preflight evidence"
  quick_validation_status="$(curl -sS --noproxy '*' --connect-timeout 2 --max-time 8 \
    --output "$quick_validation_body" --write-out '%{http_code}' \
    "http://127.0.0.1/api/trex/quick-validation")" || {
      rm -f -- "$quick_validation_body"
      die "unable to sample quick-validation recovery before N-1 rollback"
    }
  if [[ -f "$INSTALL_ROOT/current/apps/api/app/trex/quick_validation.py" ]]; then
    [[ "$quick_validation_status" == "200" ]] || {
      rm -f -- "$quick_validation_body"
      die "quick-validation-capable selected release did not expose canonical recovery evidence"
    }
    quick_validation_payload="$(<"$quick_validation_body")"
  else
    [[ "$quick_validation_status" == "404" ]] || {
      rm -f -- "$quick_validation_body"
      die "legacy selected release returned an unexpected quick-validation response"
    }
    # A 404 is accepted only when the already-validated immutable selected
    # release truly predates the capability. The newer rollback wrapper still
    # validates the shared persistent RuntimeState and QuickValidationState.
    validate_persisted_previous_release_runtime_state \
      "$SERVICE_RUNTIME_STATE_PATH" || {
        rm -f -- "$quick_validation_body"
        die "wrapper authority found pending persistent state behind the legacy API"
      }
    quick_validation_payload='{"ok":true,"data":{"active":false,"recovery_required":false}}'
  fi
  rm -f -- "$quick_validation_body"
  validate_previous_release_runtime_evidence \
    "$runtime_payload" \
    "$capture_payload" \
    "$quick_validation_payload" || \
    die "runtime authority is not quiescent enough for N-1 rollback"
  if [[ "$MANAGE_LOCAL_DAEMON" -eq 1 ]]; then
    /usr/bin/python3 "$DAEMON_RPC_PROBE_TARGET" \
      --host 127.0.0.1 \
      --port 8090 \
      --timeout 5 \
      safe-restart || \
      die "TRex daemon is running, reserved, or unknown; refusing N-1 rollback"
  fi
}

cold_restart_forward_daemon_for_previous_release() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '+ after idle/unreserved proof, cold-restart the current forward daemon host generation and verify RPC/native-boundary readiness before the N-1 snapshot\n'
    return 0
  fi
  [[ "$MANAGE_LOCAL_DAEMON" -eq 1 ]] || \
    die "N-1 forward daemon convergence requires the installer-managed local daemon"
  assert_loaded_unit_disk_authority \
    trex-daemon-server.service "$DAEMON_SYSTEMD_SERVICE_TARGET" \
    "trex-daemon-server.service"
  assert_loaded_unit_not_stale nftables.service "nftables.service"
  local target nftables_dropins
  for target in \
    "$DAEMON_SYSTEMD_SERVICE_TARGET" \
    "$DAEMON_LOGROTATE_TARGET" \
    "$DAEMON_SUPERVISOR_TARGET" \
    "$DAEMON_RPC_PROBE_TARGET" \
    "$DAEMON_NATIVE_BOUNDARY_TARGET" \
    "$NFTABLES_SYSTEMD_DROPIN_TARGET"; do
    [[ -f "$target" && ! -L "$target" ]] || \
      die "N-1 forward daemon host authority is missing or unsafe: $target"
    trex_assert_root_controlled_authority_path "$target" \
      "N-1 forward daemon host authority" || \
      die "N-1 forward daemon host authority is not root-controlled: $target"
  done
  grep -Fqx '# Managed by TRex WebUI deploy/install.sh.' \
    "$DAEMON_SYSTEMD_SERVICE_TARGET" || \
    die "N-1 forward daemon unit is not installer-managed"
  grep -Fqx '# Managed by TRex WebUI deploy/install.sh.' \
    "$NFTABLES_SYSTEMD_DROPIN_TARGET" || \
    die "N-1 forward nftables integration is not installer-managed"
  nftables_dropins="$(systemctl show nftables.service --property=DropInPaths --value)" || \
    die "unable to inspect N-1 forward nftables drop-in authority"
  [[ " $nftables_dropins " == *" $NFTABLES_SYSTEMD_DROPIN_TARGET "* ]] || \
    die "N-1 forward nftables integration is not loaded by systemd"
  /usr/bin/python3 "$DAEMON_RPC_PROBE_TARGET" \
    --host 127.0.0.1 --port 8090 --timeout 5 safe-restart || \
    die "forward daemon became unsafe before its cold-start authority proof"
  systemctl restart trex-daemon-server.service || \
    die "forward daemon host generation cannot cold-start before the N-1 snapshot"
  /usr/bin/python3 "$DAEMON_RPC_PROBE_TARGET" \
    --host 127.0.0.1 --port 8090 --timeout 20 ready || \
    die "forward daemon host generation failed readiness after cold restart"
  "$DAEMON_NATIVE_BOUNDARY_TARGET" verify || \
    die "forward daemon native boundary failed after cold restart"
}

validate_persisted_previous_release_runtime_state() {
  local state_path="$1"
  /usr/bin/python3 "$TREX_PERSISTED_STATE_VALIDATOR_TARGET" "$state_path"
}

post_stop_previous_release_runtime_preflight() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '+ after stopping the API, reload canonical persistent runtime state with the current release and recheck managed-daemon safe-restart\n'
    return 0
  fi
  [[ "$MANAGE_LOCAL_DAEMON" -eq 1 ]] || \
    die "post-stop N-1 validation requires the installer-managed local daemon"
  validate_persisted_previous_release_runtime_state \
    "$SERVICE_RUNTIME_STATE_PATH" || \
    die "canonical persistent runtime state is not quiescent under the rollback wrapper authority after stopping the API"
  /usr/bin/python3 "$DAEMON_RPC_PROBE_TARGET" \
    --host 127.0.0.1 \
    --port 8090 \
    --timeout 5 \
    safe-restart || \
    die "TRex daemon became running, reserved, or unknown after stopping the API"
}

verify_previous_release_readiness() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '+ restart selector-based API and Nginx, verify API identity/health and exact selected frontend bytes, then commit\n'
    return 0
  fi
  systemctl restart trex-webui-api.service || \
    die "unable to start the N-1 API release"
  wait_for_restored_archive_api_readiness || \
    die "N-1 API readiness verification failed"
  verify_restored_archive_api_identity \
    "$INSTALL_ROOT/current/.venv/bin/python" \
    "$INSTALL_ROOT/current" || \
    die "N-1 API runtime identity verification failed"

  nginx -t || die "Nginx configuration became invalid during N-1 rollback"
  systemctl restart nginx || die "unable to restart Nginx for the N-1 release"
  systemctl is-active --quiet nginx.service || \
    systemctl is-active --quiet nginx || \
    die "Nginx is not active for the N-1 release"
  local frontend_body
  frontend_body="$(mktemp -t trex-webui-rollback-index.XXXXXX)" || \
    die "unable to stage N-1 frontend readiness response"
  if ! curl -fsS --noproxy '*' \
    --connect-timeout 2 --max-time 8 \
    --output "$frontend_body" \
    "http://127.0.0.1/"; then
    rm -f -- "$frontend_body"
    die "N-1 frontend readiness request failed"
  fi
  if ! cmp -s "$frontend_body" "$RELEASE_PROJECT_ROOT/apps/web/dist/index.html"; then
    rm -f -- "$frontend_body"
    die "Nginx did not serve the exact selected N-1 frontend entrypoint"
  fi
  rm -f -- "$frontend_body"
  /usr/bin/python3 "$DAEMON_RPC_PROBE_TARGET" \
    --host 127.0.0.1 --port 8090 --timeout 5 ready || \
    die "forward host integration daemon is not RPC-ready for the N-1 API"
  local overview overview_validator="$TREX_OVERVIEW_VALIDATOR_TARGET"
  [[ -f "$overview_validator" && ! -L "$overview_validator" ]] || \
    die "rollback wrapper is missing the strict TRex overview contract"
  overview="$(curl -fsS --noproxy '*' --connect-timeout 2 --max-time 8 \
    "http://127.0.0.1/api/system/overview")" || \
    die "N-1 real TRex overview request failed"
  python3.11 "$overview_validator" <<<"$overview" || \
    die "N-1 API is incompatible with the forward host/daemon integration"
}

run_previous_release_rollback() {
  log "Preparing guarded rollback to the retained N-1 release"
  preflight_previous_release_consumers
  arm_installed_release_reconciler
  preflight_previous_release_runtime
  cold_restart_forward_daemon_for_previous_release
  # A cold start can expose helper/disk drift that an already-running daemon
  # concealed. Re-sample every canonical runtime authority before journaling.
  preflight_previous_release_runtime
  prepare_previous_release
  prelabel_versioned_release_for_selinux
  preflight_previous_release_runtime
  if [[ "$DRY_RUN" -eq 0 ]]; then
    arm_versioned_release_consumers n-minus-one
    stop_versioned_release_consumers_for_selector_mutation
  else
    arm_versioned_release_consumers n-minus-one
  fi
  post_stop_previous_release_runtime_preflight
  ROLLBACK_NGINX_MUTATION_GUARD_APPLIED=1
  activate_versioned_release
  verify_previous_release_readiness
  commit_versioned_release
  ARCHIVE_API_MUTATION_GUARD_APPLIED=0
  ROLLBACK_NGINX_MUTATION_GUARD_APPLIED=0
  log "N-1 release rollback committed after API and Nginx readiness verification"
}

main() {
  parse_args "$@"
  normalize_paths
  if [[ -z "$ARCHIVE" && "$ROLLBACK_PREVIOUS" -eq 0 ]]; then
    printf 'warning: checkout upgrade cannot roll back source changes made before this command; use --archive for rollback-backed production upgrades\n' >&2
  fi
  require_root_for_archive
  if [[ "$DRY_RUN" -eq 0 ]]; then
    trex_acquire_deployment_lock || die "another deployment transaction is active or the deployment lock is unsafe"
  fi
  preflight_managed_api_environment
  if [[ "$ROLLBACK_PREVIOUS" -eq 1 ]]; then
    run_previous_release_rollback
    log "TRex WebUI rollback complete"
    return 0
  fi
  stage_archive
  check_archive
  extract_and_verify_archive
  require_production_archive_host_authority
  require_archive_transaction_contract
  preflight_release_systemd_shadow_authority
  if [[ -n "$ARCHIVE" ]]; then
    capture_archive_api_service_state
  fi
  preflight_archive_daemon_runtime
  if [[ -n "$ARCHIVE" ]]; then
    bootstrap_release_reconciler
    prepare_legacy_baseline
    prepare_versioned_release
    attach_candidate_dotenv
    prelabel_versioned_release_for_selinux
    if [[ "$DRY_RUN" -eq 0 ]]; then
      arm_versioned_release_consumers archive
      stop_versioned_release_consumers_for_selector_mutation
      post_fence_archive_runtime_preflight
      mark_archive_daemon_mutation_started
      converge_archive_daemon_runtime_after_recovery_barrier
    else
      arm_versioned_release_consumers archive
      stop_versioned_release_consumers_for_selector_mutation
      post_fence_archive_runtime_preflight
      mark_archive_daemon_mutation_started
      converge_archive_daemon_runtime_after_recovery_barrier
    fi
    activate_versioned_release
    run_install
    commit_versioned_release
  else
    run_install
  fi
  log "TRex WebUI upgrade complete"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
