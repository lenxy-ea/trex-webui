#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROJECT_PYTHON_ROOT="$PROJECT_ROOT/.venv/bin"
[[ -x "$PROJECT_PYTHON_ROOT/python3.11" ]] || {
  printf 'FAIL: release safety test requires the dependency-complete project Python runtime\n' >&2
  exit 1
}
export PATH="$PROJECT_PYTHON_ROOT:$PATH"
# shellcheck source=deploy/path_safety.sh
source "$PROJECT_ROOT/deploy/path_safety.sh"

TEST_ROOT="$(mktemp -d -t trex-webui-release-safety.XXXXXX)"
trex_write_managed_marker "$TEST_ROOT"
UNOWNED_ROOT=""

cleanup() {
  local status=$?
  trap - EXIT
  set +e
  if [[ -n "$UNOWNED_ROOT" && -d "$UNOWNED_ROOT" ]]; then
    rmdir "$UNOWNED_ROOT"
  fi
  trex_safe_remove_tree "$TEST_ROOT" "release safety test root" || status=1
  exit "$status"
}

trap cleanup EXIT

"$PROJECT_ROOT/scripts/tests/node_toolchain_test.sh"

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

expect_failure() {
  local expected="$1"
  shift
  local output
  if output=$("$@" 2>&1); then
    fail "command unexpectedly succeeded: $*"
  fi
  [[ "$output" == *"$expected"* ]] || fail "failure did not contain '$expected': $output"
}

native_boundary_rollback_fixture() (
  local snapshot_state="$1"
  local daemon_state="$2"
  local native_listener="$3"
  local expected_outcome="$4"
  local fixture_root="$TEST_ROOT/native-boundary-rollback-${snapshot_state}-${daemon_state}-${expected_outcome}"
  local restore_log="$fixture_root/restore.log"

  # shellcheck source=deploy/install.sh
  source "$PROJECT_ROOT/deploy/install.sh"
  mkdir -p "$fixture_root/project/deploy"
  printf '%s\n' \
    '#!/usr/bin/env bash' \
    'printf "%s\n" "$*" >>"${NATIVE_BOUNDARY_RESTORE_LOG:?}"' \
    >"$fixture_root/project/deploy/trex_native_boundary.sh"
  chmod 0755 "$fixture_root/project/deploy/trex_native_boundary.sh"
  printf '# TRex WebUI native boundary snapshot v1: %s\n' "$snapshot_state" \
    >"$fixture_root/snapshot"
  chmod 0600 "$fixture_root/snapshot"

  PROJECT_ROOT="$fixture_root/project"
  NATIVE_BOUNDARY_SNAPSHOT="$fixture_root/snapshot"
  NATIVE_BOUNDARY_SNAPSHOT_CAPTURED=1
  NATIVE_BOUNDARY_RUNTIME_MUTATED=1
  export NATIVE_BOUNDARY_RESTORE_LOG="$restore_log"
  systemctl() {
    [[ "$*" == "show trex-daemon-server.service --property=ActiveState --value" ]] || return 2
    [[ "$daemon_state" != "query-error" ]] || return 1
    printf '%s\n' "$daemon_state"
  }
  ss() {
    [[ "$*" == "-H -ltn" ]] || return 2
    [[ -z "$native_listener" ]] || printf 'LISTEN 0 128 %s 0.0.0.0:*\n' "$native_listener"
  }

  if [[ "$expected_outcome" == "restore" ]]; then
    restore_native_boundary_snapshot
    [[ "$NATIVE_BOUNDARY_RUNTIME_MUTATED" -eq 0 ]] || \
      fail "successful native-boundary rollback retained the mutation marker"
    grep -Fqx "restore $NATIVE_BOUNDARY_SNAPSHOT" "$restore_log" || \
      fail "safe native-boundary rollback did not invoke the exact snapshot restore"
  else
    if restore_native_boundary_snapshot >/dev/null 2>&1; then
      fail "unsafe native-boundary rollback unexpectedly restored an absent boundary"
    fi
    [[ ! -s "$restore_log" ]] || \
      fail "unsafe native-boundary rollback reached the restore mutation"
    [[ "$NATIVE_BOUNDARY_RUNTIME_MUTATED" -eq 1 ]] || \
      fail "unsafe native-boundary rollback cleared the fail-closed mutation marker"
  fi
)

# A daemon-reload or daemon-stop failure can leave the newly started unit in an
# uncertain state. The final rollback guard must keep the reject table unless
# both systemd and the native listener set prove that the daemon is stopped.
native_boundary_rollback_fixture absent active "" retain || \
  fail "active-daemon rollback did not retain the managed native boundary"
native_boundary_rollback_fixture absent query-error "" retain || \
  fail "uncertain-daemon rollback did not retain the managed native boundary"
native_boundary_rollback_fixture absent inactive "0.0.0.0:4501" retain || \
  fail "native-listener rollback did not retain the managed native boundary"
native_boundary_rollback_fixture absent inactive "" restore || \
  fail "stopped-daemon rollback did not restore the previously absent boundary"
native_boundary_rollback_fixture managed active "" restore || \
  fail "managed snapshot rollback was incorrectly blocked by an active daemon"

persistent_native_boundary_rollback_fixture() (
  # shellcheck source=deploy/install.sh
  source "$PROJECT_ROOT/deploy/install.sh"
  local fixture_root="$TEST_ROOT/persistent-native-boundary-rollback"
  local systemctl_log="$fixture_root/systemctl.log"
  mkdir -p "$fixture_root/systemd/nftables.service.d" "$fixture_root/libexec"

  DAEMON_SYSTEMD_SERVICE_TARGET="$fixture_root/systemd/trex-daemon-server.service"
  DAEMON_SUPERVISOR_TARGET="$fixture_root/libexec/trex_daemon_supervisor.py"
  DAEMON_RPC_PROBE_TARGET="$fixture_root/libexec/daemon_rpc_probe.py"
  DAEMON_NATIVE_BOUNDARY_TARGET="$fixture_root/libexec/trex_native_boundary.sh"
  NFTABLES_SYSTEMD_DROPIN_ROOT="$fixture_root/systemd/nftables.service.d"
  NFTABLES_SYSTEMD_DROPIN_TARGET="$NFTABLES_SYSTEMD_DROPIN_ROOT/trex-webui-native-boundary.conf"
  NATIVE_BOUNDARY_SNAPSHOT_ROOT="$fixture_root"
  NATIVE_BOUNDARY_SNAPSHOT="$fixture_root/native.snapshot"
  printf '# TRex WebUI native boundary snapshot v1: absent\n' >"$NATIVE_BOUNDARY_SNAPSHOT"
  chmod 0600 "$NATIVE_BOUNDARY_SNAPSHOT"
  NATIVE_BOUNDARY_SNAPSHOT_CAPTURED=1
  NATIVE_BOUNDARY_RUNTIME_MUTATED=1

  local target backup variable_prefix
  for variable_prefix in \
    DAEMON_SYSTEMD_CONFIG \
    DAEMON_SUPERVISOR \
    DAEMON_RPC_PROBE \
    DAEMON_NATIVE_BOUNDARY \
    NFTABLES_SYSTEMD_DROPIN; do
    case "$variable_prefix" in
      DAEMON_SYSTEMD_CONFIG)
        target="$DAEMON_SYSTEMD_SERVICE_TARGET"
        ;;
      DAEMON_SUPERVISOR)
        target="$DAEMON_SUPERVISOR_TARGET"
        ;;
      DAEMON_RPC_PROBE)
        target="$DAEMON_RPC_PROBE_TARGET"
        ;;
      DAEMON_NATIVE_BOUNDARY)
        target="$DAEMON_NATIVE_BOUNDARY_TARGET"
        ;;
      NFTABLES_SYSTEMD_DROPIN)
        target="$NFTABLES_SYSTEMD_DROPIN_TARGET"
        ;;
    esac
    backup="${target}.rollback"
    printf 'new-safe-%s\n' "$variable_prefix" >"$target"
    printf 'old-unsafe-%s\n' "$variable_prefix" >"$backup"
    printf -v "${variable_prefix}_BACKUP" '%s' "$backup"
    printf -v "${variable_prefix}_EXISTED" '%s' 1
    printf -v "${variable_prefix}_PUBLISHED" '%s' 1
  done

  SYSTEMD_RELOAD_ATTEMPTED=1
  DAEMON_RESTART_ATTEMPTED=1
  SERVICE_STATE_CAPTURED=1
  PREVIOUS_DAEMON_WAS_ACTIVE=1
  systemctl() {
    printf '%s\n' "$*" >>"$systemctl_log"
    if [[ "$*" == "show trex-daemon-server.service --property=ActiveState --value" ]]; then
      printf 'active\n'
    fi
    return 0
  }
  ss() {
    printf 'LISTEN 0 128 0.0.0.0:4501 0.0.0.0:*\n'
  }

  if rollback_configs >/dev/null 2>&1; then
    fail "unsafe absent-boundary rollback unexpectedly reported an exact restore"
  fi
  cleanup_install_temp

  for variable_prefix in \
    DAEMON_SYSTEMD_CONFIG \
    DAEMON_SUPERVISOR \
    DAEMON_RPC_PROBE \
    DAEMON_NATIVE_BOUNDARY \
    NFTABLES_SYSTEMD_DROPIN; do
    case "$variable_prefix" in
      DAEMON_SYSTEMD_CONFIG)
        target="$DAEMON_SYSTEMD_SERVICE_TARGET"
        ;;
      DAEMON_SUPERVISOR)
        target="$DAEMON_SUPERVISOR_TARGET"
        ;;
      DAEMON_RPC_PROBE)
        target="$DAEMON_RPC_PROBE_TARGET"
        ;;
      DAEMON_NATIVE_BOUNDARY)
        target="$DAEMON_NATIVE_BOUNDARY_TARGET"
        ;;
      NFTABLES_SYSTEMD_DROPIN)
        target="$NFTABLES_SYSTEMD_DROPIN_TARGET"
        ;;
    esac
    [[ "$(<"$target")" == "new-safe-$variable_prefix" ]] || \
      fail "rollback cleanup removed durable $variable_prefix native-boundary authority"
    [[ ! -e "${target}.rollback" ]] || \
      fail "rollback cleanup retained obsolete $variable_prefix backup"
  done
  grep -Fqx "daemon-reload" "$systemctl_log" || \
    fail "fail-closed rollback did not reload retained safe units"
  grep -Fqx "restart trex-daemon-server.service" "$systemctl_log" || \
    fail "fail-closed rollback did not restart through the retained safe daemon unit"
)

persistent_native_boundary_rollback_fixture || \
  fail "failed rollback did not retain durable native-boundary authority"

managed_snapshot_restore_failure_fixture() (
  # shellcheck source=deploy/install.sh
  source "$PROJECT_ROOT/deploy/install.sh"
  local fixture_root="$TEST_ROOT/managed-snapshot-restore-failure"
  local systemctl_log="$fixture_root/systemctl.log"
  local restore_log="$fixture_root/restore.log"
  mkdir -p \
    "$fixture_root/project/deploy" \
    "$fixture_root/systemd/nftables.service.d" \
    "$fixture_root/libexec"
  printf '%s\n' \
    '#!/usr/bin/env bash' \
    'printf "%s\n" "$*" >>"${NATIVE_BOUNDARY_RESTORE_LOG:?}"' \
    '[[ "${1:-}" != "restore" ]]' \
    >"$fixture_root/project/deploy/trex_native_boundary.sh"
  chmod 0755 "$fixture_root/project/deploy/trex_native_boundary.sh"

  PROJECT_ROOT="$fixture_root/project"
  DAEMON_SYSTEMD_SERVICE_TARGET="$fixture_root/systemd/trex-daemon-server.service"
  DAEMON_SUPERVISOR_TARGET="$fixture_root/libexec/trex_daemon_supervisor.py"
  DAEMON_RPC_PROBE_TARGET="$fixture_root/libexec/daemon_rpc_probe.py"
  DAEMON_NATIVE_BOUNDARY_TARGET="$fixture_root/libexec/trex_native_boundary.sh"
  NFTABLES_SYSTEMD_DROPIN_ROOT="$fixture_root/systemd/nftables.service.d"
  NFTABLES_SYSTEMD_DROPIN_TARGET="$NFTABLES_SYSTEMD_DROPIN_ROOT/trex-webui-native-boundary.conf"
  NATIVE_BOUNDARY_SNAPSHOT_ROOT="$fixture_root"
  NATIVE_BOUNDARY_SNAPSHOT="$fixture_root/native.snapshot"
  printf '# TRex WebUI native boundary snapshot v1: managed\n' >"$NATIVE_BOUNDARY_SNAPSHOT"
  chmod 0600 "$NATIVE_BOUNDARY_SNAPSHOT"
  NATIVE_BOUNDARY_SNAPSHOT_CAPTURED=1
  NATIVE_BOUNDARY_RUNTIME_MUTATED=1
  export NATIVE_BOUNDARY_RESTORE_LOG="$restore_log"

  local target backup variable_prefix
  for variable_prefix in \
    DAEMON_SYSTEMD_CONFIG \
    DAEMON_SUPERVISOR \
    DAEMON_RPC_PROBE \
    DAEMON_NATIVE_BOUNDARY \
    NFTABLES_SYSTEMD_DROPIN; do
    case "$variable_prefix" in
      DAEMON_SYSTEMD_CONFIG)
        target="$DAEMON_SYSTEMD_SERVICE_TARGET"
        ;;
      DAEMON_SUPERVISOR)
        target="$DAEMON_SUPERVISOR_TARGET"
        ;;
      DAEMON_RPC_PROBE)
        target="$DAEMON_RPC_PROBE_TARGET"
        ;;
      DAEMON_NATIVE_BOUNDARY)
        target="$DAEMON_NATIVE_BOUNDARY_TARGET"
        ;;
      NFTABLES_SYSTEMD_DROPIN)
        target="$NFTABLES_SYSTEMD_DROPIN_TARGET"
        ;;
    esac
    backup="${target}.rollback"
    printf 'new-safe-%s\n' "$variable_prefix" >"$target"
    printf 'old-unsafe-%s\n' "$variable_prefix" >"$backup"
    chmod 0755 "$target"
    chmod 0600 "$backup"
    printf -v "${variable_prefix}_BACKUP" '%s' "$backup"
    printf -v "${variable_prefix}_EXISTED" '%s' 1
    printf -v "${variable_prefix}_PUBLISHED" '%s' 1
  done

  SYSTEMD_RELOAD_ATTEMPTED=1
  DAEMON_RESTART_ATTEMPTED=1
  SERVICE_STATE_CAPTURED=1
  PREVIOUS_DAEMON_WAS_ACTIVE=1
  systemctl() {
    printf '%s\n' "$*" >>"$systemctl_log"
    return 0
  }

  if rollback_configs >/dev/null 2>&1; then
    fail "managed snapshot restore failure unexpectedly reported a complete rollback"
  fi
  cleanup_install_temp

  for variable_prefix in \
    DAEMON_SYSTEMD_CONFIG \
    DAEMON_SUPERVISOR \
    DAEMON_RPC_PROBE \
    DAEMON_NATIVE_BOUNDARY \
    NFTABLES_SYSTEMD_DROPIN; do
    case "$variable_prefix" in
      DAEMON_SYSTEMD_CONFIG)
        target="$DAEMON_SYSTEMD_SERVICE_TARGET"
        ;;
      DAEMON_SUPERVISOR)
        target="$DAEMON_SUPERVISOR_TARGET"
        ;;
      DAEMON_RPC_PROBE)
        target="$DAEMON_RPC_PROBE_TARGET"
        ;;
      DAEMON_NATIVE_BOUNDARY)
        target="$DAEMON_NATIVE_BOUNDARY_TARGET"
        ;;
      NFTABLES_SYSTEMD_DROPIN)
        target="$NFTABLES_SYSTEMD_DROPIN_TARGET"
        ;;
    esac
    [[ "$(<"$target")" == "new-safe-$variable_prefix" ]] || \
      fail "managed snapshot restore failure replaced durable $variable_prefix authority"
    [[ "$(stat -c '%a' "$target")" == "755" ]] || \
      fail "managed snapshot restore failure restored unsafe $variable_prefix mode"
    [[ ! -e "${target}.rollback" ]] || \
      fail "managed snapshot restore failure retained obsolete $variable_prefix backup"
  done
  grep -Fqx "restore $NATIVE_BOUNDARY_SNAPSHOT" "$restore_log" || \
    fail "managed snapshot failure fixture did not reach the injected restore failure"
  grep -Fqx "daemon-reload" "$systemctl_log" || \
    fail "managed snapshot failure did not reload retained safe units"
  grep -Fqx "restart trex-daemon-server.service" "$systemctl_log" || \
    fail "managed snapshot failure did not restart through the retained safe daemon unit"
)

