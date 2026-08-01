#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
[[ -f "$SCRIPT_DIR/path_safety.sh" ]] || { printf 'error: missing %s/path_safety.sh\n' "$SCRIPT_DIR" >&2; exit 1; }
# shellcheck source=deploy/path_safety.sh
source "$SCRIPT_DIR/path_safety.sh"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WEB_ROOT="/var/www/trex-webui/dist"
BACKUP_ROOT="/var/www/trex-webui/backups"
NGINX_CONF_TARGET="/etc/nginx/conf.d/trex-webui.conf"
SYSTEMD_SERVICE_TARGET="/etc/systemd/system/trex-webui-api.service"
DAEMON_SYSTEMD_SERVICE_TARGET="/etc/systemd/system/trex-daemon-server.service"
DAEMON_LOGROTATE_TARGET="/etc/logrotate.d/trex-daemon-server"
DAEMON_LIBEXEC_ROOT="${DAEMON_LIBEXEC_ROOT:-/usr/libexec/trex-webui}"
DAEMON_SUPERVISOR_TARGET="${DAEMON_SUPERVISOR_TARGET:-$DAEMON_LIBEXEC_ROOT/trex_daemon_supervisor.py}"
DAEMON_RPC_PROBE_TARGET="${DAEMON_RPC_PROBE_TARGET:-$DAEMON_LIBEXEC_ROOT/daemon_rpc_probe.py}"
DAEMON_NATIVE_BOUNDARY_TARGET="${DAEMON_NATIVE_BOUNDARY_TARGET:-$DAEMON_LIBEXEC_ROOT/trex_native_boundary.sh}"
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
RELEASE_V1_RECONCILER_BRIDGE_DROPIN_ROOT="${RELEASE_V1_RECONCILER_BRIDGE_DROPIN_ROOT:-/etc/systemd/system/trex-webui-release-reconcile.service.d}"
RELEASE_V1_RECONCILER_BRIDGE_DROPIN_TARGET="${RELEASE_V1_RECONCILER_BRIDGE_DROPIN_TARGET:-$RELEASE_V1_RECONCILER_BRIDGE_DROPIN_ROOT/trex-webui-recovery-v2-bridge.conf}"
RELEASE_V1_RETRY_BRIDGE_DROPIN_ROOT="${RELEASE_V1_RETRY_BRIDGE_DROPIN_ROOT:-/etc/systemd/system/trex-webui-release-retry.service.d}"
RELEASE_V1_RETRY_BRIDGE_DROPIN_TARGET="${RELEASE_V1_RETRY_BRIDGE_DROPIN_TARGET:-$RELEASE_V1_RETRY_BRIDGE_DROPIN_ROOT/trex-webui-recovery-v2-bridge.conf}"
RELEASE_V1_ACK_BRIDGE_DROPIN_ROOT="${RELEASE_V1_ACK_BRIDGE_DROPIN_ROOT:-/etc/systemd/system/trex-webui-release-consumer-ack.service.d}"
RELEASE_V1_ACK_BRIDGE_DROPIN_TARGET="${RELEASE_V1_ACK_BRIDGE_DROPIN_TARGET:-$RELEASE_V1_ACK_BRIDGE_DROPIN_ROOT/trex-webui-recovery-v2-bridge.conf}"
RELEASE_ROLLBACK_DAEMON_PROBE_TARGET="${RELEASE_ROLLBACK_DAEMON_PROBE_TARGET:-$DAEMON_LIBEXEC_ROOT/release_daemon_rpc_probe.py}"
RELEASE_ROLLBACK_NATIVE_BOUNDARY_TARGET="${RELEASE_ROLLBACK_NATIVE_BOUNDARY_TARGET:-$DAEMON_LIBEXEC_ROOT/release_native_boundary.sh}"
RELEASE_STATE_ROOT="${RELEASE_STATE_ROOT:-/var/lib/trex-webui-deploy}"
RELEASE_INFRASTRUCTURE_COMMON_MANIFEST="${RELEASE_INFRASTRUCTURE_COMMON_MANIFEST:-$RELEASE_STATE_ROOT/infrastructure-v2-common.json}"
RELEASE_INFRASTRUCTURE_MANAGED_MANIFEST="${RELEASE_INFRASTRUCTURE_MANAGED_MANIFEST:-$RELEASE_STATE_ROOT/infrastructure-v2-managed-local.json}"
NFTABLES_CONFIG_PATH="${NFTABLES_CONFIG_PATH:-/etc/sysconfig/nftables.conf}"
NFTABLES_SYSTEMD_DROPIN_ROOT="${NFTABLES_SYSTEMD_DROPIN_ROOT:-/etc/systemd/system/nftables.service.d}"
NFTABLES_SYSTEMD_DROPIN_TARGET="${NFTABLES_SYSTEMD_DROPIN_TARGET:-$NFTABLES_SYSTEMD_DROPIN_ROOT/trex-webui-native-boundary.conf}"
NATIVE_BOUNDARY_SNAPSHOT_ROOT="${NATIVE_BOUNDARY_SNAPSHOT_ROOT:-/run}"
PROJECT_ENV_PATH=""
SERVICE_USER="trex-webui"
SERVICE_GROUP="trex-webui"
SERVICE_STATE_ROOT="/var/lib/trex-webui"
SERVICE_STATE_PROFILE_ROOT="/var/lib/trex-webui/profiles"
SERVICE_RUNTIME_STATE_PATH="/var/lib/trex-webui/runtime-state.json"
SERVICE_CONFIG_PATH="/var/lib/trex-webui/trex_cfg.yaml"
LEGACY_TREX_CONFIG_PATH="/etc/trex_cfg.yaml"
TREX_LOG_ROOT="/var/log/trex"
TREX_CAPTURE_ROOT="/var/log/trex/captures"
TREX_REPORT_ROOT="/var/log/trex/reports"
TREX_CONFIG_VERSION_ROOT="/var/log/trex/config-versions"
TREX_DAEMON_LOG="/var/log/trex/trex_daemon_server.log"
TREX_DAEMON_SCRIPTS_DIR="${TREX_DAEMON_SCRIPTS_DIR:-/opt/trex-core/scripts}"
TREX_DAEMON_BIN="${TREX_DAEMON_BIN:-$TREX_DAEMON_SCRIPTS_DIR/trex_daemon_server}"
TREX_DAEMON_HOST="127.0.0.1"
TREX_DAEMON_PORT="8090"
DAEMON_GENERATION_PATH="/run/trex-webui/daemon-generation"
SERVICE_ENV_ROOT="/etc/trex-webui"
SERVICE_ENV_FILE="$TREX_MANAGED_API_ENV_FILE_DEFAULT"
API_PROC_ROOT="/proc"
NGINX_LOCAL_ROOT="/etc/nginx/trex-webui"
NGINX_ACCESS_ROOT="/etc/nginx/trex-webui/access.d"
NGINX_SECURITY_ROOT="/etc/nginx/trex-webui/security.d"
SERVICE_PROJECT_ROOT=""
EFFECTIVE_WEB_ROOT=""
VERSIONED_WEB_SELINUX_PATTERN='/opt/trex-webui/releases/sha256-[0-9a-f]{64}/apps/web/dist(/.*)?'

DRY_RUN=0
INSTALL_NGINX=0
RUN_BUILD=1
RUN_ENABLE=1
DEFER_CONSUMER_ENABLE=0
RUN_RESTART=1
RUN_SELINUX=0
RUN_FIREWALLD=0
INSTALL_PYTHON_DEPS=0
RUN_VERIFY=0
VERIFY_BASE_URL="http://127.0.0.1"
VERIFY_TREX=0
MANAGE_LOCAL_DAEMON=1
ALLOW_DAEMON_RUNTIME_RESTART=0
EXPECTED_DAEMON_RESTART=""
VERSIONED_RELEASE=0
API_READINESS_URL="http://127.0.0.1:8080/api/health"
API_READINESS_ATTEMPTS=40
API_READINESS_INTERVAL_SECONDS="0.5"
DAEMON_READINESS_TIMEOUT_SECONDS=20
STATIC_RELEASE_DIR=""
STATIC_ROLLBACK_DIR=""
STATIC_OLD_MOVED=0
STATIC_SWITCHED=0
STATIC_LIVE_EXISTED=0
STATE_CONFIG_TEMP=""
NGINX_CONFIG_TEMP=""
NGINX_CONFIG_BACKUP=""
NGINX_CONFIG_EXISTED=0
NGINX_CONFIG_PUBLISHED=0
SYSTEMD_CONFIG_TEMP=""
SYSTEMD_CONFIG_BACKUP=""
SYSTEMD_CONFIG_EXISTED=0
SYSTEMD_CONFIG_PUBLISHED=0
DAEMON_SYSTEMD_CONFIG_TEMP=""
DAEMON_SYSTEMD_CONFIG_BACKUP=""
DAEMON_SYSTEMD_CONFIG_EXISTED=0
DAEMON_SYSTEMD_CONFIG_PUBLISHED=0
DAEMON_LOGROTATE_CONFIG_TEMP=""
DAEMON_LOGROTATE_CONFIG_BACKUP=""
DAEMON_LOGROTATE_CONFIG_EXISTED=0
DAEMON_LOGROTATE_CONFIG_PUBLISHED=0
DAEMON_SUPERVISOR_TEMP=""
DAEMON_SUPERVISOR_BACKUP=""
DAEMON_SUPERVISOR_EXISTED=0
DAEMON_SUPERVISOR_PUBLISHED=0
DAEMON_RPC_PROBE_TEMP=""
DAEMON_RPC_PROBE_BACKUP=""
DAEMON_RPC_PROBE_EXISTED=0
DAEMON_RPC_PROBE_PUBLISHED=0
DAEMON_NATIVE_BOUNDARY_TEMP=""
DAEMON_NATIVE_BOUNDARY_BACKUP=""
DAEMON_NATIVE_BOUNDARY_EXISTED=0
DAEMON_NATIVE_BOUNDARY_PUBLISHED=0
NFTABLES_SYSTEMD_DROPIN_TEMP=""
NFTABLES_SYSTEMD_DROPIN_BACKUP=""
NFTABLES_SYSTEMD_DROPIN_EXISTED=0
NFTABLES_SYSTEMD_DROPIN_PUBLISHED=0
NFTABLES_SYSTEMD_DROPIN_ROOT_CREATED=0
NATIVE_BOUNDARY_SNAPSHOT=""
NATIVE_BOUNDARY_SNAPSHOT_CAPTURED=0
NATIVE_BOUNDARY_RUNTIME_MUTATED=0
DAEMON_LIBEXEC_ROOT_CREATED=0
DAEMON_UNIT_RESTART_REQUIRED=0
SYSTEMD_RELOAD_DONE=0
SYSTEMD_RELOAD_ATTEMPTED=0
API_RESTART_DONE=0
API_RESTART_ATTEMPTED=0
DAEMON_RESTART_DONE=0
DAEMON_RESTART_ATTEMPTED=0
NGINX_RESTART_DONE=0
NGINX_RESTART_ATTEMPTED=0
ENABLE_ATTEMPTED=0
SERVICE_STATE_CAPTURED=0
PREVIOUS_API_WAS_ACTIVE=0
PREVIOUS_DAEMON_WAS_ACTIVE=0
PREVIOUS_NGINX_WAS_ACTIVE=0
PREVIOUS_API_WAS_ENABLED=0
PREVIOUS_DAEMON_WAS_ENABLED=0
PREVIOUS_NGINX_WAS_ENABLED=0
PREVIOUS_API_EXEC_PATH=""
VENV_LIVE_PATH=""
VENV_STAGING_PATH=""
VENV_OLD_PATH=""
VENV_SERVICE_PATH=""
VENV_RUNTIME_PATH=""
VENV_RELEASE_MARKER_NAME=".trex-webui-venv-release"
VENV_RUNTIME_MARKER_NAME=".trex-webui-venv-runtime"
VENV_RUNTIME_MARKER_VALUE="trex-webui-venv-runtime-v1"
VENV_RELEASE_ID=""
VENV_LIVE_EXISTED=0
VENV_STAGED=0
VENV_SWITCHED=0
VENV_ROLLBACK_READY=1
VENV_RUNTIME_STAGED=0
VENV_RUNTIME_IN_USE=0
SERVICE_RUNTIME_AUTHORITY_CAPTURED=0
SERVICE_RUNTIME_PIN_PRESERVED=0
SERVICE_RUNTIME_DISK_EXEC=""
SERVICE_RUNTIME_LOADED_EXEC=""
SERVICE_RUNTIME_ACTIVE_EXEC=""

remove_config_artifact() {
  local path="$1"
  local label="$2"
  local parent="$3"
  [[ -n "$path" && ( -e "$path" || -L "$path" ) ]] || return 0
  trex_safe_remove_tree "$path" "$label" "$parent"
}

cleanup_install_temp() {
  local status=0
  remove_config_artifact "${STATE_CONFIG_TEMP:-}" "temporary migrated TRex config" "$SERVICE_STATE_ROOT" || status=1
  remove_config_artifact "${NGINX_CONFIG_TEMP:-}" "temporary Nginx configuration" "$(dirname -- "$NGINX_CONF_TARGET")" || status=1
  remove_config_artifact "${NGINX_CONFIG_BACKUP:-}" "Nginx configuration rollback copy" "$(dirname -- "$NGINX_CONF_TARGET")" || status=1
  remove_config_artifact "${SYSTEMD_CONFIG_TEMP:-}" "temporary systemd configuration" "$(dirname -- "$SYSTEMD_SERVICE_TARGET")" || status=1
  remove_config_artifact "${SYSTEMD_CONFIG_BACKUP:-}" "systemd configuration rollback copy" "$(dirname -- "$SYSTEMD_SERVICE_TARGET")" || status=1
  remove_config_artifact "${DAEMON_SYSTEMD_CONFIG_TEMP:-}" "temporary daemon systemd configuration" "$(dirname -- "$DAEMON_SYSTEMD_SERVICE_TARGET")" || status=1
  remove_config_artifact "${DAEMON_SYSTEMD_CONFIG_BACKUP:-}" "daemon systemd configuration rollback copy" "$(dirname -- "$DAEMON_SYSTEMD_SERVICE_TARGET")" || status=1
  remove_config_artifact "${DAEMON_LOGROTATE_CONFIG_TEMP:-}" "temporary daemon logrotate configuration" "$(dirname -- "$DAEMON_LOGROTATE_TARGET")" || status=1
  remove_config_artifact "${DAEMON_LOGROTATE_CONFIG_BACKUP:-}" "daemon logrotate configuration rollback copy" "$(dirname -- "$DAEMON_LOGROTATE_TARGET")" || status=1
  remove_config_artifact "${DAEMON_SUPERVISOR_TEMP:-}" "temporary daemon supervisor runtime" "$(dirname -- "$DAEMON_SUPERVISOR_TARGET")" || status=1
  remove_config_artifact "${DAEMON_SUPERVISOR_BACKUP:-}" "daemon supervisor runtime rollback copy" "$(dirname -- "$DAEMON_SUPERVISOR_TARGET")" || status=1
  remove_config_artifact "${DAEMON_RPC_PROBE_TEMP:-}" "temporary daemon RPC probe runtime" "$(dirname -- "$DAEMON_RPC_PROBE_TARGET")" || status=1
  remove_config_artifact "${DAEMON_RPC_PROBE_BACKUP:-}" "daemon RPC probe runtime rollback copy" "$(dirname -- "$DAEMON_RPC_PROBE_TARGET")" || status=1
  remove_config_artifact "${DAEMON_NATIVE_BOUNDARY_TEMP:-}" "temporary daemon native boundary runtime" "$(dirname -- "$DAEMON_NATIVE_BOUNDARY_TARGET")" || status=1
  remove_config_artifact "${DAEMON_NATIVE_BOUNDARY_BACKUP:-}" "daemon native boundary runtime rollback copy" "$(dirname -- "$DAEMON_NATIVE_BOUNDARY_TARGET")" || status=1
  remove_config_artifact "${NFTABLES_SYSTEMD_DROPIN_TEMP:-}" "temporary nftables integration drop-in" "$NFTABLES_SYSTEMD_DROPIN_ROOT" || status=1
  remove_config_artifact "${NFTABLES_SYSTEMD_DROPIN_BACKUP:-}" "nftables integration rollback copy" "$NFTABLES_SYSTEMD_DROPIN_ROOT" || status=1
  remove_config_artifact "${NATIVE_BOUNDARY_SNAPSHOT:-}" "native-boundary runtime snapshot" "$NATIVE_BOUNDARY_SNAPSHOT_ROOT" || status=1
  if [[ "$NFTABLES_SYSTEMD_DROPIN_ROOT_CREATED" -eq 1 ]]; then
    if [[ -e "$NFTABLES_SYSTEMD_DROPIN_TARGET" ]]; then
      NFTABLES_SYSTEMD_DROPIN_ROOT_CREATED=0
    elif rmdir -- "$NFTABLES_SYSTEMD_DROPIN_ROOT"; then
      NFTABLES_SYSTEMD_DROPIN_ROOT_CREATED=0
    elif [[ -d "$NFTABLES_SYSTEMD_DROPIN_ROOT" ]]; then
      # Preserve a concurrently introduced administrator-owned drop-in.
      NFTABLES_SYSTEMD_DROPIN_ROOT_CREATED=0
    else
      printf 'error: failed to remove new nftables drop-in root during cleanup: %s\n' \
        "$NFTABLES_SYSTEMD_DROPIN_ROOT" >&2
      status=1
    fi
  fi
  if [[ "$DAEMON_LIBEXEC_ROOT_CREATED" -eq 1 ]]; then
    if [[ -e "$DAEMON_SUPERVISOR_TARGET" || -e "$DAEMON_RPC_PROBE_TARGET" || \
      -e "$DAEMON_NATIVE_BOUNDARY_TARGET" ]]; then
      DAEMON_LIBEXEC_ROOT_CREATED=0
    elif rmdir -- "$DAEMON_LIBEXEC_ROOT"; then
      DAEMON_LIBEXEC_ROOT_CREATED=0
    else
      printf 'error: failed to remove new daemon libexec root during cleanup: %s\n' \
        "$DAEMON_LIBEXEC_ROOT" >&2
      status=1
    fi
  fi
  return "$status"
}

native_boundary_snapshot_state() {
  local header
  [[ -f "$NATIVE_BOUNDARY_SNAPSHOT" && ! -L "$NATIVE_BOUNDARY_SNAPSHOT" ]] || {
    printf 'error: native-boundary rollback snapshot is missing or unsafe: %s\n' \
      "${NATIVE_BOUNDARY_SNAPSHOT:-missing}" >&2
    return 1
  }
  header="$(head -n 1 "$NATIVE_BOUNDARY_SNAPSHOT")" || return
  case "$header" in
    '# TRex WebUI native boundary snapshot v1: absent')
      printf 'absent\n'
      ;;
    '# TRex WebUI native boundary snapshot v1: managed')
      printf 'managed\n'
      ;;
    *)
      printf 'error: native-boundary rollback snapshot has an invalid authority header\n' >&2
      return 1
      ;;
  esac
}

daemon_is_stopped_without_native_listeners() {
  local active_state listeners
  active_state="$(
    systemctl show trex-daemon-server.service --property=ActiveState --value
  )" || {
    printf 'error: unable to prove the restored TRex daemon is stopped\n' >&2
    return 1
  }
  case "$active_state" in
    inactive|failed)
      ;;
    *)
      printf 'error: restored TRex daemon state is %s, not safely stopped\n' \
        "${active_state:-unknown}" >&2
      return 1
      ;;
  esac

  command -v ss >/dev/null 2>&1 || {
    printf 'error: ss is required to prove native TRex listeners are absent\n' >&2
    return 1
  }
  listeners="$(ss -H -ltn)" || {
    printf 'error: unable to inspect native TRex listeners during rollback\n' >&2
    return 1
  }
  if awk '$4 ~ /:(4500|4501|4507)$/ { found = 1 } END { exit found ? 0 : 1 }' \
    <<<"$listeners"; then
    printf 'error: native TRex listener remains after daemon rollback; retaining the managed reject boundary\n' >&2
    return 1
  fi
}

restore_native_boundary_snapshot() {
  local snapshot_state
  [[ "$NATIVE_BOUNDARY_SNAPSHOT_CAPTURED" -eq 1 && \
    "$NATIVE_BOUNDARY_RUNTIME_MUTATED" -eq 1 ]] || return 0
  snapshot_state="$(native_boundary_snapshot_state)" || return
  if [[ "$snapshot_state" == "absent" ]] && \
    ! daemon_is_stopped_without_native_listeners; then
    printf 'error: refusing to restore a previously absent native-port boundary while daemon process state is unsafe; the managed reject table remains fail-closed\n' >&2
    return 1
  fi
  log "Restoring the exact pre-deployment native-port boundary"
  "$PROJECT_ROOT/deploy/trex_native_boundary.sh" restore "$NATIVE_BOUNDARY_SNAPSHOT" || return
  NATIVE_BOUNDARY_RUNTIME_MUTATED=0
}

restore_config_target() {
  local target="$1"
  local label="$2"
  local backup_name="$3"
  local existed_name="$4"
  local published_name="$5"
  local -n backup_ref="$backup_name"
  local -n existed_ref="$existed_name"
  local -n published_ref="$published_name"
  [[ "$published_ref" -eq 1 ]] || return 0

  if [[ "$existed_ref" -eq 1 ]]; then
    [[ -f "$backup_ref" && ! -L "$backup_ref" ]] || {
      printf 'error: %s rollback copy is missing or unsafe: %s\n' "$label" "$backup_ref" >&2
      return 1
    }
    mv -f -- "$backup_ref" "$target"
    backup_ref=""
  elif [[ -e "$target" || -L "$target" ]]; then
    trex_safe_remove_tree "$target" "new $label rollback target" "$(dirname -- "$target")"
  fi
  published_ref=0
}

