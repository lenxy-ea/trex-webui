#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# shellcheck source=deploy/path_safety.sh
source "$PROJECT_ROOT/deploy/path_safety.sh"

TEST_ROOT="$(mktemp -d -t trex-webui-venv-transaction.XXXXXX)"
trex_write_managed_marker "$TEST_ROOT"
chmod 0755 "$TEST_ROOT"

cleanup() {
  local status=$?
  trap - EXIT
  set +e
  trex_safe_remove_tree "$TEST_ROOT" "virtualenv transaction test root" || status=1
  exit "$status"
}
trap cleanup EXIT

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

[[ "$(id -u)" -eq 0 ]] || fail "root is required to exercise service-user permissions"
command -v runuser >/dev/null 2>&1 || fail "runuser is required"
getent passwd nobody >/dev/null 2>&1 || fail "the nobody account is required"
REAL_PYTHON311="$(command -v python3.11)" || fail "python3.11 is required"
export REAL_PYTHON311
[[ -x "$PROJECT_ROOT/.venv/bin/python" ]] || \
  fail "project virtualenv is required for runtime pin smoke tests"
SERVICE_TEST_VENV="$TEST_ROOT/service-test-venv"
cp -a --reflink=auto "$PROJECT_ROOT/.venv" "$SERVICE_TEST_VENV"
rm -f -- "$SERVICE_TEST_VENV/$TREX_MANAGED_MARKER_NAME"
chown -R root:root "$SERVICE_TEST_VENV"
chmod -R go-w "$SERVICE_TEST_VENV"
find "$SERVICE_TEST_VENV" -type d -exec chmod a+rx '{}' +
find "$SERVICE_TEST_VENV" -type f -exec chmod a+r '{}' +
find "$SERVICE_TEST_VENV" -type f -perm /111 -exec chmod a+rx '{}' +
SERVICE_TEST_PYTHON="$SERVICE_TEST_VENV/bin/python"

FAKE_BIN="$TEST_ROOT/fake-bin"
mkdir -p "$FAKE_BIN"
trex_write_managed_marker "$FAKE_BIN"

READINESS_CALLS="$TEST_ROOT/readiness-calls"
printf '0\n' >"$READINESS_CALLS"
(
  # shellcheck source=deploy/install.sh
  source "$PROJECT_ROOT/deploy/install.sh"
  DRY_RUN=0
  API_READINESS_ATTEMPTS=4
  API_READINESS_INTERVAL_SECONDS=0
  curl() {
    local calls
    calls="$(<"$READINESS_CALLS")"
    calls=$((calls + 1))
    printf '%s\n' "$calls" >"$READINESS_CALLS"
    if ((calls < 3)); then
      return 7
    fi
    printf '{"status":"ok"}\n'
  }
  systemctl() {
    case "$*" in
      'is-active --quiet trex-webui-api.service') return 0 ;;
      'is-failed --quiet trex-webui-api.service') return 1 ;;
      *) return 0 ;;
    esac
  }
  sleep() { :; }
  wait_for_api_readiness
)
[[ "$(<"$READINESS_CALLS")" == "3" ]] || \
  fail "API readiness gate did not tolerate a bounded Type=simple startup delay"

READINESS_FAILURE_LOG="$TEST_ROOT/readiness-failure.log"
set +e
(
  # shellcheck source=deploy/install.sh
  source "$PROJECT_ROOT/deploy/install.sh"
  DRY_RUN=0
  API_READINESS_ATTEMPTS=4
  API_READINESS_INTERVAL_SECONDS=0
  curl() { return 7; }
  systemctl() {
    case "$*" in
      'is-failed --quiet trex-webui-api.service') return 0 ;;
      'status trex-webui-api.service --no-pager') printf 'fixture failed service\n' ; return 3 ;;
      *) return 1 ;;
    esac
  }
  sleep() { :; }
  wait_for_api_readiness
) >"$READINESS_FAILURE_LOG" 2>&1
readiness_failure_status=$?
set -e
[[ "$readiness_failure_status" -ne 0 ]] || fail "failed API process was accepted as ready"
grep -q 'did not become ready' "$READINESS_FAILURE_LOG" || \
  fail "API readiness failure omitted bounded failure diagnostics"

