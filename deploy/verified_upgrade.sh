#!/usr/bin/env bash
set -Eeuo pipefail

# This bootstrap is itself a separately attested release asset.  It deliberately
# does not inspect, list, extract, or execute the release archive until every
# release input has passed the exact GitHub attestation policy below.
readonly RELEASE_REPOSITORY="lenxy-ea/trex-webui"
readonly RELEASE_SIGNER_WORKFLOW="lenxy-ea/trex-webui/.github/workflows/release.yml"

RELEASE_TAG=""
METADATA_PATH=""
ARTIFACT_DIR=""
SNAPSHOT_DIR=""
SCRIPT_SNAPSHOT=""
TAG_SHA=""
WORK_ROOT=""
declare -a UPGRADE_ARGS=()
declare -A ARTIFACT_NAMES=()

usage() {
  cat <<'USAGE'
Usage: verified_upgrade.sh --tag v<package-version> --metadata PATH [-- UPGRADE_OPTIONS...]

Verify the exact-tag GitHub attestations and release metadata before safely
validating the v3 archive and invoking the upgrader carried by that archive.
All release assets named by the metadata must be in the metadata directory.

Examples:
  ./trex-webui-verified-upgrade.sh \
    --tag v0.1.0-rc.2 \
    --metadata ./trex-webui-v0.1.0-rc.2.release.json \
    -- --install-python-deps --verify
USAGE
}

die() {
  printf 'verified upgrade error: %s\n' "$*" >&2
  exit 1
}

cleanup() {
  local status=$?
  trap - EXIT
  if [[ -n "${WORK_ROOT:-}" && -d "$WORK_ROOT" && ! -L "$WORK_ROOT" ]]; then
    rm -rf -- "$WORK_ROOT"
  fi
  exit "$status"
}

trap cleanup EXIT

parse_args() {
  local seen_tag=0 seen_metadata=0
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --tag)
        [[ "$seen_tag" -eq 0 ]] || die "--tag may be specified only once"
        seen_tag=1
        RELEASE_TAG="${2:-}"
        [[ -n "$RELEASE_TAG" ]] || die "--tag requires a value"
        shift 2
        ;;
      --metadata)
        [[ "$seen_metadata" -eq 0 ]] || die "--metadata may be specified only once"
        seen_metadata=1
        METADATA_PATH="${2:-}"
        [[ -n "$METADATA_PATH" ]] || die "--metadata requires a value"
        shift 2
        ;;
      --)
        shift
        UPGRADE_ARGS=("$@")
        validate_upgrade_passthrough
        return
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        die "unknown bootstrap option: $1 (put upgrader options after --)"
        ;;
    esac
  done
}

validate_upgrade_passthrough() {
  local argument
  for argument in "${UPGRADE_ARGS[@]}"; do
    case "$argument" in
      --archive|--archive=*|--sha256|--sha256=*|--rollback-previous)
        die "upgrader option $argument is reserved by the attested bootstrap"
        ;;
    esac
  done
}

require_regular_file() {
  local path="$1" label="$2"
  [[ -f "$path" && ! -L "$path" ]] || \
    die "$label must be a regular non-symlink file: $path"
}

read_remote_tag_sha() {
  local observed
  observed="$(
    gh api \
      -H 'Accept: application/vnd.github+json' \
      -H 'X-GitHub-Api-Version: 2026-03-10' \
      "repos/$RELEASE_REPOSITORY/commits/$RELEASE_TAG" \
      --jq .sha
  )" || die "unable to resolve the release tag from GitHub"
  [[ "$observed" =~ ^[0-9a-f]{40}$ ]] || \
    die "GitHub returned an invalid release tag commit"
  printf '%s\n' "$observed"
}

resolve_tag_sha() {
  TAG_SHA="$(read_remote_tag_sha)"
}

recheck_tag_sha() {
  local observed
  observed="$(read_remote_tag_sha)"
  [[ "$observed" == "$TAG_SHA" ]] || \
    die "release tag moved after initial verification; refusing to execute the upgrader"
}

