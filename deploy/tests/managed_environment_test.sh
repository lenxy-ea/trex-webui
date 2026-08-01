#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROJECT_PROFILE_ROOT="$PROJECT_ROOT/profiles"
DEFAULT_PROFILE_ROOTS="/opt/trex-core/scripts/stl:$PROJECT_PROFILE_ROOT:/var/lib/trex-webui/profiles"
# shellcheck source=deploy/path_safety.sh
source "$PROJECT_ROOT/deploy/path_safety.sh"

if [[ "$(id -u)" -ne 0 ]]; then
  printf 'SKIP: managed environment authority test requires root metadata ownership\n'
  exit 0
fi

TEST_ROOT="$(mktemp -d -t trex-webui-managed-environment.XXXXXX)"
trex_write_managed_marker "$TEST_ROOT"
TRUST_TEST_ROOT="$(mktemp -d -p /run trex-webui-root-control.XXXXXX)"
trex_write_managed_marker "$TRUST_TEST_ROOT"

cleanup() {
  local status=$?
  trap - EXIT
  set +e
  trex_safe_remove_tree "$TEST_ROOT" "managed environment test root" || status=1
  trex_safe_remove_tree "$TRUST_TEST_ROOT" "root-control test root" || status=1
  exit "$status"
}
trap cleanup EXIT

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
  [[ "$output" == *"$expected"* ]] || \
    fail "failure did not contain '$expected': $output"
}

run_verify_helper() (
  local helper="$1"
  shift
  # shellcheck source=deploy/verify.sh
  source "$PROJECT_ROOT/deploy/verify.sh"
  "$helper" "$@"
)

run_private_selinux_fixture() (
  local release_root="$1"
  local inspected_log="$2"
  local mismatched_path="${3:-}"
  local mismatched_context="${4:-}"
  # shellcheck source=deploy/verify.sh
  source "$PROJECT_ROOT/deploy/verify.sh"
  matchpathcon() {
    [[ "$#" -eq 3 && "$1" == "-n" && "$2" == "--" ]] || return 97
    printf '%s\n' "$3" >>"$inspected_log"
    case "$3" in
      "$release_root/.venv/bin"|"$release_root/.venv/bin/python")
        printf 'system_u:object_r:bin_t:s0\n'
        ;;
      *)
        printf 'system_u:object_r:usr_t:s0\n'
        ;;
    esac
  }
  stat() {
    [[ "$#" -eq 4 && "$1" == "-c" && "$2" == "%C" && "$3" == "--" ]] || \
      return 98
    if [[ "$4" == "$mismatched_path" ]]; then
      printf '%s\n' "$mismatched_context"
    else
      case "$4" in
        "$release_root/.venv/bin"|"$release_root/.venv/bin/python")
          printf 'system_u:object_r:bin_t:s0\n'
          ;;
        *)
          printf 'system_u:object_r:usr_t:s0\n'
          ;;
      esac
    fi
  }
  assert_release_private_selinux "$release_root" fixture
)

SELINUX_RELEASE_FIXTURE="$TEST_ROOT/selinux-release"
SELINUX_API_CHILD="$SELINUX_RELEASE_FIXTURE/apps/api/app/main.py"
SELINUX_PYTHON_LINK="$SELINUX_RELEASE_FIXTURE/.venv/bin/python"
SELINUX_INSPECTED_LOG="$TEST_ROOT/selinux-inspected.log"
mkdir -p \
  "$SELINUX_RELEASE_FIXTURE/apps/api/app" \
  "$SELINUX_RELEASE_FIXTURE/apps/web" \
  "$SELINUX_RELEASE_FIXTURE/.venv/bin"
printf 'pass\n' >"$SELINUX_API_CHILD"
printf 'TREX_WEBUI_TREX_HOST=127.0.0.1\n' >"$SELINUX_RELEASE_FIXTURE/.env"
ln -s /usr/bin/python3 "$SELINUX_PYTHON_LINK"
run_private_selinux_fixture \
  "$SELINUX_RELEASE_FIXTURE" \
  "$SELINUX_INSPECTED_LOG" || \
  fail "verifier rejected private release paths with exact policy labels"
for inspected_path in \
  "$SELINUX_RELEASE_FIXTURE" \
  "$SELINUX_RELEASE_FIXTURE/apps" \
  "$SELINUX_RELEASE_FIXTURE/apps/web" \
  "$SELINUX_RELEASE_FIXTURE/apps/api" \
  "$SELINUX_API_CHILD" \
  "$SELINUX_RELEASE_FIXTURE/.env" \
  "$SELINUX_RELEASE_FIXTURE/.venv" \
  "$SELINUX_RELEASE_FIXTURE/.venv/bin" \
  "$SELINUX_PYTHON_LINK"; do
  grep -Fxq "$inspected_path" "$SELINUX_INSPECTED_LOG" || \
    fail "verifier did not inspect SELinux policy for $inspected_path"
done

: >"$SELINUX_INSPECTED_LOG"
expect_failure "does not match persisted policy" \
  run_private_selinux_fixture \
  "$SELINUX_RELEASE_FIXTURE" \
  "$SELINUX_INSPECTED_LOG" \
  "$SELINUX_API_CHILD" \
  "unconfined_u:object_r:usr_t:s0"

: >"$SELINUX_INSPECTED_LOG"
expect_failure "does not match persisted policy" \
  run_private_selinux_fixture \
  "$SELINUX_RELEASE_FIXTURE" \
  "$SELINUX_INSPECTED_LOG" \
  "$SELINUX_PYTHON_LINK" \
  "system_u:object_r:user_tmp_t:s0"

