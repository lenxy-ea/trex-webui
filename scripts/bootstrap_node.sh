#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

NODE_VERSION="24.16.0"
NODE_PLATFORM="linux-x64"
NODE_DIRECTORY="node-v${NODE_VERSION}-${NODE_PLATFORM}"
NODE_ARCHIVE="${NODE_DIRECTORY}.tar.xz"
NODE_DOWNLOAD_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_ARCHIVE}"
# Retrieved from the official Node.js release checksum manifest on 2026-07-31:
# https://nodejs.org/dist/v24.16.0/SHASUMS256.txt
NODE_ARCHIVE_SHA256="d804845d34eddc21dc1092b519d643ef40b1f58ec5dec5c22b1f4bd8fabde6c9"

TOOLS_ROOT="$PROJECT_ROOT/.tools"
TOOLCHAIN_ROOT="$TOOLS_ROOT/$NODE_DIRECTORY"
CACHED_ARCHIVE="$TOOLS_ROOT/$NODE_ARCHIVE"
STAGING_ROOT=""

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

cleanup() {
  local status=$?
  trap - EXIT
  if [[ -n "$STAGING_ROOT" && -d "$STAGING_ROOT" ]]; then
    rm -rf -- "$STAGING_ROOT"
  fi
  exit "$status"
}

trap cleanup EXIT

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "$1 is required"
}

verify_archive() {
  local archive="$1"
  [[ -f "$archive" && ! -L "$archive" ]] || return 1
  printf '%s  %s\n' "$NODE_ARCHIVE_SHA256" "$archive" | sha256sum --check --status
}

verify_toolchain() {
  local root="$1"
  local node_version npm_version
  [[ -d "$root" && ! -L "$root" ]] || return 1
  [[ -x "$root/bin/node" && -x "$root/bin/npm" ]] || return 1
  node_version="$("$root/bin/node" --version 2>/dev/null)" || return 1
  npm_version="$(PATH="$root/bin:$PATH" "$root/bin/npm" --version 2>/dev/null)" || return 1
  [[ "$node_version" == "v$NODE_VERSION" && "$npm_version" =~ ^11([.][0-9]+){1,2}$ ]]
}

download_archive() {
  local destination="$1"
  if command -v curl >/dev/null 2>&1; then
    curl \
      --fail \
      --location \
      --proto '=https' \
      --show-error \
      --silent \
      --tlsv1.2 \
      --output "$destination" \
      "$NODE_DOWNLOAD_URL"
  elif command -v wget >/dev/null 2>&1; then
    wget \
      --https-only \
      --output-document="$destination" \
      "$NODE_DOWNLOAD_URL"
  else
    die "curl or wget is required to download Node.js"
  fi
}

main() {
  [[ "$(uname -s)" == "Linux" ]] || die "this bootstrap supports Linux x64 only"
  case "$(uname -m)" in
    x86_64|amd64)
      ;;
    *)
      die "this bootstrap supports Linux x64 only"
      ;;
  esac

  require_command sha256sum
  require_command tar

  if verify_toolchain "$TOOLCHAIN_ROOT"; then
    printf 'Node.js v%s toolchain is already installed at %s\n' \
      "$NODE_VERSION" "$TOOLCHAIN_ROOT"
    return
  fi
  if [[ -e "$TOOLCHAIN_ROOT" || -L "$TOOLCHAIN_ROOT" ]]; then
    die "existing Node.js toolchain is incomplete or invalid: $TOOLCHAIN_ROOT"
  fi
  if [[ -L "$TOOLS_ROOT" ]]; then
    die "tool directory must not be a symbolic link: $TOOLS_ROOT"
  fi
  if [[ -e "$TOOLS_ROOT" && ! -d "$TOOLS_ROOT" ]]; then
    die "tool path is not a directory: $TOOLS_ROOT"
  fi
  mkdir -p -- "$TOOLS_ROOT"

  if [[ -e "$CACHED_ARCHIVE" || -L "$CACHED_ARCHIVE" ]]; then
    verify_archive "$CACHED_ARCHIVE" || \
      die "cached Node.js archive failed the pinned SHA-256 check: $CACHED_ARCHIVE"
    printf 'Using verified cached archive %s\n' "$CACHED_ARCHIVE"
  else
    STAGING_ROOT="$(mktemp -d "$TOOLS_ROOT/.node-bootstrap.XXXXXX")"
    local downloaded_archive="$STAGING_ROOT/$NODE_ARCHIVE"
    printf 'Downloading %s\n' "$NODE_DOWNLOAD_URL"
    download_archive "$downloaded_archive"
    verify_archive "$downloaded_archive" || \
      die "downloaded Node.js archive failed the pinned SHA-256 check"
    mv -- "$downloaded_archive" "$CACHED_ARCHIVE"
    rmdir -- "$STAGING_ROOT"
    STAGING_ROOT=""
  fi

  STAGING_ROOT="$(mktemp -d "$TOOLS_ROOT/.node-bootstrap.XXXXXX")"
  tar \
    --extract \
    --xz \
    --file "$CACHED_ARCHIVE" \
    --directory "$STAGING_ROOT" \
    --no-same-owner \
    --no-same-permissions
  verify_toolchain "$STAGING_ROOT/$NODE_DIRECTORY" || \
    die "extracted Node.js toolchain failed its version checks"
  [[ ! -e "$TOOLCHAIN_ROOT" && ! -L "$TOOLCHAIN_ROOT" ]] || \
    die "Node.js toolchain path appeared during installation: $TOOLCHAIN_ROOT"
  mv -- "$STAGING_ROOT/$NODE_DIRECTORY" "$TOOLCHAIN_ROOT"
  rmdir -- "$STAGING_ROOT"
  STAGING_ROOT=""

  printf 'Installed Node.js v%s at %s\n' "$NODE_VERSION" "$TOOLCHAIN_ROOT"
  printf 'Pinned checksum source: %s\n' \
    "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt"
}

main "$@"
