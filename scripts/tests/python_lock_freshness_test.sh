#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TEST_ROOT="$(mktemp -d -t trex-webui-python-lock-test.XXXXXX)"

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

mkdir -p "$TEST_ROOT/apps/api"
cp "$PROJECT_ROOT/apps/api/requirements.txt" \
  "$PROJECT_ROOT/apps/api/requirements-dev.txt" \
  "$PROJECT_ROOT/apps/api/requirements.lock" \
  "$PROJECT_ROOT/apps/api/requirements-dev.lock" \
  "$TEST_ROOT/apps/api/"

"$PROJECT_ROOT/scripts/check_python_locks.sh" \
  --project-root "$TEST_ROOT" \
  --python "$PROJECT_ROOT/.venv/bin/python" >/dev/null

sed -i 's/fastapi==0\.139\.2/fastapi==0.139.1/' \
  "$TEST_ROOT/apps/api/requirements.lock"
if "$PROJECT_ROOT/scripts/check_python_locks.sh" \
  --project-root "$TEST_ROOT" \
  --python "$PROJECT_ROOT/.venv/bin/python" >/dev/null 2>&1; then
  fail "stale production lock unexpectedly passed"
fi

printf 'Python lock freshness tests passed.\n'