managed_snapshot_restore_failure_fixture || \
  fail "managed snapshot restore failure discarded durable native-boundary authority"

conflicting_identity_fixture() (
  # shellcheck source=deploy/install.sh
  source "$PROJECT_ROOT/deploy/install.sh"
  local conflict_uid conflict_gid_min conflict_system_gid
  conflict_uid="$(account_id_min UID_MIN 1000)"
  conflict_gid_min="$(account_id_min GID_MIN 1000)"
  conflict_system_gid=$((conflict_gid_min - 1))
  (( conflict_system_gid > 0 )) || conflict_system_gid=1
  getent() {
    case "$1" in
      group)
        printf 'trex-webui:x:%s:\n' "$conflict_system_gid"
        ;;
      passwd)
        printf 'trex-webui:x:%s:%s:TRex WebUI:/var/lib/trex-webui:/usr/sbin/nologin\n' \
          "$conflict_uid" "$conflict_system_gid"
        ;;
      *)
        return 2
        ;;
    esac
  }
  id() {
    printf '%s\n' "$conflict_system_gid"
  }
  validate_service_identity
)

conflicting_group_fixture() (
  # shellcheck source=deploy/install.sh
  source "$PROJECT_ROOT/deploy/install.sh"
  local conflict_gid
  conflict_gid="$(account_id_min GID_MIN 1000)"
  getent() {
    printf 'trex-webui:x:%s:\n' "$conflict_gid"
  }
  validate_service_group
)

missing_identity_dry_run_fixture() (
  # shellcheck source=deploy/install.sh
  source "$PROJECT_ROOT/deploy/install.sh"
  DRY_RUN=1
  getent() {
    return 2
  }
  provision_service_identity
)

checkout_install_dry_run_fixture() (
  # Keep a host's already-installed API unit from changing checkout-local
  # dry-run behavior. Likewise, quarantine the checkout fixture from either
  # generation of recovery drop-ins already installed on this real host.
  # shellcheck source=deploy/install.sh
  source "$PROJECT_ROOT/deploy/install.sh"
  local fixture_root="$TEST_ROOT/checkout-install-plan"
  local fixture_systemd_prefix="trex-webui-release-safety-${BASHPID}"
  mkdir -p "$fixture_root/systemd"
  PROJECT_ROOT="$PACKAGE_PROJECT"
  SYSTEMD_SERVICE_TARGET="$fixture_root/systemd/trex-webui-api.service"
  RELEASE_RECONCILER_NGINX_DROPIN_ROOT="/etc/systemd/system/${fixture_systemd_prefix}-nginx.service.d"
  RELEASE_RECONCILER_NGINX_DROPIN_TARGET="$RELEASE_RECONCILER_NGINX_DROPIN_ROOT/trex-webui-release-reconcile-v2.conf"
  RELEASE_RECONCILER_API_DROPIN_ROOT="/etc/systemd/system/${fixture_systemd_prefix}-api.service.d"
  RELEASE_RECONCILER_API_DROPIN_TARGET="$RELEASE_RECONCILER_API_DROPIN_ROOT/trex-webui-release-reconcile-v2.conf"
  RELEASE_RECONCILER_DAEMON_DROPIN_ROOT="/etc/systemd/system/${fixture_systemd_prefix}-daemon.service.d"
  RELEASE_RECONCILER_DAEMON_DROPIN_TARGET="$RELEASE_RECONCILER_DAEMON_DROPIN_ROOT/trex-webui-release-reconcile-v2.conf"
  RELEASE_V1_RECONCILER_BRIDGE_DROPIN_ROOT="/etc/systemd/system/${fixture_systemd_prefix}-v1-reconcile.service.d"
  RELEASE_V1_RECONCILER_BRIDGE_DROPIN_TARGET="$RELEASE_V1_RECONCILER_BRIDGE_DROPIN_ROOT/trex-webui-recovery-v2-bridge.conf"
  RELEASE_V1_RETRY_BRIDGE_DROPIN_ROOT="/etc/systemd/system/${fixture_systemd_prefix}-v1-retry.service.d"
  RELEASE_V1_RETRY_BRIDGE_DROPIN_TARGET="$RELEASE_V1_RETRY_BRIDGE_DROPIN_ROOT/trex-webui-recovery-v2-bridge.conf"
  RELEASE_V1_ACK_BRIDGE_DROPIN_ROOT="/etc/systemd/system/${fixture_systemd_prefix}-v1-ack.service.d"
  RELEASE_V1_ACK_BRIDGE_DROPIN_TARGET="$RELEASE_V1_ACK_BRIDGE_DROPIN_ROOT/trex-webui-recovery-v2-bridge.conf"
  main "$@"
)

overlapping_daemon_authority_fixture() (
  # shellcheck source=deploy/upgrade.sh
  source "$PROJECT_ROOT/deploy/upgrade.sh"
  DRY_RUN=1
  MANAGE_LOCAL_DAEMON=1
  INSTALL_ROOT="/opt/trex-webui"
  TREX_DAEMON_SCRIPTS_DIR="$INSTALL_ROOT/vendor/trex/scripts"
  TREX_DAEMON_BIN="$TREX_DAEMON_SCRIPTS_DIR/trex_daemon_server"
  normalize_paths
)

write_checksum() {
  local archive="$1"
  local digest
  digest="$(sha256sum -- "$archive")"
  digest="${digest%% *}"
  printf '%s  %s\n' "$digest" "$(basename -- "$archive")" >"$archive.sha256"
}