rollback_configs() {
  local status=0 nginx_restored=1 systemd_restored=1 daemon_systemd_restored=1
  local nftables_dropin_restored=1 daemon_runtime_restored=1 systemd_reloaded=1
  local native_snapshot_state="" retain_managed_native_authority=0
  if [[ "$NATIVE_BOUNDARY_SNAPSHOT_CAPTURED" -eq 1 && \
    "$NATIVE_BOUNDARY_RUNTIME_MUTATED" -eq 1 ]]; then
    # Once the live native boundary has changed, keep the new unit, launcher,
    # helper, and nftables drop-in until the failed transaction is fully
    # retired. Restoring those files before the final ruleset restore would
    # make a restore failure only temporarily safe: the current kernel table
    # could disappear on the next daemon/nftables reload or reboot.
    retain_managed_native_authority=1
    if ! native_snapshot_state="$(native_boundary_snapshot_state)"; then
      # Unknown snapshot authority cannot justify deleting the only durable
      # files that recreate the reject table after reload or reboot.
      status=1
    fi
  fi
  if [[ "$NGINX_CONFIG_PUBLISHED" -eq 1 || "$SYSTEMD_CONFIG_PUBLISHED" -eq 1 || \
    "$DAEMON_SYSTEMD_CONFIG_PUBLISHED" -eq 1 || "$DAEMON_LOGROTATE_CONFIG_PUBLISHED" -eq 1 || \
    "$DAEMON_SUPERVISOR_PUBLISHED" -eq 1 || "$DAEMON_RPC_PROBE_PUBLISHED" -eq 1 || \
    "$DAEMON_NATIVE_BOUNDARY_PUBLISHED" -eq 1 || \
    "$NFTABLES_SYSTEMD_DROPIN_PUBLISHED" -eq 1 ]]; then
    log "Restoring configuration files after failed deployment"
  fi
  restore_config_target "$NGINX_CONF_TARGET" "Nginx configuration" \
    NGINX_CONFIG_BACKUP NGINX_CONFIG_EXISTED NGINX_CONFIG_PUBLISHED || {
      status=1
      nginx_restored=0
    }
  restore_config_target "$SYSTEMD_SERVICE_TARGET" "systemd service" \
    SYSTEMD_CONFIG_BACKUP SYSTEMD_CONFIG_EXISTED SYSTEMD_CONFIG_PUBLISHED || {
      status=1
      systemd_restored=0
    }
  if [[ "$retain_managed_native_authority" -eq 1 ]]; then
    log "Retaining the managed daemon unit and native-boundary runtime after rollback so a failed or later boundary restore cannot expose native listeners after nftables reload or reboot"
  else
    restore_config_target "$DAEMON_SYSTEMD_SERVICE_TARGET" "daemon systemd service" \
      DAEMON_SYSTEMD_CONFIG_BACKUP DAEMON_SYSTEMD_CONFIG_EXISTED DAEMON_SYSTEMD_CONFIG_PUBLISHED || {
        status=1
        daemon_systemd_restored=0
      }
  fi
  restore_config_target "$DAEMON_LOGROTATE_TARGET" "daemon logrotate configuration" \
    DAEMON_LOGROTATE_CONFIG_BACKUP DAEMON_LOGROTATE_CONFIG_EXISTED \
    DAEMON_LOGROTATE_CONFIG_PUBLISHED || status=1
  if [[ "$retain_managed_native_authority" -eq 0 ]]; then
    restore_config_target "$DAEMON_SUPERVISOR_TARGET" "daemon supervisor runtime" \
      DAEMON_SUPERVISOR_BACKUP DAEMON_SUPERVISOR_EXISTED DAEMON_SUPERVISOR_PUBLISHED || {
        status=1
        daemon_runtime_restored=0
      }
    restore_config_target "$DAEMON_RPC_PROBE_TARGET" "daemon RPC probe runtime" \
      DAEMON_RPC_PROBE_BACKUP DAEMON_RPC_PROBE_EXISTED DAEMON_RPC_PROBE_PUBLISHED || {
        status=1
        daemon_runtime_restored=0
      }
    restore_config_target "$DAEMON_NATIVE_BOUNDARY_TARGET" "daemon native boundary runtime" \
      DAEMON_NATIVE_BOUNDARY_BACKUP DAEMON_NATIVE_BOUNDARY_EXISTED \
      DAEMON_NATIVE_BOUNDARY_PUBLISHED || {
        status=1
        daemon_runtime_restored=0
      }
    restore_config_target "$NFTABLES_SYSTEMD_DROPIN_TARGET" "nftables integration drop-in" \
      NFTABLES_SYSTEMD_DROPIN_BACKUP NFTABLES_SYSTEMD_DROPIN_EXISTED \
      NFTABLES_SYSTEMD_DROPIN_PUBLISHED || {
        status=1
        nftables_dropin_restored=0
      }
  fi

  if [[ "$SYSTEMD_RELOAD_ATTEMPTED" -eq 1 ]]; then
    if [[ "$systemd_restored" -eq 1 && "$daemon_systemd_restored" -eq 1 && \
      "$nftables_dropin_restored" -eq 1 ]]; then
      systemctl daemon-reload || {
        status=1
        systemd_reloaded=0
      }
    else
      status=1
      systemd_reloaded=0
    fi
    SYSTEMD_RELOAD_DONE=0
    SYSTEMD_RELOAD_ATTEMPTED=0
  fi
  if [[ "$ENABLE_ATTEMPTED" -eq 1 && "$SERVICE_STATE_CAPTURED" -eq 1 && "$systemd_reloaded" -eq 1 ]]; then
    if [[ "$PREVIOUS_API_WAS_ENABLED" -eq 1 ]]; then
      systemctl enable trex-webui-api.service || status=1
    else
      systemctl disable trex-webui-api.service || status=1
    fi
    if [[ "$MANAGE_LOCAL_DAEMON" -eq 1 ]]; then
      if [[ "$PREVIOUS_DAEMON_WAS_ENABLED" -eq 1 ]]; then
        systemctl enable trex-daemon-server.service || status=1
      else
        systemctl disable trex-daemon-server.service || status=1
      fi
    fi
    if [[ "$PREVIOUS_NGINX_WAS_ENABLED" -eq 1 ]]; then
      systemctl enable nginx || status=1
    else
      systemctl disable nginx || status=1
    fi
    ENABLE_ATTEMPTED=0
  fi
  if [[ "$DAEMON_RESTART_ATTEMPTED" -eq 1 ]]; then
    if [[ "$systemd_reloaded" -eq 1 && "$daemon_systemd_restored" -eq 1 && \
      "$daemon_runtime_restored" -eq 1 ]]; then
      if [[ "$DAEMON_SYSTEMD_CONFIG_EXISTED" -eq 1 && \
        ( "$SERVICE_STATE_CAPTURED" -eq 0 || "$PREVIOUS_DAEMON_WAS_ACTIVE" -eq 1 ) ]]; then
        systemctl restart trex-daemon-server.service || status=1
      else
        systemctl stop trex-daemon-server.service || status=1
      fi
    else
      status=1
    fi
    DAEMON_RESTART_DONE=0
    DAEMON_RESTART_ATTEMPTED=0
  fi
  if [[ "$API_RESTART_ATTEMPTED" -eq 1 ]]; then
    if [[ "$VENV_ROLLBACK_READY" -ne 1 ]]; then
      printf 'error: restored API service cannot be restarted because the prior Python virtualenv was not recovered\n' >&2
      if systemctl stop trex-webui-api.service; then
        VENV_RUNTIME_IN_USE=0
      else
        status=1
      fi
      status=1
    elif [[ "$systemd_reloaded" -eq 1 ]]; then
      if [[ "$SYSTEMD_CONFIG_EXISTED" -eq 1 && \
        ( "$SERVICE_STATE_CAPTURED" -eq 0 || "$PREVIOUS_API_WAS_ACTIVE" -eq 1 ) ]]; then
        if systemctl restart trex-webui-api.service && wait_for_api_readiness; then
          if [[ -n "$PREVIOUS_API_EXEC_PATH" ]]; then
            if verify_active_service_python "$PREVIOUS_API_EXEC_PATH" "restored service"; then
              VENV_RUNTIME_IN_USE=0
            else
              status=1
            fi
          else
            VENV_RUNTIME_IN_USE=0
          fi
        else
          status=1
        fi
      else
        if systemctl stop trex-webui-api.service; then
          VENV_RUNTIME_IN_USE=0
        else
          status=1
        fi
      fi
    else
      status=1
    fi
    API_RESTART_DONE=0
    API_RESTART_ATTEMPTED=0
  fi
  if [[ "$NGINX_RESTART_ATTEMPTED" -eq 1 ]]; then
    if [[ "$nginx_restored" -eq 1 ]] && nginx -t; then
      if [[ "$SERVICE_STATE_CAPTURED" -eq 0 || "$PREVIOUS_NGINX_WAS_ACTIVE" -eq 1 ]]; then
        systemctl restart nginx || status=1
      else
        systemctl stop nginx || status=1
      fi
    else
      status=1
    fi
    NGINX_RESTART_DONE=0
    NGINX_RESTART_ATTEMPTED=0
  fi
  restore_native_boundary_snapshot || status=1
  return "$status"
}

finalize_config_target() {
  local target="$1"
  local label="$2"
  local backup_name="$3"
  local published_name="$4"
  local -n backup_ref="$backup_name"
  local -n published_ref="$published_name"
  remove_config_artifact "$backup_ref" "$label rollback copy" "$(dirname -- "$target")" || return
  backup_ref=""
  published_ref=0
}

finalize_configs() {
  local status=0
  finalize_config_target "$NGINX_CONF_TARGET" "Nginx configuration" \
    NGINX_CONFIG_BACKUP NGINX_CONFIG_PUBLISHED || status=1
  finalize_config_target "$SYSTEMD_SERVICE_TARGET" "systemd configuration" \
    SYSTEMD_CONFIG_BACKUP SYSTEMD_CONFIG_PUBLISHED || status=1
  finalize_config_target "$DAEMON_SYSTEMD_SERVICE_TARGET" "daemon systemd configuration" \
    DAEMON_SYSTEMD_CONFIG_BACKUP DAEMON_SYSTEMD_CONFIG_PUBLISHED || status=1
  finalize_config_target "$DAEMON_LOGROTATE_TARGET" "daemon logrotate configuration" \
    DAEMON_LOGROTATE_CONFIG_BACKUP DAEMON_LOGROTATE_CONFIG_PUBLISHED || status=1
  finalize_config_target "$DAEMON_SUPERVISOR_TARGET" "daemon supervisor runtime" \
    DAEMON_SUPERVISOR_BACKUP DAEMON_SUPERVISOR_PUBLISHED || status=1
  finalize_config_target "$DAEMON_RPC_PROBE_TARGET" "daemon RPC probe runtime" \
    DAEMON_RPC_PROBE_BACKUP DAEMON_RPC_PROBE_PUBLISHED || status=1
  finalize_config_target "$DAEMON_NATIVE_BOUNDARY_TARGET" "daemon native boundary runtime" \
    DAEMON_NATIVE_BOUNDARY_BACKUP DAEMON_NATIVE_BOUNDARY_PUBLISHED || status=1
  finalize_config_target "$NFTABLES_SYSTEMD_DROPIN_TARGET" "nftables integration drop-in" \
    NFTABLES_SYSTEMD_DROPIN_BACKUP NFTABLES_SYSTEMD_DROPIN_PUBLISHED || status=1
  return "$status"
}

remove_venv_artifact() {
  local path="$1"
  local label="$2"
  [[ -n "$path" && ( -e "$path" || -L "$path" ) ]] || return 0
  trex_safe_remove_tree "$path" "$label" "/opt/trex-webui"
}

venv_is_current_candidate() {
  local path="$1"
  local marker="$path/$VENV_RELEASE_MARKER_NAME"
  [[ -n "$VENV_RELEASE_ID" && -d "$path" && ! -L "$path" && -f "$marker" && ! -L "$marker" ]] || return 1
  [[ "$(<"$marker")" == "$VENV_RELEASE_ID" ]]
}

rollback_venv() {
  local status=0 rollback_path=""
  VENV_ROLLBACK_READY=1

  if venv_is_current_candidate "$VENV_LIVE_PATH"; then
    log "Restoring Python virtualenv after failed deployment"
    if [[ "$VENV_LIVE_EXISTED" -eq 1 ]]; then
      rollback_path="${VENV_OLD_PATH:-$VENV_STAGING_PATH}"
      if [[ -d "$rollback_path" && ! -L "$rollback_path" ]]; then
        if trex_atomic_exchange_directories "$VENV_LIVE_PATH" "$rollback_path"; then
          VENV_SWITCHED=0
          if venv_is_current_candidate "$rollback_path"; then
            remove_venv_artifact "$rollback_path" "failed Python virtualenv release" || status=1
          else
            printf 'error: exchanged Python virtualenv release lost its transaction marker: %s\n' "$rollback_path" >&2
            status=1
          fi
          VENV_OLD_PATH=""
        else
          VENV_ROLLBACK_READY=0
          status=1
        fi
      else
        printf 'error: Python virtualenv rollback copy is missing or unsafe: %s\n' "$rollback_path" >&2
        VENV_ROLLBACK_READY=0
        status=1
      fi
    else
      if remove_venv_artifact "$VENV_LIVE_PATH" "failed first-install Python virtualenv"; then
        VENV_SWITCHED=0
      else
        VENV_ROLLBACK_READY=0
        status=1
      fi
    fi
  elif [[ "$VENV_SWITCHED" -eq 1 ]]; then
    printf 'error: published Python virtualenv has no matching transaction marker: %s\n' "$VENV_LIVE_PATH" >&2
    VENV_ROLLBACK_READY=0
    status=1
  fi

  rollback_path="${VENV_OLD_PATH:-$VENV_STAGING_PATH}"
  if [[ -n "$rollback_path" ]] && venv_is_current_candidate "$rollback_path"; then
    remove_venv_artifact "$rollback_path" "unpublished Python virtualenv release" || status=1
    VENV_OLD_PATH=""
    VENV_STAGED=0
    VENV_STAGING_PATH=""
  elif [[ "$VENV_STAGED" -eq 1 && -n "$VENV_STAGING_PATH" && ( -e "$VENV_STAGING_PATH" || -L "$VENV_STAGING_PATH" ) ]]; then
    remove_venv_artifact "$VENV_STAGING_PATH" "partial unpublished Python virtualenv release" || status=1
    VENV_STAGED=0
    VENV_STAGING_PATH=""
  fi
  return "$status"
}

finalize_venv() {
  local status=0
  if [[ "$VENV_SWITCHED" -eq 1 && "$VENV_LIVE_EXISTED" -eq 1 && -n "$VENV_OLD_PATH" ]]; then
    remove_venv_artifact "$VENV_OLD_PATH" "completed Python virtualenv rollback tree" || status=1
    if [[ "$status" -eq 0 ]]; then
      VENV_OLD_PATH=""
    fi
  elif [[ "$VENV_STAGED" -eq 1 && -n "$VENV_STAGING_PATH" ]]; then
    remove_venv_artifact "$VENV_STAGING_PATH" "unused Python virtualenv release" || status=1
    if [[ "$status" -eq 0 ]]; then
      VENV_STAGED=0
      VENV_STAGING_PATH=""
    fi
  fi
  return "$status"
}

runtime_marker_is_trusted() {
  local path="$1"
  local name suffix release_marker managed_marker owner mode
  name="$(basename -- "$path")"
  suffix="${name#.venv.runtime-}"
  local marker="$path/$VENV_RUNTIME_MARKER_NAME"
  release_marker="$path/$VENV_RELEASE_MARKER_NAME"
  managed_marker="$path/$TREX_MANAGED_MARKER_NAME"
  [[ "$name" == .venv.runtime-* && -n "$suffix" ]] || return 1
  [[ -d "$path" && ! -L "$path" ]] || return 1
  trex_reject_mountpoint "$path" "versioned service runtime" || return 1
  owner="$(stat -c '%u:%g' "$path")" || return 1
  [[ "$owner" == "0:0" ]] || return 1
  mode="$(stat -c '%a' "$path")" || return 1
  (( (8#$mode & 8#022) == 0 )) || return 1
  [[ -f "$managed_marker" && ! -L "$managed_marker" && \
    "$(<"$managed_marker")" == "$TREX_MANAGED_MARKER_VALUE" ]] || return 1
  [[ -f "$marker" && ! -L "$marker" && \
    "$(<"$marker")" == "$VENV_RUNTIME_MARKER_VALUE" ]] || return 1
  [[ -f "$release_marker" && ! -L "$release_marker" && \
    "$(<"$release_marker")" == "trex-webui-venv-release-$suffix" ]]
}

validate_service_runtime_exec() {
  local exec_path="$1"
  local label="$2"
  local runtime_path runtime_suffix canonical_runtime

  if [[ "$exec_path" == "$PROJECT_ROOT/.venv/bin/python" ]]; then
    [[ -x "$exec_path" ]] || die "$label points to a missing or non-executable live virtualenv interpreter: $exec_path"
    return 0
  fi

  case "$exec_path" in
    "$PROJECT_ROOT"/.venv.runtime-*/bin/python)
      runtime_path="${exec_path%/bin/python}"
      runtime_suffix="${runtime_path#"$PROJECT_ROOT/.venv.runtime-"}"
      [[ "$runtime_suffix" =~ ^[0-9]{8}T[0-9]{6}Z-[1-9][0-9]*$ ]] || \
        die "$label has an invalid versioned runtime path: $exec_path"
      ;;
    *)
      die "$label points outside the supported project virtualenv paths: $exec_path"
      ;;
  esac

  canonical_runtime="$(trex_canonical_path "$runtime_path" "$label versioned runtime")" || \
    die "$label versioned runtime path is unsafe"
  [[ "$canonical_runtime" == "$runtime_path" ]] || \
    die "$label versioned runtime is not canonical: $runtime_path"
  runtime_marker_is_trusted "$runtime_path" || \
    die "$label versioned runtime is not marker-owned and trusted: $runtime_path"
  [[ -x "$exec_path" ]] || die "$label versioned runtime interpreter is not executable: $exec_path"
}

parse_loaded_exec_value() {
  local value="$1"
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

inspect_disk_service_runtime() {
  SERVICE_RUNTIME_DISK_EXEC=""
  [[ ! -e "$SYSTEMD_SERVICE_TARGET" && ! -L "$SYSTEMD_SERVICE_TARGET" ]] && return 0
  [[ -f "$SYSTEMD_SERVICE_TARGET" && ! -L "$SYSTEMD_SERVICE_TARGET" ]] || \
    die "on-disk API unit is missing or unsafe: $SYSTEMD_SERVICE_TARGET"

  local working_lines=() start_lines=() pre_lines=()
  mapfile -t working_lines < <(sed -n 's/^WorkingDirectory=//p' "$SYSTEMD_SERVICE_TARGET")
  mapfile -t start_lines < <(sed -n 's/^ExecStart=//p' "$SYSTEMD_SERVICE_TARGET")
  mapfile -t pre_lines < <(sed -n 's/^ExecStartPre=//p' "$SYSTEMD_SERVICE_TARGET")
  [[ "${#working_lines[@]}" -eq 1 && "${#start_lines[@]}" -eq 1 && "${#pre_lines[@]}" -eq 1 ]] || \
    die "on-disk API unit must have exactly one WorkingDirectory, ExecStartPre, and ExecStart"
  [[ "${working_lines[0]}" == "$PROJECT_ROOT" ]] || \
    die "on-disk trex-webui-api.service targets another project root: ${working_lines[0]}"

  SERVICE_RUNTIME_DISK_EXEC="${start_lines[0]%% *}"
  local expected_start expected_pre
  expected_start="$SERVICE_RUNTIME_DISK_EXEC -m uvicorn app.main:app --app-dir $PROJECT_ROOT/apps/api --host 127.0.0.1 --port 8080"
  expected_pre="$SERVICE_RUNTIME_DISK_EXEC -c \"import fastapi, httptools, uvicorn, uvicorn.supervisors.statreload, uvloop, watchfiles.run, websockets\""
  [[ "${start_lines[0]}" == "$expected_start" && "${pre_lines[0]}" == "$expected_pre" ]] || \
    die "on-disk API unit has an unexpected ExecStartPre/ExecStart contract for $PROJECT_ROOT"
  validate_service_runtime_exec "$SERVICE_RUNTIME_DISK_EXEC" "on-disk API unit"
}

running_service_exec_path() {
  local main_pid process_exec
  main_pid="$(systemctl show trex-webui-api.service --property=MainPID --value)" || return
  [[ "$main_pid" =~ ^[1-9][0-9]*$ && -r "/proc/$main_pid/cmdline" ]] || return 1
  IFS= read -r -d '' process_exec <"/proc/$main_pid/cmdline" || return
  printf '%s\n' "$process_exec"
}

inspect_loaded_service_runtime() {
  SERVICE_RUNTIME_LOADED_EXEC=""
  SERVICE_RUNTIME_ACTIVE_EXEC=""

  local load_state working_directory start_value pre_value start_exec start_argv pre_exec pre_argv active_state
  load_state="$(systemctl show trex-webui-api.service --property=LoadState --value)" || \
    die "unable to inspect loaded trex-webui-api.service"
  if [[ "$load_state" == "not-found" ]]; then
    return 0
  fi
  [[ "$load_state" == "loaded" ]] || \
    die "loaded trex-webui-api.service is in unsupported LoadState=$load_state"

  working_directory="$(systemctl show trex-webui-api.service --property=WorkingDirectory --value)" || \
    die "unable to inspect loaded API WorkingDirectory"
  [[ "$working_directory" == "$PROJECT_ROOT" ]] || \
    die "loaded trex-webui-api.service targets another project root: $working_directory"

  start_value="$(systemctl show trex-webui-api.service --property=ExecStart --value)" || \
    die "unable to inspect loaded API ExecStart"
  pre_value="$(systemctl show trex-webui-api.service --property=ExecStartPre --value)" || \
    die "unable to inspect loaded API ExecStartPre"
  parse_loaded_exec_value "$start_value" start_exec start_argv || \
    die "loaded API ExecStart is not parseable"
  parse_loaded_exec_value "$pre_value" pre_exec pre_argv || \
    die "loaded API ExecStartPre is not parseable"
  [[ "$start_exec" == "$pre_exec" ]] || \
    die "loaded API ExecStartPre and ExecStart use different interpreters"
  [[ "$start_argv" == "$start_exec -m uvicorn app.main:app --app-dir $PROJECT_ROOT/apps/api --host 127.0.0.1 --port 8080" ]] || \
    die "loaded API ExecStart has an unexpected command contract for $PROJECT_ROOT"
  [[ "$pre_argv" == "$pre_exec -c import fastapi, httptools, uvicorn, uvicorn.supervisors.statreload, uvloop, watchfiles.run, websockets" ]] || \
    die "loaded API ExecStartPre has an unexpected command contract for $PROJECT_ROOT"
  SERVICE_RUNTIME_LOADED_EXEC="$start_exec"
  validate_service_runtime_exec "$SERVICE_RUNTIME_LOADED_EXEC" "loaded API unit"

  active_state="$(systemctl show trex-webui-api.service --property=ActiveState --value)" || \
    die "unable to inspect loaded API ActiveState"
  case "$active_state" in
    active)
      SERVICE_RUNTIME_ACTIVE_EXEC="$(running_service_exec_path)" || \
        die "active API service has no readable MainPID interpreter"
      validate_service_runtime_exec "$SERVICE_RUNTIME_ACTIVE_EXEC" "active API MainPID"
      ;;
    inactive|failed)
      ;;
    *)
      die "trex-webui-api.service is transitioning with ActiveState=$active_state; retry after it settles"
      ;;
  esac
}

