#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
[[ -f "$SCRIPT_DIR/path_safety.sh" ]] || { printf 'error: missing %s/path_safety.sh\n' "$SCRIPT_DIR" >&2; exit 1; }
# shellcheck source=deploy/path_safety.sh
source "$SCRIPT_DIR/path_safety.sh"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUT_DIR=""
PACKAGE_NAME=""
RUN_BUILD=1
STAGING_ROOT=""
OUTPUT_ARCHIVE_TMP=""
OUTPUT_CHECKSUM_TMP=""
OUTPUT_ARCHIVE_FINAL=""
OUTPUT_CHECKSUM_FINAL=""
OUTPUT_ARCHIVE_PUBLISHED=0
OUTPUT_CHECKSUM_PUBLISHED=0
PACKAGE_COMPLETE=0
ALLOW_DIRTY=0
SOURCE_EPOCH=""
PYTHON_BIN=""
BASELINE_SOURCE_IDENTITY=""
GITHUB_RELEASE_CONTEXT=0
RELEASE_REPOSITORY=""
RELEASE_REF=""
SIGNER_WORKFLOW_REF=""
SIGNER_WORKFLOW_SHA=""

cleanup() {
  local status=$?
  trap - EXIT
  set +e
  if [[ -n "${STAGING_ROOT:-}" && -e "$STAGING_ROOT" ]]; then
    trex_safe_remove_tree "$STAGING_ROOT" "package staging directory" || status=1
  fi
  if [[ "$PACKAGE_COMPLETE" -eq 0 ]]; then
    if [[ -n "$OUTPUT_ARCHIVE_TMP" ]]; then
      rm -f -- "$OUTPUT_ARCHIVE_TMP"
    fi
    if [[ -n "$OUTPUT_CHECKSUM_TMP" ]]; then
      rm -f -- "$OUTPUT_CHECKSUM_TMP"
    fi
    if [[ "$OUTPUT_ARCHIVE_PUBLISHED" -eq 1 && -n "$OUTPUT_ARCHIVE_FINAL" ]]; then
      rm -f -- "$OUTPUT_ARCHIVE_FINAL"
    fi
    if [[ "$OUTPUT_CHECKSUM_PUBLISHED" -eq 1 && -n "$OUTPUT_CHECKSUM_FINAL" ]]; then
      rm -f -- "$OUTPUT_CHECKSUM_FINAL"
    fi
  fi
  exit "$status"
}

trap cleanup EXIT

usage() {
  cat <<'USAGE'
Usage: deploy/package.sh [options]

Build a portable TRex WebUI release archive with prebuilt frontend assets.

Options:
  --project-root PATH   Project checkout path. Default: script parent directory
  --output-dir PATH     Release output directory. Default: <project-root>/dist/releases
  --name NAME           Archive directory/file stem. Default: trex-webui-<version>-<git>-<timestamp>
  --skip-build          Reuse existing apps/web/dist instead of running npm run build:web
  --allow-dirty         Package HEAD despite local changes. Never use for a published release
  --github-release-context
                        Require and bind exact GitHub tag/repository/signer-workflow context
  -h, --help            Show this help
USAGE
}

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

log() {
  printf '==> %s\n' "$*"
}

timestamp() {
  date -u --date="@$SOURCE_EPOCH" +%Y%m%dT%H%M%SZ
}

timestamp_iso() {
  date -u --date="@$SOURCE_EPOCH" +%Y-%m-%dT%H:%M:%SZ
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --project-root)
        PROJECT_ROOT="${2:-}"
        [[ -n "$PROJECT_ROOT" ]] || die "--project-root requires a value"
        shift 2
        ;;
      --output-dir)
        OUTPUT_DIR="${2:-}"
        [[ -n "$OUTPUT_DIR" ]] || die "--output-dir requires a value"
        shift 2
        ;;
      --name)
        PACKAGE_NAME="${2:-}"
        [[ -n "$PACKAGE_NAME" ]] || die "--name requires a value"
        shift 2
        ;;
      --skip-build)
        RUN_BUILD=0
        shift
        ;;
      --allow-dirty)
        ALLOW_DIRTY=1
        shift
        ;;
      --github-release-context)
        GITHUB_RELEASE_CONTEXT=1
        shift
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