make_fixture_archive() {
  local archive="$1"
  local fixture_kind="$2"
  python3.11 - \
    "$archive" \
    "$fixture_kind" \
    "$PROJECT_ROOT/deploy/release_transaction.py" \
    "$PROJECT_ROOT" <<'PY'
from __future__ import annotations

import io
import hashlib
import json
from pathlib import Path
import sys
import tarfile


archive_path, fixture_kind, release_transaction_path, project_root_text = sys.argv[1:]
project_root = Path(project_root_text)
root = "trex-webui-test-release"
if fixture_kind == "failing-install":
    install_script = b"#!/usr/bin/env bash\nexit 42\n"
elif fixture_kind == "failing-venv-install":
    install_script = b"""#!/usr/bin/env bash
set -Eeuo pipefail
package_root="$(cd -- "$(dirname -- "$0")/.." && pwd)"
mkdir -p "$package_root/.venv"
printf 'new-release\\n' >"$package_root/.venv/release-sentinel"
exit 42
"""
else:
    install_script = b"#!/usr/bin/env bash\nexit 0\n"
required = {
    "LICENSE": b"Apache-2.0 fixture\n",
    "NOTICE": b"TRex WebUI fixture\n",
    "THIRD_PARTY_NOTICES.md": b"# Third-party fixture\n",
    "SBOM.python.cdx.json": b"{}\n",
    "SBOM.web.cdx.json": b"{}\n",
    "apps/api/requirements-dev.lock": b"-r requirements.lock\n",
    "apps/api/requirements-dev.txt": b"-r requirements.txt\n",
    "apps/api/requirements.lock": b"fastapi==0.110.3\n",
    "apps/api/requirements.txt": b"fastapi==0.110.3\n",
    "apps/web/package-lock.json": b'{"lockfileVersion":3}\n',
    "apps/web/package.json": b'{"name":"fixture","version":"0.0.0"}\n',
    "apps/web/dist/index.html": b"<div id=\"root\"></div>\n",
    "deploy/archive_safety.py": b"# fixture\n",
    "deploy/bootstrap_release_infrastructure.py": (
        project_root / "deploy/bootstrap_release_infrastructure.py"
    ).read_bytes(),
    "deploy/daemon_rpc_probe.py": b"#!/usr/bin/env python3\n# fixture\n",
    "deploy/install.sh": install_script,
    "deploy/logrotate/trex-daemon-server": b"# fixture\n",
    "deploy/path_safety.sh": b"# fixture\n",
    # Archive upgrades execute this exact verified engine. A stub would test a
    # different transaction boundary and fail before selector rollback runs.
    "deploy/release_transaction.py": Path(release_transaction_path).read_bytes(),
    "deploy/systemd/trex-daemon-server.service": b"[Service]\nExecStart=/bin/true\n",
    "deploy/systemd/nftables-trex-webui.conf": b"[Service]\nExecStart=/bin/true\n",
    # ABI v1 fixtures remain explicit because the v2 bootstrap must verify and
    # quarantine an already-installed immutable recovery authority.
    "deploy/systemd/nginx-trex-webui-release-reconcile.conf": b"[Unit]\nRequires=trex-webui-release-reconcile.service\nAfter=trex-webui-release-reconcile.service\n",
    "deploy/systemd/trex-webui-api.service": b"[Service]\nExecStart=/bin/true\n",
    "deploy/systemd/trex-webui-release-consumer-ack.service": b"[Service]\nExecStart=/bin/true\n",
    "deploy/systemd/trex-webui-release-reconcile.service": b"[Service]\nExecStart=/bin/true\n",
    "deploy/systemd/trex-webui-release-retry.service": b"[Service]\nExecStart=/bin/true\n",
    # ABI v2 and all three v1 bridge drop-ins are mandatory package members.
    "deploy/systemd/trex-webui-release-consumer-ack-v1-bridge-v2.conf": (
        project_root / "deploy/systemd/trex-webui-release-consumer-ack-v1-bridge-v2.conf"
    ).read_bytes(),
    "deploy/systemd/trex-webui-release-consumer-ack-v2.service": (
        project_root / "deploy/systemd/trex-webui-release-consumer-ack-v2.service"
    ).read_bytes(),
    "deploy/systemd/trex-webui-release-reconcile-v1-bridge-v2.conf": (
        project_root / "deploy/systemd/trex-webui-release-reconcile-v1-bridge-v2.conf"
    ).read_bytes(),
    "deploy/systemd/trex-webui-release-reconcile-v2.conf": (
        project_root / "deploy/systemd/trex-webui-release-reconcile-v2.conf"
    ).read_bytes(),
    "deploy/systemd/trex-webui-release-reconcile-v2.service": (
        project_root / "deploy/systemd/trex-webui-release-reconcile-v2.service"
    ).read_bytes(),
    "deploy/systemd/trex-webui-release-retry-v1-bridge-v2.conf": (
        project_root / "deploy/systemd/trex-webui-release-retry-v1-bridge-v2.conf"
    ).read_bytes(),
    "deploy/systemd/trex-webui-release-retry-v2.service": (
        project_root / "deploy/systemd/trex-webui-release-retry-v2.service"
    ).read_bytes(),
    "deploy/trex_daemon_supervisor.py": b"#!/usr/bin/env python3\n# fixture\n",
    "deploy/trex_native_boundary.sh": b"#!/usr/bin/env bash\n# fixture\n",
    "deploy/trex_overview_contract.py": (
        project_root / "deploy/trex_overview_contract.py"
    ).read_bytes(),
    "deploy/trex_persisted_state_contract.py": (
        project_root / "deploy/trex_persisted_state_contract.py"
    ).read_bytes(),
    "deploy/trex-webui": b"#!/usr/bin/env python3\n",
    "deploy/upgrade.sh": b"#!/usr/bin/env bash\nexit 0\n",
    "deploy/verified_upgrade.sh": b"#!/usr/bin/env bash\nexit 0\n",
    "deploy/verify.sh": b"#!/usr/bin/env bash\nexit 0\n",
    "scripts/release_contract.py": b"#!/usr/bin/env python3\n# fixture\n",
    "scripts/release_evidence.py": b"#!/usr/bin/env python3\n# fixture\n",
    "scripts/release_metadata.py": b"#!/usr/bin/env python3\n# fixture\n",
}


def sha256(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def file_entry(name: str, content: bytes, mode: int) -> dict[str, object]:
    return {
        "path": name,
        "type": "file",
        "mode": f"{mode:04o}",
        "size": len(content),
        "sha256": sha256(content),
    }


file_modes = {
    name: 0o755 if name in {
        "deploy/bootstrap_release_infrastructure.py",
        "deploy/daemon_rpc_probe.py",
        "deploy/install.sh",
        "deploy/release_transaction.py",
        "deploy/trex_daemon_supervisor.py",
        "deploy/trex_native_boundary.sh",
        "deploy/trex_overview_contract.py",
        "deploy/trex_persisted_state_contract.py",
        "deploy/trex-webui",
        "deploy/upgrade.sh",
        "deploy/verified_upgrade.sh",
        "deploy/verify.sh",
        "scripts/release_contract.py",
        "scripts/release_evidence.py",
        "scripts/release_metadata.py",
    } else 0o644
    for name in required
}
release_payload = (
    b"replacement\n"
    if fixture_kind == "alternate-valid"
    else b"new\n"
)
manifested_files = {**required, "new-release-file": release_payload}
manifested_modes = {**file_modes, "new-release-file": 0o644}
entries = [
    file_entry(name, content, manifested_modes[name])
    for name, content in sorted(manifested_files.items())
]
payload_algorithm = "sha256(canonical-json(release-file-manifest)-v1)"
payload_digest = sha256(
    json.dumps(
        {"algorithm": payload_algorithm, "files": entries},
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
)
source_algorithm = "sha256(canonical-json(git-sha,path,type,mode,size,content-sha256)-v1)"
source_digest = "1" * 64
git_sha = "2" * 40
release_provenance = {
    "schema": "trex-webui-release-provenance/v1",
    "kind": "local-build",
    "publishable": False,
    "source_sha": git_sha,
    "source_dirty": True,
}
manifest = {
    "schema": "trex-webui-release/v3",
    "name": root,
    "version": "test",
    "created_at": "2026-07-22T00:00:00Z",
    "git_commit": git_sha,
    "git_dirty": True,
    "source_digest": source_digest,
    "source_identity": {
        "algorithm": source_algorithm,
        "digest": source_digest,
        "file_count": 1,
        "path_set": "git ls-files --cached --others --exclude-standard",
        "git": {
            "sha": git_sha,
            "branch": "fixture",
            "dirty": True,
            "status_sha256": "3" * 64,
        },
    },
    "release_repository": None,
    "release_ref": None,
    "signer_workflow": None,
    "release_provenance": release_provenance,
    "payload_identity": {
        "algorithm": payload_algorithm,
        "digest": payload_digest,
        "file_count": len(entries),
        "manifest_path": "RELEASE_MANIFEST.json",
        "manifest_excluded": True,
        "files": entries,
    },
}
if fixture_kind == "manifest-digest":
    manifest["payload_identity"]["digest"] = "0" * 64
manifest_content = json.dumps(manifest, indent=2, sort_keys=True).encode("utf-8") + b"\n"

archive_files = dict(manifested_files)
archive_modes = dict(manifested_modes)
if fixture_kind == "payload-changed":
    archive_files["new-release-file"] = b"changed\n"
elif fixture_kind == "payload-extra":
    archive_files["unmanifested-file"] = b"extra\n"
    archive_modes["unmanifested-file"] = 0o644
elif fixture_kind == "payload-missing":
    archive_files.pop("new-release-file")
elif fixture_kind == "payload-mode":
    archive_modes["new-release-file"] = 0o600


def add_bytes(archive: tarfile.TarFile, name: str, content: bytes, mode: int = 0o644) -> None:
    member = tarfile.TarInfo(name)
    member.mode = mode
    member.size = len(content)
    archive.addfile(member, io.BytesIO(content))


with tarfile.open(archive_path, "w:gz") as archive:
    add_bytes(archive, f"{root}/RELEASE_MANIFEST.json", manifest_content)
    for name, content in archive_files.items():
        add_bytes(archive, f"{root}/{name}", content, archive_modes[name])
    if fixture_kind == "traversal":
        add_bytes(archive, f"{root}/../../escape", b"escape\n")
    elif fixture_kind == "absolute":
        add_bytes(archive, "/absolute-escape", b"escape\n")
    elif fixture_kind == "symlink":
        member = tarfile.TarInfo(f"{root}/dangerous-link")
        member.type = tarfile.SYMTYPE
        member.linkname = "../../etc/passwd"
        archive.addfile(member)
    elif fixture_kind == "device":
        member = tarfile.TarInfo(f"{root}/dangerous-device")
        member.type = tarfile.CHRTYPE
        member.devmajor = 1
        member.devminor = 3
        archive.addfile(member)
PY
  write_checksum "$archive"
}

upgrade_dry_run() {
  local archive="$1"
  shift
  "$PROJECT_ROOT/deploy/upgrade.sh" \
    --archive "$archive" \
    --install-root "$TEST_ROOT/install" \
    --web-root "$TEST_ROOT/web" \
    --backup-root "$TEST_ROOT/static-backups" \
    --source-backup-root "$TEST_ROOT/source-backups" \
    --dry-run \
    --skip-python-deps \
    --skip-enable \
    --skip-restart \
    --sync-method portable \
    "$@"
}

PACKAGE_PROJECT="$TEST_ROOT/package-project"
git clone --quiet --no-local "$PROJECT_ROOT" "$PACKAGE_PROJECT"
# Exercise the release-chain implementation under test even before it has
# become the cloned checkout's HEAD.  The fixture is intentionally packaged
# with --allow-dirty below, so these exact overlays remain part of its source
# identity rather than bypassing that identity.
for release_path in \
  deploy/archive_safety.py \
  deploy/bootstrap_release_infrastructure.py \
  deploy/package.sh \
  deploy/release_transaction.py \
  deploy/systemd/trex-daemon-server.service \
  deploy/systemd/nginx-trex-webui-release-reconcile.conf \
  deploy/systemd/trex-webui-api.service \
  deploy/systemd/trex-webui-release-consumer-ack-v1-bridge-v2.conf \
  deploy/systemd/trex-webui-release-consumer-ack-v2.service \
  deploy/systemd/trex-webui-release-consumer-ack.service \
  deploy/systemd/trex-webui-release-reconcile-v1-bridge-v2.conf \
  deploy/systemd/trex-webui-release-reconcile-v2.conf \
  deploy/systemd/trex-webui-release-reconcile-v2.service \
  deploy/systemd/trex-webui-release-reconcile.service \
  deploy/systemd/trex-webui-release-retry-v1-bridge-v2.conf \
  deploy/systemd/trex-webui-release-retry-v2.service \
  deploy/systemd/trex-webui-release-retry.service \
  deploy/trex_overview_contract.py \
  deploy/trex_persisted_state_contract.py \
  deploy/trex-webui \
  deploy/verified_upgrade.sh \
  scripts/release_contract.py \
  scripts/release_evidence.py \
  scripts/release_metadata.py; do
  cp -p -- "$PROJECT_ROOT/$release_path" "$PACKAGE_PROJECT/$release_path"
done
mkdir -p "$PACKAGE_PROJECT/apps/web/dist" "$PACKAGE_PROJECT/.venv/bin"
printf '<div id="root"></div>\n' >"$PACKAGE_PROJECT/apps/web/dist/index.html"
printf '#!/usr/bin/env bash\nexec %q "$@"\n' \
  "$PROJECT_ROOT/.venv/bin/python" >"$PACKAGE_PROJECT/.venv/bin/python"
chmod 0755 "$PACKAGE_PROJECT/.venv/bin/python"

PACKAGE_OUTPUT="$TEST_ROOT/package-output"
IGNORED_ENV_PATH="$PACKAGE_PROJECT/apps/api/.env.release-safety-test"
[[ ! -e "$IGNORED_ENV_PATH" && ! -L "$IGNORED_ENV_PATH" ]] || \
  fail "ignored package safety fixture already exists: $IGNORED_ENV_PATH"
printf 'TREX_WEBUI_TEST_SECRET=must-not-be-packaged\n' >"$IGNORED_ENV_PATH"
env PATH=/usr/bin:/bin \
  TREX_WEBUI_PACKAGE_PYTHON="$PROJECT_ROOT/.venv/bin/python" \
  "$PROJECT_ROOT/deploy/package.sh" \
  --project-root "$PACKAGE_PROJECT" \
  --skip-build \
  --allow-dirty \
  --output-dir "$PACKAGE_OUTPUT" \
  --name trex-webui-release-safety-test >/dev/null
VALID_ARCHIVE="$PACKAGE_OUTPUT/trex-webui-release-safety-test.tar.gz"
(cd "$PACKAGE_OUTPUT" && sha256sum -c "$(basename -- "$VALID_ARCHIVE").sha256" >/dev/null)
python3.11 "$PROJECT_ROOT/deploy/archive_safety.py" "$VALID_ARCHIVE" >/dev/null
upgrade_dry_run "$VALID_ARCHIVE" >/dev/null
python3.11 - "$VALID_ARCHIVE" <<'PY'
from __future__ import annotations

import json
import sys
import tarfile


with tarfile.open(sys.argv[1], "r:gz") as archive:
    manifest_member = next(member for member in archive if member.name.endswith("/RELEASE_MANIFEST.json"))
    source = archive.extractfile(manifest_member)
    assert source is not None
    manifest = json.load(source)

assert manifest["schema"] == "trex-webui-release/v3"
assert len(manifest["git_commit"]) == 40
assert isinstance(manifest["git_dirty"], bool)
assert "branch" not in manifest["source_identity"]["git"]
assert len(manifest["source_digest"]) == 64
assert manifest["release_repository"] is None
assert manifest["release_ref"] is None
assert manifest["signer_workflow"] is None
assert manifest["release_provenance"]["kind"] == "local-build"
assert manifest["release_provenance"]["publishable"] is False
payload = manifest["payload_identity"]
assert payload["algorithm"] == "sha256(canonical-json(release-file-manifest)-v1)"
assert len(payload["digest"]) == 64
assert payload["file_count"] == len(payload["files"])
assert payload["manifest_excluded"] is True
assert all(entry["path"] != "RELEASE_MANIFEST.json" for entry in payload["files"])
assert all(set(entry) == {"path", "type", "mode", "size", "sha256"} for entry in payload["files"])
assert {entry["mode"] for entry in payload["files"]} <= {"0644", "0755"}
files = {entry["path"]: entry for entry in payload["files"]}
assert files["apps/api/app/main.py"]["mode"] == "0644"
assert files["deploy/archive_safety.py"]["mode"] == "0644"
assert files["deploy/bootstrap_release_infrastructure.py"]["mode"] == "0755"
assert files["deploy/install.sh"]["mode"] == "0755"
assert files["deploy/trex-webui"]["mode"] == "0755"
assert files["deploy/release_transaction.py"]["mode"] == "0755"
assert files["deploy/systemd/nginx-trex-webui-release-reconcile.conf"]["mode"] == "0644"
assert files["deploy/systemd/trex-webui-release-consumer-ack-v1-bridge-v2.conf"]["mode"] == "0644"
assert files["deploy/systemd/trex-webui-release-consumer-ack-v2.service"]["mode"] == "0644"
assert files["deploy/systemd/trex-webui-release-consumer-ack.service"]["mode"] == "0644"
assert files["deploy/systemd/trex-webui-release-reconcile-v1-bridge-v2.conf"]["mode"] == "0644"
assert files["deploy/systemd/trex-webui-release-reconcile-v2.conf"]["mode"] == "0644"
assert files["deploy/systemd/trex-webui-release-reconcile-v2.service"]["mode"] == "0644"
assert files["deploy/systemd/trex-webui-release-reconcile.service"]["mode"] == "0644"
assert files["deploy/systemd/trex-webui-release-retry-v1-bridge-v2.conf"]["mode"] == "0644"
assert files["deploy/systemd/trex-webui-release-retry-v2.service"]["mode"] == "0644"
assert files["deploy/systemd/trex-webui-release-retry.service"]["mode"] == "0644"
assert files["deploy/trex_native_boundary.sh"]["mode"] == "0755"
assert files["deploy/trex_overview_contract.py"]["mode"] == "0755"
assert files["deploy/trex_persisted_state_contract.py"]["mode"] == "0755"
assert files["deploy/verified_upgrade.sh"]["mode"] == "0755"
assert files["scripts/release_metadata.py"]["mode"] == "0755"
assert files["LICENSE"]["mode"] == "0644"
assert files["NOTICE"]["mode"] == "0644"
assert files["THIRD_PARTY_NOTICES.md"]["mode"] == "0644"
assert files["public-source-policy.json"]["mode"] == "0644"
assert files["SBOM.web.cdx.json"]["mode"] == "0644"
assert files["SBOM.python.cdx.json"]["mode"] == "0644"
assert files["apps/web/package.json"]["mode"] == "0644"
assert files["apps/web/package-lock.json"]["mode"] == "0644"
assert "apps/api/.env.release-safety-test" not in files
PY

REPRODUCIBLE_OUTPUT="$TEST_ROOT/reproducible-output"
env PATH=/usr/bin:/bin \
  TREX_WEBUI_PACKAGE_PYTHON="$PROJECT_ROOT/.venv/bin/python" \
  "$PROJECT_ROOT/deploy/package.sh" \
  --project-root "$PACKAGE_PROJECT" \
  --skip-build \
  --allow-dirty \
  --output-dir "$REPRODUCIBLE_OUTPUT" \
  --name trex-webui-release-safety-test >/dev/null
cmp -s \
  "$VALID_ARCHIVE" \
  "$REPRODUCIBLE_OUTPUT/trex-webui-release-safety-test.tar.gz" || \
  fail "same source and package name did not produce a byte-identical archive"

# A publishable package is a distinct contract: it must come from a clean
# exact-tag checkout and bind the repository plus signer workflow identity.
git -C "$PACKAGE_PROJECT" config user.name "TRex WebUI release test"
git -C "$PACKAGE_PROJECT" config user.email "release-test@invalid.example"
git -C "$PACKAGE_PROJECT" add \
  deploy/archive_safety.py \
  deploy/bootstrap_release_infrastructure.py \
  deploy/package.sh \
  deploy/release_transaction.py \
  deploy/systemd/trex-daemon-server.service \
  deploy/systemd/nginx-trex-webui-release-reconcile.conf \
  deploy/systemd/trex-webui-api.service \
  deploy/systemd/trex-webui-release-consumer-ack-v1-bridge-v2.conf \
  deploy/systemd/trex-webui-release-consumer-ack-v2.service \
  deploy/systemd/trex-webui-release-consumer-ack.service \
  deploy/systemd/trex-webui-release-reconcile-v1-bridge-v2.conf \
  deploy/systemd/trex-webui-release-reconcile-v2.conf \
  deploy/systemd/trex-webui-release-reconcile-v2.service \
  deploy/systemd/trex-webui-release-reconcile.service \
  deploy/systemd/trex-webui-release-retry-v1-bridge-v2.conf \
  deploy/systemd/trex-webui-release-retry-v2.service \
  deploy/systemd/trex-webui-release-retry.service \
  deploy/trex_overview_contract.py \
  deploy/trex_persisted_state_contract.py \
  deploy/trex-webui \
  deploy/verified_upgrade.sh \
  scripts/release_contract.py \
  scripts/release_evidence.py \
  scripts/release_metadata.py
# The release-chain overlays may already be identical to the cloned HEAD once
# the implementation is committed. A distinct empty fixture commit still gives
# the exact-tag contract an isolated, clean source SHA to bind and verify.
git -C "$PACKAGE_PROJECT" commit --quiet --allow-empty -m "release provenance fixture"
PACKAGE_RELEASE_SHA="$(git -C "$PACKAGE_PROJECT" rev-parse HEAD)"
PACKAGE_VERSION="$(python3.11 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$PACKAGE_PROJECT/package.json")"
PACKAGE_RELEASE_REF="refs/tags/v${PACKAGE_VERSION}"
# A release-workflow checkout already carries the real version tag. This clone
# is an isolated fixture repository, so replace only its inherited tag before
# binding the same required ref shape to the fixture's distinct source commit.
if git -C "$PACKAGE_PROJECT" rev-parse --verify "$PACKAGE_RELEASE_REF" >/dev/null 2>&1; then
  git -C "$PACKAGE_PROJECT" tag --delete "v${PACKAGE_VERSION}" >/dev/null
fi
git -C "$PACKAGE_PROJECT" tag "v${PACKAGE_VERSION}"
PACKAGE_SIGNER_WORKFLOW="lenxy-ea/trex-webui/.github/workflows/release.yml"
PACKAGE_GITHUB_OUTPUT="$TEST_ROOT/package-github-output"
env PATH=/usr/bin:/bin \
  TREX_WEBUI_PACKAGE_PYTHON="$PROJECT_ROOT/.venv/bin/python" \
  GITHUB_ACTIONS=true \
  GITHUB_REPOSITORY=lenxy-ea/trex-webui \
  GITHUB_REF="$PACKAGE_RELEASE_REF" \
  GITHUB_SHA="$PACKAGE_RELEASE_SHA" \
  GITHUB_WORKFLOW_REF="${PACKAGE_SIGNER_WORKFLOW}@${PACKAGE_RELEASE_REF}" \
  GITHUB_WORKFLOW_SHA="$PACKAGE_RELEASE_SHA" \
  "$PROJECT_ROOT/deploy/package.sh" \
  --project-root "$PACKAGE_PROJECT" \
  --skip-build \
  --github-release-context \
  --output-dir "$PACKAGE_GITHUB_OUTPUT" \
  --name trex-webui-release-github-test >/dev/null
PACKAGE_GITHUB_ARCHIVE="$PACKAGE_GITHUB_OUTPUT/trex-webui-release-github-test.tar.gz"
PACKAGE_GITHUB_MANIFEST="$TEST_ROOT/package-github-manifest.json"
tar -xOf "$PACKAGE_GITHUB_ARCHIVE" \
  trex-webui-release-github-test/RELEASE_MANIFEST.json >"$PACKAGE_GITHUB_MANIFEST"
"$PROJECT_ROOT/scripts/release_contract.py" validate-manifest \
  "$PACKAGE_GITHUB_MANIFEST" \
  --publishable \
  --expected-repository lenxy-ea/trex-webui \
  --expected-release-ref "$PACKAGE_RELEASE_REF" \
  --expected-signer-workflow "$PACKAGE_SIGNER_WORKFLOW" \
  --expected-source-sha "$PACKAGE_RELEASE_SHA" >/dev/null
expect_failure "release tag does not exist" env PATH=/usr/bin:/bin \
  TREX_WEBUI_PACKAGE_PYTHON="$PROJECT_ROOT/.venv/bin/python" \
  GITHUB_ACTIONS=true \
  GITHUB_REPOSITORY=lenxy-ea/trex-webui \
  GITHUB_REF="refs/tags/v${PACKAGE_VERSION}-missing" \
  GITHUB_SHA="$PACKAGE_RELEASE_SHA" \
  GITHUB_WORKFLOW_REF="${PACKAGE_SIGNER_WORKFLOW}@refs/tags/v${PACKAGE_VERSION}-missing" \
  GITHUB_WORKFLOW_SHA="$PACKAGE_RELEASE_SHA" \
  "$PROJECT_ROOT/deploy/package.sh" \
  --project-root "$PACKAGE_PROJECT" \
  --skip-build \
  --github-release-context \
  --output-dir "$TEST_ROOT/package-missing-tag-output" \
  --name trex-webui-release-missing-tag-test

PRESERVE_OUTPUT="$TEST_ROOT/preserve-output"
mkdir "$PRESERVE_OUTPUT"
printf 'existing archive\n' >"$PRESERVE_OUTPUT/existing-archive.tar.gz"
expect_failure "already exists" \
  env PATH=/usr/bin:/bin \
  TREX_WEBUI_PACKAGE_PYTHON="$PROJECT_ROOT/.venv/bin/python" \
  "$PROJECT_ROOT/deploy/package.sh" \
  --project-root "$PACKAGE_PROJECT" \
  --skip-build \
  --allow-dirty \
  --output-dir "$PRESERVE_OUTPUT" \
  --name existing-archive
[[ "$(<"$PRESERVE_OUTPUT/existing-archive.tar.gz")" == "existing archive" ]] || \
  fail "package failure removed or replaced an existing archive"

printf 'existing checksum\n' >"$PRESERVE_OUTPUT/existing-checksum.tar.gz.sha256"
expect_failure "already exists" \
  env PATH=/usr/bin:/bin \
  TREX_WEBUI_PACKAGE_PYTHON="$PROJECT_ROOT/.venv/bin/python" \
  "$PROJECT_ROOT/deploy/package.sh" \
  --project-root "$PACKAGE_PROJECT" \
  --skip-build \
  --allow-dirty \
  --output-dir "$PRESERVE_OUTPUT" \
  --name existing-checksum
[[ "$(<"$PRESERVE_OUTPUT/existing-checksum.tar.gz.sha256")" == "existing checksum" ]] || \
  fail "package failure removed or replaced an existing checksum"
[[ ! -e "$PRESERVE_OUTPUT/existing-checksum.tar.gz" ]] || \
  fail "package failure published an archive without its checksum"

NO_SIDECAR="$TEST_ROOT/no-sidecar.tar.gz"
cp "$VALID_ARCHIVE" "$NO_SIDECAR"
expect_failure "checksum sidecar" upgrade_dry_run "$NO_SIDECAR"

BAD_DIGEST="$TEST_ROOT/bad-digest.tar.gz"
cp "$VALID_ARCHIVE" "$BAD_DIGEST"
printf '%064d  %s\n' 0 "$(basename -- "$BAD_DIGEST")" >"$BAD_DIGEST.sha256"
expect_failure "SHA-256 mismatch" upgrade_dry_run "$BAD_DIGEST"

EXPLICIT_ARCHIVE="$TEST_ROOT/explicit-digest.tar.gz"
cp "$VALID_ARCHIVE" "$EXPLICIT_ARCHIVE"
EXPLICIT_DIGEST="$(sha256sum -- "$EXPLICIT_ARCHIVE")"
EXPLICIT_DIGEST="${EXPLICIT_DIGEST%% *}"
upgrade_dry_run "$EXPLICIT_ARCHIVE" --sha256 "$EXPLICIT_DIGEST" >/dev/null

for fixture_kind in traversal absolute symlink device; do
  fixture_archive="$TEST_ROOT/$fixture_kind.tar.gz"
  make_fixture_archive "$fixture_archive" "$fixture_kind"
  expect_failure "archive safety error" upgrade_dry_run "$fixture_archive"
done

declare -A payload_failures=(
  [payload-changed]="release payload file changed"
  [payload-extra]="unmanifested file"
  [payload-missing]="missing manifested file"
  [payload-mode]="release payload file changed"
  [manifest-digest]="release payload digest mismatch"
)
for fixture_kind in "${!payload_failures[@]}"; do
  fixture_archive="$TEST_ROOT/$fixture_kind.tar.gz"
  make_fixture_archive "$fixture_archive" "$fixture_kind"
  expect_failure "${payload_failures[$fixture_kind]}" upgrade_dry_run "$fixture_archive"
done

archive_snapshot_swap_fixture() (
  local trusted_archive="$TEST_ROOT/archive-snapshot-trusted.tar.gz"
  local replacement_archive="$TEST_ROOT/archive-snapshot-replacement.tar.gz"
  local input_archive="$TEST_ROOT/archive-snapshot-input.tar.gz"
  local trusted_digest
  make_fixture_archive "$trusted_archive" valid
  make_fixture_archive "$replacement_archive" alternate-valid
  cp "$trusted_archive" "$input_archive"
  trusted_digest="$(sha256sum -- "$trusted_archive")"
  trusted_digest="${trusted_digest%% *}"

  # shellcheck source=deploy/upgrade.sh
  source "$PROJECT_ROOT/deploy/upgrade.sh"
  ARCHIVE="$input_archive"
  ARCHIVE_SHA256="$trusted_digest"
  SYNC_METHOD=portable

  stage_archive
  check_archive
  cp "$replacement_archive" "$input_archive"
  extract_and_verify_archive

  [[ "$(<"$ARCHIVE_SOURCE_ROOT/new-release-file")" == "new" ]] || \
    fail "archive extraction followed the replaced input path instead of the verified private snapshot"
)

archive_snapshot_swap_fixture || \
  fail "archive replacement after validation changed the extracted release payload"

archive_dry_run_extract_fixture() (
  # A production dry-run must inspect candidate-owned recovery and systemd
  # files after archive validation, so it needs a real private extraction even
  # though it never mutates the install root.
  # shellcheck source=deploy/upgrade.sh
  source "$PROJECT_ROOT/deploy/upgrade.sh"
  ARCHIVE="$VALID_ARCHIVE"
  DRY_RUN=1
  SYNC_METHOD=portable

  stage_archive
  check_archive
  extract_and_verify_archive

  [[ -f "$ARCHIVE_SOURCE_ROOT/deploy/upgrade.sh" ]] || \
    fail "archive dry-run did not retain a verified candidate source tree"
)

archive_dry_run_extract_fixture || \
  fail "archive dry-run did not extract and verify its private candidate snapshot"

TREE_ARCHIVE="$TEST_ROOT/tree-identity.tar.gz"
make_fixture_archive "$TREE_ARCHIVE" valid
TREE_EXTRACT="$TEST_ROOT/tree-extract"
mkdir "$TREE_EXTRACT"
tar --extract --gzip --no-same-owner --same-permissions --file "$TREE_ARCHIVE" --directory "$TREE_EXTRACT"
TREE_ROOT="$TREE_EXTRACT/trex-webui-test-release"
python3.11 "$PROJECT_ROOT/deploy/archive_safety.py" verify-tree "$TREE_ROOT" >/dev/null

printf 'changed\n' >"$TREE_ROOT/new-release-file"
expect_failure "release payload file changed" \
  python3.11 "$PROJECT_ROOT/deploy/archive_safety.py" verify-tree "$TREE_ROOT"
printf 'new\n' >"$TREE_ROOT/new-release-file"

printf 'extra\n' >"$TREE_ROOT/unmanifested-file"
expect_failure "unmanifested file" \
  python3.11 "$PROJECT_ROOT/deploy/archive_safety.py" verify-tree "$TREE_ROOT"
rm -f -- "$TREE_ROOT/unmanifested-file"

mv -- "$TREE_ROOT/new-release-file" "$TEST_ROOT/missing-payload-file"
expect_failure "missing manifested file" \
  python3.11 "$PROJECT_ROOT/deploy/archive_safety.py" verify-tree "$TREE_ROOT"
mv -- "$TEST_ROOT/missing-payload-file" "$TREE_ROOT/new-release-file"

chmod 0600 "$TREE_ROOT/new-release-file"
expect_failure "release payload file changed" \
  python3.11 "$PROJECT_ROOT/deploy/archive_safety.py" verify-tree "$TREE_ROOT"
chmod 0644 "$TREE_ROOT/new-release-file"

ln -s -- new-release-file "$TREE_ROOT/untrusted-link"
expect_failure "symbolic links are not allowed" \
  python3.11 "$PROJECT_ROOT/deploy/archive_safety.py" verify-tree "$TREE_ROOT"
rm -f -- "$TREE_ROOT/untrusted-link"

mkfifo "$TREE_ROOT/untrusted-fifo"
expect_failure "special files are not allowed" \
  python3.11 "$PROJECT_ROOT/deploy/archive_safety.py" verify-tree "$TREE_ROOT"
rm -f -- "$TREE_ROOT/untrusted-fifo"

PREMUTATION_ARCHIVE="$TEST_ROOT/premutation-failure.tar.gz"
make_fixture_archive "$PREMUTATION_ARCHIVE" payload-changed
PREMUTATION_INSTALL="$TEST_ROOT/premutation-install"
mkdir "$PREMUTATION_INSTALL"
trex_write_managed_marker "$PREMUTATION_INSTALL"
printf 'old\n' >"$PREMUTATION_INSTALL/sentinel"
expect_failure "release payload file changed" \
  "$PROJECT_ROOT/deploy/upgrade.sh" \
  --archive "$PREMUTATION_ARCHIVE" \
  --install-root "$PREMUTATION_INSTALL" \
  --web-root "$TEST_ROOT/premutation-web" \
  --backup-root "$TEST_ROOT/premutation-static-backups" \
  --source-backup-root "$TEST_ROOT/premutation-source-backups" \
  --skip-python-deps --skip-enable --skip-restart --external-daemon \
  --sync-method portable
[[ "$(<"$PREMUTATION_INSTALL/sentinel")" == "old" ]] || \
  fail "payload identity failure mutated the install root"

if [[ "$(id -u)" -eq 0 ]]; then
  POSTEXTRACT_ARCHIVE="$TEST_ROOT/postextract-failure.tar.gz"
  make_fixture_archive "$POSTEXTRACT_ARCHIVE" valid
  POSTEXTRACT_INSTALL="$TEST_ROOT/postextract-install"
  mkdir "$POSTEXTRACT_INSTALL"
  trex_write_managed_marker "$POSTEXTRACT_INSTALL"
  printf 'old\n' >"$POSTEXTRACT_INSTALL/sentinel"
  POSTEXTRACT_FAKE_BIN="$TEST_ROOT/postextract-fake-bin"
  mkdir "$POSTEXTRACT_FAKE_BIN"
  printf '%s\n' '#!/usr/bin/env bash' >"$POSTEXTRACT_FAKE_BIN/tar"
  printf '%s\n' 'set -Eeuo pipefail' >>"$POSTEXTRACT_FAKE_BIN/tar"
  printf '%s\n' 'arguments=("$@")' >>"$POSTEXTRACT_FAKE_BIN/tar"
  printf '%s\n' 'destination=""' >>"$POSTEXTRACT_FAKE_BIN/tar"
  printf '%s\n' 'while [[ $# -gt 0 ]]; do' >>"$POSTEXTRACT_FAKE_BIN/tar"
  printf '%s\n' '  if [[ "$1" == "--directory" ]]; then destination="$2"; shift 2; else shift; fi' >>"$POSTEXTRACT_FAKE_BIN/tar"
  printf '%s\n' 'done' >>"$POSTEXTRACT_FAKE_BIN/tar"
  printf '%s\n' '"${REAL_TAR:?}" "${arguments[@]}"' >>"$POSTEXTRACT_FAKE_BIN/tar"
  printf '%s\n' 'printf "changed after extraction\n" >"$destination/trex-webui-test-release/new-release-file"' >>"$POSTEXTRACT_FAKE_BIN/tar"
  chmod 0755 "$POSTEXTRACT_FAKE_BIN/tar"
  expect_failure "extracted release payload failed identity verification" env \
    PATH="$POSTEXTRACT_FAKE_BIN:$PATH" \
    REAL_TAR="$(command -v tar)" \
    "$PROJECT_ROOT/deploy/upgrade.sh" \
    --archive "$POSTEXTRACT_ARCHIVE" \
    --install-root "$POSTEXTRACT_INSTALL" \
    --web-root "$TEST_ROOT/postextract-web" \
    --backup-root "$TEST_ROOT/postextract-static-backups" \
    --source-backup-root "$TEST_ROOT/postextract-source-backups" \
    --skip-python-deps --skip-enable --skip-restart --external-daemon \
    --sync-method portable
  [[ "$(<"$POSTEXTRACT_INSTALL/sentinel")" == "old" ]] || \
    fail "post-extraction payload failure mutated the install root"
  [[ ! -e "$TEST_ROOT/postextract-source-backups" ]] || \
    fail "post-extraction payload failure ran install-root backup before verification"
else
  printf 'SKIP: post-extraction pre-mutation failure injection requires archive-upgrade root\n'
fi

expect_failure "too broad" \
  checkout_install_dry_run_fixture \
  --dry-run --skip-build --skip-enable --skip-restart --web-root /var

for deploy_entrypoint in "$PROJECT_ROOT/deploy/install.sh" "$PROJECT_ROOT/deploy/upgrade.sh"; do
  expect_failure "--verify cannot be combined with --skip-restart" \
    "$deploy_entrypoint" --dry-run --skip-restart --verify
  expect_failure "--verify cannot be combined with --skip-restart" \
    "$deploy_entrypoint" --dry-run --skip-restart --verify-trex
done

UNOWNED_ROOT="$(mktemp -d -t trex-webui-unowned.XXXXXX)"
expect_failure "no trusted .trex-webui-managed owner" \
  checkout_install_dry_run_fixture \
  --dry-run --skip-build --skip-enable --skip-restart \
  --web-root "$UNOWNED_ROOT/web" --backup-root "$UNOWNED_ROOT/backups"

mkdir "$TEST_ROOT/real-web"
ln -s "$TEST_ROOT/real-web" "$TEST_ROOT/web-link"
expect_failure "symbolic-link component" \
  checkout_install_dry_run_fixture \
  --dry-run --skip-build --skip-enable --skip-restart \
  --web-root "$TEST_ROOT/web-link" --backup-root "$TEST_ROOT/backups"

expect_failure "must not be equal, parent, or child" \
  checkout_install_dry_run_fixture \
  --dry-run --skip-build --skip-enable --skip-restart \
  --web-root "$TEST_ROOT/overlap" --backup-root "$TEST_ROOT/overlap/backups"

expect_failure "ordinary/root UID" conflicting_identity_fixture
expect_failure "ordinary/root GID" conflicting_group_fixture
IDENTITY_DRY_RUN_OUTPUT="$(missing_identity_dry_run_fixture)"
[[ "$IDENTITY_DRY_RUN_OUTPUT" == *"groupadd --system trex-webui"* ]] || \
  fail "identity dry run did not plan the dedicated system group"
[[ "$IDENTITY_DRY_RUN_OUTPUT" == *"useradd --system --gid trex-webui"* ]] || \
  fail "identity dry run did not plan the dedicated nologin system user"

INSTALL_DRY_RUN_OUTPUT="$(
  checkout_install_dry_run_fixture --dry-run --skip-build --skip-enable --skip-restart
)"
for expected_plan in \
  "install -d -o trex-webui -g trex-webui -m 0750 /var/lib/trex-webui" \
  "install -d -o root -g nginx -m 0750 /etc/nginx/trex-webui" \
  "runuser -u trex-webui" \
  "app.trex.stl_connection" \
  "trex-daemon-server.service" \
  "loopback-only RPC" \
  "native-port boundary" \
  "same-directory temporary file" \
  "restore prior configs or delete files created by this run"; do
  [[ "$INSTALL_DRY_RUN_OUTPUT" == *"$expected_plan"* ]] || \
    fail "install dry run omitted required plan: $expected_plan"