resolve_existing_service_runtime_pin() {
  [[ "$INSTALL_PYTHON_DEPS" -eq 0 ]] || return 0

  inspect_disk_service_runtime
  if [[ "$DRY_RUN" -eq 0 ]]; then
    have_cmd systemctl || die "systemctl is required to resolve the existing API runtime pin"
    inspect_loaded_service_runtime
  else
    SERVICE_RUNTIME_LOADED_EXEC=""
    SERVICE_RUNTIME_ACTIVE_EXEC=""
  fi

  local selected_exec="" source_exec
  for source_exec in \
    "$SERVICE_RUNTIME_DISK_EXEC" \
    "$SERVICE_RUNTIME_LOADED_EXEC" \
    "$SERVICE_RUNTIME_ACTIVE_EXEC"; do
    [[ -n "$source_exec" ]] || continue
    if [[ -z "$selected_exec" ]]; then
      selected_exec="$source_exec"
    elif [[ "$source_exec" != "$selected_exec" ]]; then
      die "on-disk, loaded, and active API runtime authorities conflict: $SERVICE_RUNTIME_DISK_EXEC <> $SERVICE_RUNTIME_LOADED_EXEC <> $SERVICE_RUNTIME_ACTIVE_EXEC"
    fi
  done

  if [[ -z "$selected_exec" ]]; then
    selected_exec="$VENV_LIVE_PATH/bin/python"
    validate_service_runtime_exec "$selected_exec" "fallback API runtime"
  fi
  VENV_SERVICE_PATH="${selected_exec%/bin/python}"
  SERVICE_RUNTIME_PIN_PRESERVED=0
  if [[ "$VENV_SERVICE_PATH" == "$PROJECT_ROOT"/.venv.runtime-* ]]; then
    SERVICE_RUNTIME_PIN_PRESERVED=1
    log "Preserving trusted existing API runtime pin $VENV_SERVICE_PATH"
  fi
  SERVICE_RUNTIME_AUTHORITY_CAPTURED=1
}

rollback_service_runtime() {
  [[ "$VENV_RUNTIME_STAGED" -eq 1 && -n "$VENV_RUNTIME_PATH" ]] || return 0
  if [[ "$VENV_RUNTIME_IN_USE" -eq 1 ]]; then
    printf 'error: refusing to remove versioned service runtime while the failed unit may still use it: %s\n' \
      "$VENV_RUNTIME_PATH" >&2
    return 1
  fi
  if [[ -e "$VENV_RUNTIME_PATH" || -L "$VENV_RUNTIME_PATH" ]]; then
    runtime_marker_is_trusted "$VENV_RUNTIME_PATH" || {
      printf 'error: versioned service runtime has no trusted marker: %s\n' "$VENV_RUNTIME_PATH" >&2
      return 1
    }
    remove_venv_artifact "$VENV_RUNTIME_PATH" "failed versioned service virtual environment" || return
  fi
  VENV_RUNTIME_STAGED=0
  VENV_RUNTIME_PATH=""
  VENV_SERVICE_PATH=""
}

finalize_service_runtime() {
  [[ "$INSTALL_PYTHON_DEPS" -eq 1 && -n "$VENV_RUNTIME_PATH" ]] || return 0
  runtime_marker_is_trusted "$VENV_RUNTIME_PATH" || {
    printf 'error: active versioned service runtime has no trusted marker: %s\n' "$VENV_RUNTIME_PATH" >&2
    return 1
  }
  local candidate
  local candidates=()
  while IFS= read -r -d '' candidate; do
    candidates+=("$candidate")
    if ! runtime_marker_is_trusted "$candidate"; then
      printf 'error: refusing to prune untrusted versioned runtime directory: %s\n' "$candidate" >&2
      return 1
    fi
  done < <(find -P "$PROJECT_ROOT" -mindepth 1 -maxdepth 1 -name '.venv.runtime-*' -print0)

  # Validate the complete candidate set before deleting any old runtime. This
  # makes an untrusted later entry fail with zero partial garbage collection.
  for candidate in "${candidates[@]}"; do
    [[ "$candidate" != "$VENV_RUNTIME_PATH" ]] || continue
    remove_venv_artifact "$candidate" "superseded versioned service virtual environment" || return
  done
  VENV_RUNTIME_STAGED=0
  VENV_RUNTIME_IN_USE=1
}

loaded_service_exec_path() {
  local value
  value="$(systemctl show trex-webui-api.service --property=ExecStart --value)" || return
  sed -n 's/^[^{]*{[[:space:]]*path=\([^ ;}]*\).*/\1/p' <<<"$value"
}

verify_active_service_python() {
  local expected_python="$1"
  local label="${2:-service}"
  local loaded_exec disk_exec_line disk_exec main_pid process_exec

  systemctl is-active --quiet trex-webui-api.service || {
    printf 'error: trex-webui-api.service is not active after readiness succeeded\n' >&2
    return 1
  }
  loaded_exec="$(loaded_service_exec_path)" || return
  [[ "$loaded_exec" == "$expected_python" ]] || {
    printf 'error: loaded %s runtime mismatch: expected %s, got %s\n' \
      "$label" "$expected_python" "${loaded_exec:-missing}" >&2
    return 1
  }

  disk_exec_line="$(awk -F= '$1 == "ExecStart" { print $2; exit }' "$SYSTEMD_SERVICE_TARGET")" || return
  disk_exec="${disk_exec_line%% *}"
  [[ "$disk_exec" == "$expected_python" ]] || {
    printf 'error: on-disk %s runtime mismatch: expected %s, got %s\n' \
      "$label" "$expected_python" "${disk_exec:-missing}" >&2
    return 1
  }

  main_pid="$(systemctl show trex-webui-api.service --property=MainPID --value)" || return
  [[ "$main_pid" =~ ^[1-9][0-9]*$ && -r "/proc/$main_pid/cmdline" ]] || {
    printf 'error: service MainPID is missing after readiness succeeded: %s\n' "${main_pid:-missing}" >&2
    return 1
  }
  IFS= read -r -d '' process_exec <"/proc/$main_pid/cmdline" || {
    printf 'error: unable to read service MainPID command line: %s\n' "$main_pid" >&2
    return 1
  }
  [[ "$process_exec" == "$expected_python" ]] || {
    printf 'error: running %s runtime mismatch: expected %s, got %s\n' \
      "$label" "$expected_python" "$process_exec" >&2
    return 1
  }
}

verify_active_service_runtime() {
  local runtime_path="$1"
  verify_active_service_python "$runtime_path/bin/python" "service" || return
  verify_active_managed_service_environment || return
  log "Loaded unit, on-disk unit, and MainPID all use $runtime_path"
}

verify_active_managed_service_environment() {
  [[ "$MANAGE_LOCAL_DAEMON" -eq 1 ]] || return 0
  trex_assert_managed_api_environment_file "$SERVICE_ENV_FILE" || \
    die "managed API environment file changed after preflight"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '+ inspect trex-webui-api.service MainPID /proc environment for exact managed-local TRex authority\n'
    return 0
  fi

  local main_pid authority_project_root="${SERVICE_PROJECT_ROOT:-$PROJECT_ROOT}"
  main_pid="$(systemctl show trex-webui-api.service --property=MainPID --value)" || \
    die "unable to inspect managed API MainPID environment"
  trex_assert_managed_api_process_environment \
    "$main_pid" \
    "$API_PROC_ROOT" \
    "$TREX_DAEMON_SCRIPTS_DIR" \
    "$TREX_DAEMON_BIN" \
    "$TREX_DAEMON_SCRIPTS_DIR/stl:$authority_project_root/profiles:$SERVICE_STATE_PROFILE_ROOT" || \
    die "managed API process environment is not pinned to local TRex authority"
  log "Managed API MainPID uses the exact local TRex path, connection, profile, and runtime-state authority"
}

capture_service_manager_state() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    return 0
  fi
  have_cmd systemctl || die "systemctl is required for deployment state capture"
  SERVICE_STATE_CAPTURED=1
  systemctl is-active --quiet trex-webui-api.service && PREVIOUS_API_WAS_ACTIVE=1
  if [[ "$PREVIOUS_API_WAS_ACTIVE" -eq 1 ]]; then
    PREVIOUS_API_EXEC_PATH="$(loaded_service_exec_path)" || \
      die "unable to capture the running API service executable before deployment"
    [[ -n "$PREVIOUS_API_EXEC_PATH" ]] || \
      die "running API service has no parseable ExecStart path before deployment"
  fi
  if [[ "$MANAGE_LOCAL_DAEMON" -eq 1 ]]; then
    systemctl is-active --quiet trex-daemon-server.service && PREVIOUS_DAEMON_WAS_ACTIVE=1
  fi
  systemctl is-active --quiet nginx.service && PREVIOUS_NGINX_WAS_ACTIVE=1
  systemctl is-enabled --quiet trex-webui-api.service 2>/dev/null && PREVIOUS_API_WAS_ENABLED=1
  if [[ "$MANAGE_LOCAL_DAEMON" -eq 1 ]]; then
    systemctl is-enabled --quiet trex-daemon-server.service 2>/dev/null && PREVIOUS_DAEMON_WAS_ENABLED=1
  fi
  systemctl is-enabled --quiet nginx 2>/dev/null && PREVIOUS_NGINX_WAS_ENABLED=1
  return 0
}

rollback_static_dist() {
  local rollback_path=""
  if [[ "$STATIC_SWITCHED" -eq 1 ]]; then
    log "Rolling back failed static deployment"
    if [[ "$STATIC_LIVE_EXISTED" -eq 1 ]]; then
      if [[ "$STATIC_OLD_MOVED" -eq 1 ]]; then
        [[ -d "$STATIC_ROLLBACK_DIR" && ! -L "$STATIC_ROLLBACK_DIR" ]] || {
          printf 'error: static rollback tree is missing or unsafe: %s\n' "$STATIC_ROLLBACK_DIR" >&2
          return 1
        }
        rollback_path="$STATIC_ROLLBACK_DIR"
      elif [[ -n "$STATIC_RELEASE_DIR" && -d "$STATIC_RELEASE_DIR" && ! -L "$STATIC_RELEASE_DIR" ]]; then
        rollback_path="$STATIC_RELEASE_DIR"
      else
        printf 'error: exchanged static rollback tree is missing; refusing to remove live web root: %s\n' \
          "$WEB_ROOT" >&2
        return 1
      fi
      trex_atomic_exchange_directories "$WEB_ROOT" "$rollback_path" || return
      STATIC_SWITCHED=0
      trex_safe_remove_tree "$rollback_path" "failed static release after atomic rollback" \
        "/var/www/trex-webui" || return
      if [[ "$rollback_path" == "$STATIC_ROLLBACK_DIR" ]]; then
        STATIC_OLD_MOVED=0
      fi
      if [[ "$rollback_path" == "$STATIC_RELEASE_DIR" ]]; then
        STATIC_RELEASE_DIR=""
      fi
      STATIC_LIVE_EXISTED=0
    elif [[ -e "$WEB_ROOT" || -L "$WEB_ROOT" ]]; then
      trex_safe_remove_tree "$WEB_ROOT" "failed first-install web root" "/var/www/trex-webui" || return
      STATIC_SWITCHED=0
    fi
  fi
  if [[ -n "$STATIC_RELEASE_DIR" && -d "$STATIC_RELEASE_DIR" ]]; then
    trex_safe_remove_tree "$STATIC_RELEASE_DIR" "unpublished static release" "/var/www/trex-webui" || return
    STATIC_RELEASE_DIR=""
  fi
}

finalize_static_dist() {
  if [[ "$STATIC_OLD_MOVED" -eq 1 && -d "$STATIC_ROLLBACK_DIR" ]]; then
    trex_safe_remove_tree "$STATIC_ROLLBACK_DIR" "completed static rollback tree" "/var/www/trex-webui" || return
    STATIC_OLD_MOVED=0
    STATIC_LIVE_EXISTED=0
  fi
}

install_exit() {
  local status=$?
  trap - EXIT
  set +e
  if [[ "$status" -ne 0 ]]; then
    rollback_static_dist || status=1
    rollback_venv || status=1
    rollback_configs || status=1
    rollback_service_runtime || status=1
  else
    # The release is committed once restart/readiness/verification returned
    # successfully. Everything below is garbage collection of rollback state;
    # a cleanup error must not make an archive upgrader restore old source
    # underneath the already-running new unit.
    local cleanup_status=0
    finalize_static_dist || cleanup_status=1
    finalize_configs || cleanup_status=1
    finalize_venv || cleanup_status=1
    finalize_service_runtime || cleanup_status=1
    cleanup_install_temp || cleanup_status=1
    if [[ "$cleanup_status" -ne 0 ]]; then
      printf 'warning: deployment committed, but rollback-artifact cleanup was incomplete; retain the reported artifacts for manual inspection\n' >&2
    fi
    exit 0
  fi
  cleanup_install_temp || status=1
  exit "$status"
}

trap install_exit EXIT

usage() {
  cat <<'USAGE'
Usage: deploy/install.sh [options]

Install or upgrade the single-operator TRex WebUI LAN deployment.

Options:
  --project-root PATH   Project checkout path. Default: script parent directory
  --versioned-release  Render API/Nginx against the validated /opt/trex-webui/current selector
  --web-root PATH       Nginx static dist path. Default: /var/www/trex-webui/dist
  --backup-root PATH    Static backup directory. Default: /var/www/trex-webui/backups
  --dry-run             Print commands without changing the host
  --install-nginx       Install nginx with dnf before deploying
  --install-python-deps Atomically stage and publish .venv from apps/api/requirements.lock
  --skip-build          Do not run npm run build:web
  --skip-enable         Do not enable trex-daemon-server, trex-webui-api, or nginx
  --defer-consumer-enable
                        Internal archive-upgrade mode: leave consumer boot authority unchanged until commit
  --skip-restart        Do not restart trex-daemon-server, trex-webui-api, or nginx; incompatible with --verify
  --external-daemon     Do not install, enable, restart, or verify a local daemon
  --allow-daemon-runtime-restart
                       Permit maintenance that interrupts running/reserved/unknown daemon state
  --selinux             Run restorecon and httpd_can_network_connect setup when tools exist
  --firewalld           Allow HTTP through firewalld; the managed native-port boundary is independent
  --verify              Run deploy/verify.sh after install or upgrade; requires restart
  --verify-base-url URL URL used by --verify. Default: http://127.0.0.1
  --verify-trex         Include real TRex overview check during --verify
  -h, --help            Show this help
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

run_shell() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '+ bash -lc %q\n' "$*"
    return 0
  fi
  bash -lc "$*"
}

have_cmd() {
  command -v "$1" >/dev/null 2>&1
}

sed_escape() {
  printf '%s' "$1" | sed 's/[\/&|]/\\&/g'
}

require_root_for_install() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    return
  fi
  if [[ "$(id -u)" -ne 0 ]]; then
    die "root is required; rerun with sudo or use --dry-run"
  fi
}

timestamp() {
  date -u +%Y%m%dT%H%M%SZ
}

account_id_min() {
  local key="$1"
  local fallback="$2"
  local value=""
  if [[ -r /etc/login.defs ]]; then
    value="$(awk -v key="$key" '$1 == key && $2 ~ /^[0-9]+$/ { print $2; exit }' /etc/login.defs)"
  fi
  if [[ ! "$value" =~ ^[0-9]+$ || "$value" -le 1 ]]; then
    value="$fallback"
  fi
  printf '%s\n' "$value"
}

validate_service_group() {
  local record name password gid members gid_min member
  record="$(getent group "$SERVICE_GROUP")" || die "service group $SERVICE_GROUP does not exist"
  [[ "$record" != *$'\n'* ]] || die "service group lookup returned multiple records for $SERVICE_GROUP"
  IFS=: read -r name password gid members <<<"$record"
  [[ "$name" == "$SERVICE_GROUP" && "$gid" =~ ^[0-9]+$ ]] || die "service group record is malformed: $record"
  gid_min="$(account_id_min GID_MIN 1000)"
  (( gid > 0 && gid < gid_min )) || die "service group $SERVICE_GROUP uses ordinary/root GID $gid; expected 1..$((gid_min - 1))"

  if [[ -n "$members" ]]; then
    local member_list=()
    IFS=, read -r -a member_list <<<"$members"
    for member in "${member_list[@]}"; do
      [[ "$member" == "$SERVICE_USER" ]] || die "service group $SERVICE_GROUP contains unexpected member $member"
    done
  fi
}

