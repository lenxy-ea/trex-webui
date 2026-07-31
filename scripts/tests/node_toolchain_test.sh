#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TEST_ROOT="$(mktemp -d -t trex-webui-node-toolchain.XXXXXX)"

cleanup() {
  local status=$?
  trap - EXIT
  rm -rf -- "$TEST_ROOT"
  exit "$status"
}

trap cleanup EXIT

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

write_fake_runtime() {
  local bin_root="$1"
  local node_version="$2"
  local npm_version="$3"
  local marker="$4"
  mkdir -p "$bin_root"
  printf '%s\n' \
    '#!/usr/bin/env bash' \
    "printf '%s\\n' '$node_version'" \
    >"$bin_root/node"
  printf '%s\n' \
    '#!/usr/bin/env bash' \
    'if [[ "${1:-}" == "--version" ]]; then' \
    "  printf '%s\\n' '$npm_version'" \
    'else' \
    "  printf '%s\\n' '$marker'" \
    'fi' \
    >"$bin_root/npm"
  chmod 0755 "$bin_root/node" "$bin_root/npm"
}

make_wrapper_fixture() {
  local fixture_root="$1"
  mkdir -p "$fixture_root/scripts"
  cp "$PROJECT_ROOT/scripts/npmw" "$fixture_root/scripts/npmw"
  chmod 0755 "$fixture_root/scripts/npmw"
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

SYSTEM_FIXTURE="$TEST_ROOT/system-runtime"
make_wrapper_fixture "$SYSTEM_FIXTURE"
write_fake_runtime "$SYSTEM_FIXTURE/fake-bin" "v24.9.1" "11.4.0" "system-runtime"
SYSTEM_OUTPUT="$(
  PATH="$SYSTEM_FIXTURE/fake-bin:/usr/bin:/bin" \
    "$SYSTEM_FIXTURE/scripts/npmw" run build
)"
[[ "$SYSTEM_OUTPUT" == "system-runtime" ]] || \
  fail "npmw did not accept a compatible system runtime"

PROJECT_FIXTURE="$TEST_ROOT/project-runtime"
make_wrapper_fixture "$PROJECT_FIXTURE"
write_fake_runtime "$PROJECT_FIXTURE/fake-bin" "v24.9.1" "11.4.0" "system-runtime"
write_fake_runtime \
  "$PROJECT_FIXTURE/.tools/node-v24.16.0-linux-x64/bin" \
  "v24.16.0" \
  "11.13.0" \
  "project-runtime"
PROJECT_OUTPUT="$(
  PATH="$PROJECT_FIXTURE/fake-bin:/usr/bin:/bin" \
    "$PROJECT_FIXTURE/scripts/npmw" run build
)"
[[ "$PROJECT_OUTPUT" == "project-runtime" ]] || \
  fail "npmw did not prefer the project runtime"

REJECT_FIXTURE="$TEST_ROOT/reject-runtime"
make_wrapper_fixture "$REJECT_FIXTURE"
write_fake_runtime "$REJECT_FIXTURE/fake-bin" "v23.11.0" "11.4.0" "wrong-runtime"
expect_failure "Node 24 and npm 11 are required" \
  env PATH="$REJECT_FIXTURE/fake-bin:/usr/bin:/bin" \
  "$REJECT_FIXTURE/scripts/npmw" --version

PARTIAL_FIXTURE="$TEST_ROOT/partial-runtime"
make_wrapper_fixture "$PARTIAL_FIXTURE"
mkdir -p "$PARTIAL_FIXTURE/.tools/node-v24.16.0-linux-x64"
expect_failure "project Node.js toolchain is incomplete" \
  "$PARTIAL_FIXTURE/scripts/npmw" --version

BOOTSTRAP_FIXTURE="$TEST_ROOT/bootstrap-existing"
mkdir -p "$BOOTSTRAP_FIXTURE/scripts"
cp "$PROJECT_ROOT/scripts/bootstrap_node.sh" "$BOOTSTRAP_FIXTURE/scripts/bootstrap_node.sh"
chmod 0755 "$BOOTSTRAP_FIXTURE/scripts/bootstrap_node.sh"
write_fake_runtime \
  "$BOOTSTRAP_FIXTURE/.tools/node-v24.16.0-linux-x64/bin" \
  "v24.16.0" \
  "11.13.0" \
  "project-runtime"
BOOTSTRAP_OUTPUT="$("$BOOTSTRAP_FIXTURE/scripts/bootstrap_node.sh")"
[[ "$BOOTSTRAP_OUTPUT" == *"already installed"* ]] || \
  fail "bootstrap was not idempotent for a valid existing toolchain"

grep -Fq \
  'NODE_ARCHIVE_SHA256="d804845d34eddc21dc1092b519d643ef40b1f58ec5dec5c22b1f4bd8fabde6c9"' \
  "$PROJECT_ROOT/scripts/bootstrap_node.sh" || \
  fail "bootstrap does not pin the official Node.js archive checksum"
grep -Fq \
  'https://nodejs.org/dist/v24.16.0/SHASUMS256.txt' \
  "$PROJECT_ROOT/scripts/bootstrap_node.sh" || \
  fail "bootstrap does not record the official checksum source"

printf 'PASS: Node.js bootstrap and npm wrapper contracts\n'