done
[[ "$INSTALL_DRY_RUN_OUTPUT" == *"/var/log/trex/trex_daemon_server.log"* ]] || \
  fail "install dry run omitted root-owned daemon log provisioning"
for expected_authority in \
  "TREX_WEBUI_DAEMON_SUPERVISOR=systemd" \
  "TREX_WEBUI_TREX_SCRIPTS_DIR=/opt/trex-core/scripts" \
  "TREX_WEBUI_TREX_DAEMON_BIN=/opt/trex-core/scripts/trex_daemon_server" \
  "TREX_WEBUI_PROFILE_ROOTS=/opt/trex-core/scripts/stl:$PACKAGE_PROJECT/profiles:/var/lib/trex-webui/profiles"; do
  [[ "$INSTALL_DRY_RUN_OUTPUT" == *"$expected_authority"* ]] || \
    fail "managed-local smoke test omitted exact path authority: $expected_authority"
done

EXTERNAL_DAEMON_DRY_RUN_OUTPUT="$(
  checkout_install_dry_run_fixture \
    --dry-run --skip-build --skip-enable --skip-restart --external-daemon
)"
[[ "$EXTERNAL_DAEMON_DRY_RUN_OUTPUT" != *"/var/log/trex/trex_daemon_server.log"* ]] || \
  fail "external-daemon install dry run touched the local daemon log"
[[ "$EXTERNAL_DAEMON_DRY_RUN_OUTPUT" != *"native-port boundary"* ]] || \
  fail "external-daemon install dry run touched the managed native-port boundary"
