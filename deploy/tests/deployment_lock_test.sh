#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# shellcheck source=deploy/path_safety.sh
source "$PROJECT_ROOT/deploy/path_safety.sh"

TEST_ROOT="$(mktemp -d -t trex-webui-deployment-lock.XXXXXX)"
trex_write_managed_marker "$TEST_ROOT"
chmod 0700 "$TEST_ROOT"
HOLDER_PID=""

cleanup() {
  local status=$?
  trap - EXIT
  set +e
  if [[ -n "$HOLDER_PID" ]] && kill -0 "$HOLDER_PID" 2>/dev/null; then
    kill "$HOLDER_PID" 2>/dev/null
    wait "$HOLDER_PID" 2>/dev/null
  fi
  trex_safe_remove_tree "$TEST_ROOT" "deployment lock test root" || status=1
  exit "$status"
}
trap cleanup EXIT

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

expect_lock_failure() {
  local label="$1"
  shift
  if "$@" >"$TEST_ROOT/$label.log" 2>&1; then
    fail "$label unexpectedly acquired the deployment lock"
  fi
}

[[ "$(id -u)" == "0" ]] || fail "root is required to exercise the deployment lock"
command -v flock >/dev/null 2>&1 || fail "flock is required"

export PROJECT_ROOT
PRIMARY_LOCK="$TEST_ROOT/primary/deploy.lock"
WRONG_LOCK="$TEST_ROOT/wrong/deploy.lock"
READY_PATH="$TEST_ROOT/holder.ready"
RELEASE_PATH="$TEST_ROOT/holder.release"
HOLDER_LOG="$TEST_ROOT/holder.log"
export PRIMARY_LOCK WRONG_LOCK READY_PATH RELEASE_PATH

(
  set -Eeuo pipefail
  # shellcheck source=deploy/path_safety.sh
  source "$PROJECT_ROOT/deploy/path_safety.sh"
  TREX_WEBUI_DEPLOY_LOCK_PATH="$PRIMARY_LOCK"
  unset TREX_WEBUI_DEPLOY_LOCK_FD TREX_WEBUI_DEPLOY_LOCK_PROTOCOL
  export TREX_WEBUI_DEPLOY_LOCK_PATH
  trex_acquire_deployment_lock

  [[ "$TREX_WEBUI_DEPLOY_LOCK_PATH" == "$PRIMARY_LOCK" ]]
  [[ "$TREX_WEBUI_DEPLOY_LOCK_PROTOCOL" == "$TREX_DEPLOY_LOCK_PROTOCOL_VERSION" ]]
  [[ "$TREX_WEBUI_DEPLOY_LOCK_FD" =~ ^[0-9]+$ ]]

  bash -c 'source "$PROJECT_ROOT/deploy/path_safety.sh"; trex_acquire_deployment_lock'

  env -u TREX_WEBUI_DEPLOY_LOCK_FD -u TREX_WEBUI_DEPLOY_LOCK_PROTOCOL \
    TREX_WEBUI_DEPLOY_LOCK_PATH="$WRONG_LOCK" \
    bash -c 'source "$PROJECT_ROOT/deploy/path_safety.sh"; trex_acquire_deployment_lock'

  if TREX_WEBUI_DEPLOY_LOCK_PROTOCOL=forged \
    bash -c 'source "$PROJECT_ROOT/deploy/path_safety.sh"; trex_acquire_deployment_lock'; then
    fail "forged protocol was accepted"
  fi

  if TREX_WEBUI_DEPLOY_LOCK_FD=1 \
    bash -c 'source "$PROJECT_ROOT/deploy/path_safety.sh"; trex_acquire_deployment_lock'; then
    fail "forged FD was accepted"
  fi

  if bash -c '
    source "$PROJECT_ROOT/deploy/path_safety.sh"
    inherited_fd="$TREX_WEBUI_DEPLOY_LOCK_FD"
    exec {TREX_WEBUI_DEPLOY_LOCK_FD}<&-
    TREX_WEBUI_DEPLOY_LOCK_FD="$inherited_fd"
    export TREX_WEBUI_DEPLOY_LOCK_FD
    trex_acquire_deployment_lock
  '; then
    fail "closed inherited FD was accepted"
  fi

  if TREX_WEBUI_DEPLOY_LOCK_PATH="$WRONG_LOCK" \
    bash -c 'source "$PROJECT_ROOT/deploy/path_safety.sh"; trex_acquire_deployment_lock'; then
    fail "wrong-inode inherited lock was accepted"
  fi

  : >"$READY_PATH"
  while [[ ! -e "$RELEASE_PATH" ]]; do
    sleep 0.02
  done
) >"$HOLDER_LOG" 2>&1 &
HOLDER_PID=$!