validate_service_identity() {
  validate_service_group
  local record name password uid gid gecos home shell uid_min expected_gid group_id
  record="$(getent passwd "$SERVICE_USER")" || die "service user $SERVICE_USER does not exist"
  [[ "$record" != *$'\n'* ]] || die "service user lookup returned multiple records for $SERVICE_USER"
  IFS=: read -r name password uid gid gecos home shell <<<"$record"
  [[ "$name" == "$SERVICE_USER" && "$uid" =~ ^[0-9]+$ && "$gid" =~ ^[0-9]+$ ]] || \
    die "service user record is malformed: $record"
  uid_min="$(account_id_min UID_MIN 1000)"
  (( uid > 0 && uid < uid_min )) || die "service user $SERVICE_USER uses ordinary/root UID $uid; expected 1..$((uid_min - 1))"
  expected_gid="$(getent group "$SERVICE_GROUP")"
  IFS=: read -r _ _ group_id _ <<<"$expected_gid"
  [[ "$gid" == "$group_id" ]] || die "service user $SERVICE_USER primary GID $gid does not match $SERVICE_GROUP GID $group_id"
  [[ "$home" == "$SERVICE_STATE_ROOT" ]] || die "service user $SERVICE_USER has unexpected home $home; expected $SERVICE_STATE_ROOT"
  [[ "$shell" == /* && "$(basename -- "$shell")" == "nologin" && -x "$shell" ]] || \
    die "service user $SERVICE_USER must use an executable nologin shell, got $shell"

  local supplementary_gids supplementary_gid
  supplementary_gids="$(id -G "$SERVICE_USER")" || die "cannot inspect groups for service user $SERVICE_USER"
  for supplementary_gid in $supplementary_gids; do
    [[ "$supplementary_gid" == "$group_id" ]] || \
      die "service user $SERVICE_USER belongs to unexpected supplemental GID $supplementary_gid"
  done
}

provision_service_identity() {
  have_cmd getent || die "getent is required to provision $SERVICE_USER"
  local group_exists=0 user_exists=0 nologin_shell
  getent group "$SERVICE_GROUP" >/dev/null 2>&1 && group_exists=1
  getent passwd "$SERVICE_USER" >/dev/null 2>&1 && user_exists=1

  if [[ "$user_exists" -eq 1 && "$group_exists" -eq 0 ]]; then
    die "service user $SERVICE_USER exists without the required dedicated group"
  fi
  if [[ "$group_exists" -eq 1 ]]; then
    validate_service_group
  elif [[ "$DRY_RUN" -eq 1 ]]; then
    have_cmd groupadd || die "groupadd is required to create $SERVICE_GROUP"
    run groupadd --system "$SERVICE_GROUP"
  else
    have_cmd groupadd || die "groupadd is required to create $SERVICE_GROUP"
    run groupadd --system "$SERVICE_GROUP"
    validate_service_group
  fi

  if [[ "$user_exists" -eq 1 ]]; then
    validate_service_identity
    return
  fi

  have_cmd useradd || die "useradd is required to create $SERVICE_USER"
  nologin_shell="$(command -v nologin || true)"
  [[ -n "$nologin_shell" && "$nologin_shell" == /* && -x "$nologin_shell" ]] || \
    die "an executable nologin shell is required to create $SERVICE_USER"
  run useradd --system --gid "$SERVICE_GROUP" --home-dir "$SERVICE_STATE_ROOT" \
    --shell "$nologin_shell" --comment "TRex WebUI service" --no-create-home "$SERVICE_USER"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '+ validate %q as a dedicated non-login system identity after creation\n' "$SERVICE_USER"
  else
    validate_service_identity
  fi
}

assert_regular_file_or_absent() {
  local path="$1"
  local label="$2"
  [[ ! -L "$path" ]] || die "$label must not be a symbolic link: $path"
  [[ ! -e "$path" || -f "$path" ]] || die "$label must be a regular file: $path"
}

provision_service_directories() {
  log "Provisioning service-owned state and log directories"
  run install -d -o "$SERVICE_USER" -g "$SERVICE_GROUP" -m 0750 "$SERVICE_STATE_ROOT" "$SERVICE_STATE_PROFILE_ROOT"
  run install -d -o root -g "$SERVICE_GROUP" -m 2750 "$TREX_LOG_ROOT"
  run install -d -o "$SERVICE_USER" -g "$SERVICE_GROUP" -m 0750 \
    "$TREX_CAPTURE_ROOT" "$TREX_REPORT_ROOT" "$TREX_CONFIG_VERSION_ROOT"
  run install -d -o root -g root -m 0750 "$SERVICE_ENV_ROOT"

  assert_regular_file_or_absent "$SERVICE_CONFIG_PATH" "service TRex configuration"
  assert_regular_file_or_absent "$LEGACY_TREX_CONFIG_PATH" "legacy TRex configuration"
  if [[ ! -e "$SERVICE_CONFIG_PATH" && -f "$LEGACY_TREX_CONFIG_PATH" ]]; then
    log "Migrating legacy TRex configuration to $SERVICE_CONFIG_PATH"
    if [[ "$DRY_RUN" -eq 1 ]]; then
      printf '+ install -o root -g %q -m 0640 %q <same-directory-temporary-file>\n' \
        "$SERVICE_GROUP" "$LEGACY_TREX_CONFIG_PATH"
      printf '+ atomically publish migrated config to %q only when it is still absent, then chown it to %q\n' \
        "$SERVICE_CONFIG_PATH" "$SERVICE_USER:$SERVICE_GROUP"
    else
      STATE_CONFIG_TEMP="$(mktemp --tmpdir="$SERVICE_STATE_ROOT" .trex_cfg.yaml.install.XXXXXXXX)"
      install -o root -g "$SERVICE_GROUP" -m 0640 "$LEGACY_TREX_CONFIG_PATH" "$STATE_CONFIG_TEMP"
      ln -- "$STATE_CONFIG_TEMP" "$SERVICE_CONFIG_PATH" || \
        die "service TRex configuration appeared during migration: $SERVICE_CONFIG_PATH"
      chown "$SERVICE_USER:$SERVICE_GROUP" "$SERVICE_CONFIG_PATH"
      remove_config_artifact "$STATE_CONFIG_TEMP" "temporary migrated TRex config" "$SERVICE_STATE_ROOT"
      STATE_CONFIG_TEMP=""
    fi
  fi
  if [[ -f "$SERVICE_CONFIG_PATH" ]]; then
    run chown "$SERVICE_USER:$SERVICE_GROUP" "$SERVICE_CONFIG_PATH"
    run chmod 0640 "$SERVICE_CONFIG_PATH"
  fi

  if [[ "$MANAGE_LOCAL_DAEMON" -eq 1 ]]; then
    assert_regular_file_or_absent "$TREX_DAEMON_LOG" "TRex daemon log"
    log "Provisioning the root-owned daemon log with API read-only group access"
    if [[ ! -e "$TREX_DAEMON_LOG" ]]; then
      run install -o root -g "$SERVICE_GROUP" -m 0640 /dev/null "$TREX_DAEMON_LOG"
    else
      run chown "root:$SERVICE_GROUP" "$TREX_DAEMON_LOG"
      run chmod 0640 "$TREX_DAEMON_LOG"
    fi
  fi

  log "Provisioning local Nginx policy include directories"
  if [[ "$DRY_RUN" -eq 0 ]]; then
    getent group nginx >/dev/null 2>&1 || die "Nginx group is missing; install nginx first or use --install-nginx"
  fi
  run install -d -o root -g nginx -m 0750 "$NGINX_LOCAL_ROOT" "$NGINX_ACCESS_ROOT" "$NGINX_SECURITY_ROOT"
}

secure_readonly_tree() {
  local tree="$1"
  local label="$2"
  if [[ "$DRY_RUN" -eq 0 ]]; then
    [[ -d "$tree" && ! -L "$tree" ]] || die "$label is missing or unsafe: $tree"
  else
    [[ ! -L "$tree" ]] || die "$label must not be a symbolic link: $tree"
  fi
  run chown -R root:root "$tree"
  run chmod -R go-w "$tree"
  run find "$tree" -type d -exec chmod a+rx '{}' +
  run find "$tree" -type f -exec chmod a+r '{}' +
  run find "$tree" -type f -perm /111 -exec chmod a+rx '{}' +
}

secure_service_read_paths() {
  [[ -n "$VENV_LIVE_PATH" ]] || VENV_LIVE_PATH="$PROJECT_ROOT/.venv"
  log "Making runtime code readable but not writable by $SERVICE_USER"
  run chown root:root "$PROJECT_ROOT" "$PROJECT_ROOT/apps" "$PROJECT_ROOT/apps/api"
  run chmod 0755 "$PROJECT_ROOT" "$PROJECT_ROOT/apps" "$PROJECT_ROOT/apps/api"
  run install -d -o root -g root -m 0755 "$PROJECT_ROOT/profiles"
  secure_readonly_tree "$PROJECT_ROOT/apps/api/app" "API application tree"
  if [[ -d "$VENV_LIVE_PATH" && ! -L "$VENV_LIVE_PATH" ]]; then
    secure_readonly_tree "$VENV_LIVE_PATH" "current Python virtual environment"
  elif [[ "$INSTALL_PYTHON_DEPS" -eq 0 && "$VENV_SERVICE_PATH" == "$VENV_LIVE_PATH" ]]; then
    die "Python virtual environment is missing or unsafe: $VENV_LIVE_PATH"
  fi
  if [[ "$VENV_STAGED" -eq 1 ]]; then
    secure_readonly_tree "$VENV_STAGING_PATH" "staged Python virtual environment"
  fi
  secure_readonly_tree "$PROJECT_ROOT/profiles" "project profile catalog"
  assert_regular_file_or_absent "$PROJECT_ENV_PATH" "project environment file"
  if [[ -f "$PROJECT_ENV_PATH" ]]; then
    run chown "root:$SERVICE_GROUP" "$PROJECT_ENV_PATH"
    run chmod 0640 "$PROJECT_ENV_PATH"
  fi
}

smoke_test_service_import() {
  local venv_path="${1:-$VENV_LIVE_PATH}"
  [[ -n "$venv_path" ]] || venv_path="$PROJECT_ROOT/.venv"
  have_cmd runuser || die "runuser is required for the non-privileged API import smoke test"
  if [[ "$MANAGE_LOCAL_DAEMON" -eq 1 ]]; then
    log "Validating app.main and the managed-local TRex SDK as $SERVICE_USER from $venv_path"
    run runuser -u "$SERVICE_USER" -- env \
      PYTHONDONTWRITEBYTECODE=1 \
      PYTHONPATH="$PROJECT_ROOT/apps/api" \
      TREX_WEBUI_TREX_HOST=127.0.0.1 \
      TREX_WEBUI_TREX_SYNC_PORT=4501 \
      TREX_WEBUI_TREX_ASYNC_PORT=4500 \
      TREX_WEBUI_TREX_SCAPY_PORT=4507 \
      TREX_WEBUI_TREX_DAEMON_PORT=8090 \
      TREX_WEBUI_DAEMON_SUPERVISOR=systemd \
      TREX_WEBUI_TREX_SCRIPTS_DIR="$TREX_DAEMON_SCRIPTS_DIR" \
      TREX_WEBUI_TREX_DAEMON_BIN="$TREX_DAEMON_BIN" \
      TREX_WEBUI_TREX_CONFIG_PATH="$SERVICE_CONFIG_PATH" \
      TREX_WEBUI_PROFILE_ROOTS="$TREX_DAEMON_SCRIPTS_DIR/stl:$PROJECT_ROOT/profiles:$SERVICE_STATE_PROFILE_ROOT" \
      TREX_WEBUI_RUNTIME_STATE_PATH="$SERVICE_RUNTIME_STATE_PATH" \
      TREX_WEBUI_DAEMON_GENERATION_PATH="$DAEMON_GENERATION_PATH" \
      "$venv_path/bin/python" -c \
      'import app.main; from app.core.settings import get_environment; from app.trex.stl_connection import default_client_class; result = default_client_class(get_environment()); assert result.ok, f"{result.blocker}: {result.error}"'
    return
  fi

  # External-daemon deployments retain operator authority over the SDK and
  # transport paths.  The installer may prove that the API imports, but must
  # not inject the managed-local systemd/path contract into this smoke test.
  log "Validating app.main as $SERVICE_USER in external-daemon mode from $venv_path"
  run runuser -u "$SERVICE_USER" -- env \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH="$PROJECT_ROOT/apps/api" \
    "$venv_path/bin/python" -c 'import app.main'
}

smoke_test_service_runtime_entrypoint() {
  local venv_path="${1:-$VENV_LIVE_PATH}"
  [[ -n "$venv_path" ]] || venv_path="$PROJECT_ROOT/.venv"
  have_cmd runuser || die "runuser is required for the non-privileged API runtime smoke test"
  log "Importing the production Uvicorn runtime as $SERVICE_USER from $venv_path"
  run runuser -u "$SERVICE_USER" -- env \
    PYTHONDONTWRITEBYTECODE=1 \
    "$venv_path/bin/python" -c \
    'import httptools; import uvicorn; import uvicorn.supervisors.statreload; import uvloop; import watchfiles.run; import websockets'
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --project-root)
        PROJECT_ROOT="${2:-}"
        [[ -n "$PROJECT_ROOT" ]] || die "--project-root requires a value"
        shift 2
        ;;
      --versioned-release)
        VERSIONED_RELEASE=1
        shift
        ;;
      --web-root)
        WEB_ROOT="${2:-}"
        [[ -n "$WEB_ROOT" ]] || die "--web-root requires a value"
        shift 2
        ;;
      --backup-root)
        BACKUP_ROOT="${2:-}"
        [[ -n "$BACKUP_ROOT" ]] || die "--backup-root requires a value"
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
      --defer-consumer-enable)
        DEFER_CONSUMER_ENABLE=1
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
      --expected-daemon-restart)
        EXPECTED_DAEMON_RESTART="${2:-}"
        [[ "$EXPECTED_DAEMON_RESTART" =~ ^[01]$ ]] || \
          die "--expected-daemon-restart requires 0 or 1"
        shift 2
        ;;
      --selinux)
        RUN_SELINUX=1
        shift
        ;;
      --firewalld)
        RUN_FIREWALLD=1
        shift
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
  if [[ "$DEFER_CONSUMER_ENABLE" -eq 1 && \
    ( "$VERSIONED_RELEASE" -ne 1 || "$RUN_ENABLE" -ne 1 ) ]]; then
    die "--defer-consumer-enable requires an enabled versioned release deployment"
  fi
}

check_layout() {
  PROJECT_ROOT="$(trex_canonical_path "$PROJECT_ROOT" "project root")" || die "unsafe project root"
  SERVICE_PROJECT_ROOT="$PROJECT_ROOT"
  EFFECTIVE_WEB_ROOT="$WEB_ROOT"
  if [[ "$VERSIONED_RELEASE" -eq 1 ]]; then
    local release_name release_layout expected_target observed_target
    release_name="$(basename -- "$PROJECT_ROOT")"
    [[ "$release_name" =~ ^sha256-[0-9a-f]{64}$ && \
      "$(basename -- "$(dirname -- "$PROJECT_ROOT")")" == "releases" ]] || \
      die "versioned release project root must be /opt/trex-webui/releases/sha256-<payload>"
    release_layout="$(dirname -- "$(dirname -- "$PROJECT_ROOT")")"
    [[ "$release_layout" == "/opt/trex-webui" ]] || \
      die "versioned release layout must be rooted at /opt/trex-webui"
    SERVICE_PROJECT_ROOT="$release_layout/current"
    EFFECTIVE_WEB_ROOT="$SERVICE_PROJECT_ROOT/apps/web/dist"
    expected_target="releases/$release_name"
    if [[ "$DRY_RUN" -eq 0 ]]; then
      [[ -L "$SERVICE_PROJECT_ROOT" ]] || die "versioned current selector is missing"
      observed_target="$(readlink -- "$SERVICE_PROJECT_ROOT")" || \
        die "unable to read versioned current selector"
      [[ "$observed_target" == "$expected_target" ]] || \
        die "versioned current selector does not select $release_name"
      [[ "$(realpath -- "$SERVICE_PROJECT_ROOT")" == "$PROJECT_ROOT" ]] || \
        die "versioned current selector resolved outside the candidate release"
    fi
  fi
  PROJECT_ENV_PATH="$(trex_canonical_path "$PROJECT_ROOT/.env" "project environment file")" || die "unsafe project environment file"
  WEB_ROOT="$(trex_canonical_path "$WEB_ROOT" "web root")" || die "unsafe web root"
  BACKUP_ROOT="$(trex_canonical_path "$BACKUP_ROOT" "static backup root")" || die "unsafe static backup root"
  NGINX_CONF_TARGET="$(trex_canonical_path "$NGINX_CONF_TARGET" "Nginx configuration target")" || die "unsafe Nginx configuration target"
  SYSTEMD_SERVICE_TARGET="$(trex_canonical_path "$SYSTEMD_SERVICE_TARGET" "systemd service target")" || die "unsafe systemd service target"
  DAEMON_SYSTEMD_SERVICE_TARGET="$(trex_canonical_path "$DAEMON_SYSTEMD_SERVICE_TARGET" "daemon systemd service target")" || die "unsafe daemon systemd service target"
  DAEMON_LOGROTATE_TARGET="$(trex_canonical_path "$DAEMON_LOGROTATE_TARGET" "daemon logrotate target")" || die "unsafe daemon logrotate target"
  DAEMON_LIBEXEC_ROOT="$(trex_canonical_path "$DAEMON_LIBEXEC_ROOT" "daemon libexec root")" || die "unsafe daemon libexec root"
  DAEMON_SUPERVISOR_TARGET="$(trex_canonical_path "$DAEMON_SUPERVISOR_TARGET" "daemon supervisor target")" || die "unsafe daemon supervisor target"
  DAEMON_RPC_PROBE_TARGET="$(trex_canonical_path "$DAEMON_RPC_PROBE_TARGET" "daemon RPC probe target")" || die "unsafe daemon RPC probe target"
  DAEMON_NATIVE_BOUNDARY_TARGET="$(trex_canonical_path "$DAEMON_NATIVE_BOUNDARY_TARGET" "daemon native boundary target")" || die "unsafe daemon native boundary target"
  RECOVERY_V2_ROOT="$(trex_canonical_path "$RECOVERY_V2_ROOT" "recovery ABI v2 root")" || die "unsafe recovery ABI v2 root"
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
  RELEASE_V1_RECONCILER_BRIDGE_DROPIN_ROOT="$(trex_canonical_path "$RELEASE_V1_RECONCILER_BRIDGE_DROPIN_ROOT" "recovery ABI v1 reconciler bridge drop-in root")" || die "unsafe recovery ABI v1 reconciler bridge drop-in root"
  RELEASE_V1_RECONCILER_BRIDGE_DROPIN_TARGET="$(trex_canonical_path "$RELEASE_V1_RECONCILER_BRIDGE_DROPIN_TARGET" "recovery ABI v1 reconciler bridge drop-in target")" || die "unsafe recovery ABI v1 reconciler bridge drop-in target"
  RELEASE_V1_RETRY_BRIDGE_DROPIN_ROOT="$(trex_canonical_path "$RELEASE_V1_RETRY_BRIDGE_DROPIN_ROOT" "recovery ABI v1 retry bridge drop-in root")" || die "unsafe recovery ABI v1 retry bridge drop-in root"
  RELEASE_V1_RETRY_BRIDGE_DROPIN_TARGET="$(trex_canonical_path "$RELEASE_V1_RETRY_BRIDGE_DROPIN_TARGET" "recovery ABI v1 retry bridge drop-in target")" || die "unsafe recovery ABI v1 retry bridge drop-in target"
  RELEASE_V1_ACK_BRIDGE_DROPIN_ROOT="$(trex_canonical_path "$RELEASE_V1_ACK_BRIDGE_DROPIN_ROOT" "recovery ABI v1 acknowledgement bridge drop-in root")" || die "unsafe recovery ABI v1 acknowledgement bridge drop-in root"
  RELEASE_V1_ACK_BRIDGE_DROPIN_TARGET="$(trex_canonical_path "$RELEASE_V1_ACK_BRIDGE_DROPIN_TARGET" "recovery ABI v1 acknowledgement bridge drop-in target")" || die "unsafe recovery ABI v1 acknowledgement bridge drop-in target"
  RELEASE_ROLLBACK_DAEMON_PROBE_TARGET="$(trex_canonical_path "$RELEASE_ROLLBACK_DAEMON_PROBE_TARGET" "stable rollback daemon probe target")" || die "unsafe stable rollback daemon probe target"
  RELEASE_ROLLBACK_NATIVE_BOUNDARY_TARGET="$(trex_canonical_path "$RELEASE_ROLLBACK_NATIVE_BOUNDARY_TARGET" "stable rollback native boundary target")" || die "unsafe stable rollback native boundary target"
  RELEASE_STATE_ROOT="$(trex_canonical_path "$RELEASE_STATE_ROOT" "release infrastructure state root")" || die "unsafe release infrastructure state root"
  RELEASE_INFRASTRUCTURE_COMMON_MANIFEST="$(trex_canonical_path "$RELEASE_INFRASTRUCTURE_COMMON_MANIFEST" "common release infrastructure manifest")" || die "unsafe common release infrastructure manifest"
  RELEASE_INFRASTRUCTURE_MANAGED_MANIFEST="$(trex_canonical_path "$RELEASE_INFRASTRUCTURE_MANAGED_MANIFEST" "managed release infrastructure manifest")" || die "unsafe managed release infrastructure manifest"
  NFTABLES_CONFIG_PATH="$(trex_canonical_path "$NFTABLES_CONFIG_PATH" "nftables service configuration")" || die "unsafe nftables service configuration"
  NFTABLES_SYSTEMD_DROPIN_ROOT="$(trex_canonical_path "$NFTABLES_SYSTEMD_DROPIN_ROOT" "nftables systemd drop-in root")" || die "unsafe nftables systemd drop-in root"
  NFTABLES_SYSTEMD_DROPIN_TARGET="$(trex_canonical_path "$NFTABLES_SYSTEMD_DROPIN_TARGET" "nftables systemd drop-in target")" || die "unsafe nftables systemd drop-in target"
  NATIVE_BOUNDARY_SNAPSHOT_ROOT="$(trex_canonical_path "$NATIVE_BOUNDARY_SNAPSHOT_ROOT" "native-boundary snapshot root")" || die "unsafe native-boundary snapshot root"
  SERVICE_STATE_ROOT="$(trex_canonical_path "$SERVICE_STATE_ROOT" "service state root")" || die "unsafe service state root"
  SERVICE_STATE_PROFILE_ROOT="$(trex_canonical_path "$SERVICE_STATE_PROFILE_ROOT" "service profile root")" || die "unsafe service profile root"
  SERVICE_CONFIG_PATH="$(trex_canonical_path "$SERVICE_CONFIG_PATH" "service TRex config")" || die "unsafe service TRex config"
  LEGACY_TREX_CONFIG_PATH="$(trex_canonical_path "$LEGACY_TREX_CONFIG_PATH" "legacy TRex config")" || die "unsafe legacy TRex config"
  TREX_LOG_ROOT="$(trex_canonical_path "$TREX_LOG_ROOT" "TRex log root")" || die "unsafe TRex log root"
  TREX_CAPTURE_ROOT="$(trex_canonical_path "$TREX_CAPTURE_ROOT" "capture root")" || die "unsafe capture root"
  TREX_REPORT_ROOT="$(trex_canonical_path "$TREX_REPORT_ROOT" "report root")" || die "unsafe report root"
  TREX_CONFIG_VERSION_ROOT="$(trex_canonical_path "$TREX_CONFIG_VERSION_ROOT" "config version root")" || die "unsafe config version root"
  TREX_DAEMON_LOG="$(trex_canonical_path "$TREX_DAEMON_LOG" "TRex daemon log")" || die "unsafe TRex daemon log"
  TREX_DAEMON_SCRIPTS_DIR="$(trex_canonical_path "$TREX_DAEMON_SCRIPTS_DIR" "TRex daemon scripts directory")" || die "unsafe TRex daemon scripts directory"
  TREX_DAEMON_BIN="$(trex_canonical_path "$TREX_DAEMON_BIN" "TRex daemon executable")" || die "unsafe TRex daemon executable"
  SERVICE_ENV_ROOT="$(trex_canonical_path "$SERVICE_ENV_ROOT" "service environment root")" || die "unsafe service environment root"
  SERVICE_ENV_FILE="$(trex_canonical_path "$SERVICE_ENV_FILE" "service environment file")" || die "unsafe service environment file"
  NGINX_LOCAL_ROOT="$(trex_canonical_path "$NGINX_LOCAL_ROOT" "Nginx local policy root")" || die "unsafe Nginx local policy root"
  NGINX_ACCESS_ROOT="$(trex_canonical_path "$NGINX_ACCESS_ROOT" "Nginx access policy root")" || die "unsafe Nginx access policy root"
  NGINX_SECURITY_ROOT="$(trex_canonical_path "$NGINX_SECURITY_ROOT" "Nginx security policy root")" || die "unsafe Nginx security policy root"

  local api_app_root project_profile_root
  api_app_root="$(trex_canonical_path "$PROJECT_ROOT/apps/api/app" "API application tree")" || die "unsafe API application tree"
  VENV_LIVE_PATH="$(trex_canonical_path "$PROJECT_ROOT/.venv" "Python virtual environment")" || die "unsafe Python virtual environment"
  VENV_SERVICE_PATH="$VENV_LIVE_PATH"
  project_profile_root="$(trex_canonical_path "$PROJECT_ROOT/profiles" "project profile catalog")" || die "unsafe project profile catalog"
  trex_path_is_within "$api_app_root" "$PROJECT_ROOT" || die "API application tree escaped the project root"
  trex_path_is_within "$VENV_LIVE_PATH" "$PROJECT_ROOT" || die "Python virtual environment escaped the project root"
  trex_path_is_within "$project_profile_root" "$PROJECT_ROOT" || die "project profile catalog escaped the project root"
  trex_path_is_within "$PROJECT_ENV_PATH" "$PROJECT_ROOT" || die "project environment file escaped the project root"

  trex_path_is_within "$SERVICE_STATE_PROFILE_ROOT" "$SERVICE_STATE_ROOT" || die "service profile root escaped the service state root"
  trex_path_is_within "$SERVICE_CONFIG_PATH" "$SERVICE_STATE_ROOT" || die "service config escaped the service state root"
  trex_path_is_within "$TREX_CAPTURE_ROOT" "$TREX_LOG_ROOT" || die "capture root escaped the TRex log root"
  trex_path_is_within "$TREX_REPORT_ROOT" "$TREX_LOG_ROOT" || die "report root escaped the TRex log root"
  trex_path_is_within "$TREX_CONFIG_VERSION_ROOT" "$TREX_LOG_ROOT" || die "config version root escaped the TRex log root"
  trex_path_is_within "$TREX_DAEMON_LOG" "$TREX_LOG_ROOT" || die "daemon log escaped the TRex log root"
  trex_path_is_within "$TREX_DAEMON_BIN" "$TREX_DAEMON_SCRIPTS_DIR" || die "daemon executable escaped its scripts directory"
  if [[ "$MANAGE_LOCAL_DAEMON" -eq 1 ]]; then
    trex_assert_software_path \
      "$TREX_DAEMON_SCRIPTS_DIR" \
      "TRex daemon scripts directory" || die "unsafe TRex daemon scripts directory"
    trex_assert_software_path \
      "$TREX_DAEMON_BIN" \
      "TRex daemon executable" || die "unsafe TRex daemon executable"
    trex_assert_disjoint_paths \
      "$TREX_DAEMON_SCRIPTS_DIR" "TRex daemon scripts directory" \
      "$PROJECT_ROOT" "project root" || die "overlapping TRex daemon scripts path"
    trex_assert_disjoint_paths \
      "$TREX_DAEMON_SCRIPTS_DIR" "TRex daemon scripts directory" \
      "$WEB_ROOT" "web root" || die "overlapping TRex daemon scripts path"
    trex_assert_disjoint_paths \
      "$TREX_DAEMON_SCRIPTS_DIR" "TRex daemon scripts directory" \
      "$BACKUP_ROOT" "static backup root" || die "overlapping TRex daemon scripts path"
    trex_assert_disjoint_paths \
      "$TREX_DAEMON_SCRIPTS_DIR" "TRex daemon scripts directory" \
      "$SERVICE_STATE_ROOT" "service state root" || die "overlapping TRex daemon scripts path"
    trex_assert_disjoint_paths \
      "$TREX_DAEMON_SCRIPTS_DIR" "TRex daemon scripts directory" \
      "$TREX_LOG_ROOT" "TRex log root" || die "overlapping TRex daemon scripts path"
    trex_assert_disjoint_paths \
      "$TREX_DAEMON_SCRIPTS_DIR" "TRex daemon scripts directory" \
      "$DAEMON_LIBEXEC_ROOT" "daemon libexec root" || die "overlapping TRex daemon scripts path"
  fi
  trex_path_is_within "$DAEMON_SUPERVISOR_TARGET" "$DAEMON_LIBEXEC_ROOT" || die "daemon supervisor target escaped its libexec root"
  trex_path_is_within "$DAEMON_RPC_PROBE_TARGET" "$DAEMON_LIBEXEC_ROOT" || die "daemon RPC probe target escaped its libexec root"
  trex_path_is_within "$DAEMON_NATIVE_BOUNDARY_TARGET" "$DAEMON_LIBEXEC_ROOT" || die "daemon native boundary target escaped its libexec root"
  trex_path_is_within "$RECOVERY_V2_ROOT" "$DAEMON_LIBEXEC_ROOT" || \
    die "recovery ABI v2 root escaped its libexec root"
  trex_path_is_within "$RELEASE_RECONCILER_TARGET" "$RECOVERY_V2_ROOT" || \
    die "release reconciler target escaped the recovery ABI v2 root"
  trex_path_is_within "$RELEASE_BOOTSTRAP_TARGET" "$RECOVERY_V2_ROOT" || \
    die "release infrastructure bootstrap target escaped the recovery ABI v2 root"
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
  trex_path_is_within "$NFTABLES_SYSTEMD_DROPIN_TARGET" "$NFTABLES_SYSTEMD_DROPIN_ROOT" || die "nftables systemd drop-in escaped its root"
  trex_path_is_within "$SERVICE_ENV_FILE" "$SERVICE_ENV_ROOT" || die "service environment file escaped its root"
  trex_path_is_within "$NGINX_ACCESS_ROOT" "$NGINX_LOCAL_ROOT" || die "Nginx access root escaped its policy root"
  trex_path_is_within "$NGINX_SECURITY_ROOT" "$NGINX_LOCAL_ROOT" || die "Nginx security root escaped its policy root"

  trex_assert_managed_path "$WEB_ROOT" "web root" "/var/www/trex-webui" || die "unsafe web root"
  trex_assert_managed_path "$BACKUP_ROOT" "static backup root" "/var/www/trex-webui" || die "unsafe static backup root"
  trex_assert_managed_path "$VENV_LIVE_PATH" "Python virtual environment" "/opt/trex-webui" || die "unsafe Python virtual environment"
  trex_assert_managed_path "$DAEMON_LIBEXEC_ROOT" "daemon libexec root" "/usr/libexec/trex-webui" || die "unsafe daemon libexec root"
  trex_assert_managed_path "$RECOVERY_V2_ROOT" "recovery ABI v2 root" "/usr/libexec/trex-webui" || die "unsafe recovery ABI v2 root"
  trex_assert_managed_path "$NFTABLES_SYSTEMD_DROPIN_ROOT" "nftables systemd drop-in root" "/etc/systemd/system" || die "unsafe nftables systemd drop-in root"
  trex_assert_managed_path \
    "$RELEASE_RECONCILER_NGINX_DROPIN_ROOT" \
    "release reconciler Nginx drop-in root" \
    "/etc/systemd/system" || die "unsafe release reconciler Nginx drop-in root"
  trex_path_is_within "$RELEASE_RECONCILER_API_DROPIN_TARGET" "$RELEASE_RECONCILER_API_DROPIN_ROOT" || \
    die "release reconciler API drop-in escaped its root"
  trex_assert_managed_path "$RELEASE_RECONCILER_API_DROPIN_ROOT" \
    "release reconciler API drop-in root" "/etc/systemd/system" || \
    die "unsafe release reconciler API drop-in root"
  trex_path_is_within "$RELEASE_RECONCILER_DAEMON_DROPIN_TARGET" "$RELEASE_RECONCILER_DAEMON_DROPIN_ROOT" || \
    die "release reconciler daemon drop-in escaped its root"
  trex_assert_managed_path "$RELEASE_RECONCILER_DAEMON_DROPIN_ROOT" \
    "release reconciler daemon drop-in root" "/etc/systemd/system" || \
    die "unsafe release reconciler daemon drop-in root"
  trex_path_is_within \
    "$RELEASE_V1_RECONCILER_BRIDGE_DROPIN_TARGET" \
    "$RELEASE_V1_RECONCILER_BRIDGE_DROPIN_ROOT" || \
    die "recovery ABI v1 reconciler bridge drop-in escaped its root"
  trex_assert_managed_path "$RELEASE_V1_RECONCILER_BRIDGE_DROPIN_ROOT" \
    "recovery ABI v1 reconciler bridge drop-in root" "/etc/systemd/system" || \
    die "unsafe recovery ABI v1 reconciler bridge drop-in root"
  trex_path_is_within \
    "$RELEASE_V1_RETRY_BRIDGE_DROPIN_TARGET" \
    "$RELEASE_V1_RETRY_BRIDGE_DROPIN_ROOT" || \
    die "recovery ABI v1 retry bridge drop-in escaped its root"
  trex_assert_managed_path "$RELEASE_V1_RETRY_BRIDGE_DROPIN_ROOT" \
    "recovery ABI v1 retry bridge drop-in root" "/etc/systemd/system" || \
    die "unsafe recovery ABI v1 retry bridge drop-in root"
  trex_path_is_within \
    "$RELEASE_V1_ACK_BRIDGE_DROPIN_TARGET" \
    "$RELEASE_V1_ACK_BRIDGE_DROPIN_ROOT" || \
    die "recovery ABI v1 acknowledgement bridge drop-in escaped its root"
  trex_assert_managed_path "$RELEASE_V1_ACK_BRIDGE_DROPIN_ROOT" \
    "recovery ABI v1 acknowledgement bridge drop-in root" "/etc/systemd/system" || \
    die "unsafe recovery ABI v1 acknowledgement bridge drop-in root"
  trex_path_is_within "$RELEASE_INFRASTRUCTURE_COMMON_MANIFEST" "$RELEASE_STATE_ROOT" || \
    die "common release infrastructure manifest escaped its state root"
  trex_path_is_within "$RELEASE_INFRASTRUCTURE_MANAGED_MANIFEST" "$RELEASE_STATE_ROOT" || \
    die "managed release infrastructure manifest escaped its state root"
  trex_assert_disjoint_paths "$PROJECT_ROOT" "project root" "$WEB_ROOT" "web root" || die "overlapping deployment paths"
  trex_assert_disjoint_paths "$PROJECT_ROOT" "project root" "$BACKUP_ROOT" "static backup root" || die "overlapping deployment paths"
  trex_assert_disjoint_paths "$WEB_ROOT" "web root" "$BACKUP_ROOT" "static backup root" || die "overlapping deployment paths"
  trex_assert_disjoint_paths "$PROJECT_ROOT" "project root" "$SERVICE_STATE_ROOT" "service state root" || die "overlapping deployment paths"
  trex_assert_disjoint_paths "$PROJECT_ROOT" "project root" "$TREX_LOG_ROOT" "TRex log root" || die "overlapping deployment paths"
  trex_assert_disjoint_paths "$WEB_ROOT" "web root" "$SERVICE_STATE_ROOT" "service state root" || die "overlapping deployment paths"
  trex_assert_disjoint_paths "$WEB_ROOT" "web root" "$TREX_LOG_ROOT" "TRex log root" || die "overlapping deployment paths"
  trex_assert_disjoint_paths "$BACKUP_ROOT" "static backup root" "$SERVICE_STATE_ROOT" "service state root" || die "overlapping deployment paths"
  trex_assert_disjoint_paths "$BACKUP_ROOT" "static backup root" "$TREX_LOG_ROOT" "TRex log root" || die "overlapping deployment paths"

  [[ -d "$PROJECT_ROOT" ]] || die "project root not found: $PROJECT_ROOT"
  [[ ! -e "$WEB_ROOT" || -d "$WEB_ROOT" ]] || die "web root is not a directory: $WEB_ROOT"
  [[ ! -e "$BACKUP_ROOT" || -d "$BACKUP_ROOT" ]] || die "static backup root is not a directory: $BACKUP_ROOT"
  [[ -f "$PROJECT_ROOT/package.json" ]] || die "missing package.json under $PROJECT_ROOT"
  [[ -f "$PROJECT_ROOT/apps/api/requirements.txt" ]] || die "missing apps/api/requirements.txt under $PROJECT_ROOT"
  [[ -f "$PROJECT_ROOT/apps/api/requirements.lock" ]] || die "missing apps/api/requirements.lock under $PROJECT_ROOT"
  [[ -d "$PROJECT_ROOT/apps/api/app" ]] || die "missing API application tree under $PROJECT_ROOT"
  assert_regular_file_or_absent "$PROJECT_ENV_PATH" "project environment file"
  [[ -f "$PROJECT_ROOT/deploy/nginx/trex-webui.conf" ]] || die "missing deploy/nginx/trex-webui.conf"
  [[ -f "$PROJECT_ROOT/deploy/systemd/trex-webui-api.service" ]] || die "missing deploy/systemd/trex-webui-api.service"
  if [[ "$VERSIONED_RELEASE" -eq 1 ]]; then
    [[ "$DAEMON_LIBEXEC_ROOT" == "/usr/libexec/trex-webui" && \
      "$RECOVERY_V2_ROOT" == "/usr/libexec/trex-webui/recovery-v2" && \
      "$RELEASE_STATE_ROOT" == "/var/lib/trex-webui-deploy" && \
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
      "$RELEASE_V1_RECONCILER_BRIDGE_DROPIN_ROOT" == "/etc/systemd/system/trex-webui-release-reconcile.service.d" && \
      "$RELEASE_V1_RECONCILER_BRIDGE_DROPIN_TARGET" == "/etc/systemd/system/trex-webui-release-reconcile.service.d/trex-webui-recovery-v2-bridge.conf" && \
      "$RELEASE_V1_RETRY_BRIDGE_DROPIN_ROOT" == "/etc/systemd/system/trex-webui-release-retry.service.d" && \
      "$RELEASE_V1_RETRY_BRIDGE_DROPIN_TARGET" == "/etc/systemd/system/trex-webui-release-retry.service.d/trex-webui-recovery-v2-bridge.conf" && \
      "$RELEASE_V1_ACK_BRIDGE_DROPIN_ROOT" == "/etc/systemd/system/trex-webui-release-consumer-ack.service.d" && \
      "$RELEASE_V1_ACK_BRIDGE_DROPIN_TARGET" == "/etc/systemd/system/trex-webui-release-consumer-ack.service.d/trex-webui-recovery-v2-bridge.conf" && \
      "$RELEASE_INFRASTRUCTURE_COMMON_MANIFEST" == "/var/lib/trex-webui-deploy/infrastructure-v2-common.json" && \
      "$RELEASE_INFRASTRUCTURE_MANAGED_MANIFEST" == "/var/lib/trex-webui-deploy/infrastructure-v2-managed-local.json" ]] || \
      die "versioned release requires the exact fixed release infrastructure targets"
    [[ -x "$PROJECT_ROOT/deploy/bootstrap_release_infrastructure.py" ]] || \
      die "missing executable release infrastructure bootstrap"
    [[ -x "$PROJECT_ROOT/deploy/trex_overview_contract.py" ]] || \
      die "missing executable strict TRex overview validator"
    [[ -x "$PROJECT_ROOT/deploy/trex_persisted_state_contract.py" ]] || \
      die "missing executable persisted state validator"
    [[ -f "$PROJECT_ROOT/deploy/systemd/trex-webui-release-reconcile-v2.service" ]] || \
      die "missing recovery ABI v2 reconciler systemd unit"
    [[ -f "$PROJECT_ROOT/deploy/systemd/trex-webui-release-retry-v2.service" ]] || \
      die "missing recovery ABI v2 retry systemd unit"
    [[ -f "$PROJECT_ROOT/deploy/systemd/trex-webui-release-consumer-ack-v2.service" ]] || \
      die "missing recovery ABI v2 consumer acknowledgement systemd unit"
    [[ -f "$PROJECT_ROOT/deploy/systemd/trex-webui-release-reconcile-v2.conf" ]] || \
      die "missing recovery ABI v2 consumer dependency drop-in"
    [[ -f "$PROJECT_ROOT/deploy/systemd/trex-webui-release-reconcile-v1-bridge-v2.conf" ]] || \
      die "missing recovery ABI v1 reconciler bridge drop-in"
    [[ -f "$PROJECT_ROOT/deploy/systemd/trex-webui-release-retry-v1-bridge-v2.conf" ]] || \
      die "missing recovery ABI v1 retry bridge drop-in"
    [[ -f "$PROJECT_ROOT/deploy/systemd/trex-webui-release-consumer-ack-v1-bridge-v2.conf" ]] || \
      die "missing recovery ABI v1 acknowledgement bridge drop-in"
    [[ -x "$PROJECT_ROOT/deploy/release_transaction.py" ]] || \
      die "release transaction reconciler must be executable"
  elif [[ -e "$RELEASE_RECONCILER_NGINX_DROPIN_TARGET" || \
    -L "$RELEASE_RECONCILER_NGINX_DROPIN_TARGET" || \
    -e "$RELEASE_RECONCILER_NGINX_DROPIN_ROOT/trex-webui-release-reconcile.conf" || \
    -L "$RELEASE_RECONCILER_NGINX_DROPIN_ROOT/trex-webui-release-reconcile.conf" ]]; then
    die "legacy checkout install cannot replace a versioned deployment; use a verified archive upgrade"
  fi
  [[ "$(grep -Fxc '# @@TREX_WEBUI_DAEMON_MODE_ENV@@' "$PROJECT_ROOT/deploy/systemd/trex-webui-api.service")" -eq 1 ]] || \
    die "API systemd template must contain exactly one daemon mode marker"
  if [[ "$MANAGE_LOCAL_DAEMON" -eq 1 ]]; then
    [[ -f "$PROJECT_ROOT/deploy/systemd/trex-daemon-server.service" ]] || die "missing deploy/systemd/trex-daemon-server.service"
    [[ -f "$PROJECT_ROOT/deploy/daemon_rpc_probe.py" ]] || die "missing deploy/daemon_rpc_probe.py"
    [[ -f "$PROJECT_ROOT/deploy/trex_daemon_supervisor.py" ]] || die "missing deploy/trex_daemon_supervisor.py"
    [[ -f "$PROJECT_ROOT/deploy/trex_native_boundary.sh" ]] || die "missing deploy/trex_native_boundary.sh"
    [[ -f "$PROJECT_ROOT/deploy/systemd/nftables-trex-webui.conf" ]] || die "missing deploy/systemd/nftables-trex-webui.conf"
    [[ -x "$PROJECT_ROOT/deploy/daemon_rpc_probe.py" ]] || die "daemon RPC probe must be executable"
    [[ -x "$PROJECT_ROOT/deploy/trex_daemon_supervisor.py" ]] || die "daemon supervisor must be executable"
    [[ -x "$PROJECT_ROOT/deploy/trex_native_boundary.sh" ]] || die "daemon native boundary must be executable"
    [[ -f "$PROJECT_ROOT/deploy/logrotate/trex-daemon-server" ]] || die "missing daemon logrotate policy"
  fi
  [[ -f "$PROJECT_ROOT/deploy/verify.sh" ]] || die "missing deploy/verify.sh"
  [[ "$TREX_DAEMON_HOST" == "127.0.0.1" ]] || die "managed TRex daemon host must remain 127.0.0.1"
  [[ "$TREX_DAEMON_PORT" =~ ^[1-9][0-9]*$ && "$TREX_DAEMON_PORT" -le 65535 ]] || \
    die "managed TRex daemon port must be between 1 and 65535"
  if [[ "$DRY_RUN" -eq 0 && "$MANAGE_LOCAL_DAEMON" -eq 1 ]]; then
    [[ -d "$TREX_DAEMON_SCRIPTS_DIR" && ! -L "$TREX_DAEMON_SCRIPTS_DIR" ]] || \
      die "TRex daemon scripts directory is missing or unsafe: $TREX_DAEMON_SCRIPTS_DIR"
    [[ -f "$TREX_DAEMON_BIN" && ! -L "$TREX_DAEMON_BIN" && -x "$TREX_DAEMON_BIN" ]] || \
      die "TRex daemon executable is missing or unsafe: $TREX_DAEMON_BIN"
    trex_assert_root_controlled_tree \
      "$TREX_DAEMON_SCRIPTS_DIR" \
      "TRex daemon scripts tree" || \
      die "TRex daemon scripts tree is not safe for root execution"
    [[ -d "$NATIVE_BOUNDARY_SNAPSHOT_ROOT" && ! -L "$NATIVE_BOUNDARY_SNAPSHOT_ROOT" ]] || \
      die "native-boundary snapshot root is missing or unsafe: $NATIVE_BOUNDARY_SNAPSHOT_ROOT"
  fi
  [[ ! -L "$VENV_LIVE_PATH" ]] || die "Python virtual environment must not be a symbolic link: $VENV_LIVE_PATH"
  [[ ! -e "$VENV_LIVE_PATH" || -d "$VENV_LIVE_PATH" ]] || die "Python virtual environment is not a directory: $VENV_LIVE_PATH"
  if [[ -d "$VENV_LIVE_PATH" ]]; then
    trex_reject_mountpoint "$VENV_LIVE_PATH" "Python virtual environment" || die "unsafe Python virtual environment"
  fi
  if [[ "$INSTALL_PYTHON_DEPS" -eq 1 && "$RUN_RESTART" -eq 0 ]]; then
    die "--install-python-deps requires an API restart; remove --skip-restart"
  fi
  if [[ "$RUN_BUILD" -eq 1 ]]; then
    [[ -x "$PROJECT_ROOT/scripts/npmw" ]] || die "missing executable scripts/npmw"
    "$PROJECT_ROOT/scripts/npmw" --version >/dev/null || \
      die "web build requires Node 24 and npm 11; run scripts/bootstrap_node.sh"
  fi
}

prepare_venv_transaction() {
  [[ "$INSTALL_PYTHON_DEPS" -eq 1 ]] || return 0
  [[ -z "$VENV_STAGING_PATH" ]] || return 0

  VENV_LIVE_PATH="$(trex_canonical_path "${VENV_LIVE_PATH:-$PROJECT_ROOT/.venv}" "Python virtual environment")" || \
    die "unsafe Python virtual environment"
  trex_path_is_within "$VENV_LIVE_PATH" "$PROJECT_ROOT" || die "Python virtual environment escaped the project root"
  trex_assert_managed_path "$VENV_LIVE_PATH" "Python virtual environment" "/opt/trex-webui" || \
    die "unsafe Python virtual environment"
  [[ ! -L "$VENV_LIVE_PATH" ]] || die "Python virtual environment must not be a symbolic link: $VENV_LIVE_PATH"
  [[ ! -e "$VENV_LIVE_PATH" || -d "$VENV_LIVE_PATH" ]] || \
    die "Python virtual environment is not a directory: $VENV_LIVE_PATH"
  if [[ -d "$VENV_LIVE_PATH" ]]; then
    trex_reject_mountpoint "$VENV_LIVE_PATH" "Python virtual environment" || die "unsafe Python virtual environment"
    VENV_LIVE_EXISTED=1
  else
    VENV_LIVE_EXISTED=0
  fi

  local release_id
  release_id="$(timestamp)-$$"
  VENV_RELEASE_ID="trex-webui-venv-release-$release_id"
  VENV_STAGING_PATH="$(trex_canonical_path "$PROJECT_ROOT/.venv.release-$release_id" "staged Python virtual environment")" || \
    die "unsafe staged Python virtual environment"
  VENV_RUNTIME_PATH="$(trex_canonical_path "$PROJECT_ROOT/.venv.runtime-$release_id" "versioned service virtual environment")" || \
    die "unsafe versioned service virtual environment"
  VENV_SERVICE_PATH="$VENV_RUNTIME_PATH"
  trex_path_is_within "$VENV_STAGING_PATH" "$PROJECT_ROOT" || die "staged Python virtual environment escaped the project root"
  trex_path_is_within "$VENV_RUNTIME_PATH" "$PROJECT_ROOT" || die "versioned service virtual environment escaped the project root"
  trex_assert_managed_path "$VENV_STAGING_PATH" "staged Python virtual environment" "/opt/trex-webui" || \
    die "unsafe staged Python virtual environment"
  trex_assert_managed_path "$VENV_RUNTIME_PATH" "versioned service virtual environment" "/opt/trex-webui" || \
    die "unsafe versioned service virtual environment"
  trex_assert_disjoint_paths "$VENV_LIVE_PATH" "Python virtual environment" \
    "$VENV_STAGING_PATH" "staged Python virtual environment" || die "overlapping Python virtualenv paths"
  trex_assert_disjoint_paths "$VENV_LIVE_PATH" "Python virtual environment" \
    "$VENV_RUNTIME_PATH" "versioned service virtual environment" || die "overlapping Python virtualenv paths"
  trex_assert_disjoint_paths "$VENV_STAGING_PATH" "staged Python virtual environment" \
    "$VENV_RUNTIME_PATH" "versioned service virtual environment" || die "overlapping Python virtualenv paths"
  [[ ! -e "$VENV_STAGING_PATH" && ! -L "$VENV_STAGING_PATH" ]] || \
    die "staged Python virtual environment already exists: $VENV_STAGING_PATH"
  [[ ! -e "$VENV_RUNTIME_PATH" && ! -L "$VENV_RUNTIME_PATH" ]] || \
    die "versioned service virtual environment already exists: $VENV_RUNTIME_PATH"
}

rewrite_venv_bin_paths() {
  local tree_path="$1"
  local source_path="$2"
  local destination_path="$3"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '+ rewrite virtualenv scripts under %q from %q to %q\n' \
      "$tree_path" "$source_path" "$destination_path"
    return 0
  fi
  python3.11 - "$tree_path" "$source_path" "$destination_path" <<'PY'
from __future__ import annotations

import os
import stat
import sys


tree, source, destination = (os.fsencode(value) for value in sys.argv[1:])
bin_dir = os.path.join(tree, b"bin")
for name in os.listdir(bin_dir):
    path = os.path.join(bin_dir, name)
    metadata = os.lstat(path)
    if not stat.S_ISREG(metadata.st_mode):
        continue
    with open(path, "rb") as handle:
        content = handle.read()
    rewritten = content.replace(source, destination)
    if rewritten == content:
        continue
    temporary = path + b".trex-webui-rewrite"
    with open(temporary, "wb") as handle:
        handle.write(rewritten)
        handle.flush()
        os.fsync(handle.fileno())
    os.chmod(temporary, stat.S_IMODE(metadata.st_mode))
    os.replace(temporary, path)
PY
}

rewrite_staged_venv_paths() {
  rewrite_venv_bin_paths "$VENV_STAGING_PATH" "$VENV_STAGING_PATH" "$VENV_LIVE_PATH"
}

install_python_deps() {
  if [[ "$INSTALL_PYTHON_DEPS" -eq 0 ]]; then
    return
  fi
  have_cmd python3.11 || die "--install-python-deps requested but python3.11 was not found"
  [[ "$RUN_RESTART" -eq 1 ]] || die "--install-python-deps requires an API restart; remove --skip-restart"
  prepare_venv_transaction

  log "Staging a complete Python 3.11 API runtime at $VENV_STAGING_PATH"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '+ mkdir -m 0700 %q and write its trusted managed and release markers\n' "$VENV_STAGING_PATH"
  else
    mkdir -m 0700 -- "$VENV_STAGING_PATH"
    VENV_STAGED=1
    trex_write_managed_marker "$VENV_STAGING_PATH"
    printf '%s\n' "$VENV_RELEASE_ID" >"$VENV_STAGING_PATH/$VENV_RELEASE_MARKER_NAME"
    chmod 0644 "$VENV_STAGING_PATH/$VENV_RELEASE_MARKER_NAME"
  fi
  if [[ "$DRY_RUN" -eq 1 ]]; then
    VENV_STAGED=1
  fi
  run python3.11 -c 'import sys; assert sys.version_info[:2] == (3, 11), sys.version'
  run python3.11 -m venv "$VENV_STAGING_PATH"
  run "$VENV_STAGING_PATH/bin/python" -m pip install \
    --require-hashes \
    --only-binary=:all: \
    -r "$PROJECT_ROOT/apps/api/requirements.lock"
  run "$VENV_STAGING_PATH/bin/python" -m pip check
  rewrite_staged_venv_paths
}

stage_versioned_service_runtime() {
  if [[ "$INSTALL_PYTHON_DEPS" -eq 0 ]]; then
    [[ "$SERVICE_RUNTIME_AUTHORITY_CAPTURED" -eq 1 && -n "$VENV_SERVICE_PATH" ]] || \
      die "existing API runtime authority was not resolved before unit rendering"
    return 0
  fi
  [[ -n "$VENV_RUNTIME_PATH" && -n "$VENV_STAGING_PATH" ]] || \
    die "versioned service virtual environment was not prepared"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '+ clone immutable service runtime %q -> %q with an independent inode tree\n' \
      "$VENV_STAGING_PATH" "$VENV_RUNTIME_PATH"
    printf '+ mark and secure versioned service runtime, then validate it before unit publication\n'
    VENV_RUNTIME_STAGED=1
    return 0
  fi
  [[ ! -e "$VENV_RUNTIME_PATH" && ! -L "$VENV_RUNTIME_PATH" ]] || \
    die "versioned service virtual environment already exists: $VENV_RUNTIME_PATH"
  VENV_RUNTIME_STAGED=1
  mkdir -m 0700 "$VENV_RUNTIME_PATH"
  trex_write_managed_marker "$VENV_RUNTIME_PATH"
  printf '%s\n' "$VENV_RUNTIME_MARKER_VALUE" >"$VENV_RUNTIME_PATH/$VENV_RUNTIME_MARKER_NAME"
  chmod 0644 "$VENV_RUNTIME_PATH/$VENV_RUNTIME_MARKER_NAME"
  cp -a --reflink=auto "$VENV_STAGING_PATH/." "$VENV_RUNTIME_PATH/"
  rewrite_venv_bin_paths "$VENV_RUNTIME_PATH" "$VENV_LIVE_PATH" "$VENV_RUNTIME_PATH"
  secure_readonly_tree "$VENV_RUNTIME_PATH" "versioned service virtual environment"
}

switch_staged_venv() {
  [[ "$INSTALL_PYTHON_DEPS" -eq 1 ]] || return 0
  [[ "$VENV_STAGED" -eq 1 && -n "$VENV_STAGING_PATH" ]] || \
    die "staged Python virtual environment is not ready for publication"

  if [[ "$DRY_RUN" -eq 1 ]]; then
    if [[ "$VENV_LIVE_EXISTED" -eq 1 ]]; then
      trex_atomic_exchange_directories "$VENV_LIVE_PATH" "$VENV_STAGING_PATH"
      printf '+ retain the prior %q at %q until every restart and verification succeeds\n' \
        "$VENV_LIVE_PATH" "$VENV_STAGING_PATH"
    else
      printf '+ atomically rename first-install virtualenv %q to %q\n' "$VENV_STAGING_PATH" "$VENV_LIVE_PATH"
    fi
    printf '+ on any later failure restore the old virtualenv, or remove %q for a failed first install\n' \
      "$VENV_LIVE_PATH"
    return 0
  fi

  [[ -d "$VENV_STAGING_PATH" && ! -L "$VENV_STAGING_PATH" ]] || \
    die "staged Python virtual environment is missing or unsafe: $VENV_STAGING_PATH"
  [[ -f "$VENV_STAGING_PATH/$TREX_MANAGED_MARKER_NAME" && \
    ! -L "$VENV_STAGING_PATH/$TREX_MANAGED_MARKER_NAME" && \
    "$(<"$VENV_STAGING_PATH/$TREX_MANAGED_MARKER_NAME")" == "$TREX_MANAGED_MARKER_VALUE" ]] || \
    die "staged Python virtual environment has no trusted managed marker: $VENV_STAGING_PATH"
  venv_is_current_candidate "$VENV_STAGING_PATH" || \
    die "staged Python virtual environment has no matching release marker: $VENV_STAGING_PATH"

  log "Atomically publishing the staged Python virtualenv immediately before API restart"
  if [[ "$VENV_LIVE_EXISTED" -eq 1 ]]; then
    [[ -d "$VENV_LIVE_PATH" && ! -L "$VENV_LIVE_PATH" ]] || \
      die "current Python virtual environment disappeared before publication: $VENV_LIVE_PATH"
    trex_reject_mountpoint "$VENV_LIVE_PATH" "Python virtual environment" || die "unsafe Python virtual environment"
    VENV_OLD_PATH="$VENV_STAGING_PATH"
    if ! trex_atomic_exchange_directories "$VENV_LIVE_PATH" "$VENV_STAGING_PATH"; then
      VENV_OLD_PATH=""
      return 1
    fi
  else
    [[ ! -e "$VENV_LIVE_PATH" && ! -L "$VENV_LIVE_PATH" ]] || \
      die "Python virtual environment appeared before first-install publication: $VENV_LIVE_PATH"
    mv -- "$VENV_STAGING_PATH" "$VENV_LIVE_PATH" || return
    VENV_OLD_PATH=""
  fi
  VENV_STAGING_PATH=""
  VENV_STAGED=0
  VENV_SWITCHED=1
}

build_web() {
  if [[ "$RUN_BUILD" -eq 0 ]]; then
    log "Skipping web build"
    return
  fi
  log "Building WebUI with Node.js 24 and npm 11"
  run_shell "cd $(printf '%q' "$PROJECT_ROOT") && scripts/npmw run build:web"
}

backup_current_dist() {
  if [[ "$VERSIONED_RELEASE" -eq 1 ]]; then
    return
  fi
  if [[ ! -d "$WEB_ROOT" ]]; then
    return
  fi
  local backup_dir="$BACKUP_ROOT/dist-$(timestamp)-$$"
  log "Backing up current static dist to $backup_dir"
  run mkdir -p "$BACKUP_ROOT"
  if [[ "$DRY_RUN" -eq 0 ]]; then
    trex_write_managed_marker "$BACKUP_ROOT"
    [[ ! -e "$backup_dir" && ! -L "$backup_dir" ]] || die "static backup path already exists: $backup_dir"
  fi
  run cp -a "$WEB_ROOT" "$backup_dir"
}

sync_static_dist() {
  local source_dist="$PROJECT_ROOT/apps/web/dist"
  [[ -d "$source_dist" ]] || die "web dist not found: $source_dist; run without --skip-build first"
  trex_assert_plain_static_tree "$source_dist" "frontend production build" || \
    die "frontend production build contains unsafe entries"
  if [[ "$VERSIONED_RELEASE" -eq 1 ]]; then
    log "Using frontend assets from the atomic current release selector"
    return
  fi
  local web_parent web_name release_id
  web_parent="$(dirname -- "$WEB_ROOT")"
  web_name="$(basename -- "$WEB_ROOT")"
  release_id="$(timestamp)-$$"
  STATIC_RELEASE_DIR="$web_parent/.${web_name}.release-$release_id"
  STATIC_ROLLBACK_DIR="$web_parent/.${web_name}.rollback-$release_id"

  log "Publishing static files through a rollback-safe directory switch"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '+ install -d -o root -g root -m 0755 %q\n' "$web_parent"
    printf '+ stage static release %q/. -> %q/\n' "$source_dist" "$STATIC_RELEASE_DIR"
    printf '+ secure staged static tree as root:root with directories 0755 and files 0644\n'
    printf '+ atomically exchange current %q with staged release %q using renameat2(RENAME_EXCHANGE) when present\n' \
      "$WEB_ROOT" "$STATIC_RELEASE_DIR"
    printf '+ move exchanged prior tree %q to rollback %q without removing live root\n' \
      "$STATIC_RELEASE_DIR" "$STATIC_ROLLBACK_DIR"
    printf '+ on later failure atomically exchange %q with %q, then remove the failed release\n' \
      "$WEB_ROOT" "$STATIC_ROLLBACK_DIR"
    printf '+ on first install atomically rename release %q to %q\n' "$STATIC_RELEASE_DIR" "$WEB_ROOT"
    return
  fi

  install -d -o root -g root -m 0755 "$web_parent"
  [[ ! -e "$STATIC_RELEASE_DIR" && ! -L "$STATIC_RELEASE_DIR" ]] || die "static release path already exists: $STATIC_RELEASE_DIR"
  [[ ! -e "$STATIC_ROLLBACK_DIR" && ! -L "$STATIC_ROLLBACK_DIR" ]] || die "static rollback path already exists: $STATIC_ROLLBACK_DIR"
  mkdir "$STATIC_RELEASE_DIR"
  trex_write_managed_marker "$STATIC_RELEASE_DIR"
  cp -a --no-preserve=context "$source_dist/." "$STATIC_RELEASE_DIR/"
  trex_secure_static_tree "$STATIC_RELEASE_DIR" "staged frontend production build" || \
    die "unable to secure staged frontend production build"

  if [[ -d "$WEB_ROOT" ]]; then
    STATIC_LIVE_EXISTED=1
    trex_atomic_exchange_directories "$WEB_ROOT" "$STATIC_RELEASE_DIR" || \
      die "unable to atomically publish staged frontend production build"
    STATIC_SWITCHED=1
    mv -- "$STATIC_RELEASE_DIR" "$STATIC_ROLLBACK_DIR"
    STATIC_OLD_MOVED=1
    STATIC_RELEASE_DIR=""
  else
    mv -- "$STATIC_RELEASE_DIR" "$WEB_ROOT"
    STATIC_RELEASE_DIR=""
    STATIC_SWITCHED=1
  fi
}

render_daemon_unit() {
  local escaped_project_root escaped_daemon_scripts escaped_daemon_bin
  local escaped_supervisor_target escaped_probe_target escaped_boundary_target
  local render_project_root="${SERVICE_PROJECT_ROOT:-$PROJECT_ROOT}"
  local daemon_bin_placeholder='@@TREX_DAEMON_BIN@@'
  local supervisor_placeholder='@@TREX_DAEMON_SUPERVISOR@@'
  local probe_placeholder='@@TREX_DAEMON_RPC_PROBE@@'
  local boundary_placeholder='@@TREX_DAEMON_NATIVE_BOUNDARY@@'
  escaped_project_root="$(sed_escape "$render_project_root")"
  escaped_daemon_scripts="$(sed_escape "$TREX_DAEMON_SCRIPTS_DIR")"
  escaped_daemon_bin="$(sed_escape "$TREX_DAEMON_BIN")"
  escaped_supervisor_target="$(sed_escape "$DAEMON_SUPERVISOR_TARGET")"
  escaped_probe_target="$(sed_escape "$DAEMON_RPC_PROBE_TARGET")"
  escaped_boundary_target="$(sed_escape "$DAEMON_NATIVE_BOUNDARY_TARGET")"
  if grep -Eq "$daemon_bin_placeholder|$supervisor_placeholder|$probe_placeholder|$boundary_placeholder" \
    "$PROJECT_ROOT/deploy/systemd/trex-daemon-server.service"; then
    die "daemon systemd service template contains a reserved runtime placeholder"
  fi
  sed \
    -e "s|/opt/trex-core/scripts/trex_daemon_server|$daemon_bin_placeholder|g" \
    -e "s|/usr/libexec/trex-webui/trex_daemon_supervisor.py|$supervisor_placeholder|g" \
    -e "s|/usr/libexec/trex-webui/daemon_rpc_probe.py|$probe_placeholder|g" \
    -e "s|/usr/libexec/trex-webui/trex_native_boundary.sh|$boundary_placeholder|g" \
    -e "s|/opt/trex-core/scripts|$escaped_daemon_scripts|g" \
    -e "s|/opt/trex-webui|$escaped_project_root|g" \
    -e "s|$daemon_bin_placeholder|$escaped_daemon_bin|g" \
    -e "s|$supervisor_placeholder|$escaped_supervisor_target|g" \
    -e "s|$probe_placeholder|$escaped_probe_target|g" \
    -e "s|$boundary_placeholder|$escaped_boundary_target|g" \
    "$PROJECT_ROOT/deploy/systemd/trex-daemon-server.service" | \
    awk -v versioned_release="$VERSIONED_RELEASE" '
      versioned_release != "1" && $0 == "Requires=trex-webui-release-reconcile-v2.service" { next }
      versioned_release != "1" { gsub(/ trex-webui-release-reconcile-v2\.service/, "") }
      { print }
    '
}

render_nftables_dropin() {
  local escaped_boundary_target escaped_config_path
  local boundary_placeholder='@@TREX_DAEMON_NATIVE_BOUNDARY@@'
  local config_placeholder='@@TREX_NFTABLES_CONFIG@@'
  escaped_boundary_target="$(sed_escape "$DAEMON_NATIVE_BOUNDARY_TARGET")"
  escaped_config_path="$(sed_escape "$NFTABLES_CONFIG_PATH")"
  if grep -Eq "$boundary_placeholder|$config_placeholder" \
    "$PROJECT_ROOT/deploy/systemd/nftables-trex-webui.conf"; then
    die "nftables systemd drop-in template contains a reserved runtime placeholder"
  fi
  sed \
    -e "s|/usr/libexec/trex-webui/trex_native_boundary.sh|$boundary_placeholder|g" \
    -e "s|/etc/sysconfig/nftables.conf|$config_placeholder|g" \
    -e "s|$boundary_placeholder|$escaped_boundary_target|g" \
    -e "s|$config_placeholder|$escaped_config_path|g" \
    "$PROJECT_ROOT/deploy/systemd/nftables-trex-webui.conf"
}

preflight_managed_api_environment() {
  local allow_protected_keys=0
  [[ "$MANAGE_LOCAL_DAEMON" -eq 1 ]] || allow_protected_keys=1
  trex_assert_managed_api_environment_file "$SERVICE_ENV_FILE" "$allow_protected_keys" || \
    die "API environment file failed authority validation"
  if [[ "$DRY_RUN" -eq 1 && "$MANAGE_LOCAL_DAEMON" -eq 1 ]]; then
    printf '+ require optional %q to be root:root 0600, regular/non-symlink, and free of managed TRex authority keys\n' \
      "$SERVICE_ENV_FILE"
  fi
}

assert_local_daemon_config_authority() {
  [[ "$MANAGE_LOCAL_DAEMON" -eq 1 ]] || return 0
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '+ refuse any loaded trex-daemon-server.service outside %q and any unmarked local daemon/logrotate file\n' \
      "$DAEMON_SYSTEMD_SERVICE_TARGET"
    return 0
  fi

  local load_state fragment_path
  load_state="$(systemctl show trex-daemon-server.service --property=LoadState --value)" || \
    die "unable to inspect existing trex-daemon-server.service"
  fragment_path="$(systemctl show trex-daemon-server.service --property=FragmentPath --value)" || \
    die "unable to inspect existing trex-daemon-server.service authority"
  if [[ "$load_state" == "loaded" && "$fragment_path" != "$DAEMON_SYSTEMD_SERVICE_TARGET" ]]; then
    die "refusing to shadow unmanaged trex-daemon-server.service from ${fragment_path:-unknown}"
  fi
  if [[ -e "$DAEMON_SYSTEMD_SERVICE_TARGET" || -L "$DAEMON_SYSTEMD_SERVICE_TARGET" ]]; then
    [[ -f "$DAEMON_SYSTEMD_SERVICE_TARGET" && ! -L "$DAEMON_SYSTEMD_SERVICE_TARGET" ]] || \
      die "existing daemon unit target is not a safe regular file: $DAEMON_SYSTEMD_SERVICE_TARGET"
    grep -Fqx '# Managed by TRex WebUI deploy/install.sh.' "$DAEMON_SYSTEMD_SERVICE_TARGET" || \
      die "refusing to replace unmarked daemon unit: $DAEMON_SYSTEMD_SERVICE_TARGET"
  fi
  if [[ -e "$DAEMON_LOGROTATE_TARGET" || -L "$DAEMON_LOGROTATE_TARGET" ]]; then
    [[ -f "$DAEMON_LOGROTATE_TARGET" && ! -L "$DAEMON_LOGROTATE_TARGET" ]] || \
      die "existing daemon logrotate target is not a safe regular file: $DAEMON_LOGROTATE_TARGET"
    grep -Fqx '# Managed by TRex WebUI deploy/install.sh.' "$DAEMON_LOGROTATE_TARGET" || \
      die "refusing to replace unmarked daemon logrotate policy: $DAEMON_LOGROTATE_TARGET"
  fi
  if [[ -e "$DAEMON_LIBEXEC_ROOT" || -L "$DAEMON_LIBEXEC_ROOT" ]]; then
    [[ -d "$DAEMON_LIBEXEC_ROOT" && ! -L "$DAEMON_LIBEXEC_ROOT" ]] || \
      die "daemon libexec root is not a safe directory: $DAEMON_LIBEXEC_ROOT"
    [[ "$(stat -c '%U:%G' "$DAEMON_LIBEXEC_ROOT")" == "root:root" ]] || \
      die "daemon libexec root must be owned by root:root"
    (( (8#$(stat -c '%a' "$DAEMON_LIBEXEC_ROOT") & 8#022) == 0 )) || \
      die "daemon libexec root must not be writable by group/other"
  fi
  if [[ -e "$NFTABLES_SYSTEMD_DROPIN_ROOT" || -L "$NFTABLES_SYSTEMD_DROPIN_ROOT" ]]; then
    [[ -d "$NFTABLES_SYSTEMD_DROPIN_ROOT" && ! -L "$NFTABLES_SYSTEMD_DROPIN_ROOT" ]] || \
      die "nftables systemd drop-in root is not a safe directory: $NFTABLES_SYSTEMD_DROPIN_ROOT"
    [[ "$(stat -c '%U:%G' "$NFTABLES_SYSTEMD_DROPIN_ROOT")" == "root:root" ]] || \
      die "nftables systemd drop-in root must be owned by root:root"
    (( (8#$(stat -c '%a' "$NFTABLES_SYSTEMD_DROPIN_ROOT") & 8#022) == 0 )) || \
      die "nftables systemd drop-in root must not be writable by group/other"
  fi
  if [[ -e "$NFTABLES_SYSTEMD_DROPIN_TARGET" || -L "$NFTABLES_SYSTEMD_DROPIN_TARGET" ]]; then
    [[ -f "$NFTABLES_SYSTEMD_DROPIN_TARGET" && ! -L "$NFTABLES_SYSTEMD_DROPIN_TARGET" ]] || \
      die "existing nftables integration drop-in is not a safe regular file: $NFTABLES_SYSTEMD_DROPIN_TARGET"
    [[ "$(stat -c '%U:%G' "$NFTABLES_SYSTEMD_DROPIN_TARGET")" == "root:root" ]] || \
      die "existing nftables integration drop-in must be owned by root:root"
    (( (8#$(stat -c '%a' "$NFTABLES_SYSTEMD_DROPIN_TARGET") & 8#022) == 0 )) || \
      die "existing nftables integration drop-in must not be writable by group/other"
    grep -Fqx '# Managed by TRex WebUI deploy/install.sh.' "$NFTABLES_SYSTEMD_DROPIN_TARGET" || \
      die "refusing to replace an unmarked nftables integration drop-in"
  fi
  local runtime_target runtime_label
  for runtime_target in "$DAEMON_SUPERVISOR_TARGET" "$DAEMON_RPC_PROBE_TARGET" \
    "$DAEMON_NATIVE_BOUNDARY_TARGET"; do
    if [[ "$runtime_target" == "$DAEMON_SUPERVISOR_TARGET" ]]; then
      runtime_label="daemon supervisor runtime"
    elif [[ "$runtime_target" == "$DAEMON_RPC_PROBE_TARGET" ]]; then
      runtime_label="daemon RPC probe runtime"
    else
      runtime_label="daemon native boundary runtime"
    fi
    if [[ -e "$runtime_target" || -L "$runtime_target" ]]; then
      [[ -f "$runtime_target" && ! -L "$runtime_target" ]] || \
        die "existing $runtime_label is not a safe regular file: $runtime_target"
      [[ "$(stat -c '%U:%G' "$runtime_target")" == "root:root" ]] || \
        die "existing $runtime_label must be owned by root:root"
      (( (8#$(stat -c '%a' "$runtime_target") & 8#022) == 0 )) || \
        die "existing $runtime_label must not be writable by group/other"
      grep -Fqx '# Managed by TRex WebUI deploy/install.sh.' "$runtime_target" || \
        die "refusing to replace unmarked $runtime_label: $runtime_target"
    fi
  done
}

preflight_native_boundary() {
  [[ "$MANAGE_LOCAL_DAEMON" -eq 1 ]] || return 0
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '+ validate nftables support, the nftables.service config, and refuse an unowned inet trex_webui_native_boundary table without changing host rules\n'
    printf '+ snapshot the exact absent/managed native-boundary ruleset before any deployment mutation\n'
    if [[ "$RUN_RESTART" -eq 0 ]]; then
      printf '+ if the managed daemon is already active, require its native-port boundary to be active before deferring restart\n'
    fi
    return 0
  fi

  [[ "$(systemctl show nftables.service --property=LoadState --value)" == "loaded" ]] || \
    die "managed-local mode requires a loaded nftables.service unit"
  local nft_exec_start nft_exec_reload
  nft_exec_start="$(systemctl show nftables.service --property=ExecStart --value)" || \
    die "unable to inspect nftables.service start authority"
  nft_exec_reload="$(systemctl show nftables.service --property=ExecReload --value)" || \
    die "unable to inspect nftables.service reload authority"
  if [[ "$nft_exec_start" == *"$DAEMON_NATIVE_BOUNDARY_TARGET service-start $NFTABLES_CONFIG_PATH"* && \
    "$nft_exec_reload" == *"$DAEMON_NATIVE_BOUNDARY_TARGET service-reload $NFTABLES_CONFIG_PATH"* ]]; then
    :
  elif [[ "$nft_exec_start" == *" -f $NFTABLES_CONFIG_PATH "* && \
    "$nft_exec_reload" == *"flush ruleset"* && \
    "$nft_exec_reload" == *"$NFTABLES_CONFIG_PATH"* ]]; then
    :
  else
    die "nftables.service start/reload contract is unsupported; refusing to override unknown firewall semantics"
  fi
  "$PROJECT_ROOT/deploy/trex_native_boundary.sh" check-service "$NFTABLES_CONFIG_PATH" || \
    die "managed-local mode requires a usable nftables native-port boundary"
  NATIVE_BOUNDARY_SNAPSHOT="$(
    mktemp --tmpdir="$NATIVE_BOUNDARY_SNAPSHOT_ROOT" \
      "trex-webui-native-boundary.snapshot.XXXXXXXX"
  )"
  chown root:root "$NATIVE_BOUNDARY_SNAPSHOT"
  chmod 0600 "$NATIVE_BOUNDARY_SNAPSHOT"
  "$PROJECT_ROOT/deploy/trex_native_boundary.sh" snapshot "$NATIVE_BOUNDARY_SNAPSHOT" || \
    die "unable to capture the pre-deployment native-boundary ruleset"
  NATIVE_BOUNDARY_SNAPSHOT_CAPTURED=1
  if [[ "$RUN_RESTART" -eq 0 ]] && systemctl is-active --quiet trex-daemon-server.service; then
    "$PROJECT_ROOT/deploy/trex_native_boundary.sh" verify || \
      die "--skip-restart cannot leave an active managed daemon without the native-port boundary; restart during an idle maintenance window"
  fi
}

daemon_unit_requires_restart() {
  [[ "$MANAGE_LOCAL_DAEMON" -eq 1 ]] || return 1
  [[ -f "$DAEMON_SYSTEMD_SERVICE_TARGET" && ! -L "$DAEMON_SYSTEMD_SERVICE_TARGET" ]] || return 0
  [[ -f "$DAEMON_SUPERVISOR_TARGET" && ! -L "$DAEMON_SUPERVISOR_TARGET" ]] || return 0
  [[ -f "$DAEMON_RPC_PROBE_TARGET" && ! -L "$DAEMON_RPC_PROBE_TARGET" ]] || return 0
  [[ -f "$DAEMON_NATIVE_BOUNDARY_TARGET" && ! -L "$DAEMON_NATIVE_BOUNDARY_TARGET" ]] || return 0
  [[ -f "$NFTABLES_SYSTEMD_DROPIN_TARGET" && ! -L "$NFTABLES_SYSTEMD_DROPIN_TARGET" ]] || return 0
  cmp -s "$DAEMON_SYSTEMD_SERVICE_TARGET" <(render_daemon_unit) || return 0
  cmp -s "$DAEMON_SUPERVISOR_TARGET" "$PROJECT_ROOT/deploy/trex_daemon_supervisor.py" || return 0
  cmp -s "$DAEMON_RPC_PROBE_TARGET" "$PROJECT_ROOT/deploy/daemon_rpc_probe.py" || return 0
  cmp -s "$DAEMON_NATIVE_BOUNDARY_TARGET" "$PROJECT_ROOT/deploy/trex_native_boundary.sh" || return 0
  cmp -s "$NFTABLES_SYSTEMD_DROPIN_TARGET" <(render_nftables_dropin) || return 0
  systemctl is-active --quiet trex-daemon-server.service || return 0
  [[ "$(systemctl show trex-daemon-server.service --property=NeedDaemonReload --value)" == "no" ]] || return 0
  [[ "$(systemctl show nftables.service --property=NeedDaemonReload --value)" == "no" ]] || return 0
  [[ "$(systemctl show trex-daemon-server.service --property=KillMode --value)" == "mixed" ]] || return 0
  [[ "$(systemctl show trex-daemon-server.service --property=Restart --value)" == "on-failure" ]] || return 0
  local loaded_post
  loaded_post="$(systemctl show trex-daemon-server.service --property=ExecStartPost --value)" || return 0
  [[ "$loaded_post" == *"daemon_rpc_probe.py"* && "$loaded_post" == *" ready"* ]] || return 0
  "$DAEMON_NATIVE_BOUNDARY_TARGET" verify >/dev/null 2>&1 || return 0
  /usr/bin/python3 "$DAEMON_RPC_PROBE_TARGET" \
    --host "$TREX_DAEMON_HOST" \
    --port "$TREX_DAEMON_PORT" \
    --timeout 1 \
    ready >/dev/null 2>&1 || return 0
  return 1
}

current_daemon_probe() {
  if [[ -f "$DAEMON_RPC_PROBE_TARGET" && ! -L "$DAEMON_RPC_PROBE_TARGET" && \
    -x "$DAEMON_RPC_PROBE_TARGET" ]]; then
    printf '%s\n' "$DAEMON_RPC_PROBE_TARGET"
  else
    printf '%s\n' "$PROJECT_ROOT/deploy/daemon_rpc_probe.py"
  fi
}

assert_daemon_restart_safe() {
  [[ "$MANAGE_LOCAL_DAEMON" -eq 1 ]] || return 0
  systemctl is-active --quiet trex-daemon-server.service || return 0
  if [[ "$ALLOW_DAEMON_RUNTIME_RESTART" -eq 1 ]]; then
    printf 'warning: maintenance override permits daemon restart without preserving active TRex/reservation state\n' >&2
    return 0
  fi
  local probe
  probe="$(current_daemon_probe)"
  /usr/bin/python3 "$probe" \
    --host "$TREX_DAEMON_HOST" \
    --port "$TREX_DAEMON_PORT" \
    --timeout 5 \
    safe-restart || \
    die "daemon restart is unsafe or state is unknown; stop traffic/cancel reservation first, or explicitly use --allow-daemon-runtime-restart"
}

preflight_daemon_supervisor() {
  [[ "$MANAGE_LOCAL_DAEMON" -eq 1 ]] || {
    log "External daemon mode selected; local privileged daemon files and service will remain untouched"
    return 0
  }
  assert_local_daemon_config_authority
  preflight_native_boundary
  DAEMON_UNIT_RESTART_REQUIRED=0
  if [[ "$DRY_RUN" -eq 1 ]]; then
    DAEMON_UNIT_RESTART_REQUIRED=1
    if [[ "$RUN_RESTART" -eq 1 ]]; then
      printf '+ require daemon state Idle(1) and is_reserved=false before any deployment mutation\n'
    fi
    return 0
  fi
  if daemon_unit_requires_restart; then
    DAEMON_UNIT_RESTART_REQUIRED=1
  fi
  if [[ "$RUN_RESTART" -eq 1 && "$DAEMON_UNIT_RESTART_REQUIRED" -eq 1 ]]; then
    assert_daemon_restart_safe
  fi
}

publish_staged_config() {
  local target="$1"
  local label="$2"
  local temp_name="$3"
  local backup_name="$4"
  local existed_name="$5"
  local published_name="$6"
  local -n temp_ref="$temp_name"
  local -n backup_ref="$backup_name"
  local -n existed_ref="$existed_name"
  local -n published_ref="$published_name"
  local parent base
  parent="$(dirname -- "$target")"
  base="$(basename -- "$target")"

  [[ -f "$temp_ref" && ! -L "$temp_ref" ]] || die "staged $label is missing or unsafe: $temp_ref"
  [[ ! -L "$target" ]] || die "$label target must not be a symbolic link: $target"
  [[ ! -e "$target" || -f "$target" ]] || die "$label target must be a regular file: $target"
  if [[ -f "$target" ]]; then
    backup_ref="$(mktemp --tmpdir="$parent" ".${base}.rollback.XXXXXXXX")"
    cp -a -- "$target" "$backup_ref"
    existed_ref=1
  else
    existed_ref=0
  fi

  mv -f -- "$temp_ref" "$target"
  temp_ref=""
  published_ref=1
}

install_configs() {
  log "Installing Nginx and API systemd configuration"
  if [[ "$MANAGE_LOCAL_DAEMON" -eq 1 ]]; then
    log "Installing the local privileged daemon supervisor, native-port boundary, and logrotate policy"
  fi
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '+ render %q with root %q into a same-directory temporary file beside %q\n' \
      "$PROJECT_ROOT/deploy/nginx/trex-webui.conf" "$WEB_ROOT" "$NGINX_CONF_TARGET"
    printf '+ preserve the current %q when present, then atomically replace it\n' "$NGINX_CONF_TARGET"
    printf '+ render %q with project root %q into a same-directory temporary file beside %q\n' \
      "$PROJECT_ROOT/deploy/systemd/trex-webui-api.service" "$PROJECT_ROOT" "$SYSTEMD_SERVICE_TARGET"
    printf '+ pin systemd ExecStart to immutable service runtime %q\n' "$VENV_SERVICE_PATH"
    printf '+ preserve the current %q when present, then atomically replace it\n' "$SYSTEMD_SERVICE_TARGET"
    if [[ "$MANAGE_LOCAL_DAEMON" -eq 1 ]]; then
      printf '+ force API daemon authority to systemd on 127.0.0.1:8090\n'
      printf '+ atomically install root-owned daemon supervisor, RPC probe, and native-port boundary into %q\n' \
        "$DAEMON_LIBEXEC_ROOT"
      printf '+ render %q with loopback-only RPC and TRex scripts root %q beside %q\n' \
        "$PROJECT_ROOT/deploy/systemd/trex-daemon-server.service" \
        "$TREX_DAEMON_SCRIPTS_DIR" \
        "$DAEMON_SYSTEMD_SERVICE_TARGET"
      printf '+ atomically install an owned nftables.service drop-in that keeps config reload and native-boundary publication in one nft transaction\n'
      printf '+ preserve the current daemon unit, nftables drop-in, logrotate policy, supervisor, RPC probe, and native boundary before atomically replacing them\n'
    else
      printf '+ remove the API daemon-mode marker without installing local daemon files\n'
    fi
    printf '+ on any later nginx/systemd/restart/verify failure restore prior configs or delete files created by this run\n'
    return
  fi

  local escaped_web_root escaped_project_root escaped_service_venv escaped_daemon_scripts
  local render_project_root="${SERVICE_PROJECT_ROOT:-$PROJECT_ROOT}"
  local render_web_root="${EFFECTIVE_WEB_ROOT:-$WEB_ROOT}"
  local nginx_parent nginx_base systemd_parent systemd_base daemon_systemd_parent daemon_systemd_base
  local daemon_logrotate_parent daemon_logrotate_base daemon_supervisor_parent daemon_supervisor_base
  local daemon_probe_parent daemon_probe_base daemon_boundary_parent daemon_boundary_base
  local nftables_dropin_parent nftables_dropin_base
  escaped_web_root="$(sed_escape "$render_web_root")"
  escaped_project_root="$(sed_escape "$render_project_root")"
  if [[ "$VERSIONED_RELEASE" -eq 1 ]]; then
    escaped_service_venv="$(sed_escape "$SERVICE_PROJECT_ROOT/.venv")"
  else
    escaped_service_venv="$(sed_escape "$VENV_SERVICE_PATH")"
  fi
  escaped_daemon_scripts="$(sed_escape "$TREX_DAEMON_SCRIPTS_DIR")"
  nginx_parent="$(dirname -- "$NGINX_CONF_TARGET")"
  nginx_base="$(basename -- "$NGINX_CONF_TARGET")"
  systemd_parent="$(dirname -- "$SYSTEMD_SERVICE_TARGET")"
  systemd_base="$(basename -- "$SYSTEMD_SERVICE_TARGET")"
  daemon_systemd_parent="$(dirname -- "$DAEMON_SYSTEMD_SERVICE_TARGET")"
  daemon_systemd_base="$(basename -- "$DAEMON_SYSTEMD_SERVICE_TARGET")"
  daemon_logrotate_parent="$(dirname -- "$DAEMON_LOGROTATE_TARGET")"
  daemon_logrotate_base="$(basename -- "$DAEMON_LOGROTATE_TARGET")"
  daemon_supervisor_parent="$(dirname -- "$DAEMON_SUPERVISOR_TARGET")"
  daemon_supervisor_base="$(basename -- "$DAEMON_SUPERVISOR_TARGET")"
  daemon_probe_parent="$(dirname -- "$DAEMON_RPC_PROBE_TARGET")"
  daemon_probe_base="$(basename -- "$DAEMON_RPC_PROBE_TARGET")"
  daemon_boundary_parent="$(dirname -- "$DAEMON_NATIVE_BOUNDARY_TARGET")"
  daemon_boundary_base="$(basename -- "$DAEMON_NATIVE_BOUNDARY_TARGET")"
  nftables_dropin_parent="$(dirname -- "$NFTABLES_SYSTEMD_DROPIN_TARGET")"
  nftables_dropin_base="$(basename -- "$NFTABLES_SYSTEMD_DROPIN_TARGET")"
  [[ -d "$nginx_parent" && ! -L "$nginx_parent" ]] || die "Nginx configuration directory is missing or unsafe: $nginx_parent"
  [[ -d "$systemd_parent" && ! -L "$systemd_parent" ]] || die "systemd configuration directory is missing or unsafe: $systemd_parent"
  if [[ "$MANAGE_LOCAL_DAEMON" -eq 1 ]]; then
    [[ -d "$daemon_systemd_parent" && ! -L "$daemon_systemd_parent" ]] || \
      die "daemon systemd configuration directory is missing or unsafe: $daemon_systemd_parent"
    [[ -d "$daemon_logrotate_parent" && ! -L "$daemon_logrotate_parent" ]] || \
      die "daemon logrotate configuration directory is missing or unsafe (install logrotate first): $daemon_logrotate_parent"
    if [[ ! -e "$DAEMON_LIBEXEC_ROOT" ]]; then
      install -d -o root -g root -m 0755 "$DAEMON_LIBEXEC_ROOT"
      DAEMON_LIBEXEC_ROOT_CREATED=1
    fi
    [[ -d "$DAEMON_LIBEXEC_ROOT" && ! -L "$DAEMON_LIBEXEC_ROOT" ]] || \
      die "daemon libexec root is missing or unsafe: $DAEMON_LIBEXEC_ROOT"
    [[ -d "$daemon_supervisor_parent" && ! -L "$daemon_supervisor_parent" ]] || \
      die "daemon supervisor target directory is missing or unsafe: $daemon_supervisor_parent"
    [[ -d "$daemon_probe_parent" && ! -L "$daemon_probe_parent" ]] || \
      die "daemon RPC probe target directory is missing or unsafe: $daemon_probe_parent"
    [[ -d "$daemon_boundary_parent" && ! -L "$daemon_boundary_parent" ]] || \
      die "daemon native boundary target directory is missing or unsafe: $daemon_boundary_parent"
    if [[ ! -e "$NFTABLES_SYSTEMD_DROPIN_ROOT" ]]; then
      install -d -o root -g root -m 0755 "$NFTABLES_SYSTEMD_DROPIN_ROOT"
      NFTABLES_SYSTEMD_DROPIN_ROOT_CREATED=1
    fi
    [[ -d "$nftables_dropin_parent" && ! -L "$nftables_dropin_parent" ]] || \
      die "nftables systemd drop-in directory is missing or unsafe: $nftables_dropin_parent"
  fi

  NGINX_CONFIG_TEMP="$(mktemp --tmpdir="$nginx_parent" ".${nginx_base}.new.XXXXXXXX")"
  SYSTEMD_CONFIG_TEMP="$(mktemp --tmpdir="$systemd_parent" ".${systemd_base}.new.XXXXXXXX")"
  if [[ "$MANAGE_LOCAL_DAEMON" -eq 1 ]]; then
    DAEMON_SYSTEMD_CONFIG_TEMP="$(mktemp --tmpdir="$daemon_systemd_parent" ".${daemon_systemd_base}.new.XXXXXXXX")"
    DAEMON_LOGROTATE_CONFIG_TEMP="$(mktemp --tmpdir="$daemon_logrotate_parent" ".${daemon_logrotate_base}.new.XXXXXXXX")"
    DAEMON_SUPERVISOR_TEMP="$(mktemp --tmpdir="$daemon_supervisor_parent" ".${daemon_supervisor_base}.new.XXXXXXXX")"
    DAEMON_RPC_PROBE_TEMP="$(mktemp --tmpdir="$daemon_probe_parent" ".${daemon_probe_base}.new.XXXXXXXX")"
    DAEMON_NATIVE_BOUNDARY_TEMP="$(mktemp --tmpdir="$daemon_boundary_parent" ".${daemon_boundary_base}.new.XXXXXXXX")"
    NFTABLES_SYSTEMD_DROPIN_TEMP="$(mktemp --tmpdir="$nftables_dropin_parent" ".${nftables_dropin_base}.new.XXXXXXXX")"
  fi

  sed "s|root /var/www/trex-webui/dist;|root $escaped_web_root;|" \
    "$PROJECT_ROOT/deploy/nginx/trex-webui.conf" >"$NGINX_CONFIG_TEMP"
  local service_venv_placeholder='@@TREX_WEBUI_SERVICE_VENV@@'
  local daemon_scripts_placeholder='@@TREX_WEBUI_DAEMON_SCRIPTS@@'
  if grep -Eq "$service_venv_placeholder|$daemon_scripts_placeholder" \
    "$PROJECT_ROOT/deploy/systemd/trex-webui-api.service"; then
    die "systemd service template contains the reserved runtime placeholder"
  fi
  sed \
    -e "s|/opt/trex-webui/.venv|$service_venv_placeholder|g" \
    -e "s|/opt/trex-core/scripts|$daemon_scripts_placeholder|g" \
    -e "s|/opt/trex-webui|$escaped_project_root|g" \
    -e "s|$service_venv_placeholder|$escaped_service_venv|g" \
    -e "s|$daemon_scripts_placeholder|$escaped_daemon_scripts|g" \
    "$PROJECT_ROOT/deploy/systemd/trex-webui-api.service" | \
    awk \
      -v local_daemon="$MANAGE_LOCAL_DAEMON" \
      -v versioned_release="$VERSIONED_RELEASE" \
      -v daemon_scripts="$TREX_DAEMON_SCRIPTS_DIR" \
      -v daemon_bin="$TREX_DAEMON_BIN" \
      -v profile_roots="$TREX_DAEMON_SCRIPTS_DIR/stl:$render_project_root/profiles:$SERVICE_STATE_PROFILE_ROOT" '
      versioned_release != "1" && $0 == "Requires=trex-webui-release-reconcile-v2.service" { next }
      versioned_release != "1" { gsub(/ trex-webui-release-reconcile-v2\.service/, "") }
      local_daemon == "1" && index($0, "Environment=TREX_WEBUI_PROFILE_ROOTS=") == 1 {
        next
      }
      $0 == "# @@TREX_WEBUI_DAEMON_MODE_ENV@@" {
        if (local_daemon == "1") {
          print "Environment=TREX_WEBUI_TREX_HOST=127.0.0.1"
          print "Environment=TREX_WEBUI_TREX_SYNC_PORT=4501"
          print "Environment=TREX_WEBUI_TREX_ASYNC_PORT=4500"
          print "Environment=TREX_WEBUI_TREX_SCAPY_PORT=4507"
          print "Environment=TREX_WEBUI_TREX_DAEMON_PORT=8090"
          print "Environment=TREX_WEBUI_DAEMON_SUPERVISOR=systemd"
          print "Environment=TREX_WEBUI_TREX_SCRIPTS_DIR=" daemon_scripts
          print "Environment=TREX_WEBUI_TREX_DAEMON_BIN=" daemon_bin
          print "Environment=TREX_WEBUI_PROFILE_ROOTS=" profile_roots
          print "Environment=TREX_WEBUI_RUNTIME_STATE_PATH=/var/lib/trex-webui/runtime-state.json"
          print "Environment=TREX_WEBUI_DAEMON_GENERATION_PATH=/run/trex-webui/daemon-generation"
        }
        next
      }
      { print }
    ' >"$SYSTEMD_CONFIG_TEMP"
  if [[ "$MANAGE_LOCAL_DAEMON" -eq 1 ]]; then
    render_daemon_unit >"$DAEMON_SYSTEMD_CONFIG_TEMP"
    cp -- "$PROJECT_ROOT/deploy/logrotate/trex-daemon-server" "$DAEMON_LOGROTATE_CONFIG_TEMP"
    cp -- "$PROJECT_ROOT/deploy/trex_daemon_supervisor.py" "$DAEMON_SUPERVISOR_TEMP"
    cp -- "$PROJECT_ROOT/deploy/daemon_rpc_probe.py" "$DAEMON_RPC_PROBE_TEMP"
    cp -- "$PROJECT_ROOT/deploy/trex_native_boundary.sh" "$DAEMON_NATIVE_BOUNDARY_TEMP"
    render_nftables_dropin >"$NFTABLES_SYSTEMD_DROPIN_TEMP"
  fi
  chown root:root "$NGINX_CONFIG_TEMP" "$SYSTEMD_CONFIG_TEMP"
  chmod 0644 "$NGINX_CONFIG_TEMP" "$SYSTEMD_CONFIG_TEMP"
  if [[ "$MANAGE_LOCAL_DAEMON" -eq 1 ]]; then
    chown root:root "$DAEMON_SYSTEMD_CONFIG_TEMP" "$DAEMON_LOGROTATE_CONFIG_TEMP" \
      "$NFTABLES_SYSTEMD_DROPIN_TEMP"
    chmod 0644 "$DAEMON_SYSTEMD_CONFIG_TEMP" "$DAEMON_LOGROTATE_CONFIG_TEMP" \
      "$NFTABLES_SYSTEMD_DROPIN_TEMP"
    chown root:root "$DAEMON_SUPERVISOR_TEMP" "$DAEMON_RPC_PROBE_TEMP" \
      "$DAEMON_NATIVE_BOUNDARY_TEMP"
    chmod 0755 "$DAEMON_SUPERVISOR_TEMP" "$DAEMON_RPC_PROBE_TEMP" \
      "$DAEMON_NATIVE_BOUNDARY_TEMP"
  fi

  publish_staged_config "$NGINX_CONF_TARGET" "Nginx configuration" \
    NGINX_CONFIG_TEMP NGINX_CONFIG_BACKUP NGINX_CONFIG_EXISTED NGINX_CONFIG_PUBLISHED
  publish_staged_config "$SYSTEMD_SERVICE_TARGET" "systemd service" \
    SYSTEMD_CONFIG_TEMP SYSTEMD_CONFIG_BACKUP SYSTEMD_CONFIG_EXISTED SYSTEMD_CONFIG_PUBLISHED
  if [[ "$MANAGE_LOCAL_DAEMON" -eq 1 ]]; then
    publish_staged_config "$DAEMON_SYSTEMD_SERVICE_TARGET" "daemon systemd service" \
      DAEMON_SYSTEMD_CONFIG_TEMP DAEMON_SYSTEMD_CONFIG_BACKUP \
      DAEMON_SYSTEMD_CONFIG_EXISTED DAEMON_SYSTEMD_CONFIG_PUBLISHED
    publish_staged_config "$DAEMON_LOGROTATE_TARGET" "daemon logrotate configuration" \
      DAEMON_LOGROTATE_CONFIG_TEMP DAEMON_LOGROTATE_CONFIG_BACKUP \
      DAEMON_LOGROTATE_CONFIG_EXISTED DAEMON_LOGROTATE_CONFIG_PUBLISHED
    publish_staged_config "$DAEMON_SUPERVISOR_TARGET" "daemon supervisor runtime" \
      DAEMON_SUPERVISOR_TEMP DAEMON_SUPERVISOR_BACKUP \
      DAEMON_SUPERVISOR_EXISTED DAEMON_SUPERVISOR_PUBLISHED
    publish_staged_config "$DAEMON_RPC_PROBE_TARGET" "daemon RPC probe runtime" \
      DAEMON_RPC_PROBE_TEMP DAEMON_RPC_PROBE_BACKUP \
      DAEMON_RPC_PROBE_EXISTED DAEMON_RPC_PROBE_PUBLISHED
    publish_staged_config "$DAEMON_NATIVE_BOUNDARY_TARGET" "daemon native boundary runtime" \
      DAEMON_NATIVE_BOUNDARY_TEMP DAEMON_NATIVE_BOUNDARY_BACKUP \
      DAEMON_NATIVE_BOUNDARY_EXISTED DAEMON_NATIVE_BOUNDARY_PUBLISHED
    publish_staged_config "$NFTABLES_SYSTEMD_DROPIN_TARGET" "nftables integration drop-in" \
      NFTABLES_SYSTEMD_DROPIN_TEMP NFTABLES_SYSTEMD_DROPIN_BACKUP \
      NFTABLES_SYSTEMD_DROPIN_EXISTED NFTABLES_SYSTEMD_DROPIN_PUBLISHED
  fi
}

install_release_reconciler() {
  if [[ "$VERSIONED_RELEASE" -ne 1 ]]; then
    log "Keeping legacy checkout consumers independent of the production release selector"
    return 0
  fi
  local source_bootstrap="$PROJECT_ROOT/deploy/bootstrap_release_infrastructure.py"
  local source_engine="$PROJECT_ROOT/deploy/release_transaction.py"
  local source_overview_validator="$PROJECT_ROOT/deploy/trex_overview_contract.py"
  local source_state_validator="$PROJECT_ROOT/deploy/trex_persisted_state_contract.py"
  local source_daemon_probe="$PROJECT_ROOT/deploy/daemon_rpc_probe.py"
  local source_native_boundary="$PROJECT_ROOT/deploy/trex_native_boundary.sh"
  local source_unit="$PROJECT_ROOT/deploy/systemd/trex-webui-release-reconcile-v2.service"
  local source_retry_unit="$PROJECT_ROOT/deploy/systemd/trex-webui-release-retry-v2.service"
  local source_ack_unit="$PROJECT_ROOT/deploy/systemd/trex-webui-release-consumer-ack-v2.service"
  local source_dropin="$PROJECT_ROOT/deploy/systemd/trex-webui-release-reconcile-v2.conf"
  local source_reconciler_bridge="$PROJECT_ROOT/deploy/systemd/trex-webui-release-reconcile-v1-bridge-v2.conf"
  local source_retry_bridge="$PROJECT_ROOT/deploy/systemd/trex-webui-release-retry-v1-bridge-v2.conf"
  local source_ack_bridge="$PROJECT_ROOT/deploy/systemd/trex-webui-release-consumer-ack-v1-bridge-v2.conf"
  log "Publishing or exact-verifying the immutable release recovery ABI v2"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '+ exact-verify the complete common fixed ABI v2; durably publish provider prerequisites, then quarantine any installed ABI v1 units with bridges, then publish API/Nginx v2 dependencies and the manifest last\n'
    if [[ "$MANAGE_LOCAL_DAEMON" -eq 1 ]]; then
      printf '+ exact-verify the managed-local fixed ABI v2; publish its daemon dependency drop-in only after rollback helpers are durable\n'
    fi
    return
  fi
  if [[ ! -e "$RELEASE_INFRASTRUCTURE_COMMON_MANIFEST" && \
    ! -L "$RELEASE_INFRASTRUCTURE_COMMON_MANIFEST" ]]; then
    local legacy_path
    for legacy_path in \
      "$RELEASE_STATE_ROOT/infrastructure-common.json" \
      "$RELEASE_STATE_ROOT/infrastructure-managed-local.json" \
      "$DAEMON_LIBEXEC_ROOT/bootstrap_release_infrastructure.py" \
      "$DAEMON_LIBEXEC_ROOT/release_transaction.py" \
      "${RELEASE_V1_RECONCILER_BRIDGE_DROPIN_ROOT%.d}" \
      "${RELEASE_V1_RETRY_BRIDGE_DROPIN_ROOT%.d}" \
      "${RELEASE_V1_ACK_BRIDGE_DROPIN_ROOT%.d}" \
      "$RELEASE_RECONCILER_API_DROPIN_ROOT/trex-webui-release-reconcile.conf" \
      "$RELEASE_RECONCILER_NGINX_DROPIN_ROOT/trex-webui-release-reconcile.conf" \
      "$RELEASE_RECONCILER_DAEMON_DROPIN_ROOT/trex-webui-release-reconcile.conf"; do
      if [[ -e "$legacy_path" || -L "$legacy_path" ]]; then
        die "recovery ABI v1 must be migrated from a terminal journal by deploy/upgrade.sh before install.sh may publish ABI v2"
      fi
    done
  fi
  install -d -o root -g root -m 0755 \
    "$DAEMON_LIBEXEC_ROOT" \
    "$RECOVERY_V2_ROOT" \
    "$RELEASE_RECONCILER_NGINX_DROPIN_ROOT" \
    "$RELEASE_RECONCILER_API_DROPIN_ROOT" \
    "$RELEASE_V1_RECONCILER_BRIDGE_DROPIN_ROOT" \
    "$RELEASE_V1_RETRY_BRIDGE_DROPIN_ROOT" \
    "$RELEASE_V1_ACK_BRIDGE_DROPIN_ROOT"
  install -d -o root -g root -m 0700 "$RELEASE_STATE_ROOT"
  local common_artifacts=(
    --artifact "$source_bootstrap::$RELEASE_BOOTSTRAP_TARGET::0755"
    --artifact "$source_engine::$RELEASE_RECONCILER_TARGET::0755"
    --artifact "$source_overview_validator::$TREX_OVERVIEW_VALIDATOR_TARGET::0755"
    --artifact "$source_state_validator::$TREX_PERSISTED_STATE_VALIDATOR_TARGET::0755"
    --artifact "$source_unit::$RELEASE_RECONCILER_UNIT_TARGET::0644"
    --artifact "$source_retry_unit::$RELEASE_RECONCILER_RETRY_UNIT_TARGET::0644"
    --artifact "$source_ack_unit::$RELEASE_RECONCILER_ACK_UNIT_TARGET::0644"
    --consumer-dropin "$source_reconciler_bridge::$RELEASE_V1_RECONCILER_BRIDGE_DROPIN_TARGET::0644"
    --consumer-dropin "$source_retry_bridge::$RELEASE_V1_RETRY_BRIDGE_DROPIN_TARGET::0644"
    --consumer-dropin "$source_ack_bridge::$RELEASE_V1_ACK_BRIDGE_DROPIN_TARGET::0644"
    --consumer-dropin "$source_dropin::$RELEASE_RECONCILER_API_DROPIN_TARGET::0644"
    --consumer-dropin "$source_dropin::$RELEASE_RECONCILER_NGINX_DROPIN_TARGET::0644"
  )
  /usr/bin/python3 "$source_bootstrap" \
    --manifest "$RELEASE_INFRASTRUCTURE_COMMON_MANIFEST" \
    "${common_artifacts[@]}" || \
    die "fixed common release infrastructure differs from the armed recovery ABI v2"
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
      die "fixed managed-local release infrastructure differs from the armed recovery ABI v2"
  fi
  sync --file-system "$RELEASE_STATE_ROOT" || \
    die "unable to persist the fixed recovery ABI v2 infrastructure state"
}

install_packages() {
  if [[ "$INSTALL_NGINX" -eq 0 ]]; then
    return
  fi
  have_cmd dnf || die "--install-nginx requested but dnf was not found"
  log "Installing nginx package"
  run dnf install -y nginx
}

configure_selinux() {
  local mode="Disabled"
  if have_cmd getenforce; then
    mode="$(getenforce)" || die "unable to inspect SELinux mode"
    [[ "$mode" =~ ^(Disabled|Permissive|Enforcing)$ ]] || \
      die "unexpected SELinux mode: $mode"
  elif [[ -r /sys/fs/selinux/enforce ]]; then
    if [[ "$(< /sys/fs/selinux/enforce)" == "1" ]]; then
      mode="Enforcing"
    else
      mode="Permissive"
    fi
  fi
  if [[ "$RUN_SELINUX" -eq 0 && \
    ! ( "$VERSIONED_RELEASE" -eq 1 && "$mode" != "Disabled" ) ]]; then
    return
  fi
  have_cmd restorecon || die "SELinux policy setup requires restorecon"
  have_cmd setsebool || die "SELinux policy setup requires setsebool"
  log "Applying SELinux web context and network policy"
  if [[ "$VERSIONED_RELEASE" -eq 1 ]]; then
    have_cmd semanage || \
      die "versioned SELinux policy setup requires semanage (policycoreutils-python-utils)"
    have_cmd matchpathcon || \
      die "versioned SELinux policy setup requires matchpathcon"
    if [[ "$DRY_RUN" -eq 1 ]]; then
      run semanage fcontext -a -t httpd_sys_content_t "$VERSIONED_WEB_SELINUX_PATTERN"
      printf '+ if the exact local fcontext already exists, modify it to httpd_sys_content_t\n'
    elif ! semanage fcontext -a -t httpd_sys_content_t \
      "$VERSIONED_WEB_SELINUX_PATTERN" 2>/dev/null; then
      semanage fcontext -m -t httpd_sys_content_t \
        "$VERSIONED_WEB_SELINUX_PATTERN" || \
        die "unable to persist the versioned frontend SELinux file-context rule"
    fi

    local release_layout="/opt/trex-webui"
    local release_paths=("$PROJECT_ROOT")
    local selector selector_target selector_path expected_context release_path
    local known_path duplicate
    for selector in current previous; do
      if [[ ! -L "$release_layout/$selector" ]]; then
        if [[ "$selector" == "current" && "$DRY_RUN" -eq 0 ]]; then
          die "current release selector is missing for SELinux labeling"
        fi
        continue
      fi
      selector_target="$(readlink -- "$release_layout/$selector")" || \
        die "unable to inspect the $selector release selector for SELinux labeling"
      [[ "$selector_target" =~ ^releases/sha256-[0-9a-f]{64}$ ]] || \
        die "$selector release selector is unsafe for SELinux labeling"
      selector_path="$release_layout/$selector_target"
      [[ -d "$selector_path" && ! -L "$selector_path" && \
        "$(realpath -- "$selector_path")" == "$selector_path" ]] || \
        die "$selector release target is unsafe for SELinux labeling"
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
      [[ -d "$release_path/apps/web/dist" && \
        ! -L "$release_path/apps/web/dist" ]] || \
        die "versioned frontend tree is missing or unsafe for SELinux labeling: $release_path"
      if [[ "$DRY_RUN" -eq 0 ]]; then
        expected_context="$(matchpathcon "$release_path/apps/web/dist")" || \
          die "unable to resolve the persisted frontend SELinux context"
        [[ "$expected_context" == *":httpd_sys_content_t:"* ]] || \
          die "persisted SELinux policy does not select the versioned frontend tree"
      fi
      # The staged runtime may inherit a temporary SELinux label before it is
      # atomically published as .venv. Relabel the complete release tree so
      # systemd can execute the runtime; the exact fcontext rule keeps only the
      # frontend subtree readable by Nginx.
      run restorecon -RF "$release_path"
    done
    run sync --file-system "$release_layout"
  else
    run restorecon -RF "$(dirname "$WEB_ROOT")"
  fi
  run setsebool -P httpd_can_network_connect 1
  # Persist semanage/setsebool policy stores even when /opt, /etc, and /var
  # are distinct filesystems before the outer transaction may commit.
  run sync
}

configure_firewalld() {
  if [[ "$RUN_FIREWALLD" -eq 0 ]]; then
    return
  fi
  log "Allowing HTTP through firewalld when available"
  if have_cmd firewall-cmd; then
    run firewall-cmd --permanent --add-service=http
    run firewall-cmd --reload
  elif have_cmd firewall-offline-cmd; then
    run firewall-offline-cmd --add-service=http
  else
    log "firewalld tools not found; skipping"
  fi
}

wait_for_daemon_readiness() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '+ strictly verify loopback daemon RPC connectivity_check=true within %ss while the service remains active\n' \
      "$DAEMON_READINESS_TIMEOUT_SECONDS"
    return 0
  fi

  if /usr/bin/python3 "$DAEMON_RPC_PROBE_TARGET" \
      --host "$TREX_DAEMON_HOST" \
      --port "$TREX_DAEMON_PORT" \
      --timeout "$DAEMON_READINESS_TIMEOUT_SECONDS" \
      ready && \
    systemctl is-active --quiet trex-daemon-server.service; then
    log "TRex daemon loopback RPC readiness confirmed"
    return 0
  fi

  printf 'error: trex-daemon-server.service did not become RPC-ready on %s:%s within %ss\n' \
    "$TREX_DAEMON_HOST" "$TREX_DAEMON_PORT" "$DAEMON_READINESS_TIMEOUT_SECONDS" >&2
  systemctl status trex-daemon-server.service --no-pager >&2 || true
  return 1
}

wait_for_api_readiness() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '+ wait for %q to report status=ok while trex-webui-api.service remains active\n' \
      "$API_READINESS_URL"
    return 0
  fi

  have_cmd curl || die "curl is required to verify API readiness after restart"
  local attempt response=""
  for ((attempt = 1; attempt <= API_READINESS_ATTEMPTS; attempt += 1)); do
    response=""
    if response="$(curl -fsS --noproxy '*' \
      --connect-timeout 1 --max-time 1 \
      -H 'Accept: application/json' \
      "$API_READINESS_URL" 2>/dev/null)" && \
      grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"' <<<"$response" && \
      systemctl is-active --quiet trex-webui-api.service; then
      log "API readiness confirmed after restart"
      return 0
    fi

    if systemctl is-failed --quiet trex-webui-api.service; then
      break
    fi
    if ((attempt < API_READINESS_ATTEMPTS)); then
      sleep "$API_READINESS_INTERVAL_SECONDS"
    fi
  done

  printf 'error: trex-webui-api.service did not become ready at %s after %s attempts\n' \
    "$API_READINESS_URL" "$API_READINESS_ATTEMPTS" >&2
  systemctl status trex-webui-api.service --no-pager >&2 || true
  return 1
}

reload_services() {
  log "Reloading service managers"
  if [[ "$DRY_RUN" -eq 0 ]]; then
    SYSTEMD_RELOAD_ATTEMPTED=1
  fi
  run systemctl daemon-reload
  if [[ "$DRY_RUN" -eq 0 ]]; then
    SYSTEMD_RELOAD_DONE=1
  fi
  run nginx -t

  if [[ "$RUN_ENABLE" -eq 1 ]]; then
    if [[ "$VERSIONED_RELEASE" -eq 1 ]]; then
      run systemctl enable trex-webui-release-reconcile-v2.service
      run sync --file-system /etc/systemd/system
      if [[ "$DRY_RUN" -eq 0 ]]; then
        systemctl is-enabled --quiet trex-webui-release-reconcile-v2.service || \
          die "boot-time recovery ABI v2 reconciliation enablement did not persist"
      fi
    fi
    if [[ "$DEFER_CONSUMER_ENABLE" -eq 1 ]]; then
      log "Deferring API, daemon, and Nginx boot-enable publication until the outer release transaction is committed"
    else
      log "Enabling services"
      if [[ "$DRY_RUN" -eq 0 ]]; then
        ENABLE_ATTEMPTED=1
      fi
      run systemctl enable trex-webui-api.service
      if [[ "$MANAGE_LOCAL_DAEMON" -eq 1 ]]; then
        run systemctl enable trex-daemon-server.service
      fi
      run systemctl enable nginx
    fi
  fi

  if [[ "$VERSIONED_RELEASE" -eq 1 ]]; then
    # Run the canonical v2 authority once against the just-loaded graph even
    # when consumer restarts are intentionally deferred. During an outer
    # archive transaction the non-blocking deployment guard reports the
    # trusted in-progress deployment as success; otherwise this proves the
    # durable selector journal before any consumer start.
    run systemctl start trex-webui-release-reconcile-v2.service
  fi

  if [[ "$RUN_RESTART" -eq 1 ]]; then
    log "Restarting services"
    if [[ "$MANAGE_LOCAL_DAEMON" -eq 1 ]]; then
      if [[ "$DAEMON_UNIT_RESTART_REQUIRED" -eq 1 ]]; then
        if [[ "$DRY_RUN" -eq 0 ]]; then
          assert_daemon_restart_safe
          DAEMON_RESTART_ATTEMPTED=1
          NATIVE_BOUNDARY_RUNTIME_MUTATED=1
        fi
        run systemctl restart trex-daemon-server.service
        if [[ "$DRY_RUN" -eq 0 ]]; then
          DAEMON_RESTART_DONE=1
        fi
      else
        log "Keeping the healthy daemon process because its managed unit is unchanged"
      fi
      wait_for_daemon_readiness
    fi
    if [[ "$DRY_RUN" -eq 0 ]]; then
      API_RESTART_ATTEMPTED=1
    fi
    if [[ "$INSTALL_PYTHON_DEPS" -eq 1 ]]; then
      # Keep the old interpreter from importing through the live pathname while
      # its directory is exchanged. Publish only after it has stopped, then
      # validate the relocated candidate before starting the hardened unit.
      run systemctl stop trex-webui-api.service
      switch_staged_venv
      run systemctl daemon-reload
      smoke_test_service_import "$VENV_LIVE_PATH"
      smoke_test_service_runtime_entrypoint "$VENV_LIVE_PATH"
      smoke_test_service_import "$VENV_SERVICE_PATH"
      smoke_test_service_runtime_entrypoint "$VENV_SERVICE_PATH"
      if [[ "$DRY_RUN" -eq 0 ]]; then
        VENV_RUNTIME_IN_USE=1
      fi
      run systemctl start trex-webui-api.service
    else
      run systemctl restart trex-webui-api.service
    fi
    wait_for_api_readiness
    if [[ "$VERSIONED_RELEASE" -eq 1 ]]; then
      verify_active_service_runtime "$SERVICE_PROJECT_ROOT/.venv"
    else
      verify_active_service_runtime "$VENV_SERVICE_PATH"
    fi
    if [[ "$DRY_RUN" -eq 0 ]]; then
      API_RESTART_DONE=1
    fi
    if [[ "$DRY_RUN" -eq 0 ]]; then
      NGINX_RESTART_ATTEMPTED=1
    fi
    run systemctl restart nginx
    if [[ "$DRY_RUN" -eq 0 ]]; then
      NGINX_RESTART_DONE=1
    fi
  fi
  if [[ "$RUN_RESTART" -eq 0 && "$MANAGE_LOCAL_DAEMON" -eq 1 ]]; then
    if [[ "$DRY_RUN" -eq 1 ]]; then
      printf '+ if trex-webui-api.service is active, verify its MainPID has the exact managed-local TRex environment before completing without restart\n'
    elif systemctl is-active --quiet trex-webui-api.service; then
      verify_active_managed_service_environment
    fi
  fi
}

verify_deployment() {
  if [[ "$RUN_VERIFY" -eq 0 ]]; then
    return
  fi
  local verified_web_root="$WEB_ROOT"
  if [[ "$VERSIONED_RELEASE" -eq 1 ]]; then
    verified_web_root="$PROJECT_ROOT/apps/web/dist"
  fi
  local args=(
    "$PROJECT_ROOT/deploy/verify.sh"
    "--base-url"
    "$VERIFY_BASE_URL"
    "--project-root"
    "$PROJECT_ROOT"
    "--web-root"
    "$verified_web_root"
  )
  if [[ "$VERSIONED_RELEASE" -eq 1 ]]; then
    args+=("--service-project-root" "$SERVICE_PROJECT_ROOT")
  fi
  if [[ "$VERIFY_TREX" -eq 1 ]]; then
    args+=("--trex")
  fi
  if [[ "$MANAGE_LOCAL_DAEMON" -eq 0 ]]; then
    args+=("--skip-daemon")
  fi
  log "Verifying deployment"
  run "${args[@]}"
}

main() {
  parse_args "$@"
  check_layout
  require_root_for_install
  if [[ "$DRY_RUN" -eq 0 ]]; then
    trex_acquire_deployment_lock || die "another deployment transaction is active or the deployment lock is unsafe"
  fi
  preflight_managed_api_environment
  capture_service_manager_state
  preflight_daemon_supervisor
  if [[ -n "$EXPECTED_DAEMON_RESTART" && \
    "$DAEMON_UNIT_RESTART_REQUIRED" -ne "$EXPECTED_DAEMON_RESTART" ]]; then
    die "daemon restart decision drifted after the outer rollback scope was armed"
  fi
  resolve_existing_service_runtime_pin
  install_packages
  provision_service_identity
  install_python_deps
  build_web
  provision_service_directories
  secure_service_read_paths
  if [[ "$INSTALL_PYTHON_DEPS" -eq 1 ]]; then
    smoke_test_service_import "$VENV_STAGING_PATH"
    smoke_test_service_runtime_entrypoint "$VENV_STAGING_PATH"
  fi
  stage_versioned_service_runtime
  smoke_test_service_import "$VENV_SERVICE_PATH"
  smoke_test_service_runtime_entrypoint "$VENV_SERVICE_PATH"
  backup_current_dist
  sync_static_dist
  install_release_reconciler
  configure_selinux
  install_configs
  configure_firewalld
  reload_services
  verify_deployment
  log "TRex WebUI deployment complete"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