: >"$SELINUX_INSPECTED_LOG"
expect_failure "does not match persisted policy" \
  run_private_selinux_fixture \
  "$SELINUX_RELEASE_FIXTURE" \
  "$SELINUX_INSPECTED_LOG" \
  "$SELINUX_RELEASE_FIXTURE/.venv/bin" \
  "system_u:object_r:user_tmp_t:s0"

secure_environment_file() {
  local path="$1"
  chown root:root "$path"
  chmod 0600 "$path"
}

MARKER_TEST_ROOT="$TRUST_TEST_ROOT/marker-authority"
mkdir "$MARKER_TEST_ROOT"
trex_write_managed_marker "$MARKER_TEST_ROOT"
[[ "$(stat -c '%u:%g %a %h' "$MARKER_TEST_ROOT/$TREX_MANAGED_MARKER_NAME")" == \
  "0:0 $TREX_MANAGED_MARKER_MODE 1" ]] || \
  fail "managed marker writer did not publish the fixed root:root single-link mode"
trex_assert_managed_path "$MARKER_TEST_ROOT" "trusted marker fixture"

MARKER_OWNER_FIXTURE="$TRUST_TEST_ROOT/non-root-marker"
mkdir "$MARKER_OWNER_FIXTURE"
trex_write_managed_marker "$MARKER_OWNER_FIXTURE"
chown 1:1 "$MARKER_OWNER_FIXTURE/$TREX_MANAGED_MARKER_NAME"
expect_failure "owned by root:root" \
  trex_assert_managed_path "$MARKER_OWNER_FIXTURE" "non-root marker fixture"

MARKER_MODE_FIXTURE="$TRUST_TEST_ROOT/wrong-mode-marker"
mkdir "$MARKER_MODE_FIXTURE"
trex_write_managed_marker "$MARKER_MODE_FIXTURE"
chmod 0600 "$MARKER_MODE_FIXTURE/$TREX_MANAGED_MARKER_NAME"
expect_failure "mode must be $TREX_MANAGED_MARKER_MODE" \
  trex_assert_managed_path "$MARKER_MODE_FIXTURE" "wrong-mode marker fixture"

MARKER_LINK_FIXTURE="$TRUST_TEST_ROOT/hard-linked-marker"
mkdir "$MARKER_LINK_FIXTURE"
trex_write_managed_marker "$MARKER_LINK_FIXTURE"
ln \
  "$MARKER_LINK_FIXTURE/$TREX_MANAGED_MARKER_NAME" \
  "$MARKER_LINK_FIXTURE/second-marker-link"
expect_failure "exactly one hard link" \
  trex_assert_managed_path "$MARKER_LINK_FIXTURE" "hard-linked marker fixture"

MARKER_SYMLINK_FIXTURE="$TRUST_TEST_ROOT/symlink-marker"
mkdir "$MARKER_SYMLINK_FIXTURE"
ln -s \
  "$MARKER_TEST_ROOT/$TREX_MANAGED_MARKER_NAME" \
  "$MARKER_SYMLINK_FIXTURE/$TREX_MANAGED_MARKER_NAME"
expect_failure "missing or unsafe" \
  trex_assert_managed_path "$MARKER_SYMLINK_FIXTURE" "symlink marker fixture"

MARKER_DIRECTORY_FIXTURE="$TRUST_TEST_ROOT/directory-marker"
mkdir "$MARKER_DIRECTORY_FIXTURE"
mkdir "$MARKER_DIRECTORY_FIXTURE/$TREX_MANAGED_MARKER_NAME"
expect_failure "regular non-symlink file" \
  trex_assert_managed_path "$MARKER_DIRECTORY_FIXTURE" "directory marker fixture"

UNTRUSTED_ANCESTOR="$TRUST_TEST_ROOT/untrusted-authority-ancestor"
UNTRUSTED_TARGET="$UNTRUSTED_ANCESTOR/target"
mkdir -p "$UNTRUSTED_TARGET"
trex_write_managed_marker "$UNTRUSTED_TARGET"
chown 1:1 "$UNTRUSTED_ANCESTOR"
expect_failure "not root-controlled" \
  trex_assert_managed_path "$UNTRUSTED_TARGET" "non-root ancestor fixture"
chown root:root "$UNTRUSTED_ANCESTOR"

WRITABLE_ANCESTOR="$TRUST_TEST_ROOT/writable-authority-ancestor"
WRITABLE_TARGET="$WRITABLE_ANCESTOR/target"
mkdir -p "$WRITABLE_TARGET"
trex_write_managed_marker "$WRITABLE_TARGET"
chmod 0777 "$WRITABLE_ANCESTOR"
expect_failure "can be replaced by a non-root account" \
  trex_assert_managed_path "$WRITABLE_TARGET" "writable ancestor fixture"
chmod 0755 "$WRITABLE_ANCESTOR"

UNTRUSTED_TARGET="$TRUST_TEST_ROOT/non-root-target"
mkdir "$UNTRUSTED_TARGET"
chown 1:1 "$UNTRUSTED_TARGET"
expect_failure "not root-controlled" \
  trex_assert_managed_path "$UNTRUSTED_TARGET" "non-root target fixture"
chown root:root "$UNTRUSTED_TARGET"

MUTATION_RECHECK_FIXTURE="$TRUST_TEST_ROOT/mutation-recheck"
mkdir "$MUTATION_RECHECK_FIXTURE"
trex_write_managed_marker "$MUTATION_RECHECK_FIXTURE"
trex_assert_managed_path "$MUTATION_RECHECK_FIXTURE" "mutation recheck fixture"
chmod 0600 "$MUTATION_RECHECK_FIXTURE/$TREX_MANAGED_MARKER_NAME"
expect_failure "mode must be $TREX_MANAGED_MARKER_MODE" \
  trex_safe_remove_tree "$MUTATION_RECHECK_FIXTURE" "mutation recheck fixture"
