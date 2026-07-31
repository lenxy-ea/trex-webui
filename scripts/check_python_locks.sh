#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$DEFAULT_PROJECT_ROOT"
PYTHON_BIN=""
UV_BIN=""

usage() {
  cat <<'USAGE'
Usage: scripts/check_python_locks.sh [options]

Verify that both Python lock files are the unchanged uv compile result for
their source requirements while reusing the currently pinned transitive
versions. This catches direct dependency drift without opportunistically
upgrading unrelated packages.

Options:
  --project-root PATH  Checkout to validate. Default: script parent directory
  --python PATH        Python 3.11 environment containing the pinned uv tool
  -h, --help           Show this help
USAGE
}

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-root)
      PROJECT_ROOT="${2:-}"
      [[ -n "$PROJECT_ROOT" ]] || die "--project-root requires a value"
      shift 2
      ;;
    --python)
      PYTHON_BIN="${2:-}"
      [[ -n "$PYTHON_BIN" ]] || die "--python requires a value"
      shift 2
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

PROJECT_ROOT="$(cd "$PROJECT_ROOT" && pwd)"
PYTHON_BIN="${PYTHON_BIN:-${TREX_WEBUI_LOCK_PYTHON:-$PROJECT_ROOT/.venv/bin/python}}"
[[ -x "$PYTHON_BIN" ]] || die "dependency-complete project Python not found: $PYTHON_BIN"
UV_BIN="$(dirname -- "$PYTHON_BIN")/uv"
[[ -x "$UV_BIN" ]] || die "uv is not installed beside $PYTHON_BIN"
for path in \
  apps/api/requirements.txt \
  apps/api/requirements-dev.txt \
  apps/api/requirements.lock \
  apps/api/requirements-dev.lock; do
  [[ -f "$PROJECT_ROOT/$path" ]] || die "missing $path under $PROJECT_ROOT"
done

TEMP_ROOT="$(mktemp -d -t trex-webui-python-lock-check.XXXXXX)"
cleanup() {
  local status=$?
  trap - EXIT
  rm -rf -- "$TEMP_ROOT"
  exit "$status"
}
trap cleanup EXIT

mkdir -p "$TEMP_ROOT/apps/api"
cp "$PROJECT_ROOT/apps/api/requirements.lock" \
  "$TEMP_ROOT/apps/api/requirements.lock"
cp "$PROJECT_ROOT/apps/api/requirements-dev.lock" \
  "$TEMP_ROOT/apps/api/requirements-dev.lock"

cd "$PROJECT_ROOT"
"$UV_BIN" pip compile \
  --custom-compile-command scripts/update_python_locks.sh \
  --generate-hashes \
  --output-file="$TEMP_ROOT/apps/api/requirements.lock" \
  --python-version 3.11 \
  --quiet \
  apps/api/requirements.txt >/dev/null

"$UV_BIN" pip compile \
  --custom-compile-command scripts/update_python_locks.sh \
  --generate-hashes \
  --output-file="$TEMP_ROOT/apps/api/requirements-dev.lock" \
  --python-version 3.11 \
  --quiet \
  apps/api/requirements-dev.txt >/dev/null

for name in requirements.lock requirements-dev.lock; do
  if ! cmp -s \
    "$PROJECT_ROOT/apps/api/$name" \
    "$TEMP_ROOT/apps/api/$name"; then
    diff -u \
      --label "committed apps/api/$name" \
      --label "expected apps/api/$name" \
      "$PROJECT_ROOT/apps/api/$name" \
      "$TEMP_ROOT/apps/api/$name" | sed -n '1,200p' || true
    die "$name is stale; run scripts/update_python_locks.sh"
  fi
done

printf 'Python lock freshness passed.\n'