verify_attestation() {
  local path="$1" label="$2"
  require_regular_file "$path" "$label"
  gh attestation verify "$path" \
    --repo "$RELEASE_REPOSITORY" \
    --signer-workflow "$RELEASE_SIGNER_WORKFLOW" \
    --source-ref "refs/tags/$RELEASE_TAG" \
    --source-digest "$TAG_SHA" \
    --signer-digest "$TAG_SHA" \
    --deny-self-hosted-runners >/dev/null || \
    die "$label did not pass the exact-tag GitHub attestation policy"
}

snapshot_initial_inputs() {
  local original_metadata="$METADATA_PATH"
  SNAPSHOT_DIR="$WORK_ROOT/artifacts"
  install -d -m 0700 "$SNAPSHOT_DIR"
  SCRIPT_SNAPSHOT="$WORK_ROOT/running-bootstrap"
  install -m 0700 -- "$SCRIPT_PATH" "$SCRIPT_SNAPSHOT"
  install -m 0600 -- "$original_metadata" "$WORK_ROOT/release-metadata.json"
  METADATA_PATH="$WORK_ROOT/release-metadata.json"
}

read_attested_inventory() {
  local inventory_path="$WORK_ROOT/metadata-inventory"
  python3 - "$METADATA_PATH" "$RELEASE_REPOSITORY" \
    "refs/tags/$RELEASE_TAG" "$RELEASE_SIGNER_WORKFLOW" "$TAG_SHA" \
    >"$inventory_path" <<'PY'
import json
import re
import sys
from pathlib import Path

metadata_path, repository, release_ref, signer_workflow, source_sha = sys.argv[1:]
safe_name = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,191}\Z")
sha256 = re.compile(r"[0-9a-f]{64}\Z")
required_roles = {
    "archive",
    "checksum",
    "release-evidence",
    "sbom-web",
    "sbom-python",
    "standard-report",
    "six-port-report",
    "verified-upgrade",
    "archive-safety",
    "release-contract",
    "release-metadata",
}

def pairs(items):
    result = {}
    for key, value in items:
        if key in result:
            raise ValueError(f"duplicate JSON key: {key}")
        result[key] = value
    return result

try:
    document = json.loads(
        Path(metadata_path).read_text(encoding="utf-8"),
        object_pairs_hook=pairs,
        parse_constant=lambda value: (_ for _ in ()).throw(
            ValueError(f"non-finite JSON value: {value}")
        ),
    )
    if set(document) != {"schema", "release", "artifacts"}:
        raise ValueError("invalid metadata root shape")
    if document["schema"] != "trex-webui-release-metadata/v1":
        raise ValueError("unsupported metadata schema")
    release = document["release"]
    expected_release = {
        "repository": repository,
        "release_ref": release_ref,
        "release_tag": release_ref.removeprefix("refs/tags/"),
        "signer_workflow": signer_workflow,
        "signer_workflow_sha": source_sha,
        "source_sha": source_sha,
    }
    for key, expected in expected_release.items():
        if release.get(key) != expected:
            raise ValueError(f"release {key} does not match exact-tag policy")
    if release.get("release_tag") != f"v{release.get('version')}":
        raise ValueError("release tag does not match package version")
    artifacts = document["artifacts"]
    if not isinstance(artifacts, list) or len(artifacts) != len(required_roles):
        raise ValueError("incomplete artifact inventory")
    roles = set()
    names = set()
    for item in artifacts:
        if not isinstance(item, dict) or set(item) != {"role", "name", "sha256", "size"}:
            raise ValueError("invalid artifact descriptor")
        role = item["role"]
        name = item["name"]
        if role not in required_roles or role in roles:
            raise ValueError("unknown or duplicate artifact role")
        if not isinstance(name, str) or not safe_name.fullmatch(name) or name in names:
            raise ValueError("unsafe or duplicate artifact basename")
        if not isinstance(item["sha256"], str) or not sha256.fullmatch(item["sha256"]):
            raise ValueError("invalid artifact digest")
        if isinstance(item["size"], bool) or not isinstance(item["size"], int) or item["size"] < 1:
            raise ValueError("invalid artifact size")
        roles.add(role)
        names.add(name)
        sys.stdout.buffer.write(role.encode() + b"\0" + name.encode() + b"\0")
    if roles != required_roles:
        raise ValueError("incomplete artifact roles")