printf '%s\n' '#!/usr/bin/env bash' >"$FAKE_BIN/python3.11"
printf '%s\n' 'set -Eeuo pipefail' >>"$FAKE_BIN/python3.11"
printf '%s\n' 'if [[ "${1:-}" == "-m" && "${2:-}" == "venv" ]]; then' >>"$FAKE_BIN/python3.11"
printf '%s\n' '  target="${3:?missing venv target}"' >>"$FAKE_BIN/python3.11"
printf '%s\n' '  mkdir -p "$target/bin"' >>"$FAKE_BIN/python3.11"
printf '%s\n' '  printf "new-release\n" >"$target/release-sentinel"' >>"$FAKE_BIN/python3.11"
  printf '%s\n' '  printf "%s\n" "#!/usr/bin/env bash" "set -Eeuo pipefail" "if [[ \"\${1:-}\" == \"-m\" && \"\${2:-}\" == \"pip\" ]]; then" "  printf \"%s\\n\" \"\$*\" >>\"\${FAKE_VENV_LOG:?}\"" "  if [[ \"\${FAKE_PIP_FAIL:-0}\" == \"1\" && \"\$*\" == *\" -r \"* ]]; then exit 73; fi" "  exit 0" "fi" "exec \"\${REAL_PYTHON311:?}\" \"\$@\"" >"$target/bin/python"' >>"$FAKE_BIN/python3.11"
printf '%s\n' '  chmod 0755 "$target/bin/python"' >>"$FAKE_BIN/python3.11"
printf '%s\n' '  exit 0' >>"$FAKE_BIN/python3.11"
printf '%s\n' 'fi' >>"$FAKE_BIN/python3.11"
printf '%s\n' 'exec "${REAL_PYTHON311:?}" "$@"' >>"$FAKE_BIN/python3.11"
chmod 0755 "$FAKE_BIN/python3.11"

make_project_fixture() {
  local fixture="$1"
  local with_live_venv="$2"
  mkdir -p "$fixture/apps/api/app/core" "$fixture/apps/api/app/trex" "$fixture/profiles"
  trex_write_managed_marker "$fixture"
  printf '{}\n' >"$fixture/package.json"
  printf '# dependency fixture\n' >"$fixture/apps/api/requirements.txt"
  printf '# locked dependency fixture\n' >"$fixture/apps/api/requirements.lock"
  printf '' >"$fixture/apps/api/app/__init__.py"
  printf 'SMOKE_OK = True\n' >"$fixture/apps/api/app/main.py"
  cp "$PROJECT_ROOT/apps/api/app/core/__init__.py" \
    "$PROJECT_ROOT/apps/api/app/core/settings.py" \
    "$fixture/apps/api/app/core/"
  cp "$PROJECT_ROOT/apps/api/app/trex/__init__.py" \
    "$PROJECT_ROOT/apps/api/app/trex/result.py" \
    "$PROJECT_ROOT/apps/api/app/trex/stl_connection.py" \
    "$PROJECT_ROOT/apps/api/app/trex/stl_endpoint.py" \
    "$fixture/apps/api/app/trex/"
  printf '%s\n' \
    'class _RuntimeDocument:' \
    '    connection = None' \
    '' \
    'class RuntimeStateStore:' \
    '    def __init__(self, _path):' \
    '        pass' \
    '' \
    '    def load(self):' \
    '        return _RuntimeDocument()' \
    >"$fixture/apps/api/app/trex/runtime_state.py"
  printf 'TREX_WEBUI_TREX_HOST=127.0.0.1\n' >"$fixture/.env"
  chmod 0755 "$fixture" "$fixture/apps" "$fixture/apps/api" "$fixture/apps/api/app" "$fixture/profiles"
  if [[ "$with_live_venv" -eq 1 ]]; then
    mkdir -p "$fixture/.venv/bin"
    printf 'old-release\n' >"$fixture/.venv/release-sentinel"
    ln -s "$REAL_PYTHON311" "$fixture/.venv/bin/python"
  fi
}