[[ -d "$MUTATION_RECHECK_FIXTURE" ]] || \
  fail "mutation proceeded after managed marker authority changed"
chmod "$TREX_MANAGED_MARKER_MODE" \
  "$MUTATION_RECHECK_FIXTURE/$TREX_MANAGED_MARKER_NAME"
trex_safe_remove_tree "$MUTATION_RECHECK_FIXTURE" "mutation recheck fixture"

VALID_ENV="$TEST_ROOT/valid.env"
printf '%s\n' \
  '# non-authoritative operator tuning remains available' \
  'TREX_WEBUI_REQUIRE_CONFIRMATION=1' \
  'TREX_WEBUI_TREX_TIMEOUT_SECONDS=5' >"$VALID_ENV"
secure_environment_file "$VALID_ENV"
trex_assert_managed_api_environment_file "$VALID_ENV"

for protected_key in "${TREX_MANAGED_API_ENV_PROTECTED_KEYS[@]}"; do
  protected_env="$TEST_ROOT/protected-$protected_key.env"
  printf '%s\n' "$protected_key=unsafe" >"$protected_env"
  secure_environment_file "$protected_env"
  expect_failure "protected key $protected_key" \
    trex_assert_managed_api_environment_file "$protected_env"
done

MODE_ENV="$TEST_ROOT/mode.env"
printf '%s\n' 'TREX_WEBUI_REQUIRE_CONFIRMATION=1' >"$MODE_ENV"
chown root:root "$MODE_ENV"
chmod 0640 "$MODE_ENV"
expect_failure "mode must be 0600" trex_assert_managed_api_environment_file "$MODE_ENV"

OWNER_ENV="$TEST_ROOT/owner.env"
printf '%s\n' 'TREX_WEBUI_REQUIRE_CONFIRMATION=1' >"$OWNER_ENV"
chown 1:1 "$OWNER_ENV"
chmod 0600 "$OWNER_ENV"
expect_failure "owned by root:root" trex_assert_managed_api_environment_file "$OWNER_ENV"

LINK_ENV="$TEST_ROOT/link.env"
ln -s "$VALID_ENV" "$LINK_ENV"
expect_failure "symbolic-link component" trex_assert_managed_api_environment_file "$LINK_ENV"

EXTERNAL_ENV="$TEST_ROOT/external.env"
printf '%s\n' 'TREX_WEBUI_TREX_HOST=remote.trex' >"$EXTERNAL_ENV"
secure_environment_file "$EXTERNAL_ENV"
(
  # shellcheck source=deploy/install.sh
  source "$PROJECT_ROOT/deploy/install.sh"
  MANAGE_LOCAL_DAEMON=0
  SERVICE_ENV_FILE="$EXTERNAL_ENV"
  preflight_managed_api_environment
) || fail "external-daemon mode unexpectedly rejected its operator-managed connection input"

chmod 0644 "$EXTERNAL_ENV"
external_unsafe_environment_fixture() (
  # shellcheck source=deploy/install.sh
  source "$PROJECT_ROOT/deploy/install.sh"
  MANAGE_LOCAL_DAEMON=0
  SERVICE_ENV_FILE="$EXTERNAL_ENV"
  preflight_managed_api_environment
)
expect_failure "mode must be 0600" external_unsafe_environment_fixture
secure_environment_file "$EXTERNAL_ENV"

TRUSTED_TREE="$TRUST_TEST_ROOT/scripts"
mkdir -p "$TRUSTED_TREE/bin"
printf '#!/usr/bin/env bash\nexit 0\n' >"$TRUSTED_TREE/bin/trex_daemon_server"
chown -R root:root "$TRUSTED_TREE"
chmod 0755 "$TRUSTED_TREE" "$TRUSTED_TREE/bin" "$TRUSTED_TREE/bin/trex_daemon_server"
trex_assert_root_controlled_tree "$TRUSTED_TREE" "trusted fixture tree"

chmod 0775 "$TRUSTED_TREE/bin"
expect_failure "writable by group or other" \
  trex_assert_root_controlled_tree "$TRUSTED_TREE" "group-writable fixture tree"
chmod 0755 "$TRUSTED_TREE/bin"

chown 1:1 "$TRUSTED_TREE/bin/trex_daemon_server"
expect_failure "not owned by root" \
  trex_assert_root_controlled_tree "$TRUSTED_TREE" "non-root fixture tree"
chown root:root "$TRUSTED_TREE/bin/trex_daemon_server"

expect_failure "hidden by the managed API systemd sandbox" \
  trex_assert_systemd_visible_path "/tmp/trex/scripts" "TRex scripts fixture"
expect_failure "character unsafe for managed configuration" \
  trex_canonical_path "/srv/trex:alternate/scripts" "TRex scripts fixture"
expect_failure "character unsafe for managed configuration" \
  trex_canonical_path '/srv/trex\alternate/scripts' "TRex scripts fixture"
expect_failure "character unsafe for managed configuration" \
  trex_canonical_path "/srv/trex%alternate/scripts" "TRex scripts fixture"