except (OSError, UnicodeError, ValueError, TypeError, KeyError) as exc:
    print(f"invalid attested release metadata: {exc}", file=sys.stderr)
    raise SystemExit(1)
PY

  local role name
  while IFS= read -r -d '' role && IFS= read -r -d '' name; do
    ARTIFACT_NAMES["$role"]="$name"
  done <"$inventory_path"
  [[ "${#ARTIFACT_NAMES[@]}" -eq 11 ]] || \
    die "attested release metadata did not yield the complete artifact inventory"
}

snapshot_and_verify_release_assets() {
  local role name source_path snapshot_path
  for role in \
    archive checksum release-evidence sbom-web sbom-python \
    standard-report six-port-report verified-upgrade archive-safety \
    release-contract release-metadata; do
    name="${ARTIFACT_NAMES[$role]:-}"
    [[ -n "$name" ]] || die "release metadata omitted $role"
    source_path="$ARTIFACT_DIR/$name"
    require_regular_file "$source_path" "$role artifact source"
    snapshot_path="$SNAPSHOT_DIR/$name"
    [[ ! -e "$snapshot_path" && ! -L "$snapshot_path" ]] || \
      die "duplicate release artifact snapshot target: $name"
    install -m 0600 -- "$source_path" "$snapshot_path"
    verify_attestation "$snapshot_path" "$role artifact snapshot"
  done

  local attested_bootstrap="$SNAPSHOT_DIR/${ARTIFACT_NAMES[verified-upgrade]}"
  cmp -s -- "$SCRIPT_SNAPSHOT" "$attested_bootstrap" || \
    die "the running bootstrap does not match the metadata-bound bootstrap asset"
}

validate_metadata_and_archive() {
  local metadata_validator archive_validator contract_validator archive_path
  metadata_validator="$SNAPSHOT_DIR/${ARTIFACT_NAMES[release-metadata]}"
  archive_validator="$SNAPSHOT_DIR/${ARTIFACT_NAMES[archive-safety]}"
  contract_validator="$SNAPSHOT_DIR/${ARTIFACT_NAMES[release-contract]}"
  archive_path="$SNAPSHOT_DIR/${ARTIFACT_NAMES[archive]}"

  # The validator assets have already passed attestation.  Arrange the two
  # project modules in their expected source layout before executing them.
  install -d -m 0700 "$WORK_ROOT/validator/deploy" "$WORK_ROOT/validator/scripts"
  install -m 0700 -- "$archive_validator" "$WORK_ROOT/validator/deploy/archive_safety.py"
  install -m 0700 -- "$contract_validator" "$WORK_ROOT/validator/scripts/release_contract.py"

  python3 "$metadata_validator" verify \
    --metadata "$METADATA_PATH" \
    --artifact-dir "$SNAPSHOT_DIR" \
    --expected-repository "$RELEASE_REPOSITORY" \
    --expected-release-ref "refs/tags/$RELEASE_TAG" \
    --expected-signer-workflow "$RELEASE_SIGNER_WORKFLOW" \
    --expected-source-sha "$TAG_SHA" >/dev/null || \
    die "release metadata or artifact digests did not validate"

  ARCHIVE_TOP="$(
    python3 "$WORK_ROOT/validator/deploy/archive_safety.py" "$archive_path"
  )" || die "attested release archive failed the v3 safety contract"
  [[ "$ARCHIVE_TOP" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$ ]] || \
    die "v3 archive validator returned an unsafe top-level name"

  install -d -m 0700 "$WORK_ROOT/payload"
  tar --extract --gzip --no-same-owner --same-permissions \
    --file "$archive_path" --directory "$WORK_ROOT/payload"
  PAYLOAD_ROOT="$WORK_ROOT/payload/$ARCHIVE_TOP"
  [[ -d "$PAYLOAD_ROOT" && ! -L "$PAYLOAD_ROOT" ]] || \
    die "validated release payload root is missing"
  python3 "$WORK_ROOT/validator/deploy/archive_safety.py" \
    verify-tree "$PAYLOAD_ROOT" >/dev/null || \
    die "extracted v3 release payload changed after archive validation"
  python3 "$WORK_ROOT/validator/scripts/release_contract.py" validate-manifest \
    "$PAYLOAD_ROOT/RELEASE_MANIFEST.json" \
    --publishable \
    --expected-repository "$RELEASE_REPOSITORY" \
    --expected-release-ref "refs/tags/$RELEASE_TAG" \
    --expected-signer-workflow "$RELEASE_SIGNER_WORKFLOW" \
    --expected-source-sha "$TAG_SHA" >/dev/null || \
    die "extracted v3 release manifest failed exact-tag validation"
}