assert_no_transaction_siblings() {
  local fixture="$1"
  local remaining
  remaining="$(find "$fixture" -mindepth 1 -maxdepth 1 \
    \( -name '.venv.release-*' -o -name '.venv.rollback-*' \) -print -quit)"
  [[ -z "$remaining" ]] || fail "virtualenv transaction residue remained: $remaining"
}

assert_no_service_runtime_siblings() {
  local fixture="$1"
  local remaining
  remaining="$(find "$fixture" -mindepth 1 -maxdepth 1 -type d -name '.venv.runtime-*' -print -quit)"
  [[ -z "$remaining" ]] || fail "versioned service runtime residue remained: $remaining"
}

configure_installer_fixture() {
  local fixture="$1"
  PROJECT_ROOT="$fixture"
  PROJECT_ENV_PATH="$fixture/.env"
  VENV_LIVE_PATH="$fixture/.venv"
  SERVICE_USER=nobody
  SERVICE_GROUP="$(id -gn nobody)"
  SERVICE_CONFIG_PATH="$fixture/service/trex_cfg.yaml"
  SERVICE_STATE_PROFILE_ROOT="$fixture/service/profiles"
  INSTALL_PYTHON_DEPS=1
  RUN_RESTART=1
  RUN_ENABLE=0
  DRY_RUN=0
  FAKE_VENV_LOG="$fixture/pip.log"
  export FAKE_VENV_LOG
  PATH="$FAKE_BIN:$PATH"
  export PATH
  smoke_test_service_runtime_entrypoint() {
    local venv_path="$1"
    [[ -x "$venv_path/bin/python" ]] || return 1
    printf 'runtime-smoke %s\n' "$venv_path" >>"$FAKE_VENV_LOG"
  }
  wait_for_api_readiness() {
    printf 'readiness-ok\n' >>"$FAKE_VENV_LOG"
  }
  wait_for_daemon_readiness() {
    printf 'daemon-readiness-ok\n' >>"$FAKE_VENV_LOG"
  }
  verify_active_service_runtime() {
    printf 'runtime-identity %s\n' "$1" >>"$FAKE_VENV_LOG"
  }
}

make_trusted_service_runtime() {
  local fixture="$1"
  local suffix="$2"
  local runtime="$fixture/.venv.runtime-$suffix"
  mkdir -p "$runtime/bin"
  trex_write_managed_marker "$runtime"
  printf 'trex-webui-venv-runtime-v1\n' >"$runtime/.trex-webui-venv-runtime"
  printf 'trex-webui-venv-release-%s\n' "$suffix" >"$runtime/.trex-webui-venv-release"
  ln -s "$SERVICE_TEST_PYTHON" "$runtime/bin/python"
  chown -R root:root "$runtime"
  find "$runtime" -type d -exec chmod 0755 '{}' +
  find "$runtime" -type f -exec chmod 0644 '{}' +
  printf '%s\n' "$runtime"
}

write_service_unit_fixture() {
  local target="$1"
  local fixture="$2"
  local runtime="$3"
  printf 'WorkingDirectory=%s\n' "$fixture" >"$target"
  printf 'ExecStartPre=%s/bin/python -c "import fastapi, httptools, uvicorn, uvicorn.supervisors.statreload, uvloop, watchfiles.run, websockets"\n' \
    "$runtime" >>"$target"
  printf 'ExecStart=%s/bin/python -m uvicorn app.main:app --app-dir %s/apps/api --host 127.0.0.1 --port 8080\n' \
    "$runtime" "$fixture" >>"$target"
}