for forbidden_authority in \
  "TREX_WEBUI_DAEMON_SUPERVISOR=systemd" \
  "TREX_WEBUI_TREX_SCRIPTS_DIR=" \
  "TREX_WEBUI_TREX_DAEMON_BIN=" \
  "TREX_WEBUI_PROFILE_ROOTS="; do
  [[ "$EXTERNAL_DAEMON_DRY_RUN_OUTPUT" != *"$forbidden_authority"* ]] || \
    fail "external-daemon smoke test injected managed-local authority: $forbidden_authority"
done
expect_failure "overlapping TRex daemon scripts path" overlapping_daemon_authority_fixture

CUSTOM_RENDER_ROOT="$TEST_ROOT/opt/trex-webui/releases/current"
CUSTOM_RENDER_CONFIG_ROOT="$TEST_ROOT/custom-render-config"
CUSTOM_TREX_SCRIPTS="/srv/trex-webui-tests/$(basename -- "$TEST_ROOT")/scripts"
mkdir -p "$CUSTOM_RENDER_ROOT/deploy/nginx" "$CUSTOM_RENDER_ROOT/deploy/systemd" \
  "$CUSTOM_RENDER_ROOT/deploy/logrotate" \
  "$CUSTOM_RENDER_CONFIG_ROOT/nginx" "$CUSTOM_RENDER_CONFIG_ROOT/systemd" \
  "$CUSTOM_RENDER_CONFIG_ROOT/logrotate"
cp "$PROJECT_ROOT/deploy/nginx/trex-webui.conf" "$CUSTOM_RENDER_ROOT/deploy/nginx/"
cp "$PROJECT_ROOT/deploy/systemd/trex-webui-api.service" "$CUSTOM_RENDER_ROOT/deploy/systemd/"
cp "$PROJECT_ROOT/deploy/systemd/trex-daemon-server.service" "$CUSTOM_RENDER_ROOT/deploy/systemd/"
cp "$PROJECT_ROOT/deploy/systemd/nftables-trex-webui.conf" "$CUSTOM_RENDER_ROOT/deploy/systemd/"
cp "$PROJECT_ROOT/deploy/logrotate/trex-daemon-server" "$CUSTOM_RENDER_ROOT/deploy/logrotate/"
cp "$PROJECT_ROOT/deploy/trex_daemon_supervisor.py" "$CUSTOM_RENDER_ROOT/deploy/"
cp "$PROJECT_ROOT/deploy/daemon_rpc_probe.py" "$CUSTOM_RENDER_ROOT/deploy/"
cp "$PROJECT_ROOT/deploy/trex_native_boundary.sh" "$CUSTOM_RENDER_ROOT/deploy/"
(
  # shellcheck source=deploy/install.sh
  source "$PROJECT_ROOT/deploy/install.sh"
  PROJECT_ROOT="$CUSTOM_RENDER_ROOT"
  WEB_ROOT="$TEST_ROOT/custom-render-web"
  VENV_SERVICE_PATH="$CUSTOM_RENDER_ROOT/.venv.runtime-render-test"
  TREX_DAEMON_SCRIPTS_DIR="$CUSTOM_TREX_SCRIPTS"
  TREX_DAEMON_BIN="$CUSTOM_TREX_SCRIPTS/bin/trex_daemon_server"
  NGINX_CONF_TARGET="$CUSTOM_RENDER_CONFIG_ROOT/nginx/trex-webui.conf"
  SYSTEMD_SERVICE_TARGET="$CUSTOM_RENDER_CONFIG_ROOT/systemd/trex-webui-api.service"
  DAEMON_SYSTEMD_SERVICE_TARGET="$CUSTOM_RENDER_CONFIG_ROOT/systemd/trex-daemon-server.service"
  DAEMON_LOGROTATE_TARGET="$CUSTOM_RENDER_CONFIG_ROOT/logrotate/trex-daemon-server"
  DAEMON_LIBEXEC_ROOT="$CUSTOM_RENDER_CONFIG_ROOT/libexec"
  DAEMON_SUPERVISOR_TARGET="$DAEMON_LIBEXEC_ROOT/trex_daemon_supervisor.py"
  DAEMON_RPC_PROBE_TARGET="$DAEMON_LIBEXEC_ROOT/daemon_rpc_probe.py"
  DAEMON_NATIVE_BOUNDARY_TARGET="$DAEMON_LIBEXEC_ROOT/trex_native_boundary.sh"
  NFTABLES_CONFIG_PATH="$CUSTOM_RENDER_CONFIG_ROOT/nftables.conf"
  NFTABLES_SYSTEMD_DROPIN_ROOT="$CUSTOM_RENDER_CONFIG_ROOT/systemd/nftables.service.d"
  NFTABLES_SYSTEMD_DROPIN_TARGET="$NFTABLES_SYSTEMD_DROPIN_ROOT/trex-webui-native-boundary.conf"
  DRY_RUN=0
  install_configs
)
grep -Fq "ExecStart=$CUSTOM_RENDER_ROOT/.venv.runtime-render-test/bin/python " \
  "$CUSTOM_RENDER_CONFIG_ROOT/systemd/trex-webui-api.service" || \
  fail "custom project-root rendering did not preserve the exact versioned runtime path"
if grep -Fq "$CUSTOM_RENDER_ROOT${CUSTOM_RENDER_ROOT#/opt/trex-webui}" \
  "$CUSTOM_RENDER_CONFIG_ROOT/systemd/trex-webui-api.service"; then
  fail "custom project-root rendering duplicated the project path inside the runtime path"
fi
grep -Fq "ExecStart=/usr/bin/python3 -I $CUSTOM_RENDER_CONFIG_ROOT/libexec/trex_daemon_supervisor.py --daemon-bin $CUSTOM_TREX_SCRIPTS/bin/trex_daemon_server --generation-file /run/trex-webui/daemon-generation -- --daemon-port 8090 --trex-host 127.0.0.1 start-live" \
  "$CUSTOM_RENDER_CONFIG_ROOT/systemd/trex-daemon-server.service" || \
  fail "custom project-root rendering changed the daemon loopback foreground contract"
grep -Fq "ExecStartPre=/usr/bin/bash $CUSTOM_RENDER_CONFIG_ROOT/libexec/trex_native_boundary.sh apply" \
  "$CUSTOM_RENDER_CONFIG_ROOT/systemd/trex-daemon-server.service" || \
  fail "custom project-root rendering changed the daemon native-port boundary contract"
grep -Fq "Environment=TREX_WEBUI_RUNTIME_STATE_PATH=/var/lib/trex-webui/runtime-state.json" \
  "$CUSTOM_RENDER_CONFIG_ROOT/systemd/trex-webui-api.service" || \
  fail "custom project-root rendering omitted the persistent runtime-state path"
grep -Fqx "Environment=TREX_WEBUI_TREX_SCRIPTS_DIR=$CUSTOM_TREX_SCRIPTS" \
  "$CUSTOM_RENDER_CONFIG_ROOT/systemd/trex-webui-api.service" || \
  fail "custom rendering did not pin the API to the managed daemon scripts directory"
grep -Fqx "Environment=TREX_WEBUI_TREX_DAEMON_BIN=$CUSTOM_TREX_SCRIPTS/bin/trex_daemon_server" \
  "$CUSTOM_RENDER_CONFIG_ROOT/systemd/trex-webui-api.service" || \
  fail "custom rendering did not pin the API to the managed daemon executable"
grep -Fqx "Environment=TREX_WEBUI_PROFILE_ROOTS=$CUSTOM_TREX_SCRIPTS/stl:$CUSTOM_RENDER_ROOT/profiles:/var/lib/trex-webui/profiles" \
  "$CUSTOM_RENDER_CONFIG_ROOT/systemd/trex-webui-api.service" || \
  fail "custom rendering did not pin the API profile roots to the managed TRex tree"
grep -Fqx "ReadOnlyPaths=-$CUSTOM_TREX_SCRIPTS $CUSTOM_RENDER_ROOT" \
  "$CUSTOM_RENDER_CONFIG_ROOT/systemd/trex-webui-api.service" || \
  fail "custom rendering did not align API filesystem hardening with the managed TRex tree"
cmp -s "$PROJECT_ROOT/deploy/trex_daemon_supervisor.py" \
  "$CUSTOM_RENDER_CONFIG_ROOT/libexec/trex_daemon_supervisor.py" || \
  fail "custom rendering did not atomically install the daemon supervisor runtime"
cmp -s "$PROJECT_ROOT/deploy/daemon_rpc_probe.py" \
  "$CUSTOM_RENDER_CONFIG_ROOT/libexec/daemon_rpc_probe.py" || \
  fail "custom rendering did not atomically install the daemon RPC probe runtime"
cmp -s "$PROJECT_ROOT/deploy/trex_native_boundary.sh" \
  "$CUSTOM_RENDER_CONFIG_ROOT/libexec/trex_native_boundary.sh" || \
  fail "custom rendering did not atomically install the daemon native boundary runtime"
grep -Fq "ExecReload=/usr/bin/bash $CUSTOM_RENDER_CONFIG_ROOT/libexec/trex_native_boundary.sh service-reload $CUSTOM_RENDER_CONFIG_ROOT/nftables.conf" \
  "$CUSTOM_RENDER_CONFIG_ROOT/systemd/nftables.service.d/trex-webui-native-boundary.conf" || \
  fail "custom rendering did not install the atomic nftables reload integration"
printf '# changed launcher fixture\n' >>"$CUSTOM_RENDER_CONFIG_ROOT/libexec/trex_daemon_supervisor.py"
(
  # shellcheck source=deploy/install.sh
  source "$PROJECT_ROOT/deploy/install.sh"
  PROJECT_ROOT="$CUSTOM_RENDER_ROOT"
  DAEMON_SYSTEMD_SERVICE_TARGET="$CUSTOM_RENDER_CONFIG_ROOT/systemd/trex-daemon-server.service"
  DAEMON_LIBEXEC_ROOT="$CUSTOM_RENDER_CONFIG_ROOT/libexec"
  DAEMON_SUPERVISOR_TARGET="$DAEMON_LIBEXEC_ROOT/trex_daemon_supervisor.py"
  DAEMON_RPC_PROBE_TARGET="$DAEMON_LIBEXEC_ROOT/daemon_rpc_probe.py"
  DAEMON_NATIVE_BOUNDARY_TARGET="$DAEMON_LIBEXEC_ROOT/trex_native_boundary.sh"
  daemon_unit_requires_restart
) || fail "daemon launcher content drift did not require a supervisor restart"
cp "$PROJECT_ROOT/deploy/trex_daemon_supervisor.py" \
  "$CUSTOM_RENDER_CONFIG_ROOT/libexec/trex_daemon_supervisor.py"

NO_DEPS_PIN_ROOT="$TEST_ROOT/no-deps-pin-project"
NO_DEPS_PIN_CONFIG="$TEST_ROOT/no-deps-pin-config"
NO_DEPS_PIN_RUNTIME="$NO_DEPS_PIN_ROOT/.venv.runtime-20260722T000010Z-10"
mkdir -p "$NO_DEPS_PIN_ROOT/apps/api" "$NO_DEPS_PIN_ROOT/deploy/nginx" \
  "$NO_DEPS_PIN_ROOT/deploy/systemd" "$NO_DEPS_PIN_ROOT/deploy/logrotate" \
  "$NO_DEPS_PIN_RUNTIME/bin" \
  "$NO_DEPS_PIN_CONFIG/nginx" "$NO_DEPS_PIN_CONFIG/systemd" "$NO_DEPS_PIN_CONFIG/logrotate"
trex_write_managed_marker "$NO_DEPS_PIN_ROOT"
trex_write_managed_marker "$NO_DEPS_PIN_RUNTIME"
printf 'trex-webui-venv-runtime-v1\n' >"$NO_DEPS_PIN_RUNTIME/.trex-webui-venv-runtime"
printf 'trex-webui-venv-release-20260722T000010Z-10\n' >"$NO_DEPS_PIN_RUNTIME/.trex-webui-venv-release"
ln -s "$PROJECT_ROOT/.venv/bin/python" "$NO_DEPS_PIN_RUNTIME/bin/python"
chown -R root:root "$NO_DEPS_PIN_RUNTIME"
find "$NO_DEPS_PIN_RUNTIME" -type d -exec chmod 0755 '{}' +
find "$NO_DEPS_PIN_RUNTIME" -type f -exec chmod 0644 '{}' +
cp "$PROJECT_ROOT/deploy/nginx/trex-webui.conf" "$NO_DEPS_PIN_ROOT/deploy/nginx/"
cp "$PROJECT_ROOT/deploy/systemd/trex-webui-api.service" "$NO_DEPS_PIN_ROOT/deploy/systemd/"
cp "$PROJECT_ROOT/deploy/systemd/trex-daemon-server.service" "$NO_DEPS_PIN_ROOT/deploy/systemd/"
cp "$PROJECT_ROOT/deploy/systemd/nftables-trex-webui.conf" "$NO_DEPS_PIN_ROOT/deploy/systemd/"
cp "$PROJECT_ROOT/deploy/logrotate/trex-daemon-server" "$NO_DEPS_PIN_ROOT/deploy/logrotate/"
cp "$PROJECT_ROOT/deploy/trex_daemon_supervisor.py" "$NO_DEPS_PIN_ROOT/deploy/"
cp "$PROJECT_ROOT/deploy/daemon_rpc_probe.py" "$NO_DEPS_PIN_ROOT/deploy/"
cp "$PROJECT_ROOT/deploy/trex_native_boundary.sh" "$NO_DEPS_PIN_ROOT/deploy/"
NO_DEPS_PIN_UNIT="$NO_DEPS_PIN_CONFIG/systemd/trex-webui-api.service"
printf 'WorkingDirectory=%s\n' "$NO_DEPS_PIN_ROOT" >"$NO_DEPS_PIN_UNIT"
printf 'ExecStartPre=%s/bin/python -c "import fastapi, httptools, uvicorn, uvicorn.supervisors.statreload, uvloop, watchfiles.run, websockets"\n' \
  "$NO_DEPS_PIN_RUNTIME" >>"$NO_DEPS_PIN_UNIT"
printf 'ExecStart=%s/bin/python -m uvicorn app.main:app --app-dir %s/apps/api --host 127.0.0.1 --port 8080\n' \
  "$NO_DEPS_PIN_RUNTIME" "$NO_DEPS_PIN_ROOT" >>"$NO_DEPS_PIN_UNIT"
(
  # shellcheck source=deploy/install.sh
  source "$PROJECT_ROOT/deploy/install.sh"
  trap - EXIT
  PROJECT_ROOT="$NO_DEPS_PIN_ROOT"
  VENV_LIVE_PATH="$NO_DEPS_PIN_ROOT/.venv"
  SYSTEMD_SERVICE_TARGET="$NO_DEPS_PIN_UNIT"
  DAEMON_SYSTEMD_SERVICE_TARGET="$NO_DEPS_PIN_CONFIG/systemd/trex-daemon-server.service"
  DAEMON_LOGROTATE_TARGET="$NO_DEPS_PIN_CONFIG/logrotate/trex-daemon-server"
  DAEMON_LIBEXEC_ROOT="$NO_DEPS_PIN_CONFIG/libexec"
  DAEMON_SUPERVISOR_TARGET="$DAEMON_LIBEXEC_ROOT/trex_daemon_supervisor.py"
  DAEMON_RPC_PROBE_TARGET="$DAEMON_LIBEXEC_ROOT/daemon_rpc_probe.py"
  DAEMON_NATIVE_BOUNDARY_TARGET="$DAEMON_LIBEXEC_ROOT/trex_native_boundary.sh"
  NFTABLES_CONFIG_PATH="$NO_DEPS_PIN_CONFIG/nftables.conf"
  NFTABLES_SYSTEMD_DROPIN_ROOT="$NO_DEPS_PIN_CONFIG/systemd/nftables.service.d"
  NFTABLES_SYSTEMD_DROPIN_TARGET="$NFTABLES_SYSTEMD_DROPIN_ROOT/trex-webui-native-boundary.conf"
  NGINX_CONF_TARGET="$NO_DEPS_PIN_CONFIG/nginx/trex-webui.conf"
  WEB_ROOT="$TEST_ROOT/no-deps-pin-web"
  INSTALL_PYTHON_DEPS=0
  DRY_RUN=0
  systemctl() {
    [[ "$*" == "show trex-webui-api.service --property=LoadState --value" ]] || return 64
    printf 'not-found\n'
  }
  resolve_existing_service_runtime_pin
  stage_versioned_service_runtime
  [[ "$VENV_SERVICE_PATH" == "$NO_DEPS_PIN_RUNTIME" ]] || return 89
  install_configs
)
grep -Fq "ExecStart=$NO_DEPS_PIN_RUNTIME/bin/python " "$NO_DEPS_PIN_UNIT" || \
  fail "no-deps source/UI deployment silently removed the trusted versioned runtime pin"

