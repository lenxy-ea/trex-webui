#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PYTHON_BIN="${TREX_WEBUI_LOCK_PYTHON:-$PROJECT_ROOT/.venv/bin/python}"
UV_BIN=""

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

[[ -x "$PYTHON_BIN" ]] || die "dependency-complete project Python not found: $PYTHON_BIN"
"$PYTHON_BIN" -c \
  'import sys; raise SystemExit(sys.version_info[:2] != (3, 11))' ||
  die "Python lock generation requires Python 3.11"
UV_BIN="$(dirname -- "$PYTHON_BIN")/uv"
[[ -x "$UV_BIN" ]] ||
  die "uv is not installed beside $PYTHON_BIN"

cd "$PROJECT_ROOT"
"$UV_BIN" pip compile \
  --custom-compile-command scripts/update_python_locks.sh \
  --generate-hashes \
  --output-file=apps/api/requirements.lock \
  --python-version 3.11 \
  --quiet \
  apps/api/requirements.txt

"$UV_BIN" pip compile \
  --custom-compile-command scripts/update_python_locks.sh \
  --generate-hashes \
  --output-file=apps/api/requirements-dev.lock \
  --python-version 3.11 \
  --quiet \
  apps/api/requirements-dev.txt

printf 'Python lock files updated.\n'