mock_pinned_service_systemctl() {
  case "$*" in
    'show trex-webui-api.service --property=LoadState --value')
      printf 'loaded\n'
      ;;
    'show trex-webui-api.service --property=WorkingDirectory --value')
      printf '%s\n' "$MOCK_PIN_PROJECT"
      ;;
    'show trex-webui-api.service --property=ExecStart --value')
      printf '{ path=%s/bin/python ; argv[]=%s/bin/python -m uvicorn app.main:app --app-dir %s/apps/api --host 127.0.0.1 --port 8080 ; ignore_errors=no ; }\n' \
        "$MOCK_PIN_LOADED_RUNTIME" "$MOCK_PIN_LOADED_RUNTIME" "$MOCK_PIN_PROJECT"
      ;;
    'show trex-webui-api.service --property=ExecStartPre --value')
      printf '{ path=%s/bin/python ; argv[]=%s/bin/python -c import fastapi, httptools, uvicorn, uvicorn.supervisors.statreload, uvloop, watchfiles.run, websockets ; ignore_errors=no ; }\n' \
        "$MOCK_PIN_LOADED_RUNTIME" "$MOCK_PIN_LOADED_RUNTIME"
      ;;
    'show trex-webui-api.service --property=ActiveState --value')
      printf '%s\n' "$MOCK_PIN_ACTIVE_STATE"
      ;;
    *)
      return 64
      ;;
  esac
}

PIN_PRESERVE_PROJECT="$TEST_ROOT/pin-preserve"
make_project_fixture "$PIN_PRESERVE_PROJECT" 1
PIN_PRESERVE_RUNTIME="$(make_trusted_service_runtime "$PIN_PRESERVE_PROJECT" 20260722T000000Z-1)"
PIN_PRESERVE_UNIT="$PIN_PRESERVE_PROJECT/trex-webui-api.service"
write_service_unit_fixture "$PIN_PRESERVE_UNIT" "$PIN_PRESERVE_PROJECT" "$PIN_PRESERVE_RUNTIME"
(
  # shellcheck source=deploy/install.sh
  source "$PROJECT_ROOT/deploy/install.sh"
  trap - EXIT
  PROJECT_ROOT="$PIN_PRESERVE_PROJECT"
  PROJECT_ENV_PATH="$PIN_PRESERVE_PROJECT/.env"
  VENV_LIVE_PATH="$PIN_PRESERVE_PROJECT/.venv"
  SYSTEMD_SERVICE_TARGET="$PIN_PRESERVE_UNIT"
  SERVICE_USER=nobody
  SERVICE_GROUP="$(id -gn nobody)"
  SERVICE_CONFIG_PATH="$PIN_PRESERVE_PROJECT/service/trex_cfg.yaml"
  SERVICE_STATE_PROFILE_ROOT="$PIN_PRESERVE_PROJECT/service/profiles"
  INSTALL_PYTHON_DEPS=0
  DRY_RUN=0
  MOCK_PIN_PROJECT="$PIN_PRESERVE_PROJECT"
  MOCK_PIN_LOADED_RUNTIME="$PIN_PRESERVE_RUNTIME"
  MOCK_PIN_ACTIVE_STATE=active
  systemctl() { mock_pinned_service_systemctl "$@"; }
  running_service_exec_path() { printf '%s/bin/python\n' "$PIN_PRESERVE_RUNTIME"; }
  smoke_test_service_runtime_entrypoint() {
    run runuser -u "$SERVICE_USER" -- "$1/bin/python" -V >/dev/null
  }
  resolve_existing_service_runtime_pin
  [[ "$VENV_SERVICE_PATH" == "$PIN_PRESERVE_RUNTIME" && "$SERVICE_RUNTIME_PIN_PRESERVED" -eq 1 ]] || return 81
  stage_versioned_service_runtime
  secure_service_read_paths
  smoke_test_service_import "$VENV_SERVICE_PATH"
  smoke_test_service_runtime_entrypoint "$VENV_SERVICE_PATH"
) || fail "no-deps deployment did not preserve and service-user smoke the trusted active runtime pin"

