#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

SHARDS="${WEB_TEST_SHARDS:-4}"
MAX_WORKERS="${WEB_TEST_SHARD_WORKERS:-2}"
LOG_DIR="${WEB_TEST_SHARD_LOG_DIR:-.logs/web-test-shards/$(date -u +%Y%m%dT%H%M%SZ)}"
VITEST_ARGS=()

usage() {
  cat <<'USAGE'
Usage: scripts/run_web_test_shards.sh [options] [-- extra-vitest-args...]

Run the Web Vitest suite in file-level shards.

Options:
  --shards COUNT       Number of Vitest shards. Default: WEB_TEST_SHARDS or 4
  --max-workers COUNT  Workers per shard process. Default: WEB_TEST_SHARD_WORKERS or 2
  --log-dir DIR        Directory for shard logs. Default: .logs/web-test-shards/<utc timestamp>
  -h, --help           Show this help

Examples:
  scripts/run_web_test_shards.sh
  scripts/run_web_test_shards.sh --shards 4 -- --reporter=verbose
  WEB_TEST_SHARDS=2 npm run test:web:shards
USAGE
}

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --shards)
        SHARDS="${2:-}"
        [[ "$SHARDS" =~ ^[1-9][0-9]*$ ]] || die "--shards requires a positive integer"
        shift 2
        ;;
      --max-workers)
        MAX_WORKERS="${2:-}"
        [[ "$MAX_WORKERS" =~ ^[1-9][0-9]*$ ]] || die "--max-workers requires a positive integer"
        shift 2
        ;;
      --log-dir)
        LOG_DIR="${2:-}"
        [[ -n "$LOG_DIR" ]] || die "--log-dir requires a value"
        shift 2
        ;;
      --)
        shift
        VITEST_ARGS+=("$@")
        break
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
}

run_shard() {
  local index="$1"
  local log_path="$2"
  (
    cd "$PROJECT_ROOT"
    "$PROJECT_ROOT/scripts/npmw" --prefix apps/web test -- \
      --shard "$index/$SHARDS" \
      --maxWorkers "$MAX_WORKERS" \
      "${VITEST_ARGS[@]}"
  ) >"$log_path" 2>&1
}

main() {
  parse_args "$@"
  cd "$PROJECT_ROOT"

  [[ -x "scripts/npmw" ]] || die "missing executable scripts/npmw"
  scripts/npmw --version >/dev/null

  mkdir -p "$LOG_DIR"
  printf 'web test shards: %s shards, %s worker(s) per shard\n' "$SHARDS" "$MAX_WORKERS"
  printf 'logs: %s\n' "$LOG_DIR"

  local pids=()
  local labels=()
  local logs=()
  local index
  for index in $(seq 1 "$SHARDS"); do
    local log_path="$LOG_DIR/shard-${index}-of-${SHARDS}.log"
    printf 'start: shard %s/%s -> %s\n' "$index" "$SHARDS" "$log_path"
    run_shard "$index" "$log_path" &
    pids+=("$!")
    labels+=("$index/$SHARDS")
    logs+=("$log_path")
  done

  local status=0
  local offset
  for offset in "${!pids[@]}"; do
    if wait "${pids[$offset]}"; then
      printf 'ok: shard %s passed\n' "${labels[$offset]}"
    else
      status=1
      printf 'failed: shard %s; last log lines:\n' "${labels[$offset]}" >&2
      tail -n 80 "${logs[$offset]}" >&2 || true
    fi
  done

  [[ "$status" -eq 0 ]] || die "one or more web test shards failed; see $LOG_DIR"
  printf 'ok: all web test shards passed\n'
}

main "$@"