(
  export DAEMON_LIBEXEC_ROOT="$TRUST_TEST_ROOT/custom-libexec"
  export DAEMON_SUPERVISOR_TARGET="$DAEMON_LIBEXEC_ROOT/custom-supervisor.py"
  export DAEMON_RPC_PROBE_TARGET="$DAEMON_LIBEXEC_ROOT/custom-probe.py"
  export DAEMON_NATIVE_BOUNDARY_TARGET="$DAEMON_LIBEXEC_ROOT/custom-boundary.sh"
  export NFTABLES_CONFIG_PATH="$TRUST_TEST_ROOT/custom-nftables.conf"
  export NFTABLES_SYSTEMD_DROPIN_ROOT="$TRUST_TEST_ROOT/custom-nftables.service.d"
  export NFTABLES_SYSTEMD_DROPIN_TARGET="$NFTABLES_SYSTEMD_DROPIN_ROOT/custom.conf"
  # shellcheck source=deploy/verify.sh
  source "$PROJECT_ROOT/deploy/verify.sh"
  [[ "$DAEMON_SUPERVISOR" == "$DAEMON_SUPERVISOR_TARGET" ]] || \
    fail "verifier discarded the custom daemon supervisor authority"
  [[ "$DAEMON_RPC_PROBE" == "$DAEMON_RPC_PROBE_TARGET" ]] || \
    fail "verifier discarded the custom daemon RPC probe authority"
  [[ "$DAEMON_NATIVE_BOUNDARY" == "$DAEMON_NATIVE_BOUNDARY_TARGET" ]] || \
    fail "verifier discarded the custom native-boundary authority"
  [[ "$NFTABLES_CONFIG" == "$NFTABLES_CONFIG_PATH" ]] || \
    fail "verifier discarded the custom nftables configuration authority"
  [[ "$NFTABLES_DROPIN" == "$NFTABLES_SYSTEMD_DROPIN_TARGET" ]] || \
    fail "verifier discarded the custom nftables drop-in authority"
)

CUSTOM_OPERATOR_NFTABLES="$TRUST_TEST_ROOT/operator-nftables.conf"
CUSTOM_VERIFY_WEB_ROOT="$TRUST_TEST_ROOT/verifier-web-root"
mkdir -p "$CUSTOM_VERIFY_WEB_ROOT"
printf '%s\n' 'table inet operator_rules {}' >"$CUSTOM_OPERATOR_NFTABLES"
printf '%s\n' '<div id="root"></div>' >"$CUSTOM_VERIFY_WEB_ROOT/index.html"
chown root:root "$CUSTOM_OPERATOR_NFTABLES"
chmod 0644 "$CUSTOM_OPERATOR_NFTABLES"
(
  export NFTABLES_CONFIG_PATH="$CUSTOM_OPERATOR_NFTABLES"
  # shellcheck source=deploy/verify.sh
  source "$PROJECT_ROOT/deploy/verify.sh"
  WEB_ROOT="$CUSTOM_VERIFY_WEB_ROOT"
  check_layout
) || fail "verifier rejected a custom root-controlled operator nftables config"

(
  SERVICE_ENV_FILE="$TEST_ROOT/attacker-selected.env"
  API_PROC_ROOT="$TEST_ROOT/fake-proc"
  # shellcheck source=deploy/install.sh
  source "$PROJECT_ROOT/deploy/install.sh"
  [[ "$SERVICE_ENV_FILE" == "/etc/trex-webui/trex-webui.env" ]] || \
    fail "installer accepted an environment override for the authority file path"
  [[ "$API_PROC_ROOT" == "/proc" ]] || \
    fail "installer accepted an environment override for the process inspection root"
)

PROC_ROOT="$TEST_ROOT/proc"
mkdir -p "$PROC_ROOT/4242"
write_process_environment() {
  local host="$1"
  local include_runtime_state="${2:-1}"
  local scripts_dir="${3:-/opt/trex-core/scripts}"
  local daemon_bin="${4:-/opt/trex-core/scripts/trex_daemon_server}"
  local profile_roots="${5:-$DEFAULT_PROFILE_ROOTS}"
  local entries=(
    "TREX_WEBUI_TREX_HOST=$host"
    "TREX_WEBUI_TREX_SYNC_PORT=4501"
    "TREX_WEBUI_TREX_ASYNC_PORT=4500"
    "TREX_WEBUI_TREX_SCAPY_PORT=4507"
    "TREX_WEBUI_TREX_DAEMON_PORT=8090"
    "TREX_WEBUI_DAEMON_SUPERVISOR=systemd"
    "TREX_WEBUI_TREX_SCRIPTS_DIR=$scripts_dir"
    "TREX_WEBUI_TREX_DAEMON_BIN=$daemon_bin"
    "TREX_WEBUI_PROFILE_ROOTS=$profile_roots"
    "TREX_WEBUI_DAEMON_GENERATION_PATH=/run/trex-webui/daemon-generation"
  )
  if [[ "$include_runtime_state" -eq 1 ]]; then
    entries+=("TREX_WEBUI_RUNTIME_STATE_PATH=/var/lib/trex-webui/runtime-state.json")
  fi
  printf '%s\0' "${entries[@]}" >"$PROC_ROOT/4242/environ"
}

write_process_environment "127.0.0.1"
printf 'UNRELATED=\377\0' >>"$PROC_ROOT/4242/environ"
trex_assert_managed_api_process_environment 4242 "$PROC_ROOT"
trex_assert_managed_api_process_environment \
  4242 \
  "$PROC_ROOT" \
  "/opt/trex-core/scripts" \
  "/opt/trex-core/scripts/trex_daemon_server" \
  "$DEFAULT_PROFILE_ROOTS"

write_process_environment \
  "127.0.0.1" \
  1 \
  "/srv/trex/scripts" \
  "/srv/trex/scripts/trex_daemon_server" \
  "/srv/trex/scripts/stl:$PROJECT_PROFILE_ROOT:/var/lib/trex-webui/profiles"
