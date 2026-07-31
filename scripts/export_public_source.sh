#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUT_DIR="$PROJECT_ROOT/dist/public-source"
ALLOW_DIRTY=0

usage() {
  cat <<'USAGE'
Usage: scripts/export_public_source.sh [options]

Create a deterministic source archive from the current commit. Git attributes
exclude private development knowledge and agent tooling, and the exported tree
is scanned before publication.

Options:
  --output-dir PATH  Output directory. Default: dist/public-source
  --allow-dirty      Export HEAD while local changes exist (never for a release)
  -h, --help         Show this help
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
    --allow-dirty)
      ALLOW_DIRTY=1
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

git -C "$PROJECT_ROOT" rev-parse --verify HEAD >/dev/null 2>&1 ||
  die "a Git checkout with a valid HEAD is required"
if [[ "$ALLOW_DIRTY" -eq 0 ]] && [[ -n "$(git -C "$PROJECT_ROOT" status --porcelain)" ]]; then
  die "public source export requires a clean checkout"
fi

version="$(
  git -C "$PROJECT_ROOT" show HEAD:package.json |
    sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' |
    head -1
)"
[[ -n "$version" ]] || die "unable to read package version from HEAD"
commit="$(git -C "$PROJECT_ROOT" rev-parse --short=12 HEAD)"
source_epoch="$(git -C "$PROJECT_ROOT" show -s --format=%ct HEAD)"
archive_name="trex-webui-${version}-source-${commit}"

mkdir -p "$OUTPUT_DIR"
OUTPUT_DIR="$(cd "$OUTPUT_DIR" && pwd)"
archive_path="$OUTPUT_DIR/$archive_name.tar.gz"
checksum_path="$archive_path.sha256"
[[ ! -e "$archive_path" && ! -L "$archive_path" ]] ||
  die "output already exists: $archive_path"
[[ ! -e "$checksum_path" && ! -L "$checksum_path" ]] ||
  die "output already exists: $checksum_path"

staging_root="$(mktemp -d -t trex-webui-public-source.XXXXXX)"
archive_tmp="$(mktemp --tmpdir="$OUTPUT_DIR" ".${archive_name}.tar.gz.XXXXXXXX")"
checksum_tmp="$(mktemp --tmpdir="$OUTPUT_DIR" ".${archive_name}.sha256.XXXXXXXX")"
cleanup() {
  status=$?
  trap - EXIT
  rm -rf -- "$staging_root"
  rm -f -- "$archive_tmp" "$checksum_tmp"
  exit "$status"
}
trap cleanup EXIT

git -C "$PROJECT_ROOT" archive --format=tar --prefix="$archive_name/" HEAD |
  tar -xf - -C "$staging_root"
find "$staging_root/$archive_name" -type d -exec chmod 0755 '{}' +
find "$staging_root/$archive_name" -type f -perm /111 -exec chmod 0755 '{}' +
find "$staging_root/$archive_name" -type f ! -perm /111 -exec chmod 0644 '{}' +
python3.11 "$PROJECT_ROOT/scripts/check_public_source.py" \
  "$staging_root/$archive_name"

tar --sort=name \
  --mtime="@$source_epoch" \
  --owner=0 \
  --group=0 \
  --numeric-owner \
  -C "$staging_root" \
  -cf - "$archive_name" |
  gzip -n -9 >"$archive_tmp"

digest="$(sha256sum "$archive_tmp")"
digest="${digest%% *}"
printf '%s  %s\n' "$digest" "$(basename "$archive_path")" >"$checksum_tmp"
chmod 0644 "$archive_tmp" "$checksum_tmp"
mv "$archive_tmp" "$archive_path"
archive_tmp=""
mv "$checksum_tmp" "$checksum_path"
checksum_tmp=""
printf 'Public source archive: %s\n' "$archive_path"
printf 'SHA-256: %s\n' "$digest"