PIN_UNTRUSTED_PROJECT="$TEST_ROOT/pin-untrusted"
make_project_fixture "$PIN_UNTRUSTED_PROJECT" 1
PIN_UNTRUSTED_RUNTIME="$PIN_UNTRUSTED_PROJECT/.venv.runtime-20260722T000003Z-4"
mkdir -p "$PIN_UNTRUSTED_RUNTIME/bin"
ln -s "$REAL_PYTHON311" "$PIN_UNTRUSTED_RUNTIME/bin/python"
PIN_UNTRUSTED_UNIT="$PIN_UNTRUSTED_PROJECT/trex-webui-api.service"
write_service_unit_fixture "$PIN_UNTRUSTED_UNIT" "$PIN_UNTRUSTED_PROJECT" "$PIN_UNTRUSTED_RUNTIME"
set +e
(
  # shellcheck source=deploy/install.sh
  source "$PROJECT_ROOT/deploy/install.sh"
  trap - EXIT
  PROJECT_ROOT="$PIN_UNTRUSTED_PROJECT"
  VENV_LIVE_PATH="$PIN_UNTRUSTED_PROJECT/.venv"
  SYSTEMD_SERVICE_TARGET="$PIN_UNTRUSTED_UNIT"
  INSTALL_PYTHON_DEPS=0
  DRY_RUN=1
  resolve_existing_service_runtime_pin
) >/dev/null 2>&1
pin_untrusted_status=$?
set -e
[[ "$pin_untrusted_status" -ne 0 ]] || fail "untrusted existing versioned runtime pin fell back to .venv"

PIN_CONFLICT_PROJECT="$TEST_ROOT/pin-conflict"
make_project_fixture "$PIN_CONFLICT_PROJECT" 1
PIN_CONFLICT_DISK_RUNTIME="$(make_trusted_service_runtime "$PIN_CONFLICT_PROJECT" 20260722T000001Z-2)"
PIN_CONFLICT_LOADED_RUNTIME="$(make_trusted_service_runtime "$PIN_CONFLICT_PROJECT" 20260722T000002Z-3)"
PIN_CONFLICT_UNIT="$PIN_CONFLICT_PROJECT/trex-webui-api.service"
write_service_unit_fixture "$PIN_CONFLICT_UNIT" "$PIN_CONFLICT_PROJECT" "$PIN_CONFLICT_DISK_RUNTIME"
set +e
(
  # shellcheck source=deploy/install.sh
  source "$PROJECT_ROOT/deploy/install.sh"
  trap - EXIT
  PROJECT_ROOT="$PIN_CONFLICT_PROJECT"
  VENV_LIVE_PATH="$PIN_CONFLICT_PROJECT/.venv"
  SYSTEMD_SERVICE_TARGET="$PIN_CONFLICT_UNIT"
  INSTALL_PYTHON_DEPS=0
  DRY_RUN=0
  MOCK_PIN_PROJECT="$PIN_CONFLICT_PROJECT"
  MOCK_PIN_LOADED_RUNTIME="$PIN_CONFLICT_LOADED_RUNTIME"
  MOCK_PIN_ACTIVE_STATE=inactive
  systemctl() { mock_pinned_service_systemctl "$@"; }
  resolve_existing_service_runtime_pin
) >/dev/null 2>&1
pin_conflict_status=$?
set -e
[[ "$pin_conflict_status" -ne 0 ]] || fail "conflicting on-disk and loaded runtime pins were accepted"