expect_failure "mismatch for TREX_WEBUI_TREX_SCRIPTS_DIR" \
  trex_assert_managed_api_process_environment \
    4242 \
    "$PROC_ROOT" \
    "/opt/trex-core/scripts" \
    "/opt/trex-core/scripts/trex_daemon_server" \
    "$DEFAULT_PROFILE_ROOTS"

write_process_environment "remote.trex"
expect_failure "mismatch for TREX_WEBUI_TREX_HOST" \
  trex_assert_managed_api_process_environment 4242 "$PROC_ROOT"

write_process_environment "127.0.0.1" 0
expect_failure "mismatch for TREX_WEBUI_RUNTIME_STATE_PATH" \
  trex_assert_managed_api_process_environment 4242 "$PROC_ROOT"

write_process_environment "127.0.0.1"
DECLARED_ENVIRONMENT="$(tr '\0' ' ' <"$PROC_ROOT/4242/environ")"
trex_assert_managed_api_declared_environment \
  "$DECLARED_ENVIRONMENT" \
  "/opt/trex-core/scripts" \
  "/opt/trex-core/scripts/trex_daemon_server" \
  "$DEFAULT_PROFILE_ROOTS"
expect_failure "loaded API environment mismatch for TREX_WEBUI_TREX_SCRIPTS_DIR" \
  trex_assert_managed_api_declared_environment \
    "${DECLARED_ENVIRONMENT/TREX_WEBUI_TREX_SCRIPTS_DIR=\/opt\/trex-core\/scripts/TREX_WEBUI_TREX_SCRIPTS_DIR=\/srv\/wrong\/scripts}" \
    "/opt/trex-core/scripts" \
    "/opt/trex-core/scripts/trex_daemon_server" \
    "$DEFAULT_PROFILE_ROOTS"

DAEMON_CMDLINE_DIR="$PROC_ROOT/5151"
DAEMON_CMDLINE="$DAEMON_CMDLINE_DIR/cmdline"
mkdir -p "$DAEMON_CMDLINE_DIR"
printf '%s\0' \
  "/usr/bin/python3" \
  "/usr/libexec/trex-webui/trex_daemon_supervisor.py" \
  "--daemon-bin" \
  "/opt/trex-core/scripts/trex_daemon_server" \
  "--generation-file" \
  "/run/trex-webui/daemon-generation" \
  "--" \
  "--daemon-port" \
  "8090" >"$DAEMON_CMDLINE"
RUNNING_DAEMON_BIN="$(
  run_verify_helper managed_daemon_bin_from_cmdline "$DAEMON_CMDLINE"
)"
[[ "$RUNNING_DAEMON_BIN" == "/opt/trex-core/scripts/trex_daemon_server" ]] || \
  fail "daemon cmdline helper returned the wrong executable: $RUNNING_DAEMON_BIN"

printf '%s\0' \
  "/usr/bin/python3" \
  "/usr/libexec/trex-webui/trex_daemon_supervisor.py" \
  "--daemon-bin" \
  "/opt/trex-core/scripts/trex_daemon_server" \
  "--daemon-bin" \
  "/srv/attacker/scripts/trex_daemon_server" >"$DAEMON_CMDLINE"
expect_failure "no unique --daemon-bin argument" \
  run_verify_helper managed_daemon_bin_from_cmdline "$DAEMON_CMDLINE"

API_UNIT_FIXTURE="$TEST_ROOT/trex-webui-api.service"
printf '%s\n' \
  "[Service]" \
  "Environment=TREX_WEBUI_TREX_SCRIPTS_DIR=/opt/trex-core/scripts" \
  "Environment=TREX_WEBUI_TREX_DAEMON_BIN=/opt/trex-core/scripts/trex_daemon_server" \
  "Environment=TREX_WEBUI_PROFILE_ROOTS=$DEFAULT_PROFILE_ROOTS" \
  >"$API_UNIT_FIXTURE"
run_verify_helper \
  assert_managed_api_path_authority \
  "$DECLARED_ENVIRONMENT" \
  "$API_UNIT_FIXTURE" \
  4242 \
  "$PROC_ROOT" \
  "/opt/trex-core/scripts" \
  "/opt/trex-core/scripts/trex_daemon_server" \
  "$DEFAULT_PROFILE_ROOTS"
expect_failure "loaded API environment mismatch for TREX_WEBUI_TREX_DAEMON_BIN" \
  run_verify_helper \
    assert_managed_api_path_authority \
    "$DECLARED_ENVIRONMENT" \
    "$API_UNIT_FIXTURE" \
    4242 \
    "$PROC_ROOT" \
    "/opt/trex-core/scripts" \
    "/opt/trex-core/scripts/different_daemon_server" \
    "$DEFAULT_PROFILE_ROOTS"
expect_failure "loaded API environment mismatch for TREX_WEBUI_PROFILE_ROOTS" \
  run_verify_helper \
    assert_managed_api_path_authority \
    "$DECLARED_ENVIRONMENT" \
    "$API_UNIT_FIXTURE" \
    4242 \
    "$PROC_ROOT" \
    "/opt/trex-core/scripts" \
    "/opt/trex-core/scripts/trex_daemon_server" \
    "/opt/trex-core/scripts/stl:/srv/wrong/profiles:/var/lib/trex-webui/profiles"

run_verify_helper assert_managed_units_reloaded "no" "no"
expect_failure "trex-webui-api.service has unapplied on-disk unit changes" \
  run_verify_helper assert_managed_units_reloaded "yes" "no"
expect_failure "trex-daemon-server.service has unapplied on-disk unit changes" \
  run_verify_helper assert_managed_units_reloaded "no" "yes"