run_v3_upgrader() {
  local archive_path checksum_path expected_digest upgrader
  archive_path="$SNAPSHOT_DIR/${ARTIFACT_NAMES[archive]}"
  checksum_path="$SNAPSHOT_DIR/${ARTIFACT_NAMES[checksum]}"
  expected_digest="$(awk 'NR == 1 { print $1 }' "$checksum_path")"
  [[ "$expected_digest" =~ ^[0-9a-f]{64}$ ]] || \
    die "validated checksum sidecar did not contain a SHA-256"
  upgrader="$PAYLOAD_ROOT/deploy/upgrade.sh"
  [[ -x "$upgrader" && ! -L "$upgrader" ]] || \
    die "validated v3 payload has no executable upgrader"

  # Execute the upgrader from the verified v3 payload.  In particular, never
  # dispatch the archive to an already-installed rc.1/v2 upgrader.
  recheck_tag_sha
  "$upgrader" \
    --archive "$archive_path" \
    --sha256 "$expected_digest" \
    "${UPGRADE_ARGS[@]}"
}

main() {
  parse_args "$@"
  [[ "$RELEASE_TAG" =~ ^v[0-9A-Za-z][0-9A-Za-z._-]{0,126}[0-9A-Za-z]$ ]] || \
    die "--tag must be a safe exact v<package-version> tag"
  [[ -n "$METADATA_PATH" ]] || die "--metadata is required"
  [[ "$EUID" -eq 0 ]] || die "verified archive upgrades must run as root"
  command -v gh >/dev/null 2>&1 || die "GitHub CLI (gh) is required"
  command -v python3 >/dev/null 2>&1 || die "python3 is required"
  command -v tar >/dev/null 2>&1 || die "tar is required"

  [[ ! -L "${BASH_SOURCE[0]}" ]] || die "bootstrap must not be invoked through a symlink"
  SCRIPT_PATH="$(readlink -f -- "${BASH_SOURCE[0]}")" || \
    die "unable to resolve the bootstrap path"
  require_regular_file "$SCRIPT_PATH" "release bootstrap"
  [[ ! -L "$METADATA_PATH" ]] || die "release metadata must not be a symlink"
  METADATA_PATH="$(readlink -f -- "$METADATA_PATH")" || \
    die "unable to resolve release metadata path"
  require_regular_file "$METADATA_PATH" "release metadata"
  ARTIFACT_DIR="$(dirname -- "$METADATA_PATH")"
  [[ -d "$ARTIFACT_DIR" && ! -L "$ARTIFACT_DIR" ]] || \
    die "release artifact directory must be a real directory"
  WORK_ROOT="$(mktemp -d -t trex-webui-verified-upgrade.XXXXXXXX)"
  chmod 0700 "$WORK_ROOT"
  [[ "$(stat -c '%u' "$WORK_ROOT")" == "0" ]] || \
    die "verified upgrade work root must be root-owned"
  metadata_size="$(stat -c '%s' "$METADATA_PATH")"
  [[ "$metadata_size" =~ ^[0-9]+$ && "$metadata_size" -ge 1 && \
    "$metadata_size" -le 16777216 ]] || \
    die "release metadata is empty or exceeds 16 MiB"

  resolve_tag_sha
  snapshot_initial_inputs

  # Trust boundary: only these two files are referenced before the attested
  # metadata inventory is parsed.  Both are verified with the fixed repository,
  # signer workflow, tag ref, source digest, and signer digest.
  verify_attestation "$SCRIPT_SNAPSHOT" "release bootstrap snapshot"
  verify_attestation "$METADATA_PATH" "release metadata"
  read_attested_inventory
  snapshot_and_verify_release_assets

  # No archive listing, extraction, or archive-carried code execution occurs
  # above this point.
  validate_metadata_and_archive
  run_v3_upgrader
}

main "$@"