UNOWNED_PROJECT="$(mktemp -d -t trex-webui-unowned-venv.XXXXXX)"
set +e
(
  # shellcheck source=deploy/install.sh
  source "$PROJECT_ROOT/deploy/install.sh"
  PROJECT_ROOT="$UNOWNED_PROJECT"
  INSTALL_PYTHON_DEPS=1
  RUN_RESTART=1
  prepare_venv_transaction
) >/dev/null 2>&1
unowned_status=$?
set -e
rmdir "$UNOWNED_PROJECT"
[[ "$unowned_status" -ne 0 ]] || fail "unowned custom virtualenv path was accepted"

SYMLINK_PROJECT="$TEST_ROOT/symlink-project"
mkdir -p "$SYMLINK_PROJECT/real-venv"
trex_write_managed_marker "$SYMLINK_PROJECT"
ln -s "$SYMLINK_PROJECT/real-venv" "$SYMLINK_PROJECT/.venv"
set +e
(
  # shellcheck source=deploy/install.sh
  source "$PROJECT_ROOT/deploy/install.sh"
  PROJECT_ROOT="$SYMLINK_PROJECT"
  INSTALL_PYTHON_DEPS=1
  RUN_RESTART=1
  prepare_venv_transaction
) >/dev/null 2>&1
symlink_status=$?
set -e
[[ "$symlink_status" -ne 0 ]] || fail "symbolic-link virtualenv path was accepted"

SKIP_RESTART_PROJECT="$TEST_ROOT/skip-restart"
make_project_fixture "$SKIP_RESTART_PROJECT" 1
set +e
(
  # shellcheck source=deploy/install.sh
  source "$PROJECT_ROOT/deploy/install.sh"
  configure_installer_fixture "$SKIP_RESTART_PROJECT"
  RUN_RESTART=0
  install_python_deps
) >/dev/null 2>&1
skip_restart_status=$?
set -e
[[ "$skip_restart_status" -ne 0 ]] || fail "dependency publication was accepted without an API restart"
assert_no_transaction_siblings "$SKIP_RESTART_PROJECT"

PIP_FAILURE_PROJECT="$TEST_ROOT/pip-failure"
make_project_fixture "$PIP_FAILURE_PROJECT" 1
set +e
(
  # shellcheck source=deploy/install.sh
  source "$PROJECT_ROOT/deploy/install.sh"
  configure_installer_fixture "$PIP_FAILURE_PROJECT"
  FAKE_PIP_FAIL=1
  export FAKE_PIP_FAIL
  install_python_deps
)
pip_failure_status=$?
set -e
[[ "$pip_failure_status" -ne 0 ]] || fail "pip failure fixture unexpectedly succeeded"
[[ "$(<"$PIP_FAILURE_PROJECT/.venv/release-sentinel")" == "old-release" ]] || \
  fail "pip failure modified the live virtualenv"
assert_no_transaction_siblings "$PIP_FAILURE_PROJECT"
assert_no_service_runtime_siblings "$PIP_FAILURE_PROJECT"

SWITCH_FAILURE_PROJECT="$TEST_ROOT/switch-failure"
SWITCH_FAILURE_LOG="$SWITCH_FAILURE_PROJECT/systemctl.log"
make_project_fixture "$SWITCH_FAILURE_PROJECT" 1
set +e
(
  # shellcheck source=deploy/install.sh
  source "$PROJECT_ROOT/deploy/install.sh"
  configure_installer_fixture "$SWITCH_FAILURE_PROJECT"
  install_python_deps
  secure_service_read_paths
  [[ "$(<"$SWITCH_FAILURE_PROJECT/.venv/release-sentinel")" == "old-release" ]] || \
    fail "staging changed the running API virtualenv before candidate smoke"
  smoke_test_service_import "$VENV_STAGING_PATH"
  stage_versioned_service_runtime
  [[ "$(<"$SWITCH_FAILURE_PROJECT/.venv/release-sentinel")" == "old-release" ]] || \
    fail "candidate smoke changed the running API virtualenv"
  SYSTEMD_CONFIG_EXISTED=1
  fail_nginx_restart=1
  systemctl() {
    printf '%s\n' "$*" >>"$SWITCH_FAILURE_LOG"
    if [[ "$*" == "restart nginx" && "$fail_nginx_restart" -eq 1 ]]; then
      fail_nginx_restart=0
      return 42
    fi
    return 0
  }
  nginx() {
    return 0
  }
  reload_services
)
switch_failure_status=$?
set -e
[[ "$switch_failure_status" -ne 0 ]] || fail "post-switch failure fixture unexpectedly succeeded"
[[ "$(<"$SWITCH_FAILURE_PROJECT/.venv/release-sentinel")" == "old-release" ]] || \
  fail "post-switch failure did not restore the old virtualenv"