API_ENVIRONMENT_BODY='{"host":"127.0.0.1","host_valid":true,"daemon_port":8090,"daemon_supervisor":"systemd","scripts_dir_path_valid":true,"daemon_bin_path_valid":true,"config_path_valid":true,"daemon_log_path_valid":true,"scripts_dir_exists":true,"daemon_bin_exists":true,"runtime_state_path":"/var/lib/trex-webui/runtime-state.json","runtime_state_path_valid":true,"runtime_state_parent_exists":true,"configuration_errors":{},"scripts_dir":"/opt/trex-core/scripts","daemon_bin":"/opt/trex-core/scripts/trex_daemon_server","profile_roots":["/opt/trex-core/scripts/stl","/opt/trex-webui/profiles","/var/lib/trex-webui/profiles"],"profile_roots_existing":["/opt/trex-core/scripts/stl","/opt/trex-webui/profiles","/var/lib/trex-webui/profiles"]}'
API_ENVIRONMENT_BODY="${API_ENVIRONMENT_BODY//\/opt\/trex-webui\/profiles/$PROJECT_PROFILE_ROOT}"
run_verify_helper \
  assert_managed_api_environment_payload \
  "$API_ENVIRONMENT_BODY" \
  "/opt/trex-core/scripts" \
  "/opt/trex-core/scripts/trex_daemon_server" \
  "$DEFAULT_PROFILE_ROOTS"
API_ENVIRONMENT_MISSING_SCRIPTS="$(
  sed 's/"scripts_dir_exists":true/"scripts_dir_exists":false/' <<<"$API_ENVIRONMENT_BODY"
)"
expect_failure "managed daemon/API authority mismatch" \
  run_verify_helper \
    assert_managed_api_environment_payload \
    "$API_ENVIRONMENT_MISSING_SCRIPTS" \
    "/opt/trex-core/scripts" \
    "/opt/trex-core/scripts/trex_daemon_server" \
    "$DEFAULT_PROFILE_ROOTS"

(
  # shellcheck source=deploy/install.sh
  source "$PROJECT_ROOT/deploy/install.sh"
  MANAGE_LOCAL_DAEMON=1
  DRY_RUN=0
  SERVICE_ENV_FILE="$VALID_ENV"
  API_PROC_ROOT="$PROC_ROOT"
  TREX_DAEMON_SCRIPTS_DIR="/opt/trex-core/scripts"
  TREX_DAEMON_BIN="/opt/trex-core/scripts/trex_daemon_server"
  SERVICE_STATE_PROFILE_ROOT="/var/lib/trex-webui/profiles"
  systemctl() {
    [[ "$*" == "show trex-webui-api.service --property=MainPID --value" ]] || return 1
    printf '4242\n'
  }
  verify_active_managed_service_environment
) || fail "installer post-readiness check did not accept the exact MainPID environment"

API_CONTRACT_PROJECT="$TRUST_TEST_ROOT/api-contract-project"
API_CONTRACT_RUNTIME="$API_CONTRACT_PROJECT/.venv/bin/python"
API_CONTRACT_STATE="$TRUST_TEST_ROOT/api-contract-state"
API_CONTRACT_UNIT="$TRUST_TEST_ROOT/trex-webui-api-contract.service"
SYSTEMCTL_ENVIRONMENT_QUERIED="$TEST_ROOT/systemctl-environment-queried"
mkdir -p \
  "$API_CONTRACT_PROJECT/.venv/bin" \
  "$API_CONTRACT_PROJECT/apps/api" \
  "$API_CONTRACT_STATE"
printf '%s\n' '#!/usr/bin/env sh' 'exit 0' >"$API_CONTRACT_RUNTIME"
chmod 0755 "$API_CONTRACT_RUNTIME"
printf '%s\n' \
  '[Unit]' \
  'Description=TRex WebUI API contract fixture' \
  '[Service]' \
  'Type=simple' \
  'User=trex-webui' \
  'Group=trex-webui' \
  "WorkingDirectory=$API_CONTRACT_PROJECT" \
  "ExecStartPre=$API_CONTRACT_RUNTIME -c \"import fastapi, httptools, uvicorn, uvicorn.supervisors.statreload, uvloop, watchfiles.run, websockets\"" \
  "ExecStart=$API_CONTRACT_RUNTIME -m uvicorn app.main:app --app-dir $API_CONTRACT_PROJECT/apps/api --host 127.0.0.1 --port 8080" \
  'Restart=on-failure' \
  "ReadOnlyPaths=$API_CONTRACT_PROJECT" \
  "ReadWritePaths=$API_CONTRACT_STATE" \
  'UMask=0027' \
  'NoNewPrivileges=true' \
  'CapabilityBoundingSet=' \
  'AmbientCapabilities=' \
  'PrivateTmp=true' \
  'PrivateDevices=true' \
  'DevicePolicy=closed' \
  'ProtectSystem=strict' \
  'ProtectHome=true' \
  'ProtectHostname=true' \
  'ProtectClock=true' \
  'ProtectKernelTunables=true' \
  'ProtectKernelModules=true' \
  'ProtectKernelLogs=true' \
  'ProtectControlGroups=true' \
  'ProtectProc=invisible' \
  'ProcSubset=pid' \
  'RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6' \
  'RestrictNamespaces=true' \
  'RestrictRealtime=true' \
  'RestrictSUIDSGID=true' \
  'LockPersonality=true' \
  'RemoveIPC=true' \
  'KeyringMode=private' \
  'SystemCallArchitectures=native' \
  'SystemCallFilter=~@clock @cpu-emulation @debug @module @mount @obsolete @privileged @raw-io @reboot @swap' \
  'SystemCallErrorNumber=EPERM' \
  '[Install]' \
  'WantedBy=multi-user.target' >"$API_CONTRACT_UNIT"
