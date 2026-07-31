#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUT_DIR=""
PYTHON_BIN="${TREX_WEBUI_SBOM_PYTHON:-$PROJECT_ROOT/.venv/bin/python}"

usage() {
  cat <<'USAGE'
Usage: scripts/generate_sbom.sh --output-dir PATH

Generate deterministic CycloneDX 1.6 inventories from the npm and Python lock
files. Runtime components are marked required; build and test components are
marked excluded. The selected Python environment must contain the exact
packages pinned by apps/api/requirements-dev.lock so license metadata can be
recorded.
USAGE
}

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-dir)
      OUTPUT_DIR="${2:-}"
      [[ -n "$OUTPUT_DIR" ]] || die "--output-dir requires a value"
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

[[ -n "$OUTPUT_DIR" ]] || die "--output-dir is required"
[[ -x "$PYTHON_BIN" ]] || die "Python environment not found: $PYTHON_BIN"

exec "$PYTHON_BIN" "$PROJECT_ROOT/scripts/generate_sbom.py" \
  --project-root "$PROJECT_ROOT" \
  --output-dir "$OUTPUT_DIR"