[[ "$(grep -c '^stop trex-webui-api.service$' "$SWITCH_FAILURE_LOG")" -eq 1 ]] || \
  fail "virtualenv publication did not stop the old API before exchange"
[[ "$(grep -c '^start trex-webui-api.service$' "$SWITCH_FAILURE_LOG")" -eq 1 ]] || \
  fail "virtualenv publication did not start the API after exchange"
[[ "$(grep -c '^restart trex-webui-api.service$' "$SWITCH_FAILURE_LOG")" -eq 1 ]] || \
  fail "post-switch rollback did not restart the API with the restored virtualenv"
[[ "$(<"$SWITCH_FAILURE_LOG")" == *"daemon-reload"* ]] || \
  fail "post-switch rollback did not reload the restored unit"
[[ "$(<"$SWITCH_FAILURE_PROJECT/pip.log")" == *"-m pip check"* ]] || \
  fail "candidate dependency staging omitted pip check"
[[ "$(<"$SWITCH_FAILURE_PROJECT/pip.log")" == *"runtime-smoke $SWITCH_FAILURE_PROJECT/.venv"* ]] || \
  fail "published virtualenv runtime was not revalidated at its live path"
assert_no_transaction_siblings "$SWITCH_FAILURE_PROJECT"
assert_no_service_runtime_siblings "$SWITCH_FAILURE_PROJECT"

READINESS_ROLLBACK_PROJECT="$TEST_ROOT/readiness-rollback"
READINESS_ROLLBACK_LOG="$READINESS_ROLLBACK_PROJECT/service.log"
make_project_fixture "$READINESS_ROLLBACK_PROJECT" 1
set +e
(
  # shellcheck source=deploy/install.sh
  source "$PROJECT_ROOT/deploy/install.sh"
  configure_installer_fixture "$READINESS_ROLLBACK_PROJECT"
  install_python_deps
  secure_service_read_paths
  smoke_test_service_import "$VENV_STAGING_PATH"
  stage_versioned_service_runtime
  SYSTEMD_CONFIG_EXISTED=1
  systemctl() {
    printf 'systemctl %s\n' "$*" >>"$READINESS_ROLLBACK_LOG"
    return 0
  }
  nginx() {
    printf 'nginx %s\n' "$*" >>"$READINESS_ROLLBACK_LOG"
    return 0
  }
  readiness_attempt=0
  wait_for_api_readiness() {
    readiness_attempt=$((readiness_attempt + 1))
    if [[ "$readiness_attempt" -eq 1 ]]; then
      printf 'candidate readiness failed\n' >>"$READINESS_ROLLBACK_LOG"
      return 91
    fi
    printf 'restored readiness ok\n' >>"$READINESS_ROLLBACK_LOG"
    return 0
  }
  reload_services
)
readiness_rollback_status=$?
set -e
[[ "$readiness_rollback_status" -ne 0 ]] || fail "readiness rollback fixture unexpectedly succeeded"
[[ "$(<"$READINESS_ROLLBACK_PROJECT/.venv/release-sentinel")" == "old-release" ]] || \
  fail "readiness failure did not restore the old virtualenv"