version() {
  sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$PROJECT_ROOT/package.json" | head -1
}

git_commit() {
  git -C "$PROJECT_ROOT" rev-parse --short=12 HEAD 2>/dev/null || die "release packaging requires a Git checkout with a valid HEAD"
}

capture_github_release_context() {
  [[ "$GITHUB_RELEASE_CONTEXT" -eq 1 ]] || return 0
  [[ "${GITHUB_ACTIONS:-}" == "true" ]] || \
    die "--github-release-context requires GITHUB_ACTIONS=true"
  RELEASE_REPOSITORY="${GITHUB_REPOSITORY:-}"
  RELEASE_REF="${GITHUB_REF:-}"
  SIGNER_WORKFLOW_REF="${GITHUB_WORKFLOW_REF:-}"
  SIGNER_WORKFLOW_SHA="${GITHUB_WORKFLOW_SHA:-}"
  local github_sha current_sha tag_commit
  github_sha="${GITHUB_SHA:-}"
  [[ -n "$RELEASE_REPOSITORY" ]] || die "GitHub release repository context is missing"
  [[ -n "$RELEASE_REF" ]] || die "GitHub release ref context is missing"
  [[ -n "$SIGNER_WORKFLOW_REF" ]] || die "GitHub signer workflow ref context is missing"
  [[ -n "$SIGNER_WORKFLOW_SHA" ]] || die "GitHub signer workflow SHA context is missing"
  [[ -n "$github_sha" ]] || die "GitHub source SHA context is missing"
  [[ "$RELEASE_REF" == refs/tags/* ]] || \
    die "GitHub release ref must be an exact refs/tags/* ref"
  current_sha="$(git -C "$PROJECT_ROOT" rev-parse HEAD 2>/dev/null)" || \
    die "unable to resolve release checkout HEAD"
  tag_commit="$(git -C "$PROJECT_ROOT" rev-parse --verify "${RELEASE_REF}^{commit}" 2>/dev/null)" || \
    die "GitHub release tag does not exist in the release checkout"
  [[ "$github_sha" == "$current_sha" ]] || \
    die "GitHub source SHA does not exactly match the release checkout HEAD"
  [[ "$tag_commit" == "$current_sha" ]] || \
    die "GitHub release tag does not exactly resolve to the release checkout HEAD"
  [[ "$SIGNER_WORKFLOW_SHA" == "$github_sha" ]] || \
    die "GitHub signer workflow SHA does not exactly match the release source SHA"
}

capture_source_identity() {
  "$PYTHON_BIN" "$PROJECT_ROOT/deploy/archive_safety.py" \
    source-identity "$PROJECT_ROOT"
}

assert_clean_source_stable() {
  local phase="$1"
  local current_identity
  if [[ "$ALLOW_DIRTY" -eq 1 ]]; then
    return
  fi
  [[ -z "$(git -C "$PROJECT_ROOT" status --porcelain)" ]] || \
    die "source changed during $phase; release packaging stopped"
  current_identity="$(capture_source_identity)" ||
    die "unable to verify source identity after $phase"
  [[ "$current_identity" == "$BASELINE_SOURCE_IDENTITY" ]] || \
    die "source identity changed during $phase; release packaging stopped"
}

check_layout() {
  PROJECT_ROOT="$(trex_canonical_path "$PROJECT_ROOT" "package project root")" || die "unsafe project root"
  [[ -d "$PROJECT_ROOT" ]] || die "project root not found: $PROJECT_ROOT"
  PYTHON_BIN="${TREX_WEBUI_PACKAGE_PYTHON:-$PROJECT_ROOT/.venv/bin/python}"
  [[ -x "$PYTHON_BIN" ]] || \
    die "dependency-complete project Python not found: $PYTHON_BIN"
  [[ -f "$PROJECT_ROOT/package.json" ]] || die "missing package.json under $PROJECT_ROOT"
  [[ -f "$PROJECT_ROOT/LICENSE" ]] || die "missing LICENSE under $PROJECT_ROOT"
  [[ -f "$PROJECT_ROOT/NOTICE" ]] || die "missing NOTICE under $PROJECT_ROOT"
  [[ -f "$PROJECT_ROOT/THIRD_PARTY_NOTICES.md" ]] || die "missing THIRD_PARTY_NOTICES.md under $PROJECT_ROOT"
  [[ -f "$PROJECT_ROOT/public-source-policy.json" ]] || die "missing public-source-policy.json under $PROJECT_ROOT"
  [[ -f "$PROJECT_ROOT/apps/api/requirements.txt" ]] || die "missing apps/api/requirements.txt under $PROJECT_ROOT"
  [[ -f "$PROJECT_ROOT/apps/api/requirements.lock" ]] || die "missing apps/api/requirements.lock under $PROJECT_ROOT"
  [[ -f "$PROJECT_ROOT/apps/api/requirements-dev.txt" ]] || die "missing apps/api/requirements-dev.txt under $PROJECT_ROOT"
  [[ -f "$PROJECT_ROOT/apps/api/requirements-dev.lock" ]] || die "missing apps/api/requirements-dev.lock under $PROJECT_ROOT"
  [[ -f "$PROJECT_ROOT/apps/web/package-lock.json" ]] || die "missing apps/web/package-lock.json under $PROJECT_ROOT"
  [[ -f "$PROJECT_ROOT/deploy/install.sh" ]] || die "missing deploy/install.sh"
  [[ -f "$PROJECT_ROOT/deploy/upgrade.sh" ]] || die "missing deploy/upgrade.sh"
  [[ -f "$PROJECT_ROOT/deploy/verify.sh" ]] || die "missing deploy/verify.sh"
  [[ -f "$PROJECT_ROOT/deploy/path_safety.sh" ]] || die "missing deploy/path_safety.sh"
  [[ -f "$PROJECT_ROOT/deploy/archive_safety.py" ]] || die "missing deploy/archive_safety.py"
  [[ -x "$PROJECT_ROOT/deploy/bootstrap_release_infrastructure.py" ]] || die "missing executable deploy/bootstrap_release_infrastructure.py"
  [[ -x "$PROJECT_ROOT/deploy/release_transaction.py" ]] || die "missing executable deploy/release_transaction.py"
  [[ -x "$PROJECT_ROOT/deploy/trex_overview_contract.py" ]] || die "missing executable deploy/trex_overview_contract.py"
  [[ -x "$PROJECT_ROOT/deploy/trex_persisted_state_contract.py" ]] || die "missing executable deploy/trex_persisted_state_contract.py"
  [[ -f "$PROJECT_ROOT/deploy/systemd/trex-webui-release-consumer-ack.service" ]] || die "missing release consumer acknowledgement systemd unit"
  [[ -f "$PROJECT_ROOT/deploy/systemd/trex-webui-release-reconcile.service" ]] || die "missing release reconciler systemd unit"
  [[ -f "$PROJECT_ROOT/deploy/systemd/trex-webui-release-retry.service" ]] || die "missing release retry systemd unit"
  [[ -f "$PROJECT_ROOT/deploy/systemd/nginx-trex-webui-release-reconcile.conf" ]] || die "missing release reconciler Nginx dependency drop-in"
  [[ -x "$PROJECT_ROOT/deploy/verified_upgrade.sh" ]] || die "missing executable deploy/verified_upgrade.sh"
  [[ -f "$PROJECT_ROOT/scripts/trex_standard_e2e.py" ]] || die "missing scripts/trex_standard_e2e.py"
  [[ -f "$PROJECT_ROOT/scripts/trex_real_acceptance.py" ]] || die "missing scripts/trex_real_acceptance.py"
  [[ -x "$PROJECT_ROOT/scripts/release_contract.py" ]] || die "missing executable scripts/release_contract.py"
  [[ -x "$PROJECT_ROOT/scripts/release_evidence.py" ]] || die "missing executable scripts/release_evidence.py"
  [[ -x "$PROJECT_ROOT/scripts/release_metadata.py" ]] || die "missing executable scripts/release_metadata.py"
  [[ -x "$PROJECT_ROOT/scripts/npmw" ]] || die "missing executable scripts/npmw"
  [[ -x "$PROJECT_ROOT/scripts/generate_sbom.sh" ]] || die "missing executable scripts/generate_sbom.sh"
  [[ -f "$PROJECT_ROOT/deploy/nginx/trex-webui.conf" ]] || die "missing deploy/nginx/trex-webui.conf"
  [[ -f "$PROJECT_ROOT/deploy/systemd/trex-webui-api.service" ]] || die "missing deploy/systemd/trex-webui-api.service"
  [[ -f "$PROJECT_ROOT/deploy/systemd/trex-daemon-server.service" ]] || die "missing deploy/systemd/trex-daemon-server.service"
  [[ -f "$PROJECT_ROOT/deploy/systemd/nftables-trex-webui.conf" ]] || die "missing deploy/systemd/nftables-trex-webui.conf"
  [[ -f "$PROJECT_ROOT/deploy/daemon_rpc_probe.py" && -x "$PROJECT_ROOT/deploy/daemon_rpc_probe.py" ]] || die "missing executable deploy/daemon_rpc_probe.py"
  [[ -f "$PROJECT_ROOT/deploy/trex_daemon_supervisor.py" && -x "$PROJECT_ROOT/deploy/trex_daemon_supervisor.py" ]] || die "missing executable deploy/trex_daemon_supervisor.py"
  [[ -f "$PROJECT_ROOT/deploy/trex_native_boundary.sh" && -x "$PROJECT_ROOT/deploy/trex_native_boundary.sh" ]] || die "missing executable deploy/trex_native_boundary.sh"
  [[ -f "$PROJECT_ROOT/deploy/logrotate/trex-daemon-server" ]] || die "missing daemon logrotate policy"
}

build_web() {
  if [[ "$RUN_BUILD" -eq 0 ]]; then
    log "Skipping web build"
  else
    log "Building WebUI"
    (cd "$PROJECT_ROOT" && scripts/npmw run build:web)
  fi
  [[ -d "$PROJECT_ROOT/apps/web/dist" ]] || die "web dist not found; run without --skip-build first"
}

copy_release_tree() {
  local target="$1"
  local relative_path source_path destination_path export_attribute
  local release_paths=(
    apps/api
    apps/web/package.json
    apps/web/package-lock.json
    deploy
    docs
    examples
    scripts
    tools
    README.md
    LICENSE
    NOTICE
    THIRD_PARTY_NOTICES.md
    SECURITY.md
    SUPPORT.md
    CONTRIBUTING.md
    CODE_OF_CONDUCT.md
    CHANGELOG.md
    public-source-policy.json
    package.json
    package-lock.json
    pytest.ini
    .env.example
    .node-version
    .nvmrc
  )

  while IFS= read -r -d '' relative_path; do
    export_attribute="$(
      git -C "$PROJECT_ROOT" check-attr export-ignore -- "$relative_path"
    )"
    if [[ "$export_attribute" == *": export-ignore: set" ]]; then
      continue
    fi
    source_path="$PROJECT_ROOT/$relative_path"
    destination_path="$target/$relative_path"
    [[ -f "$source_path" && ! -L "$source_path" ]] || \
      die "release source entry is missing, unsafe, or not a regular file: $relative_path"
    mkdir -p "$(dirname -- "$destination_path")"
    cp -p -- "$source_path" "$destination_path"
  done < <(
    git -C "$PROJECT_ROOT" ls-files -z --cached --others --exclude-standard -- \
      "${release_paths[@]}"
  )

  mkdir -p "$target/apps/web"
  cp -a "$PROJECT_ROOT/apps/web/dist" "$target/apps/web/"

  TREX_WEBUI_SBOM_PYTHON="$PYTHON_BIN" \
    "$PROJECT_ROOT/scripts/generate_sbom.sh" --output-dir "$target" ||
    die "failed to generate release SBOM files"
  "$PYTHON_BIN" "$PROJECT_ROOT/scripts/check_public_source.py" \
    --partial-tree "$target" ||
    die "release payload failed public source policy"

  local cache_dir compiled_file
  while IFS= read -r -d '' cache_dir; do
    trex_safe_remove_tree "$cache_dir" "packaged Python cache directory" || die "failed to clean Python cache"
  done < <(find "$target" -type d -name __pycache__ -prune -print0)
  while IFS= read -r -d '' compiled_file; do
    rm -f -- "$compiled_file"
  done < <(find "$target" -type f \( -name '*.pyc' -o -name '*.pyo' \) -print0)

  # Canonical package modes keep the verified payload stable after the
  # installer makes runtime code world-readable and executable where needed.
  # Record executable intent before normalizing non-executable files.
  find "$target" -type d -exec chmod 0755 '{}' +
  find "$target" -type f -perm /111 -exec chmod 0755 '{}' +
  find "$target" -type f ! -perm /111 -exec chmod 0644 '{}' +
}

write_manifest() {
  local target="$1"
  local created_at="$2"
  local package_version="$3"
  local digest
  local provenance_args=()
  if [[ "$GITHUB_RELEASE_CONTEXT" -eq 1 ]]; then
    provenance_args=(
      --release-repository "$RELEASE_REPOSITORY"
      --release-ref "$RELEASE_REF"
      --signer-workflow-ref "$SIGNER_WORKFLOW_REF"
      --signer-workflow-sha "$SIGNER_WORKFLOW_SHA"
      --require-publishable
    )
  fi
  digest="$(
    "$PYTHON_BIN" "$PROJECT_ROOT/deploy/archive_safety.py" write-manifest "$target" \
      --source-root "$PROJECT_ROOT" \
      --name "$PACKAGE_NAME" \
      --version "$package_version" \
      --created-at "$created_at" \
      "${provenance_args[@]}"
  )" || die "failed to create release payload identity"
  log "Recorded release payload SHA-256 $digest"
}

create_archive() {
  local staging_root="$1"
  mkdir -p "$OUTPUT_DIR"
  local archive="$OUTPUT_DIR/$PACKAGE_NAME.tar.gz"
  local checksum="$archive.sha256"
  OUTPUT_ARCHIVE_FINAL="$archive"
  OUTPUT_CHECKSUM_FINAL="$checksum"
  [[ ! -e "$archive" && ! -L "$archive" ]] || die "release archive already exists: $archive"
  [[ ! -e "$checksum" && ! -L "$checksum" ]] || die "release checksum already exists: $checksum"
  OUTPUT_ARCHIVE_TMP="$(mktemp --tmpdir="$OUTPUT_DIR" ".${PACKAGE_NAME}.tar.gz.XXXXXXXX")"
  OUTPUT_CHECKSUM_TMP="$(mktemp --tmpdir="$OUTPUT_DIR" ".${PACKAGE_NAME}.tar.gz.sha256.XXXXXXXX")"
  log "Creating $archive"
  tar \
    --sort=name \
    --mtime="@$SOURCE_EPOCH" \
    --owner=0 \
    --group=0 \
    --numeric-owner \
    -C "$staging_root" \
    -cf - "$PACKAGE_NAME" |
    gzip -n -9 >"$OUTPUT_ARCHIVE_TMP"
  "$PYTHON_BIN" "$PROJECT_ROOT/deploy/archive_safety.py" "$OUTPUT_ARCHIVE_TMP" >/dev/null
  local digest
  digest="$(sha256sum -- "$OUTPUT_ARCHIVE_TMP")"
  digest="${digest%% *}"
  printf '%s  %s\n' "$digest" "$(basename -- "$archive")" >"$OUTPUT_CHECKSUM_TMP"
  chmod 0644 "$OUTPUT_ARCHIVE_TMP" "$OUTPUT_CHECKSUM_TMP"
  mv -- "$OUTPUT_ARCHIVE_TMP" "$archive"
  OUTPUT_ARCHIVE_TMP=""
  OUTPUT_ARCHIVE_PUBLISHED=1
  mv -- "$OUTPUT_CHECKSUM_TMP" "$checksum"
  OUTPUT_CHECKSUM_TMP=""
  OUTPUT_CHECKSUM_PUBLISHED=1
  PACKAGE_COMPLETE=1
  log "Wrote $checksum"
  log "Release package ready: $archive"
}

main() {
  parse_args "$@"
  check_layout
  if [[ "$ALLOW_DIRTY" -eq 0 ]] && [[ -n "$(git -C "$PROJECT_ROOT" status --porcelain)" ]]; then
    die "release packaging requires a clean checkout; commit changes or pass --allow-dirty for local testing"
  fi
  if [[ "$ALLOW_DIRTY" -eq 0 ]]; then
    BASELINE_SOURCE_IDENTITY="$(capture_source_identity)" ||
      die "unable to capture release source identity"
  fi
  if [[ "$GITHUB_RELEASE_CONTEXT" -eq 1 && "$ALLOW_DIRTY" -eq 1 ]]; then
    die "--github-release-context cannot be combined with --allow-dirty"
  fi
  capture_github_release_context
  SOURCE_EPOCH="${SOURCE_DATE_EPOCH:-$(git -C "$PROJECT_ROOT" show -s --format=%ct HEAD)}"
  [[ "$SOURCE_EPOCH" =~ ^[0-9]+$ ]] || die "SOURCE_DATE_EPOCH must be an integer"
  OUTPUT_DIR="${OUTPUT_DIR:-$PROJECT_ROOT/dist/releases}"
  OUTPUT_DIR="$(trex_canonical_path "$OUTPUT_DIR" "release output directory")" || die "unsafe release output directory"
  trex_assert_managed_path "$OUTPUT_DIR" "release output directory" "$PROJECT_ROOT" || die "unsafe release output directory"
  mkdir -p "$OUTPUT_DIR"
  command -v sha256sum >/dev/null 2>&1 || die "sha256sum is required to package releases"
  command -v gzip >/dev/null 2>&1 || die "gzip is required to package releases"
  local package_version commit created_at package_root
  package_version="$(version)"
  [[ -n "$package_version" ]] || die "unable to read version from package.json"
  commit="$(git_commit)"
  created_at="$(timestamp_iso)"
  PACKAGE_NAME="${PACKAGE_NAME:-trex-webui-${package_version}-${commit}-$(timestamp)}"
  [[ "$PACKAGE_NAME" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$ ]] || die "--name must use 1-128 safe filename characters"

  build_web
  assert_clean_source_stable "web build"

  STAGING_ROOT="$(mktemp -d -t trex-webui-package.XXXXXX)"
  trex_write_managed_marker "$STAGING_ROOT"
  package_root="$STAGING_ROOT/$PACKAGE_NAME"
  mkdir -p "$package_root"
  copy_release_tree "$package_root"
  write_manifest "$package_root" "$created_at" "$package_version"
  assert_clean_source_stable "payload assembly"
  create_archive "$STAGING_ROOT"
}

main "$@"