chown root:root "$API_CONTRACT_UNIT"
chmod 0644 "$API_CONTRACT_UNIT"
printf '%s\0' \
  "$API_CONTRACT_RUNTIME" \
  '-m' \
  'uvicorn' \
  'app.main:app' \
  '--app-dir' \
  "$API_CONTRACT_PROJECT/apps/api" \
  '--host' \
  '127.0.0.1' \
  '--port' \
  '8080' >"$PROC_ROOT/4242/cmdline"

api_contract_systemctl() {
  local user="${API_CONTRACT_USER_OVERRIDE:-trex-webui}"
  local private_devices="${API_CONTRACT_PRIVATE_DEVICES_OVERRIDE:-yes}"
  local need_reload="${API_CONTRACT_NEED_RELOAD_OVERRIDE:-no}"
  local runtime="${API_CONTRACT_RUNTIME_OVERRIDE:-$API_CONTRACT_RUNTIME}"
  local syscall_filter="${API_CONTRACT_SYSCALL_FILTER_OVERRIDE:-~_sysctl clock_settime modify_ldt ptrace init_module mount setuid iopl reboot swapon}"
  case "$*" in
    "is-active --quiet trex-webui-api.service" | \
    "is-active --quiet trex-daemon-server.service" | \
    "is-active --quiet nginx.service")
      return 0
      ;;
    "show trex-webui-api.service --property=LoadState --value")
      printf 'loaded\n'
      ;;
    "show trex-webui-api.service --property=FragmentPath --value")
      printf '%s\n' "$API_CONTRACT_UNIT"
      ;;
    "show trex-webui-api.service --property=NeedDaemonReload --value")
      printf '%s\n' "$need_reload"
      ;;
    "show trex-daemon-server.service --property=NeedDaemonReload --value")
      printf 'no\n'
      ;;
    "show trex-webui-api.service --property=Type --value")
      printf 'simple\n'
      ;;
    "show trex-webui-api.service --property=User --value")
      printf '%s\n' "$user"
      ;;
    "show trex-webui-api.service --property=Group --value")
      printf 'trex-webui\n'
      ;;
    "show trex-webui-api.service --property=WorkingDirectory --value")
      printf '%s\n' "$API_CONTRACT_PROJECT"
      ;;
    "show trex-webui-api.service --property=Restart --value")
      printf 'on-failure\n'
      ;;
    "show trex-webui-api.service --property=UMask --value")
      printf '0027\n'
      ;;
    "show trex-webui-api.service --property=NoNewPrivileges --value" | \
    "show trex-webui-api.service --property=PrivateTmp --value" | \
    "show trex-webui-api.service --property=ProtectHome --value" | \
    "show trex-webui-api.service --property=ProtectHostname --value" | \
    "show trex-webui-api.service --property=ProtectClock --value" | \
    "show trex-webui-api.service --property=ProtectKernelTunables --value" | \
    "show trex-webui-api.service --property=ProtectKernelModules --value" | \
    "show trex-webui-api.service --property=ProtectKernelLogs --value" | \
    "show trex-webui-api.service --property=ProtectControlGroups --value" | \
    "show trex-webui-api.service --property=RestrictNamespaces --value" | \
    "show trex-webui-api.service --property=RestrictRealtime --value" | \
    "show trex-webui-api.service --property=RestrictSUIDSGID --value" | \
    "show trex-webui-api.service --property=LockPersonality --value" | \
    "show trex-webui-api.service --property=RemoveIPC --value")
      printf 'yes\n'
      ;;
    "show trex-webui-api.service --property=PrivateDevices --value")
      printf '%s\n' "$private_devices"
      ;;
    "show trex-webui-api.service --property=CapabilityBoundingSet --value" | \
    "show trex-webui-api.service --property=AmbientCapabilities --value")
      printf '\n'
      ;;
    "show trex-webui-api.service --property=DevicePolicy --value")
      printf 'closed\n'
      ;;
    "show trex-webui-api.service --property=ProtectSystem --value")
      printf 'strict\n'
      ;;
    "show trex-webui-api.service --property=ProtectProc --value")
      printf 'invisible\n'
      ;;
    "show trex-webui-api.service --property=ProcSubset --value")
      printf 'pid\n'
      ;;
    "show trex-webui-api.service --property=KeyringMode --value")
      printf 'private\n'
      ;;
    "show trex-webui-api.service --property=SystemCallArchitectures --value")
      printf 'native\n'
      ;;
    "show trex-webui-api.service --property=RestrictAddressFamilies --value")
      printf 'AF_INET6 AF_UNIX AF_INET\n'
      ;;
    "show trex-webui-api.service --property=SystemCallErrorNumber --value")
      printf '1\n'
      ;;
    "show trex-webui-api.service --property=SystemCallFilter --value")
      printf '%s\n' "$syscall_filter"
      ;;
    "show trex-webui-api.service --property=ReadOnlyPaths --value")
      printf '%s\n' "$API_CONTRACT_PROJECT"
      ;;
    "show trex-webui-api.service --property=ReadWritePaths --value")
      printf '%s\n' "$API_CONTRACT_STATE"
      ;;
    "show trex-webui-api.service --property=ExecStart --value")
      printf '{ path=%s ; argv[]=%s -m uvicorn app.main:app --app-dir %s/apps/api --host 127.0.0.1 --port 8080 ; ignore_errors=no ; }\n' \
        "$runtime" "$runtime" "$API_CONTRACT_PROJECT"
      ;;
    "show trex-webui-api.service --property=ExecStartPre --value")
      printf '{ path=%s ; argv[]=%s -c import fastapi, httptools, uvicorn, uvicorn.supervisors.statreload, uvloop, watchfiles.run, websockets ; ignore_errors=no ; }\n' \
        "$runtime" "$runtime"
      ;;
    "show trex-webui-api.service --property=MainPID --value")
      printf '4242\n'
      ;;
    *"--property=Environment"*)
      : >"$SYSTEMCTL_ENVIRONMENT_QUERIED"
      printf 'TREX_WEBUI_TREX_HOST=127.0.0.1\n'
      ;;
    *)
      return 1
      ;;
  esac
}

