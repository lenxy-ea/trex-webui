#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
[[ -f "$PROJECT_ROOT/deploy/path_safety.sh" ]] || { printf 'error: missing %s/deploy/path_safety.sh\n' "$PROJECT_ROOT" >&2; exit 1; }
# shellcheck source=deploy/path_safety.sh
source "$PROJECT_ROOT/deploy/path_safety.sh"

BASE_URL="http://127.0.0.1"
OUTPUT_DIR=".logs/standard-e2e-gate"
REPORT_PREFIX="standard-e2e-gate"
WEB_ROOT="/var/www/trex-webui/dist"
SYNC_WEB_ROOT=1
RUN_DEPLOY_VERIFY=1
RUN_BROWSER_WRITE_ACCEPTANCE=0
STEP_TIMEOUT_SECONDS="${VERIFY_MAJOR_STEP_TIMEOUT_SECONDS:-1800}"
STANDARD_E2E_TIMEOUT_SECONDS="${VERIFY_MAJOR_E2E_TIMEOUT_SECONDS:-1800}"
TIMEOUT_KILL_AFTER_SECONDS="${VERIFY_MAJOR_TIMEOUT_KILL_AFTER_SECONDS:-90}"
WEB_TEST_SHARDS="${VERIFY_MAJOR_WEB_TEST_SHARDS:-4}"
WEB_TEST_SHARD_WORKERS="${VERIFY_MAJOR_WEB_TEST_SHARD_WORKERS:-2}"
DEPLOY_VERIFY_ARGS=()
E2E_ARGS=()
GATE_ID=""
BASELINE_SOURCE_IDENTITY=""
EXPECTED_SOURCE_IDENTITY=""
EXPECTED_BUILD_IDENTITY=""
EXPECTED_GIT_SHA=""
EXPECTED_GIT_DIRTY=""
BROWSER_SMOKE_REPORT=""
BROWSER_WRITE_ACCEPTANCE_REPORT=""
GATE_IDENTITY_FILE=""
WEB_RELEASE_DIR=""
WEB_ROLLBACK_DIR=""
WEB_OLD_MOVED=0
WEB_SWITCHED=0
WEB_LIVE_EXISTED=0

usage() {
  cat <<'USAGE'
Usage: scripts/verify_major_change.sh [options]

Run the major-change acceptance gate:
  - API tests
  - Web tests
  - Web typecheck/lint/build
  - production browser smoke through Nginx (strictly read-only)
  - deployment probe through Nginx
  - real standard E2E against TRex, with report archive evidence
  - optional production browser traffic write acceptance through Nginx

Options:
  --base-url URL          WebUI URL. Default: http://127.0.0.1
  --output-dir DIR        Local standard E2E evidence directory. Default: .logs/standard-e2e-gate
  --report-prefix NAME    Standard E2E archive prefix. Default: standard-e2e-gate
  --web-root DIR          Nginx static dist path. Default: /var/www/trex-webui/dist
  --skip-web-root-sync    Do not sync apps/web/dist to --web-root before deployment probe
  --skip-deploy-verify    Skip deploy/verify.sh
  --browser-write-acceptance
                            Explicitly run guarded P0/P1 traffic writes in Chromium
  --skip-systemd          Pass --skip-systemd to deploy/verify.sh
  --skip-sse              Pass --skip-sse to deploy/verify.sh
  --step-timeout SECONDS  Timeout for local gate steps. Default: 1800
  --e2e-timeout SECONDS   Timeout for the standard E2E step. Default: 1800
  --web-test-shards N     Run Web tests in N Vitest shards. Default: 4
  --web-test-workers N    Workers per Web test shard process. Default: 2
  --reuse-running-trex    Pass through to standard E2E
  --restart-trex          Pass through to standard E2E
  --config-file PATH      Pass custom trex_cfg.yaml through to standard E2E
  --e2e-arg ARG           Pass one extra argument through to standard E2E; repeat as needed
  -h, --help              Show this help

This command is intentionally real-hardware and disruptive by default because
standard E2E proves daemon custom YAML startup. Use --reuse-running-trex only
when the lab owner explicitly wants to avoid a TRex restart.
USAGE
}

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