[[ "$(grep -c '^systemctl start trex-webui-api.service$' "$READINESS_ROLLBACK_LOG")" -eq 1 ]] || \
  fail "readiness fixture did not start exactly one candidate API"
[[ "$(grep -c '^systemctl restart trex-webui-api.service$' "$READINESS_ROLLBACK_LOG")" -eq 1 ]] || \
  fail "readiness failure did not restart the restored API"
if grep -q '^systemctl restart nginx$' "$READINESS_ROLLBACK_LOG"; then
  fail "Nginx restarted before candidate API readiness was established"
fi
assert_no_transaction_siblings "$READINESS_ROLLBACK_PROJECT"
assert_no_service_runtime_siblings "$READINESS_ROLLBACK_PROJECT"

FIRST_INSTALL_PROJECT="$TEST_ROOT/first-install"
FIRST_INSTALL_LOG="$FIRST_INSTALL_PROJECT/systemctl.log"
make_project_fixture "$FIRST_INSTALL_PROJECT" 0
set +e
(
  # shellcheck source=deploy/install.sh
  source "$PROJECT_ROOT/deploy/install.sh"
  configure_installer_fixture "$FIRST_INSTALL_PROJECT"
  install_python_deps
  secure_service_read_paths
  smoke_test_service_import "$VENV_STAGING_PATH"
  stage_versioned_service_runtime
  SYSTEMD_CONFIG_EXISTED=0
  fail_nginx_restart=1
  systemctl() {
    printf '%s\n' "$*" >>"$FIRST_INSTALL_LOG"
    if [[ "$*" == "restart nginx" && "$fail_nginx_restart" -eq 1 ]]; then
      fail_nginx_restart=0
      return 42
    fi
    return 0
  }
  nginx() {
    return 0
  }
  reload_services
)
first_install_status=$?
set -e
[[ "$first_install_status" -ne 0 ]] || fail "failed first-install fixture unexpectedly succeeded"
[[ ! -e "$FIRST_INSTALL_PROJECT/.venv" ]] || \
  fail "failed first install retained the newly published virtualenv"
[[ "$(<"$FIRST_INSTALL_LOG")" == *"stop trex-webui-api.service"* ]] || \
  fail "failed first install did not stop the API after removing its new unit/runtime"
assert_no_transaction_siblings "$FIRST_INSTALL_PROJECT"
assert_no_service_runtime_siblings "$FIRST_INSTALL_PROJECT"

SUCCESS_PROJECT="$TEST_ROOT/success"
SUCCESS_LOG="$SUCCESS_PROJECT/systemctl.log"
make_project_fixture "$SUCCESS_PROJECT" 1
(
  # shellcheck source=deploy/install.sh
  source "$PROJECT_ROOT/deploy/install.sh"
  configure_installer_fixture "$SUCCESS_PROJECT"
  install_python_deps
  secure_service_read_paths
  smoke_test_service_import "$VENV_STAGING_PATH"
  stage_versioned_service_runtime
  SYSTEMD_CONFIG_EXISTED=1
  systemctl() {
    printf '%s\n' "$*" >>"$SUCCESS_LOG"
    return 0
  }
  nginx() {
    return 0
  }
  reload_services
)
[[ "$(<"$SUCCESS_PROJECT/.venv/release-sentinel")" == "new-release" ]] || \
  fail "successful deployment did not publish the staged virtualenv"
[[ "$(<"$SUCCESS_PROJECT/pip.log")" == *"runtime-smoke $SUCCESS_PROJECT/.venv"* ]] || \
  fail "successful deployment omitted the live-path runtime smoke"
assert_no_transaction_siblings "$SUCCESS_PROJECT"
success_runtime_count="$(find "$SUCCESS_PROJECT" -mindepth 1 -maxdepth 1 -type d -name '.venv.runtime-*' | wc -l)"
[[ "$success_runtime_count" -eq 1 ]] || fail "successful deployment did not retain exactly one versioned service runtime"

printf 'virtualenv transaction tests passed\n'