make_trusted_project_runtime() {
  local install_root="$1"
  local suffix="$2"
  local runtime="$install_root/.venv.runtime-$suffix"
  mkdir -p "$runtime/bin"
  trex_write_managed_marker "$runtime"
  printf 'trex-webui-venv-runtime-v1\n' >"$runtime/.trex-webui-venv-runtime"
  printf 'trex-webui-venv-release-%s\n' "$suffix" >"$runtime/.trex-webui-venv-release"
  printf 'runtime sentinel\n' >"$runtime/bin/python"
  chown -R root:root "$runtime"
  find "$runtime" -type d -exec chmod 0755 '{}' +
  find "$runtime" -type f -exec chmod 0644 '{}' +
  printf '%s\n' "$runtime"
}

PORTABLE_RUNTIME_INSTALL="$TEST_ROOT/runtime-preserve-portable"
PORTABLE_RUNTIME_SOURCE="$TEST_ROOT/runtime-preserve-source"
PORTABLE_RUNTIME_STAGE="$TEST_ROOT/runtime-preserve-stage"
mkdir -p "$PORTABLE_RUNTIME_INSTALL" "$PORTABLE_RUNTIME_SOURCE" "$PORTABLE_RUNTIME_STAGE"
trex_write_managed_marker "$PORTABLE_RUNTIME_INSTALL"
trex_write_managed_marker "$PORTABLE_RUNTIME_STAGE"
printf 'old source\n' >"$PORTABLE_RUNTIME_INSTALL/old-source"
printf 'new source\n' >"$PORTABLE_RUNTIME_SOURCE/new-source"
PORTABLE_RUNTIME_PATH="$(make_trusted_project_runtime "$PORTABLE_RUNTIME_INSTALL" '20260722T000000Z-1')"
PORTABLE_RUNTIME_INODE="$(stat -c '%d:%i' "$PORTABLE_RUNTIME_PATH")"
(
  # shellcheck source=deploy/upgrade.sh
  source "$PROJECT_ROOT/deploy/upgrade.sh"
  INSTALL_ROOT="$PORTABLE_RUNTIME_INSTALL"
  STAGING_ROOT="$PORTABLE_RUNTIME_STAGE"
  DRY_RUN=0
  validate_preserved_project_runtimes
  sync_archive_source_portable "$PORTABLE_RUNTIME_SOURCE"
)
[[ -f "$PORTABLE_RUNTIME_INSTALL/new-source" && ! -e "$PORTABLE_RUNTIME_INSTALL/old-source" ]] || \
  fail "portable archive sync did not replace release source"
[[ -f "$PORTABLE_RUNTIME_PATH/bin/python" ]] || \
  fail "portable archive sync deleted the active versioned runtime"
[[ "$(stat -c '%d:%i' "$PORTABLE_RUNTIME_PATH")" == "$PORTABLE_RUNTIME_INODE" ]] || \
  fail "portable archive sync moved or replaced the active versioned runtime inode"

UNTRUSTED_RUNTIME_INSTALL="$TEST_ROOT/runtime-untrusted"
mkdir -p "$UNTRUSTED_RUNTIME_INSTALL/.venv.runtime-forged"
trex_write_managed_marker "$UNTRUSTED_RUNTIME_INSTALL"
trex_write_managed_marker "$UNTRUSTED_RUNTIME_INSTALL/.venv.runtime-forged"
printf 'do not mutate\n' >"$UNTRUSTED_RUNTIME_INSTALL/sentinel"
untrusted_runtime_fixture() (
  # shellcheck source=deploy/upgrade.sh
  source "$PROJECT_ROOT/deploy/upgrade.sh"
  INSTALL_ROOT="$UNTRUSTED_RUNTIME_INSTALL"
  validate_preserved_project_runtimes
)
expect_failure "trusted runtime marker" untrusted_runtime_fixture
[[ "$(<"$UNTRUSTED_RUNTIME_INSTALL/sentinel")" == "do not mutate" ]] || \
  fail "untrusted runtime validation mutated the install root"

archive_api_exec_value() {
  local exec_path="$1"
  local install_root="$2"
  printf '{ path=%s ; argv[]=%s -m uvicorn app.main:app --app-dir %s/apps/api --host 127.0.0.1 --port 8080 ; ignore_errors=no ; start_time=[n/a] ; stop_time=[n/a] ; pid=0 ; code=(null) ; status=0/0 }\n' \
    "$exec_path" "$exec_path" "$install_root"
}

mock_archive_api_systemctl() {
  printf '%s\n' "$*" >>"${MOCK_API_SYSTEMCTL_LOG:?}"
  case "$1" in
    show)
      case "${3:-}" in
        --property=LoadState)
          printf '%s\n' "${MOCK_API_LOAD_STATE:-loaded}"
          ;;
        --property=WorkingDirectory)
          printf '%s\n' "$MOCK_API_WORKING_DIRECTORY"
          ;;
        --property=ExecStart)
          archive_api_exec_value "$MOCK_API_EXEC_PATH" \
            "${MOCK_API_APP_ROOT:-$MOCK_API_WORKING_DIRECTORY}"
          ;;
        --property=MainPID)
          printf '%s\n' "${MOCK_API_MAIN_PID:-$$}"
          ;;
        --property=FragmentPath)
          printf '%s\n' "$SYSTEMD_SERVICE_TARGET"
          ;;
        --property=NeedDaemonReload)
          printf 'no\n'
          ;;
        --property=DropInPaths)
          printf '\n'
          ;;
        --property=ActiveState)
          if [[ "${MOCK_API_ACTIVE:-0}" -eq 1 ]]; then
            printf 'active\n'
          else
            printf 'inactive\n'
          fi
          ;;
        --property=Job)
          printf '\n'
          ;;
        *)
          return 64
          ;;
      esac
      ;;
    is-active)
      [[ "${MOCK_API_ACTIVE:-0}" -eq 1 ]]
      ;;
    is-failed)
      return 1
      ;;
    stop)
      MOCK_API_ACTIVE=0
      ;;
    restart|start)
      MOCK_API_ACTIVE=1
      ;;
    daemon-reload|status)
      return 0
      ;;
    *)
      return 64
      ;;
  esac
}

ARCHIVE_API_GUARD_ROOT="$TEST_ROOT/archive-api-guard"
mkdir -p "$ARCHIVE_API_GUARD_ROOT/.venv/bin"
ARCHIVE_API_GUARD_EXEC="$ARCHIVE_API_GUARD_ROOT/.venv/bin/python"
printf 'old interpreter\n' >"$ARCHIVE_API_GUARD_EXEC"
ARCHIVE_API_GUARD_UNIT="$ARCHIVE_API_GUARD_ROOT/trex-webui-api.service"
printf '[Service]\nExecStart=/bin/true\n' >"$ARCHIVE_API_GUARD_UNIT"
chmod 0644 "$ARCHIVE_API_GUARD_UNIT"

archive_api_matching_active_guard_fixture() (
  # shellcheck source=deploy/upgrade.sh
  source "$PROJECT_ROOT/deploy/upgrade.sh"
  trap - EXIT
  INSTALL_ROOT="$ARCHIVE_API_GUARD_ROOT"
  SYSTEMD_SERVICE_TARGET="$ARCHIVE_API_GUARD_UNIT"
  ARCHIVE="fixture"
  DRY_RUN=0
  RUN_RESTART=1
  MOCK_API_WORKING_DIRECTORY="$INSTALL_ROOT"
  MOCK_API_EXEC_PATH="$ARCHIVE_API_GUARD_EXEC"
  MOCK_API_ACTIVE=1
  MOCK_API_SYSTEMCTL_LOG="$TEST_ROOT/archive-api-active-systemctl.log"
  : >"$MOCK_API_SYSTEMCTL_LOG"
  systemctl() {
    mock_archive_api_systemctl "$@"
  }

  capture_archive_api_service_state
  [[ "$ARCHIVE_API_STATE_CAPTURED" -eq 1 && "$ARCHIVE_API_SERVICE_MATCHED" -eq 1 && \
    "$ARCHIVE_API_WAS_ACTIVE" -eq 1 && "$ARCHIVE_API_OLD_EXEC_PATH" == "$ARCHIVE_API_GUARD_EXEC" ]] || return 91
  stop_archive_api_service_for_source_mutation
  [[ "$ARCHIVE_API_MUTATION_GUARD_APPLIED" -eq 1 && "$MOCK_API_ACTIVE" -eq 0 ]] || return 92
)
archive_api_matching_active_guard_fixture || \
  fail "matching active API was not captured and stopped before archive source mutation"
[[ "$(grep -c '^stop trex-webui-api.service$' "$TEST_ROOT/archive-api-active-systemctl.log")" -eq 1 ]] || \
  fail "matching active API was not stopped exactly once"

archive_api_skip_restart_active_fixture() (
  # shellcheck source=deploy/upgrade.sh
  source "$PROJECT_ROOT/deploy/upgrade.sh"
  trap - EXIT
  INSTALL_ROOT="$ARCHIVE_API_GUARD_ROOT"
  SYSTEMD_SERVICE_TARGET="$ARCHIVE_API_GUARD_UNIT"
  ARCHIVE="fixture"
  DRY_RUN=0
  RUN_RESTART=0
  MOCK_API_WORKING_DIRECTORY="$INSTALL_ROOT"
  MOCK_API_EXEC_PATH="$ARCHIVE_API_GUARD_EXEC"
  MOCK_API_ACTIVE=1
  MOCK_API_SYSTEMCTL_LOG="$TEST_ROOT/archive-api-skip-systemctl.log"
  : >"$MOCK_API_SYSTEMCTL_LOG"
  systemctl() {
    mock_archive_api_systemctl "$@"
  }
  capture_archive_api_service_state
)
expect_failure "--skip-restart cannot mutate" archive_api_skip_restart_active_fixture
if grep -q '^stop trex-webui-api.service$' "$TEST_ROOT/archive-api-skip-systemctl.log"; then
  fail "--skip-restart stopped the active API instead of failing before source mutation"
fi

archive_api_unrelated_service_fixture() (
  # shellcheck source=deploy/upgrade.sh
  source "$PROJECT_ROOT/deploy/upgrade.sh"
  trap - EXIT
  INSTALL_ROOT="$ARCHIVE_API_GUARD_ROOT"
  SYSTEMD_SERVICE_TARGET="$ARCHIVE_API_GUARD_UNIT"
  ARCHIVE="fixture"
  DRY_RUN=0
  RUN_RESTART=1
  MOCK_API_WORKING_DIRECTORY="/opt/trex-webui"
  MOCK_API_EXEC_PATH="/opt/trex-webui/.venv/bin/python"
  MOCK_API_ACTIVE=1
  MOCK_API_SYSTEMCTL_LOG="$TEST_ROOT/archive-api-unrelated-systemctl.log"
  : >"$MOCK_API_SYSTEMCTL_LOG"
  systemctl() {
    mock_archive_api_systemctl "$@"
  }

  capture_archive_api_service_state
  stop_archive_api_service_for_source_mutation
  [[ "$ARCHIVE_API_STATE_CAPTURED" -eq 1 && "$ARCHIVE_API_SERVICE_MATCHED" -eq 0 && \
    "$ARCHIVE_API_MUTATION_GUARD_APPLIED" -eq 0 && "$MOCK_API_ACTIVE" -eq 1 ]]
)
archive_api_unrelated_service_fixture || \
  fail "archive guard treated a production service outside the custom install root as matching"
if grep -Eq '^(stop|restart) trex-webui-api.service$' "$TEST_ROOT/archive-api-unrelated-systemctl.log"; then
  fail "archive guard touched the production API for an unrelated custom install root"
fi

archive_api_mismatched_app_dir_fixture() (
  # shellcheck source=deploy/upgrade.sh
  source "$PROJECT_ROOT/deploy/upgrade.sh"
  trap - EXIT
  INSTALL_ROOT="$ARCHIVE_API_GUARD_ROOT"
  SYSTEMD_SERVICE_TARGET="$ARCHIVE_API_GUARD_UNIT"
  ARCHIVE="fixture"
  DRY_RUN=0
  RUN_RESTART=1
  MOCK_API_WORKING_DIRECTORY="$INSTALL_ROOT"
  MOCK_API_APP_ROOT="$TEST_ROOT/archive-api-other-app"
  MOCK_API_EXEC_PATH="$ARCHIVE_API_GUARD_EXEC"
  MOCK_API_ACTIVE=1
  MOCK_API_SYSTEMCTL_LOG="$TEST_ROOT/archive-api-mismatched-app-dir-systemctl.log"
  : >"$MOCK_API_SYSTEMCTL_LOG"
  systemctl() {
    mock_archive_api_systemctl "$@"
  }
  capture_archive_api_service_state
)
expect_failure "no exact matching ExecStart/--app-dir contract" archive_api_mismatched_app_dir_fixture
if grep -q '^stop trex-webui-api.service$' "$TEST_ROOT/archive-api-mismatched-app-dir-systemctl.log"; then
  fail "archive guard stopped a service whose --app-dir did not match the install root"
fi

ACTIVE_SOURCE_ROLLBACK_ROOT="$TEST_ROOT/archive-api-active-rollback"
ACTIVE_SOURCE_BACKUP="$TEST_ROOT/archive-api-active-source-backup"
mkdir -p "$ACTIVE_SOURCE_ROLLBACK_ROOT" "$ACTIVE_SOURCE_BACKUP"
trex_write_managed_marker "$ACTIVE_SOURCE_ROLLBACK_ROOT"
trex_write_managed_marker "$ACTIVE_SOURCE_BACKUP"
printf 'new source\n' >"$ACTIVE_SOURCE_ROLLBACK_ROOT/release-sentinel"
printf 'old source\n' >"$ACTIVE_SOURCE_BACKUP/release-sentinel"

archive_api_active_rollback_fixture() (
  # shellcheck source=deploy/upgrade.sh
  source "$PROJECT_ROOT/deploy/upgrade.sh"
  trap - EXIT
  INSTALL_ROOT="$ACTIVE_SOURCE_ROLLBACK_ROOT"
  SOURCE_BACKUP_DIR="$ACTIVE_SOURCE_BACKUP"
  INSTALL_ROOT_EXISTED=1
  SOURCE_MUTATION_STARTED=1
  ARCHIVE_API_STATE_CAPTURED=1
  ARCHIVE_API_SERVICE_MATCHED=1
  ARCHIVE_API_WAS_ACTIVE=1
  ARCHIVE_API_OLD_EXEC_PATH="$INSTALL_ROOT/.venv.runtime-old/bin/python"
  ARCHIVE_API_MUTATION_GUARD_APPLIED=1
  ARCHIVE_API_READINESS_ATTEMPTS=3
  ARCHIVE_API_READINESS_INTERVAL_SECONDS=0
  MOCK_API_WORKING_DIRECTORY="$INSTALL_ROOT"
  MOCK_API_EXEC_PATH="$ARCHIVE_API_OLD_EXEC_PATH"
  MOCK_API_ACTIVE=0
  MOCK_API_SYSTEMCTL_LOG="$TEST_ROOT/archive-api-active-rollback-systemctl.log"
  MOCK_API_CURL_COUNTER="$TEST_ROOT/archive-api-active-rollback-curl.count"
  : >"$MOCK_API_SYSTEMCTL_LOG"
  printf '0\n' >"$MOCK_API_CURL_COUNTER"
  systemctl() {
    mock_archive_api_systemctl "$@"
  }
  curl() {
    local attempt
    attempt="$(<"$MOCK_API_CURL_COUNTER")"
    attempt=$((attempt + 1))
    printf '%s\n' "$attempt" >"$MOCK_API_CURL_COUNTER"
    (( attempt >= 2 )) || return 22
    printf '{"status":"ok"}\n'
  }
  sleep() {
    return 0
  }
  archive_api_main_pid_exec_path() {
    printf 'mainpid-exec-check\n' >>"$MOCK_API_SYSTEMCTL_LOG"
    printf '%s\n' "$ARCHIVE_API_OLD_EXEC_PATH"
  }

  rollback_install_root
  [[ "$SOURCE_MUTATION_STARTED" -eq 0 && "$ARCHIVE_API_MUTATION_GUARD_APPLIED" -eq 0 && \
    "$MOCK_API_ACTIVE" -eq 1 ]]
)
archive_api_active_rollback_fixture || \
  fail "active API rollback did not restore source, readiness, and interpreter identity"