verify_api_contract_fixture() (
  # shellcheck source=deploy/verify.sh
  source "$PROJECT_ROOT/deploy/verify.sh"
  PROJECT_ROOT="$API_CONTRACT_PROJECT"
  API_UNIT="$API_CONTRACT_UNIT"
  API_PROC_ROOT="$PROC_ROOT"
  CHECK_SYSTEMD=1
  CHECK_DAEMON=0
  systemctl() {
    api_contract_systemctl "$@"
  }
  check_systemd
)

verify_api_contract_fixture || \
  fail "deployment verification rejected the exact external-mode API contract"
[[ ! -e "$SYSTEMCTL_ENVIRONMENT_QUERIED" ]] || \
  fail "deployment verification trusted systemctl's declared Environment instead of /proc"

API_CONTRACT_USER_OVERRIDE=root
expect_failure "loaded API User mismatch" verify_api_contract_fixture
unset API_CONTRACT_USER_OVERRIDE

API_CONTRACT_PRIVATE_DEVICES_OVERRIDE=no
expect_failure "loaded API PrivateDevices mismatch" verify_api_contract_fixture
unset API_CONTRACT_PRIVATE_DEVICES_OVERRIDE

API_CONTRACT_SYSCALL_FILTER_OVERRIDE='~_sysctl clock_settime ptrace init_module mount setuid iopl reboot swapon'
expect_failure "does not deny modify_ldt" verify_api_contract_fixture
unset API_CONTRACT_SYSCALL_FILTER_OVERRIDE

API_CONTRACT_NEED_RELOAD_OVERRIDE=yes
expect_failure "has unapplied on-disk changes" verify_api_contract_fixture
unset API_CONTRACT_NEED_RELOAD_OVERRIDE

printf '%s\0' \
  "$API_CONTRACT_RUNTIME" \
  '-m' \
  'uvicorn' \
  'app.main:app' \
  '--app-dir' \
  "$API_CONTRACT_PROJECT/apps/api" \
  '--host' \
  '0.0.0.0' \
  '--port' \
  '8080' >"$PROC_ROOT/4242/cmdline"
expect_failure "API MainPID command mismatch" verify_api_contract_fixture
printf '%s\0' \
  "$API_CONTRACT_RUNTIME" \
  '-m' \
  'uvicorn' \
  'app.main:app' \
  '--app-dir' \
  "$API_CONTRACT_PROJECT/apps/api" \
  '--host' \
  '127.0.0.1' \
  '--port' \
  '8080' >"$PROC_ROOT/4242/cmdline"

(
  # shellcheck source=deploy/verify.sh
  source "$PROJECT_ROOT/deploy/verify.sh"
  PROJECT_ROOT="$API_CONTRACT_PROJECT"
  API_UNIT="$API_CONTRACT_UNIT"
  CHECK_SYSTEMD=1
  CHECK_DAEMON=1
  API_ENV_FILE="$VALID_ENV"
  API_PROC_ROOT="$PROC_ROOT"
  systemctl() {
    api_contract_systemctl "$@"
  }
  check_systemd
) || fail "deployment verification did not accept the exact managed API contract and MainPID environment"
[[ ! -e "$SYSTEMCTL_ENVIRONMENT_QUERIED" ]] || \
  fail "deployment verification trusted systemctl's declared Environment instead of /proc"

write_process_environment "remote.trex"
verify_wrong_process_fixture() (
  # shellcheck source=deploy/verify.sh
  source "$PROJECT_ROOT/deploy/verify.sh"
  PROJECT_ROOT="$API_CONTRACT_PROJECT"
  API_UNIT="$API_CONTRACT_UNIT"
  CHECK_SYSTEMD=1
  CHECK_DAEMON=1
  API_ENV_FILE="$VALID_ENV"
  API_PROC_ROOT="$PROC_ROOT"
  systemctl() {
    api_contract_systemctl "$@"
  }
  check_systemd
)
expect_failure "MainPID is not pinned" verify_wrong_process_fixture

python3 - "$PROJECT_ROOT/deploy/install.sh" "$PROJECT_ROOT/deploy/upgrade.sh" <<'PY'
from pathlib import Path
import sys


for raw_path_value in sys.argv[1:]:
    raw_path = Path(raw_path_value)
    source = raw_path.read_text(encoding="utf-8")
    main_body = source[source.index("main() {") :]
    deployment_lock = main_body.index("trex_acquire_deployment_lock")
    preflight = main_body.index("preflight_managed_api_environment")
    if deployment_lock >= preflight:
        raise SystemExit(
            f"managed environment preflight is not serialized by the deployment lock: {raw_path}"
        )
    mutation_markers = {
        "install.sh": ("install_packages",),
        "upgrade.sh": ("run_previous_release_rollback", "stage_archive"),
    }[raw_path.name]
    for marker in mutation_markers:
        if preflight >= main_body.index(marker):
            raise SystemExit(
                f"managed environment preflight is not before {marker}: {raw_path}"
            )
PY

printf 'PASS: managed environment file and API MainPID authority\n'