for _ in $(seq 1 250); do
  [[ -e "$READY_PATH" ]] && break
  if ! kill -0 "$HOLDER_PID" 2>/dev/null; then
    wait "$HOLDER_PID" || true
    fail "lock holder exited before readiness: $(<"$HOLDER_LOG")"
  fi
  sleep 0.02
done
[[ -e "$READY_PATH" ]] || fail "lock holder did not become ready: $(<"$HOLDER_LOG")"

[[ "$(stat -c '%U:%G' -- "$(dirname -- "$PRIMARY_LOCK")")" == "root:root" ]] || \
  fail "lock parent ownership is not root:root"
[[ "$(stat -c '%a' -- "$(dirname -- "$PRIMARY_LOCK")")" == "700" ]] || \
  fail "lock parent mode is not 0700"
[[ -f "$PRIMARY_LOCK" && ! -L "$PRIMARY_LOCK" ]] || fail "lock path is not a regular file"
[[ "$(stat -c '%U:%G:%a:%h' -- "$PRIMARY_LOCK")" == "root:root:600:1" ]] || \
  fail "lock file metadata is not root:root 0600 with one link"

expect_lock_failure independent-competitor \
  env -u TREX_WEBUI_DEPLOY_LOCK_FD -u TREX_WEBUI_DEPLOY_LOCK_PROTOCOL \
  TREX_WEBUI_DEPLOY_LOCK_PATH="$PRIMARY_LOCK" PROJECT_ROOT="$PROJECT_ROOT" \
  bash -c 'source "$PROJECT_ROOT/deploy/path_safety.sh"; trex_acquire_deployment_lock'

: >"$RELEASE_PATH"
wait "$HOLDER_PID" || fail "lock holder failed: $(<"$HOLDER_LOG")"
HOLDER_PID=""

env -u TREX_WEBUI_DEPLOY_LOCK_FD -u TREX_WEBUI_DEPLOY_LOCK_PROTOCOL \
  TREX_WEBUI_DEPLOY_LOCK_PATH="$PRIMARY_LOCK" PROJECT_ROOT="$PROJECT_ROOT" \
  bash -c 'source "$PROJECT_ROOT/deploy/path_safety.sh"; trex_acquire_deployment_lock'

SYMLINK_TARGET="$TEST_ROOT/symlink-target"
printf 'target\n' >"$SYMLINK_TARGET"
chmod 0600 "$SYMLINK_TARGET"
ln -s "$SYMLINK_TARGET" "$TEST_ROOT/symlink.lock"
expect_lock_failure symlink-lock \
  env TREX_WEBUI_DEPLOY_LOCK_PATH="$TEST_ROOT/symlink.lock" PROJECT_ROOT="$PROJECT_ROOT" \
  bash -c 'source "$PROJECT_ROOT/deploy/path_safety.sh"; trex_acquire_deployment_lock'

mkfifo "$TEST_ROOT/special.lock"
expect_lock_failure special-lock \
  env TREX_WEBUI_DEPLOY_LOCK_PATH="$TEST_ROOT/special.lock" PROJECT_ROOT="$PROJECT_ROOT" \
  bash -c 'source "$PROJECT_ROOT/deploy/path_safety.sh"; trex_acquire_deployment_lock'

printf 'hard-link\n' >"$TEST_ROOT/hard-link-target"
chmod 0600 "$TEST_ROOT/hard-link-target"
ln "$TEST_ROOT/hard-link-target" "$TEST_ROOT/hard-link.lock"
expect_lock_failure hard-link-lock \
  env TREX_WEBUI_DEPLOY_LOCK_PATH="$TEST_ROOT/hard-link.lock" PROJECT_ROOT="$PROJECT_ROOT" \
  bash -c 'source "$PROJECT_ROOT/deploy/path_safety.sh"; trex_acquire_deployment_lock'

printf 'deployment lock tests passed\n'