[[ "$(<"$ACTIVE_SOURCE_ROLLBACK_ROOT/release-sentinel")" == "old source" ]] || \
  fail "active API rollback did not restore the prior source"
[[ "$(<"$TEST_ROOT/archive-api-active-rollback-curl.count")" -eq 2 ]] || \
  fail "active API rollback did not wait for direct API readiness"
for expected_call in \
  "daemon-reload" \
  "restart trex-webui-api.service" \
  "show trex-webui-api.service --property=ExecStart --value" \
  "mainpid-exec-check"; do
  grep -Fqx "$expected_call" "$TEST_ROOT/archive-api-active-rollback-systemctl.log" || \
    fail "active API rollback omitted validation call: $expected_call"
done

INACTIVE_SOURCE_ROLLBACK_ROOT="$TEST_ROOT/archive-api-inactive-rollback"
INACTIVE_SOURCE_BACKUP="$TEST_ROOT/archive-api-inactive-source-backup"
mkdir -p "$INACTIVE_SOURCE_ROLLBACK_ROOT" "$INACTIVE_SOURCE_BACKUP"
trex_write_managed_marker "$INACTIVE_SOURCE_ROLLBACK_ROOT"
trex_write_managed_marker "$INACTIVE_SOURCE_BACKUP"
printf 'new source\n' >"$INACTIVE_SOURCE_ROLLBACK_ROOT/release-sentinel"
printf 'old source\n' >"$INACTIVE_SOURCE_BACKUP/release-sentinel"

archive_api_inactive_rollback_fixture() (
  # shellcheck source=deploy/upgrade.sh
  source "$PROJECT_ROOT/deploy/upgrade.sh"
  trap - EXIT
  INSTALL_ROOT="$INACTIVE_SOURCE_ROLLBACK_ROOT"
  SOURCE_BACKUP_DIR="$INACTIVE_SOURCE_BACKUP"
  INSTALL_ROOT_EXISTED=1
  SOURCE_MUTATION_STARTED=1
  ARCHIVE_API_STATE_CAPTURED=1
  ARCHIVE_API_SERVICE_MATCHED=1
  ARCHIVE_API_WAS_ACTIVE=0
  ARCHIVE_API_OLD_EXEC_PATH="$INSTALL_ROOT/.venv/bin/python"
  ARCHIVE_API_MUTATION_GUARD_APPLIED=1
  MOCK_API_WORKING_DIRECTORY="$INSTALL_ROOT"
  MOCK_API_EXEC_PATH="$ARCHIVE_API_OLD_EXEC_PATH"
  MOCK_API_ACTIVE=1
  MOCK_API_SYSTEMCTL_LOG="$TEST_ROOT/archive-api-inactive-rollback-systemctl.log"
  : >"$MOCK_API_SYSTEMCTL_LOG"
  systemctl() {
    mock_archive_api_systemctl "$@"
  }
  curl() {
    printf 'curl-called\n' >>"$MOCK_API_SYSTEMCTL_LOG"
    return 0
  }

  rollback_install_root
  [[ "$SOURCE_MUTATION_STARTED" -eq 0 && "$ARCHIVE_API_MUTATION_GUARD_APPLIED" -eq 0 && \
    "$MOCK_API_ACTIVE" -eq 0 ]]
)
archive_api_inactive_rollback_fixture || \
  fail "inactive API rollback did not preserve the stopped pre-transaction state"
[[ "$(<"$INACTIVE_SOURCE_ROLLBACK_ROOT/release-sentinel")" == "old source" ]] || \
  fail "inactive API rollback did not restore the prior source"
grep -Fqx "stop trex-webui-api.service" "$TEST_ROOT/archive-api-inactive-rollback-systemctl.log" || \
  fail "inactive API rollback did not ensure that the service remained stopped"
if grep -Eq '^(restart trex-webui-api.service|curl-called)$' \
  "$TEST_ROOT/archive-api-inactive-rollback-systemctl.log"; then
  fail "inactive API rollback restarted or probed a service that was previously stopped"
fi

archive_api_readiness_failure_fixture() (
  # shellcheck source=deploy/upgrade.sh
  source "$PROJECT_ROOT/deploy/upgrade.sh"
  trap - EXIT
  ARCHIVE_API_READINESS_ATTEMPTS=2
  ARCHIVE_API_READINESS_INTERVAL_SECONDS=0
  MOCK_API_ACTIVE=1
  MOCK_API_SYSTEMCTL_LOG="$TEST_ROOT/archive-api-readiness-failure-systemctl.log"
  MOCK_API_CURL_COUNTER="$TEST_ROOT/archive-api-readiness-failure-curl.count"
  : >"$MOCK_API_SYSTEMCTL_LOG"
  printf '0\n' >"$MOCK_API_CURL_COUNTER"
  systemctl() {
    mock_archive_api_systemctl "$@"
  }
  curl() {
    local attempt
    attempt="$(<"$MOCK_API_CURL_COUNTER")"
    printf '%s\n' "$((attempt + 1))" >"$MOCK_API_CURL_COUNTER"
    return 22
  }
  sleep() {
    return 0
  }
  wait_for_restored_archive_api_readiness
)
expect_failure "did not become ready" archive_api_readiness_failure_fixture
[[ "$(<"$TEST_ROOT/archive-api-readiness-failure-curl.count")" -eq 2 ]] || \
  fail "archive rollback readiness did not exhaust the configured direct health attempts"

chmod 0755 "$TEST_ROOT"
READ_PROJECT="$TEST_ROOT/read-project"
READ_TREX_SCRIPTS="$TEST_ROOT/read-trex-scripts"
READ_TREX_INTERACTIVE="$READ_TREX_SCRIPTS/automation/trex_control_plane/interactive"
mkdir -p "$READ_PROJECT/apps/api/app/core" "$READ_PROJECT/apps/api/app/trex" \
  "$READ_PROJECT/profiles" "$READ_TREX_SCRIPTS/stl" \
  "$READ_TREX_INTERACTIVE/trex/stl"
printf '' >"$READ_TREX_INTERACTIVE/trex/__init__.py"
printf '' >"$READ_TREX_INTERACTIVE/trex/stl/__init__.py"
printf 'class STLClient:\n    pass\n' >"$READ_TREX_INTERACTIVE/trex/stl/api.py"
printf '#!/usr/bin/env bash\nexit 0\n' >"$READ_TREX_SCRIPTS/trex_daemon_server"
chmod 0755 "$READ_TREX_SCRIPTS/trex_daemon_server"
find "$READ_TREX_SCRIPTS" -type d -exec chmod 0755 '{}' +
find "$READ_TREX_SCRIPTS" -type f ! -perm /111 -exec chmod 0644 '{}' +
cp -a --reflink=auto "$PROJECT_ROOT/.venv" "$READ_PROJECT/.venv"
rm -f -- "$READ_PROJECT/.venv/$TREX_MANAGED_MARKER_NAME"
printf '' >"$READ_PROJECT/apps/api/app/__init__.py"
printf 'SMOKE_OK = True\n' >"$READ_PROJECT/apps/api/app/main.py"
cp "$PROJECT_ROOT/apps/api/app/core/__init__.py" "$PROJECT_ROOT/apps/api/app/core/settings.py" \
  "$READ_PROJECT/apps/api/app/core/"
cp "$PROJECT_ROOT/apps/api/app/trex/__init__.py" \
  "$PROJECT_ROOT/apps/api/app/trex/result.py" \
  "$PROJECT_ROOT/apps/api/app/trex/runtime_state.py" \
  "$PROJECT_ROOT/apps/api/app/trex/stl_connection.py" \
  "$PROJECT_ROOT/apps/api/app/trex/stl_endpoint.py" \
  "$PROJECT_ROOT/apps/api/app/trex/traffic_hard_stop.py" \
  "$READ_PROJECT/apps/api/app/trex/"
printf 'TREX_WEBUI_TREX_HOST=127.0.0.1\n' >"$READ_PROJECT/.env"
chmod 0700 "$READ_PROJECT" "$READ_PROJECT/apps" "$READ_PROJECT/apps/api" \
  "$READ_PROJECT/apps/api/app" "$READ_PROJECT/.venv" "$READ_PROJECT/.venv/bin" "$READ_PROJECT/profiles"
find "$READ_PROJECT/apps/api/app" -type d -exec chmod 0700 '{}' +
find "$READ_PROJECT/apps/api/app" -type f -exec chmod 0600 '{}' +
chmod 0666 "$READ_PROJECT/.env"
(
  # shellcheck source=deploy/install.sh
  source "$PROJECT_ROOT/deploy/install.sh"
  PROJECT_ROOT="$READ_PROJECT"
  PROJECT_ENV_PATH="$READ_PROJECT/.env"
  SERVICE_USER=nobody
  SERVICE_GROUP="$(id -gn nobody)"
  DRY_RUN=0
  secure_service_read_paths
)
if getent passwd nobody >/dev/null 2>&1 && command -v runuser >/dev/null 2>&1; then
  (
    # shellcheck source=deploy/install.sh
    source "$PROJECT_ROOT/deploy/install.sh"
    PROJECT_ROOT="$READ_PROJECT"
    SERVICE_USER=nobody
    SERVICE_CONFIG_PATH="$TEST_ROOT/read-project-config.yaml"
    SERVICE_STATE_PROFILE_ROOT="$READ_PROJECT/profiles"
    TREX_DAEMON_SCRIPTS_DIR="$READ_TREX_SCRIPTS"
    TREX_DAEMON_BIN="$READ_TREX_SCRIPTS/trex_daemon_server"
    DRY_RUN=0
    smoke_test_service_import
  )
else
  fail "nobody/runuser is required to prove the non-privileged import smoke path"
fi
[[ "$(stat -c '%U:%G' "$READ_PROJECT/apps/api/app/main.py")" == "root:root" ]] || \
  fail "API source was not secured as root-owned"