step() {
  printf '\n==> %s\n' "$*"
}

resolve_path() {
  local path="$1"
  if [[ "$path" = /* ]]; then
    printf '%s\n' "$path"
  else
    printf '%s/%s\n' "$PROJECT_ROOT" "$path"
  fi
}

run_step() {
  local label="$1"
  local status
  shift
  step "$label"
  set +e
  timeout \
    --signal=TERM \
    --kill-after="${TIMEOUT_KILL_AFTER_SECONDS}s" \
    "${STEP_TIMEOUT_SECONDS}s" \
    "$@"
  status=$?
  set -e
  if [[ "$status" -eq 124 || "$status" -eq 137 ]]; then
    die "$label timed out after ${STEP_TIMEOUT_SECONDS}s"
  fi
  [[ "$status" -eq 0 ]] || return "$status"
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --base-url)
        BASE_URL="${2:-}"
        [[ -n "$BASE_URL" ]] || die "--base-url requires a value"
        shift 2
        ;;
      --output-dir)
        OUTPUT_DIR="${2:-}"
        [[ -n "$OUTPUT_DIR" ]] || die "--output-dir requires a value"
        shift 2
        ;;
      --report-prefix)
        REPORT_PREFIX="${2:-}"
        [[ -n "$REPORT_PREFIX" ]] || die "--report-prefix requires a value"
        shift 2
        ;;
      --web-root)
        WEB_ROOT="${2:-}"
        [[ -n "$WEB_ROOT" ]] || die "--web-root requires a value"
        shift 2
        ;;
      --skip-web-root-sync)
        SYNC_WEB_ROOT=0
        shift
        ;;
      --skip-deploy-verify)
        RUN_DEPLOY_VERIFY=0
        shift
        ;;
      --browser-write-acceptance)
        RUN_BROWSER_WRITE_ACCEPTANCE=1
        shift
        ;;
      --skip-systemd)
        DEPLOY_VERIFY_ARGS+=("--skip-systemd")
        shift
        ;;
      --skip-sse)
        DEPLOY_VERIFY_ARGS+=("--skip-sse")
        shift
        ;;
      --step-timeout)
        STEP_TIMEOUT_SECONDS="${2:-}"
        [[ "$STEP_TIMEOUT_SECONDS" =~ ^[1-9][0-9]*$ ]] || die "--step-timeout requires a positive integer"
        shift 2
        ;;
      --e2e-timeout)
        STANDARD_E2E_TIMEOUT_SECONDS="${2:-}"
        [[ "$STANDARD_E2E_TIMEOUT_SECONDS" =~ ^[1-9][0-9]*$ ]] || die "--e2e-timeout requires a positive integer"
        shift 2
        ;;
      --web-test-shards)
        WEB_TEST_SHARDS="${2:-}"
        [[ "$WEB_TEST_SHARDS" =~ ^[1-9][0-9]*$ ]] || die "--web-test-shards requires a positive integer"
        shift 2
        ;;
      --web-test-workers)
        WEB_TEST_SHARD_WORKERS="${2:-}"
        [[ "$WEB_TEST_SHARD_WORKERS" =~ ^[1-9][0-9]*$ ]] || die "--web-test-workers requires a positive integer"
        shift 2
        ;;
      --reuse-running-trex|--restart-trex)
        E2E_ARGS+=("$1")
        shift
        ;;
      --config-file)
        [[ -n "${2:-}" ]] || die "--config-file requires a value"
        E2E_ARGS+=("--config-file" "$2")
        shift 2
        ;;
      --e2e-arg)
        [[ -n "${2:-}" ]] || die "--e2e-arg requires a value"
        E2E_ARGS+=("$2")
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
}

sync_web_root() {
  if [[ "$SYNC_WEB_ROOT" -eq 0 ]]; then
    printf 'skip: web-root sync disabled by --skip-web-root-sync\n'
    return
  fi
  local source_dist web_parent web_name release_id
  source_dist="$PROJECT_ROOT/apps/web/dist"
  [[ -d "$source_dist" ]] || die "apps/web/dist is missing; run npm run build:web first"
  trex_assert_plain_static_tree "$source_dist" "frontend production build" || \
    die "frontend production build contains unsafe entries"
  web_parent="$(dirname -- "$WEB_ROOT")"
  web_name="$(basename -- "$WEB_ROOT")"
  release_id="$(date -u +%Y%m%dT%H%M%SZ)-$$"
  WEB_RELEASE_DIR="$web_parent/.${web_name}.gate-release-$release_id"
  WEB_ROLLBACK_DIR="$web_parent/.${web_name}.gate-rollback-$release_id"

  step "atomically publish built frontend to Nginx web root"
  install -d -o root -g root -m 0755 "$web_parent"
  [[ ! -e "$WEB_RELEASE_DIR" && ! -L "$WEB_RELEASE_DIR" ]] || die "web release path already exists: $WEB_RELEASE_DIR"
  [[ ! -e "$WEB_ROLLBACK_DIR" && ! -L "$WEB_ROLLBACK_DIR" ]] || die "web rollback path already exists: $WEB_ROLLBACK_DIR"
  mkdir "$WEB_RELEASE_DIR"
  trex_write_managed_marker "$WEB_RELEASE_DIR" || die "unable to mark staged web release"
  cp -a --no-preserve=context "$source_dist/." "$WEB_RELEASE_DIR/"
  trex_secure_static_tree "$WEB_RELEASE_DIR" "staged frontend production build" || \
    die "unable to secure staged frontend production build"

  if [[ -d "$WEB_ROOT" ]]; then
    WEB_LIVE_EXISTED=1
    trex_atomic_exchange_directories "$WEB_ROOT" "$WEB_RELEASE_DIR" || \
      die "unable to atomically publish staged frontend production build"
    WEB_SWITCHED=1
    mv -- "$WEB_RELEASE_DIR" "$WEB_ROLLBACK_DIR"
    WEB_OLD_MOVED=1
    WEB_RELEASE_DIR=""
  else
    mv -- "$WEB_RELEASE_DIR" "$WEB_ROOT"
    WEB_RELEASE_DIR=""
    WEB_SWITCHED=1
  fi
  printf 'ok: atomically published apps/web/dist -> %s\n' "$WEB_ROOT"
}

rollback_gate_web_root() {
  local status=0 rollback_path=""
  if [[ "$WEB_SWITCHED" -eq 1 ]]; then
    if [[ "$WEB_LIVE_EXISTED" -eq 1 ]]; then
      if [[ "$WEB_OLD_MOVED" -eq 1 ]]; then
        [[ -d "$WEB_ROLLBACK_DIR" && ! -L "$WEB_ROLLBACK_DIR" ]] || {
          printf 'error: gate web rollback tree is missing or unsafe: %s\n' "$WEB_ROLLBACK_DIR" >&2
          return 1
        }
        rollback_path="$WEB_ROLLBACK_DIR"
      elif [[ -n "$WEB_RELEASE_DIR" && -d "$WEB_RELEASE_DIR" && ! -L "$WEB_RELEASE_DIR" ]]; then
        rollback_path="$WEB_RELEASE_DIR"
      else
        printf 'error: exchanged gate web rollback tree is missing; refusing to remove live web root: %s\n' \
          "$WEB_ROOT" >&2
        return 1
      fi
      trex_atomic_exchange_directories "$WEB_ROOT" "$rollback_path" || return
      WEB_SWITCHED=0
      trex_safe_remove_tree "$rollback_path" "failed gate web release after atomic rollback" \
        "/var/www/trex-webui" || return
      if [[ "$rollback_path" == "$WEB_ROLLBACK_DIR" ]]; then
        WEB_OLD_MOVED=0
      fi
      if [[ "$rollback_path" == "$WEB_RELEASE_DIR" ]]; then
        WEB_RELEASE_DIR=""
      fi
      WEB_LIVE_EXISTED=0
    elif [[ -e "$WEB_ROOT" || -L "$WEB_ROOT" ]]; then
      trex_safe_remove_tree "$WEB_ROOT" "failed first-install gate web root" "/var/www/trex-webui" || return
      WEB_SWITCHED=0
    fi
  fi
  if [[ -n "$WEB_RELEASE_DIR" && ( -e "$WEB_RELEASE_DIR" || -L "$WEB_RELEASE_DIR" ) ]]; then
    trex_safe_remove_tree "$WEB_RELEASE_DIR" "failed staged web release" "/var/www/trex-webui" || status=1
    WEB_RELEASE_DIR=""
  fi
  return "$status"
}

finalize_gate_web_root() {
  if [[ "$WEB_OLD_MOVED" -eq 1 && -d "$WEB_ROLLBACK_DIR" ]]; then
    trex_safe_remove_tree "$WEB_ROLLBACK_DIR" "completed gate web rollback" "/var/www/trex-webui" || return
    WEB_OLD_MOVED=0
    WEB_LIVE_EXISTED=0
  fi
}

gate_exit() {
  local status=$?
  trap - EXIT
  set +e
  if [[ "$status" -eq 0 ]]; then
    finalize_gate_web_root || status=1
  else
    rollback_gate_web_root || status=1
  fi
  exit "$status"
}

validate_gate_layout() {
  local source_dist
  PROJECT_ROOT="$(trex_canonical_path "$PROJECT_ROOT" "project root")" || die "unsafe project root"
  WEB_ROOT="$(trex_canonical_path "$WEB_ROOT" "web root")" || die "unsafe web root"
  source_dist="$(trex_canonical_path "$PROJECT_ROOT/apps/web/dist" "frontend dist")" || die "unsafe frontend dist"
  trex_path_is_within "$source_dist" "$PROJECT_ROOT" || die "frontend dist escaped the project root"
  trex_assert_managed_path "$WEB_ROOT" "web root" "/var/www/trex-webui" || die "unsafe web root"
  trex_assert_disjoint_paths "$PROJECT_ROOT" "project root" "$WEB_ROOT" "web root" || die "overlapping project/web paths"
  [[ ! -e "$WEB_ROOT" || -d "$WEB_ROOT" ]] || die "web root is not a directory: $WEB_ROOT"
}

verify_python_baseline() {
  if ! .venv/bin/python - <<'PY'
import sys

if sys.version_info[:2] != (3, 11):
    raise SystemExit(f"expected Python 3.11, found {sys.version.split()[0]}")
PY
  then
    die "major gate requires a Python 3.11 .venv; rebuild it with: mv .venv .venv.previous && python3.11 -m venv .venv && .venv/bin/python -m pip install --require-hashes --only-binary=:all: -r apps/api/requirements-dev.lock (or run deploy/install.sh --install-python-deps)"
  fi
}

capture_gate_source_baseline() {
  local output_path
  output_path="$(resolve_path "$OUTPUT_DIR")"
  mkdir -p "$output_path"
  GATE_ID="${REPORT_PREFIX}-$(date -u +%Y%m%dT%H%M%SZ)-$$"
  BASELINE_SOURCE_IDENTITY="$("$PROJECT_ROOT/.venv/bin/python" - "$PROJECT_ROOT" <<'PY'
import sys
from pathlib import Path

project_root = Path(sys.argv[1])
sys.path.insert(0, str(project_root / "scripts"))

from trex_standard_e2e import compute_source_identity

print(compute_source_identity(project_root).get("digest") or "")
PY
)"
  [[ -n "$BASELINE_SOURCE_IDENTITY" ]] || die "unable to compute the pre-build source identity"
  printf 'gate baseline:\n'
  printf '  gate_id: %s\n' "$GATE_ID"
  printf '  source_before_build: %s\n' "$BASELINE_SOURCE_IDENTITY"
}

prepare_gate_identity() {
  local output_path identity_path
  local identity_values=()
  output_path="$(resolve_path "$OUTPUT_DIR")"
  mkdir -p "$output_path"
  [[ -n "$GATE_ID" && -n "$BASELINE_SOURCE_IDENTITY" ]] || \
    die "gate source baseline was not captured before the build"
  identity_path="$output_path/${GATE_ID}-identity.json"
  GATE_IDENTITY_FILE="$identity_path"

  mapfile -t identity_values < <(
    "$PROJECT_ROOT/.venv/bin/python" - \
      "$PROJECT_ROOT" \
      "$GATE_ID" \
      "$identity_path" \
      "$BASELINE_SOURCE_IDENTITY" <<'PY'
import json
import sys
from pathlib import Path

project_root = Path(sys.argv[1])
gate_id = sys.argv[2]
identity_path = Path(sys.argv[3])
baseline_source_identity = sys.argv[4]
sys.path.insert(0, str(project_root / "scripts"))

from trex_standard_e2e import compute_build_identity, compute_source_identity

source = compute_source_identity(project_root)
if source.get("digest") != baseline_source_identity:
    raise SystemExit("source changed while tests/build were running; refusing to bind the build to a different source tree")
build = compute_build_identity(project_root)
identity = {
    "gate_id": gate_id,
    "source": source,
    "build": build,
}
identity_path.write_text(json.dumps(identity, indent=2, sort_keys=True) + "\n", encoding="utf-8")
git = source.get("git") if isinstance(source.get("git"), dict) else {}
print(source.get("digest") or "")
print(build.get("digest") or "")
print(git.get("sha") or "")
print("true" if git.get("dirty") is True else "false")
PY
  )
  [[ "${#identity_values[@]}" -eq 4 ]] || die "unable to compute gate source/build identity"
  EXPECTED_SOURCE_IDENTITY="${identity_values[0]}"
  EXPECTED_BUILD_IDENTITY="${identity_values[1]}"
  EXPECTED_GIT_SHA="${identity_values[2]}"
  EXPECTED_GIT_DIRTY="${identity_values[3]}"
  [[ -n "$EXPECTED_SOURCE_IDENTITY" && -n "$EXPECTED_BUILD_IDENTITY" && -n "$EXPECTED_GIT_SHA" ]] \
    || die "gate source/build identity was incomplete"

  printf 'gate identity:\n'
  printf '  gate_id: %s\n' "$GATE_ID"
  printf '  git_sha: %s (dirty=%s)\n' "$EXPECTED_GIT_SHA" "$EXPECTED_GIT_DIRTY"
  printf '  source: %s\n' "$EXPECTED_SOURCE_IDENTITY"
  printf '  build: %s\n' "$EXPECTED_BUILD_IDENTITY"
  printf '  identity_file: %s\n' "$identity_path"
}

run_production_browser_smoke() {
  local output_path
  output_path="$(resolve_path "$OUTPUT_DIR")"
  BROWSER_SMOKE_REPORT="$output_path/production-browser-smoke-${GATE_ID}.json"
  run_step "Production browser smoke through Nginx" \
    npm run smoke:web:production -- \
      --base-url "$BASE_URL" \
      --gate-id "$GATE_ID" \
      --output "$BROWSER_SMOKE_REPORT"
  printf 'ok: production browser smoke evidence: %s\n' "$BROWSER_SMOKE_REPORT"
}

run_production_browser_write_acceptance() {
  local output_path
  output_path="$(resolve_path "$OUTPUT_DIR")"
  [[ -n "$GATE_IDENTITY_FILE" && -f "$GATE_IDENTITY_FILE" ]] || \
    die "gate identity is unavailable for browser write acceptance"
  BROWSER_WRITE_ACCEPTANCE_REPORT="$output_path/production-browser-write-acceptance-${GATE_ID}.json"
  run_step "Opt-in production browser traffic write acceptance through Nginx" \
    npm run acceptance:web:production-write -- \
      --base-url "$BASE_URL" \
      --gate-id "$GATE_ID" \
      --identity-file "$GATE_IDENTITY_FILE" \
      --output "$BROWSER_WRITE_ACCEPTANCE_REPORT"
  printf 'ok: production browser write acceptance evidence: %s\n' \
    "$BROWSER_WRITE_ACCEPTANCE_REPORT"
}

verify_standard_e2e_archive() {
  local output_dir="$1"
  local report_prefix="$2"
  local base_url="$3"
  local min_mtime="$4"
  "$PROJECT_ROOT/.venv/bin/python" - \
    "$output_dir" \
    "$report_prefix" \
    "$base_url" \
    "$min_mtime" \
    "$GATE_ID" \
    "$EXPECTED_SOURCE_IDENTITY" \
    "$EXPECTED_BUILD_IDENTITY" \
    "$EXPECTED_GIT_SHA" \
    "$EXPECTED_GIT_DIRTY" \
    "$PROJECT_ROOT" <<'PY'
import json
import sys
from pathlib import Path
from urllib.request import urlopen

output_dir = Path(sys.argv[1])
report_prefix = sys.argv[2]
base_url = sys.argv[3].rstrip("/")
min_mtime = float(sys.argv[4])
gate_id = sys.argv[5]
expected_source_identity = sys.argv[6]
expected_build_identity = sys.argv[7]
expected_git_sha = sys.argv[8]
expected_git_dirty = sys.argv[9] == "true"
project_root = Path(sys.argv[10])
reports = sorted(
    (
        path
        for path in output_dir.glob(f"{report_prefix}-*.json")
        if path.stat().st_mtime >= min_mtime
    ),
    key=lambda path: path.stat().st_mtime,
)
if not reports:
    raise SystemExit(f"no fresh standard E2E reports found in {output_dir}")

latest = reports[-1]
data = json.loads(latest.read_text(encoding="utf-8"))
payload = data.get("payload")
if not isinstance(payload, dict):
    raise SystemExit(f"{latest} does not contain a report payload")

if payload.get("standard_e2e") is not True or payload.get("workflow") != "standard-e2e":
    raise SystemExit(f"{latest} is not a standard E2E archive")
if payload.get("verdict") != "pass":
    raise SystemExit(f"{latest} verdict is not pass: {payload.get('verdict')!r}")

identity = payload.get("evidence_identity")
if not isinstance(identity, dict) or identity.get("schema") != "trex-webui-evidence/v1":
    raise SystemExit(f"{latest} has no supported evidence identity")
if identity.get("gate_id") != gate_id or payload.get("gate_id") != gate_id:
    raise SystemExit(f"{latest} does not belong to this gate: {identity.get('gate_id')!r}")

source = identity.get("source") if isinstance(identity.get("source"), dict) else {}
build = identity.get("build") if isinstance(identity.get("build"), dict) else {}
git = source.get("git") if isinstance(source.get("git"), dict) else {}
frontend = build.get("frontend") if isinstance(build.get("frontend"), dict) else {}
api = identity.get("api") if isinstance(identity.get("api"), dict) else {}
api_config = api.get("configuration") if isinstance(api.get("configuration"), dict) else {}

if source.get("digest") != expected_source_identity or payload.get("source_identity") != expected_source_identity:
    raise SystemExit(f"{latest} source identity does not match this gate")
if build.get("digest") != expected_build_identity or payload.get("build_identity") != expected_build_identity:
    raise SystemExit(f"{latest} build identity does not match this gate")
if git.get("sha") != expected_git_sha or payload.get("git_sha") != expected_git_sha:
    raise SystemExit(f"{latest} Git SHA does not match this gate")
if git.get("dirty") is not expected_git_dirty or payload.get("git_dirty") is not expected_git_dirty:
    raise SystemExit(f"{latest} Git dirty state does not match this gate")
if not isinstance(frontend.get("asset_manifest"), list) or not frontend.get("asset_manifest"):
    raise SystemExit(f"{latest} has no frontend asset manifest")
if payload.get("frontend_asset_hash") != frontend.get("asset_manifest_hash"):
    raise SystemExit(f"{latest} frontend asset manifest hash is inconsistent")
if not isinstance(api.get("version"), str) or not api.get("version"):
    raise SystemExit(f"{latest} has no API version evidence")
if not isinstance(api_config.get("summary"), dict) or not api_config.get("digest"):
    raise SystemExit(f"{latest} has no API configuration summary")

sys.path.insert(0, str(project_root / "scripts"))
from trex_standard_e2e import compute_build_identity, compute_source_identity

current_source = compute_source_identity(project_root)
current_build = compute_build_identity(project_root)
if current_source.get("digest") != expected_source_identity:
    raise SystemExit("current source changed during the major gate")
if current_build.get("digest") != expected_build_identity:
    raise SystemExit("current frontend build changed during the major gate")

post = payload.get("post_conditions") if isinstance(payload.get("post_conditions"), dict) else {}
if post.get("traffic_ports_idle") is not True:
    raise SystemExit(f"{latest} did not prove traffic ports idle")
if post.get("capture_recorders_after_stop") != 0:
    raise SystemExit(f"{latest} did not prove capture cleanup")

latency = payload.get("latency_phase") if isinstance(payload.get("latency_phase"), dict) else {}
capture = payload.get("capture_phase") if isinstance(payload.get("capture_phase"), dict) else {}

if base_url.endswith("/api"):
    reports_url = f"{base_url}/trex/reports"
else:
    reports_url = f"{base_url}/api/trex/reports"
with urlopen(reports_url, timeout=20) as response:
    reports_payload = json.loads(response.read().decode("utf-8"))
files = (reports_payload.get("data") or {}).get("files") if isinstance(reports_payload, dict) else None
if not isinstance(files, list):
    raise SystemExit(f"{reports_url} did not return report files")
server_file = next((item for item in files if isinstance(item, dict) and item.get("name") == latest.name), None)
if server_file is None:
    raise SystemExit(f"server report archive is missing for {latest.name}")

print("standard-e2e evidence:")
print(f"  local: {latest}")
print(f"  archive: {server_file.get('path') or server_file.get('name')}")
print(f"  gate_id: {gate_id}")
print(f"  git_sha: {expected_git_sha} (dirty={str(expected_git_dirty).lower()})")
print(f"  source_identity: {expected_source_identity}")
print(f"  build_identity: {expected_build_identity}")
print(f"  latency_avg_us: {latency.get('latency_avg_us')}")
print(f"  capture_packets: {capture.get('packet_count')}")
print(f"  postconditions: traffic idle, capture recorders 0")
PY
}

run_standard_e2e_gate() {
  local output_path run_id log_path status gate_started_epoch
  output_path="$(resolve_path "$OUTPUT_DIR")"
  mkdir -p "$output_path"
  run_id="$(date -u +%Y%m%dT%H%M%SZ)"
  gate_started_epoch="$(date +%s)"
  log_path="$output_path/${REPORT_PREFIX}-${run_id}.log"

  step "standard E2E real-hardware gate"
  set +e
  timeout \
    --signal=TERM \
    --kill-after="${TIMEOUT_KILL_AFTER_SECONDS}s" \
    "${STANDARD_E2E_TIMEOUT_SECONDS}s" \
    bash -c '
    cd "$1"
    shift
    npm run e2e:standard -- "$@"
  ' bash \
    "$PROJECT_ROOT" \
    --base-url "$BASE_URL" \
    --output-dir "$OUTPUT_DIR" \
    --report-prefix "$REPORT_PREFIX" \
    "${E2E_ARGS[@]}" \
    --gate-id "$GATE_ID" \
    --expected-source-identity "$EXPECTED_SOURCE_IDENTITY" \
    --expected-build-identity "$EXPECTED_BUILD_IDENTITY" 2>&1 | tee "$log_path"
  status=${PIPESTATUS[0]}
  set -e
  if [[ "$status" -eq 124 || "$status" -eq 137 ]]; then
    die "standard E2E timed out after ${STANDARD_E2E_TIMEOUT_SECONDS}s; see $log_path"
  fi
  [[ "$status" -eq 0 ]] || die "standard E2E failed; see $log_path"

  verify_standard_e2e_archive "$output_path" "$REPORT_PREFIX" "$BASE_URL" "$gate_started_epoch"
  printf 'ok: standard E2E report evidence verified (log: %s)\n' "$log_path"
}

main() {
  parse_args "$@"
  cd "$PROJECT_ROOT"

  [[ -x ".venv/bin/python" ]] || die "missing Python virtualenv at .venv/bin/python"
  command -v npm >/dev/null 2>&1 || die "npm is required"
  command -v timeout >/dev/null 2>&1 || die "timeout is required"
  [[ "$TIMEOUT_KILL_AFTER_SECONDS" =~ ^[1-9][0-9]*$ ]] || \
    die "VERIFY_MAJOR_TIMEOUT_KILL_AFTER_SECONDS requires a positive integer"
  validate_gate_layout
  verify_python_baseline
  trex_acquire_deployment_lock || die "another deployment transaction is active or the deployment lock is unsafe"
  capture_gate_source_baseline

  step "major-change gate for $BASE_URL"
  run_step "Python syntax check for acceptance scripts" \
    .venv/bin/python -m py_compile scripts/trex_standard_e2e.py scripts/trex_real_acceptance.py
  run_step "Privileged daemon service contract tests" deploy/tests/daemon_service_test.sh
  run_step "Managed API environment authority tests" deploy/tests/managed_environment_test.sh
  run_step "Deployment release and rollback safety tests" deploy/tests/release_safety_test.sh
  run_step "Deployment virtualenv transaction tests" deploy/tests/venv_transaction_test.sh
  run_step "Deployment global lock tests" deploy/tests/deployment_lock_test.sh
  run_step "API tests" npm run test:api
  if [[ "$WEB_TEST_SHARDS" -gt 1 ]]; then
    run_step "Web tests (${WEB_TEST_SHARDS} shards)" \
      scripts/run_web_test_shards.sh --shards "$WEB_TEST_SHARDS" --max-workers "$WEB_TEST_SHARD_WORKERS"
  else
    run_step "Web tests" npm run test:web
  fi
  run_step "Web typecheck" npm run typecheck:web
  run_step "Web lint" npm run lint:web
  run_step "Web production build" npm run build:web
  run_step "Whitespace/conflict diff check" git diff --check
  sync_web_root
  prepare_gate_identity
  run_production_browser_smoke

  if [[ "$RUN_DEPLOY_VERIFY" -eq 1 ]]; then
    run_step "Nginx/API deployment probe" \
      deploy/verify.sh --base-url "$BASE_URL" --web-root "$WEB_ROOT" "${DEPLOY_VERIFY_ARGS[@]}"
  else
    printf 'skip: deploy/verify.sh disabled by --skip-deploy-verify\n'
  fi

  # Standard E2E owns the default daemon restart/custom-config start. Run it
  # before the optional browser writes so a stopped-but-healthy managed daemon
  # is a supported gate baseline rather than an implicit browser precondition.
  run_standard_e2e_gate

  if [[ "$RUN_BROWSER_WRITE_ACCEPTANCE" -eq 1 ]]; then
    run_production_browser_write_acceptance
  else
    printf 'skip: production browser write acceptance requires --browser-write-acceptance\n'
  fi

  step "major-change gate passed"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  trap gate_exit EXIT
  main "$@"
fi