(( (8#$(stat -c '%a' "$READ_PROJECT/apps/api/app/main.py") & 8#022) == 0 )) || \
  fail "API source remained writable by group/other"
[[ "$(stat -c '%U:%G %a' "$READ_PROJECT/.env")" == "root:$(id -gn nobody) 640" ]] || \
  fail "project .env was not secured as root-owned, service-readable 0640"
ln -s "$READ_PROJECT/.env" "$READ_PROJECT/unsafe.env"
unsafe_project_env_fixture() (
  # shellcheck source=deploy/install.sh
  source "$PROJECT_ROOT/deploy/install.sh"
  assert_regular_file_or_absent "$READ_PROJECT/unsafe.env" "project environment file"
)
expect_failure "must not be a symbolic link" unsafe_project_env_fixture

if [[ "$(id -u)" -eq 0 ]]; then
  CONFIG_ROLLBACK_ROOT="$TEST_ROOT/config-rollback"
  CONFIG_RESTART_LOG="$CONFIG_ROLLBACK_ROOT/systemctl.log"
  mkdir -p "$CONFIG_ROLLBACK_ROOT/nginx" "$CONFIG_ROLLBACK_ROOT/systemd" \
    "$CONFIG_ROLLBACK_ROOT/systemd/nftables.service.d" \
    "$CONFIG_ROLLBACK_ROOT/logrotate" "$CONFIG_ROLLBACK_ROOT/libexec"
  printf 'old nginx\n' >"$CONFIG_ROLLBACK_ROOT/nginx/trex-webui.conf"
  printf 'old systemd\n' >"$CONFIG_ROLLBACK_ROOT/systemd/trex-webui-api.service"
  printf 'old daemon systemd\n' >"$CONFIG_ROLLBACK_ROOT/systemd/trex-daemon-server.service"
  printf 'old daemon logrotate\n' >"$CONFIG_ROLLBACK_ROOT/logrotate/trex-daemon-server"
  printf 'old daemon supervisor\n' >"$CONFIG_ROLLBACK_ROOT/libexec/trex_daemon_supervisor.py"
  printf 'old daemon probe\n' >"$CONFIG_ROLLBACK_ROOT/libexec/daemon_rpc_probe.py"
  printf 'old daemon boundary\n' >"$CONFIG_ROLLBACK_ROOT/libexec/trex_native_boundary.sh"
  printf 'old nftables drop-in\n' \
    >"$CONFIG_ROLLBACK_ROOT/systemd/nftables.service.d/trex-webui-native-boundary.conf"
  if (
    # shellcheck source=deploy/install.sh
    source "$PROJECT_ROOT/deploy/install.sh"
    WEB_ROOT="$TEST_ROOT/config-web"
    NGINX_CONF_TARGET="$CONFIG_ROLLBACK_ROOT/nginx/trex-webui.conf"
    SYSTEMD_SERVICE_TARGET="$CONFIG_ROLLBACK_ROOT/systemd/trex-webui-api.service"
    DAEMON_SYSTEMD_SERVICE_TARGET="$CONFIG_ROLLBACK_ROOT/systemd/trex-daemon-server.service"
    DAEMON_LOGROTATE_TARGET="$CONFIG_ROLLBACK_ROOT/logrotate/trex-daemon-server"
    DAEMON_LIBEXEC_ROOT="$CONFIG_ROLLBACK_ROOT/libexec"
    DAEMON_SUPERVISOR_TARGET="$DAEMON_LIBEXEC_ROOT/trex_daemon_supervisor.py"
    DAEMON_RPC_PROBE_TARGET="$DAEMON_LIBEXEC_ROOT/daemon_rpc_probe.py"
    DAEMON_NATIVE_BOUNDARY_TARGET="$DAEMON_LIBEXEC_ROOT/trex_native_boundary.sh"
    NFTABLES_CONFIG_PATH="$CONFIG_ROLLBACK_ROOT/nftables.conf"
    NFTABLES_SYSTEMD_DROPIN_ROOT="$CONFIG_ROLLBACK_ROOT/systemd/nftables.service.d"
    NFTABLES_SYSTEMD_DROPIN_TARGET="$NFTABLES_SYSTEMD_DROPIN_ROOT/trex-webui-native-boundary.conf"
    DAEMON_UNIT_RESTART_REQUIRED=1
    DRY_RUN=0
    systemctl() {
      printf '%s\n' "$*" >>"$CONFIG_RESTART_LOG"
      return 0
    }
    nginx() {
      return 0
    }
    wait_for_api_readiness() {
      return 0
    }
    wait_for_daemon_readiness() {
      return 0
    }
    assert_daemon_restart_safe() {
      return 0
    }
    install_configs
    RUN_ENABLE=0
    RUN_RESTART=1
    reload_services
    exit 42
  ) >/dev/null 2>&1; then
    fail "configuration rollback fixture unexpectedly succeeded"
  fi
  [[ "$(<"$CONFIG_ROLLBACK_ROOT/nginx/trex-webui.conf")" == "old nginx" ]] || \
    fail "configuration rollback did not restore the prior Nginx file"
  [[ "$(<"$CONFIG_ROLLBACK_ROOT/systemd/trex-webui-api.service")" == "old systemd" ]] || \
    fail "configuration rollback did not restore the prior systemd file"
  [[ "$(<"$CONFIG_ROLLBACK_ROOT/systemd/trex-daemon-server.service")" == "old daemon systemd" ]] || \
    fail "configuration rollback did not restore the prior daemon systemd file"
  [[ "$(<"$CONFIG_ROLLBACK_ROOT/logrotate/trex-daemon-server")" == "old daemon logrotate" ]] || \
    fail "configuration rollback did not restore the prior daemon logrotate file"
  [[ "$(<"$CONFIG_ROLLBACK_ROOT/libexec/trex_daemon_supervisor.py")" == "old daemon supervisor" ]] || \
    fail "configuration rollback did not restore the prior daemon supervisor runtime"
  [[ "$(<"$CONFIG_ROLLBACK_ROOT/libexec/daemon_rpc_probe.py")" == "old daemon probe" ]] || \
    fail "configuration rollback did not restore the prior daemon RPC probe runtime"
  [[ "$(<"$CONFIG_ROLLBACK_ROOT/libexec/trex_native_boundary.sh")" == "old daemon boundary" ]] || \
    fail "configuration rollback did not restore the prior daemon native boundary runtime"
  [[ "$(<"$CONFIG_ROLLBACK_ROOT/systemd/nftables.service.d/trex-webui-native-boundary.conf")" == "old nftables drop-in" ]] || \
    fail "configuration rollback did not restore the prior nftables integration drop-in"
  [[ "$(<"$CONFIG_RESTART_LOG")" == *"daemon-reload"* ]] || \
    fail "configuration rollback did not reload restored systemd state"
  [[ "$(grep -c '^restart trex-webui-api.service$' "$CONFIG_RESTART_LOG")" -eq 2 ]] || \
    fail "configuration rollback did not restart the API with both published and restored units"
  [[ "$(grep -c '^restart trex-daemon-server.service$' "$CONFIG_RESTART_LOG")" -eq 2 ]] || \
    fail "configuration rollback did not restart the daemon with both published and restored units"

  CONFIG_NEW_ROOT="$TEST_ROOT/config-new-files"
  CONFIG_NEW_RESTART_LOG="$CONFIG_NEW_ROOT/systemctl.log"
  mkdir -p "$CONFIG_NEW_ROOT/nginx" "$CONFIG_NEW_ROOT/systemd" "$CONFIG_NEW_ROOT/logrotate"
  if (
    # shellcheck source=deploy/install.sh
    source "$PROJECT_ROOT/deploy/install.sh"
    WEB_ROOT="$TEST_ROOT/config-web"
    NGINX_CONF_TARGET="$CONFIG_NEW_ROOT/nginx/trex-webui.conf"
    SYSTEMD_SERVICE_TARGET="$CONFIG_NEW_ROOT/systemd/trex-webui-api.service"
    DAEMON_SYSTEMD_SERVICE_TARGET="$CONFIG_NEW_ROOT/systemd/trex-daemon-server.service"
    DAEMON_LOGROTATE_TARGET="$CONFIG_NEW_ROOT/logrotate/trex-daemon-server"
    DAEMON_LIBEXEC_ROOT="$CONFIG_NEW_ROOT/libexec"
    DAEMON_SUPERVISOR_TARGET="$DAEMON_LIBEXEC_ROOT/trex_daemon_supervisor.py"
    DAEMON_RPC_PROBE_TARGET="$DAEMON_LIBEXEC_ROOT/daemon_rpc_probe.py"
    DAEMON_NATIVE_BOUNDARY_TARGET="$DAEMON_LIBEXEC_ROOT/trex_native_boundary.sh"
    NFTABLES_CONFIG_PATH="$CONFIG_NEW_ROOT/nftables.conf"
    NFTABLES_SYSTEMD_DROPIN_ROOT="$CONFIG_NEW_ROOT/systemd/nftables.service.d"
    NFTABLES_SYSTEMD_DROPIN_TARGET="$NFTABLES_SYSTEMD_DROPIN_ROOT/trex-webui-native-boundary.conf"
    DAEMON_UNIT_RESTART_REQUIRED=1
    DRY_RUN=0
    systemctl() {
      printf '%s\n' "$*" >>"$CONFIG_NEW_RESTART_LOG"
      return 0
    }
    nginx() {
      return 0
    }
    wait_for_api_readiness() {
      return 0
    }
    wait_for_daemon_readiness() {
      return 0
    }
    assert_daemon_restart_safe() {
      return 0
    }
    install_configs
    RUN_ENABLE=0
    RUN_RESTART=1
    reload_services
    exit 42
  ) >/dev/null 2>&1; then
    fail "new configuration rollback fixture unexpectedly succeeded"
  fi
  [[ ! -e "$CONFIG_NEW_ROOT/nginx/trex-webui.conf" ]] || \
    fail "configuration rollback left a newly created Nginx file"
  [[ ! -e "$CONFIG_NEW_ROOT/systemd/trex-webui-api.service" ]] || \
    fail "configuration rollback left a newly created systemd file"
  [[ ! -e "$CONFIG_NEW_ROOT/systemd/trex-daemon-server.service" ]] || \
    fail "configuration rollback left a newly created daemon systemd file"
  [[ ! -e "$CONFIG_NEW_ROOT/logrotate/trex-daemon-server" ]] || \
    fail "configuration rollback left a newly created daemon logrotate file"
  [[ ! -e "$CONFIG_NEW_ROOT/libexec" ]] || \
    fail "configuration rollback left a newly created daemon libexec runtime"
  [[ ! -e "$CONFIG_NEW_ROOT/systemd/nftables.service.d" ]] || \
    fail "configuration rollback left a newly created nftables integration drop-in root"
  [[ "$(<"$CONFIG_NEW_RESTART_LOG")" == *"stop trex-webui-api.service"* ]] || \
    fail "configuration rollback did not stop the API after removing its first unit"
  [[ "$(<"$CONFIG_NEW_RESTART_LOG")" == *"stop trex-daemon-server.service"* ]] || \
    fail "configuration rollback did not stop the daemon after removing its first unit"
else
  printf 'SKIP: atomic configuration rollback integration requires root ownership changes\n'
fi

STATIC_PROJECT="$TEST_ROOT/static-project"
STATIC_WEB_ROOT="$TEST_ROOT/static-web"
mkdir -p "$STATIC_PROJECT/apps/web/dist" "$STATIC_WEB_ROOT"
printf 'new\n' >"$STATIC_PROJECT/apps/web/dist/index.html"
printf 'old\n' >"$STATIC_WEB_ROOT/index.html"
trex_write_managed_marker "$STATIC_WEB_ROOT"
STATIC_WEB_GAP="$TEST_ROOT/static-web-root-was-missing"
STATIC_OBSERVER_STOP="$TEST_ROOT/static-web-observer-stop"
(
  while [[ ! -e "$STATIC_OBSERVER_STOP" ]]; do
    [[ -d "$STATIC_WEB_ROOT" ]] || : >"$STATIC_WEB_GAP"
    sleep 0.005
  done
) &
STATIC_OBSERVER_PID=$!
if (
  # shellcheck source=deploy/install.sh
  source "$PROJECT_ROOT/deploy/install.sh"
  PROJECT_ROOT="$STATIC_PROJECT"
  WEB_ROOT="$STATIC_WEB_ROOT"
  DRY_RUN=0
  mv() {
    command mv "$@"
    sleep 0.2
  }
  sync_static_dist
  [[ "$(<"$STATIC_WEB_ROOT/index.html")" == "new" ]] || exit 97
  [[ "$(stat -c '%U:%G %a' "$STATIC_WEB_ROOT")" == "root:root 755" ]] || exit 96
  [[ "$(stat -c '%U:%G %a' "$STATIC_WEB_ROOT/index.html")" == "root:root 644" ]] || exit 95
  exit 42
) >/dev/null 2>&1; then
  STATIC_FIXTURE_SUCCEEDED=1
else
  STATIC_FIXTURE_SUCCEEDED=0
fi
: >"$STATIC_OBSERVER_STOP"
wait "$STATIC_OBSERVER_PID"
[[ "$STATIC_FIXTURE_SUCCEEDED" -eq 0 ]] || fail "static rollback fixture unexpectedly succeeded"
[[ ! -e "$STATIC_WEB_GAP" ]] || fail "static publish or rollback temporarily removed the live web root"
[[ "$(<"$STATIC_WEB_ROOT/index.html")" == "old" ]] || fail "static rollback did not restore the prior dist"

GATE_STATIC_PROJECT="$TEST_ROOT/gate-static-project"
GATE_STATIC_WEB_ROOT="$TEST_ROOT/gate-static-web"
mkdir -p "$GATE_STATIC_PROJECT/apps/web/dist" "$GATE_STATIC_WEB_ROOT"
printf 'new-gate\n' >"$GATE_STATIC_PROJECT/apps/web/dist/index.html"
printf 'old-gate\n' >"$GATE_STATIC_WEB_ROOT/index.html"
trex_write_managed_marker "$GATE_STATIC_WEB_ROOT"
GATE_STATIC_WEB_GAP="$TEST_ROOT/gate-static-web-root-was-missing"
GATE_STATIC_OBSERVER_STOP="$TEST_ROOT/gate-static-web-observer-stop"
(
  while [[ ! -e "$GATE_STATIC_OBSERVER_STOP" ]]; do
    [[ -d "$GATE_STATIC_WEB_ROOT" ]] || : >"$GATE_STATIC_WEB_GAP"
    sleep 0.005
  done
) &
GATE_STATIC_OBSERVER_PID=$!
if (
  # shellcheck source=scripts/verify_major_change.sh
  source "$PROJECT_ROOT/scripts/verify_major_change.sh"
  PROJECT_ROOT="$GATE_STATIC_PROJECT"
  WEB_ROOT="$GATE_STATIC_WEB_ROOT"
  SYNC_WEB_ROOT=1
  mv() {
    command mv "$@"
    sleep 0.2
  }
  sync_web_root
  [[ "$(<"$GATE_STATIC_WEB_ROOT/index.html")" == "new-gate" ]] || exit 94
  rollback_gate_web_root
  [[ "$(<"$GATE_STATIC_WEB_ROOT/index.html")" == "old-gate" ]] || exit 93
) >/dev/null 2>&1; then
  GATE_STATIC_FIXTURE_SUCCEEDED=1
else
  GATE_STATIC_FIXTURE_SUCCEEDED=0
fi
: >"$GATE_STATIC_OBSERVER_STOP"
wait "$GATE_STATIC_OBSERVER_PID"
[[ "$GATE_STATIC_FIXTURE_SUCCEEDED" -eq 1 ]] || fail "gate static rollback fixture failed"
[[ ! -e "$GATE_STATIC_WEB_GAP" ]] || fail "gate static publish or rollback temporarily removed the live web root"

STATIC_UNSAFE_PROJECT="$TEST_ROOT/static-unsafe-project"
mkdir -p "$STATIC_UNSAFE_PROJECT/apps/web/dist"
printf 'index\n' >"$STATIC_UNSAFE_PROJECT/apps/web/dist/index.html"
ln -s -- index.html "$STATIC_UNSAFE_PROJECT/apps/web/dist/injected-link"
unsafe_static_fixture() (
  # shellcheck source=deploy/install.sh
  source "$PROJECT_ROOT/deploy/install.sh"
  PROJECT_ROOT="$STATIC_UNSAFE_PROJECT"
  WEB_ROOT="$TEST_ROOT/static-unsafe-web"
  DRY_RUN=0
  sync_static_dist
)
expect_failure "frontend production build contains unsafe entries" unsafe_static_fixture

if [[ "$(id -u)" -eq 0 ]]; then
  FAKE_SYSTEMCTL_BIN="$TEST_ROOT/fake-systemctl-bin"
  FAKE_SYSTEMCTL_LOG="$TEST_ROOT/archive-rollback-systemctl.log"
  mkdir -p "$FAKE_SYSTEMCTL_BIN"
  printf '%s\n' '#!/usr/bin/env bash' 'set -Eeuo pipefail' \
    'printf "%s\n" "$*" >>"${FAKE_SYSTEMCTL_LOG:?}"' \
    'case "$*" in' \
    '  "show trex-webui-api.service --property=LoadState --value") printf "%s\n" "${FAKE_SYSTEMCTL_LOAD_STATE:-loaded}" ;;' \
    '  "show trex-webui-api.service --property=WorkingDirectory --value") printf "%s\n" "${FAKE_SYSTEMCTL_WORKING_DIRECTORY:-/opt/trex-webui}" ;;' \
    '  *) printf "unexpected systemctl call: %s\n" "$*" >&2; exit 64 ;;' \
    'esac' >"$FAKE_SYSTEMCTL_BIN/systemctl"
  chmod 0755 "$FAKE_SYSTEMCTL_BIN/systemctl"

  ROLLBACK_ARCHIVE="$TEST_ROOT/failing-install.tar.gz"
  make_fixture_archive "$ROLLBACK_ARCHIVE" failing-install
  ROLLBACK_INSTALL="$TEST_ROOT/rollback-install"
  mkdir "$ROLLBACK_INSTALL"
  trex_write_managed_marker "$ROLLBACK_INSTALL"
  printf 'old\n' >"$ROLLBACK_INSTALL/sentinel"
  expect_failure "" env \
    PATH="$FAKE_SYSTEMCTL_BIN:$PATH" \
    FAKE_SYSTEMCTL_LOG="$FAKE_SYSTEMCTL_LOG" \
    FAKE_SYSTEMCTL_LOAD_STATE=not-found \
    "$PROJECT_ROOT/deploy/upgrade.sh" \
    --archive "$ROLLBACK_ARCHIVE" \
    --install-root "$ROLLBACK_INSTALL" \
    --web-root "$TEST_ROOT/rollback-web" \
    --backup-root "$TEST_ROOT/rollback-static-backups" \
    --source-backup-root "$TEST_ROOT/rollback-source-backups" \
    --skip-python-deps --skip-enable --skip-restart --external-daemon \
    --sync-method portable
  [[ "$(<"$ROLLBACK_INSTALL/sentinel")" == "old" ]] || fail "source rollback did not restore the original sentinel"
  [[ ! -e "$ROLLBACK_INSTALL/new-release-file" ]] || fail "source rollback left release files behind"

  VENV_ROLLBACK_ARCHIVE="$TEST_ROOT/failing-venv-install.tar.gz"
  make_fixture_archive "$VENV_ROLLBACK_ARCHIVE" failing-venv-install
  VENV_ROLLBACK_INSTALL="$TEST_ROOT/venv-rollback-install"
  mkdir -p "$VENV_ROLLBACK_INSTALL/.venv"
  trex_write_managed_marker "$VENV_ROLLBACK_INSTALL"
  printf 'old-release\n' >"$VENV_ROLLBACK_INSTALL/.venv/release-sentinel"
  expect_failure "" env \
    PATH="$FAKE_SYSTEMCTL_BIN:$PATH" \
    FAKE_SYSTEMCTL_LOG="$FAKE_SYSTEMCTL_LOG" \
    "$PROJECT_ROOT/deploy/upgrade.sh" \
    --archive "$VENV_ROLLBACK_ARCHIVE" \
    --install-root "$VENV_ROLLBACK_INSTALL" \
    --web-root "$TEST_ROOT/venv-rollback-web" \
    --backup-root "$TEST_ROOT/venv-rollback-static-backups" \
    --source-backup-root "$TEST_ROOT/venv-rollback-source-backups" \
    --skip-python-deps --skip-enable --external-daemon --sync-method portable
  [[ "$(<"$VENV_ROLLBACK_INSTALL/.venv/release-sentinel")" == "old-release" ]] || \
    fail "outer archive rollback did not restore the prior virtualenv"
  # Non-production archive roots are now rejected before any host/service
  # inspection; older wrappers reached the read-only WorkingDirectory probe.
  # Both contracts must remain zero-mutation for the unrelated production API.
  if [[ -e "$FAKE_SYSTEMCTL_LOG" ]] && \
    grep -Eq '^(stop|restart) trex-webui-api.service$' "$FAKE_SYSTEMCTL_LOG"; then
    fail "custom-root archive rollback touched the unrelated production API"
  fi
else
  printf 'SKIP: source rollback integration requires root because archive upgrades intentionally require root\n'
fi

bash "$PROJECT_ROOT/deploy/tests/nginx_static_compression_test.sh"

printf 'PASS: release path, archive, checksum, and rollback safety\n'
