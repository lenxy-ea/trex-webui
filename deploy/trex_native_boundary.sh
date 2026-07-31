#!/usr/bin/env bash
# Managed by TRex WebUI deploy/install.sh.
set -Eeuo pipefail

NFT_BIN="${TREX_WEBUI_NFT_BIN:-/usr/sbin/nft}"
PYTHON_BIN="${TREX_WEBUI_PYTHON_BIN:-/usr/bin/python3}"
TABLE_FAMILY="inet"
TABLE_NAME="trex_webui_native_boundary"
TABLE_MARKER="Managed by TRex WebUI deploy/install.sh."

usage() {
  cat <<'USAGE'
Usage:
  trex_native_boundary.sh {check|apply|verify|present}
  trex_native_boundary.sh check-service NFTABLES_CONFIG
  trex_native_boundary.sh service-start NFTABLES_CONFIG
  trex_native_boundary.sh service-reload NFTABLES_CONFIG
  trex_native_boundary.sh snapshot SNAPSHOT_FILE
  trex_native_boundary.sh restore SNAPSHOT_FILE

Manage the host boundary for the managed-local TRex native TCP control ports.

Commands:
  check           Validate nftables support and refuse an unowned table; change nothing
  apply           Atomically replace the installer-owned table and verify the result
  verify          Verify the exact installed table, chain, and reject rule
  present         Return success only when an installer-owned table is present
  check-service   Validate an nftables.service config and its atomic reload transaction
  service-start   Load the vendor config and replace the managed boundary in one transaction
  service-reload  Flush, load the vendor config, and restore the boundary in one transaction
  snapshot        Save the exact absent/managed table state to a root-only file
  restore         Restore an absent/managed table snapshot without touching unowned tables
USAGE
}

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

require_runtime() {
  [[ "$(id -u)" -eq 0 ]] || die "root is required to inspect or manage the native TRex boundary"
  [[ -x "$NFT_BIN" ]] || die "nft is required at $NFT_BIN; install the nftables package"
  [[ -x "$PYTHON_BIN" ]] || die "Python is required at $PYTHON_BIN to verify nftables state"
}

desired_table() {
  cat <<EOF
table $TABLE_FAMILY $TABLE_NAME {
  comment "$TABLE_MARKER"

  chain input {
    type filter hook input priority -5; policy accept;
    iifname != "lo" tcp dport { 4500, 4501, 4507 } reject with tcp reset
  }
}
EOF
}

replacement_ruleset() {
  printf 'destroy table %s %s\n' "$TABLE_FAMILY" "$TABLE_NAME"
  desired_table
}

add_ruleset() {
  cat <<EOF
add table $TABLE_FAMILY $TABLE_NAME { comment "$TABLE_MARKER"; }
add chain $TABLE_FAMILY $TABLE_NAME input { type filter hook input priority -5; policy accept; }
add rule $TABLE_FAMILY $TABLE_NAME input iifname != "lo" tcp dport { 4500, 4501, 4507 } reject with tcp reset
EOF
}

table_authority() {
  "$NFT_BIN" -j list tables | "$PYTHON_BIN" -c '
import json
import sys

family, name, marker = sys.argv[1:]
payload = json.load(sys.stdin)
matches = [
    item["table"]
    for item in payload.get("nftables", [])
    if isinstance(item, dict)
    and isinstance(item.get("table"), dict)
    and item["table"].get("family") == family
    and item["table"].get("name") == name
]
if not matches:
    print("absent")
elif len(matches) == 1 and matches[0].get("comment") == marker:
    print("managed")
else:
    print("unmanaged")
' "$TABLE_FAMILY" "$TABLE_NAME" "$TABLE_MARKER"
}

assert_table_authority() {
  local state
  state="$(table_authority)" || die "unable to inspect nftables table authority"
  case "$state" in
    absent|managed)
      ;;
    unmanaged)
      die "refusing to replace unowned nftables table $TABLE_FAMILY $TABLE_NAME"
      ;;
    *)
      die "unexpected nftables table authority result: ${state:-empty}"
      ;;
  esac
}

check_boundary() {
  require_runtime
  assert_table_authority
  replacement_ruleset | "$NFT_BIN" --check --file - || \
    die "nftables rejected the managed-local native-port boundary"
}

verify_boundary() {
  require_runtime
  "$NFT_BIN" -j list table "$TABLE_FAMILY" "$TABLE_NAME" | "$PYTHON_BIN" -c '
import json
import sys

family, name, marker = sys.argv[1:]
payload = json.load(sys.stdin)
objects = payload.get("nftables", [])
tables = [item["table"] for item in objects if isinstance(item, dict) and "table" in item]
chains = [item["chain"] for item in objects if isinstance(item, dict) and "chain" in item]
rules = [item["rule"] for item in objects if isinstance(item, dict) and "rule" in item]

expected_table = {
    "family": family,
    "name": name,
    "comment": marker,
}
if len(tables) != 1 or any(tables[0].get(key) != value for key, value in expected_table.items()):
    raise SystemExit("managed table identity or ownership marker is invalid")

expected_chain = {
    "family": family,
    "table": name,
    "name": "input",
    "type": "filter",
    "hook": "input",
    "prio": -5,
    "policy": "accept",
}
if len(chains) != 1 or any(chains[0].get(key) != value for key, value in expected_chain.items()):
    raise SystemExit("managed input base chain is invalid")

if len(rules) != 1:
    raise SystemExit("managed boundary must contain exactly one rule")
rule = rules[0]
if any(rule.get(key) != value for key, value in {
    "family": family,
    "table": name,
    "chain": "input",
}.items()):
    raise SystemExit("managed reject rule is attached to the wrong chain")

expected_expr = [
    {
        "match": {
            "op": "!=",
            "left": {"meta": {"key": "iifname"}},
            "right": "lo",
        }
    },
    {
        "match": {
            "op": "==",
            "left": {"payload": {"protocol": "tcp", "field": "dport"}},
            "right": {"set": [4500, 4501, 4507]},
        }
    },
    {"reject": {"type": "tcp reset"}},
]
if rule.get("expr") != expected_expr:
    raise SystemExit("managed boundary does not reject exactly TCP 4500/4501/4507 off loopback")
' "$TABLE_FAMILY" "$TABLE_NAME" "$TABLE_MARKER" || \
    die "managed-local native-port boundary verification failed"
}

apply_boundary() {
  check_boundary
  replacement_ruleset | "$NFT_BIN" --file - || \
    die "unable to atomically publish the managed-local native-port boundary"
  verify_boundary
}

present_boundary() {
  require_runtime
  [[ "$(table_authority)" == "managed" ]]
}

assert_service_config() {
  local config_path="$1"
  [[ "$config_path" == /* && "$config_path" != *[[:space:]]* && \
    "$config_path" != *'"'* && \
    "$config_path" != *'\\'* ]] || \
    die "nftables service config path must be a clean absolute path"
  [[ -f "$config_path" && ! -L "$config_path" ]] || \
    die "nftables service config is missing or unsafe: $config_path"
  [[ "$(stat -c '%U:%G' "$config_path")" == "root:root" ]] || \
    die "nftables service config must be owned by root:root: $config_path"
  (( (8#$(stat -c '%a' "$config_path") & 8#022) == 0 )) || \
    die "nftables service config must not be writable by group/other: $config_path"
  "$PYTHON_BIN" - "$config_path" "$TABLE_NAME" <<'PY' || \
    die "nftables service config include graph is unsafe or uses the reserved managed table $TABLE_NAME"
from __future__ import annotations

import glob
import os
import re
import stat
import sys
from pathlib import Path

root = Path(sys.argv[1])
reserved_name = sys.argv[2]
include_re = re.compile(r'^\s*include\s+"([^"]+)"\s*;?\s*$')
visited: set[Path] = set()
total_bytes = 0


def inspect(path: Path) -> None:
    global total_bytes
    if not path.is_absolute():
        raise SystemExit(f"relative nftables include is not supported: {path}")
    path = Path(os.path.normpath(path))
    if path in visited:
        return
    metadata = os.lstat(path)
    if not stat.S_ISREG(metadata.st_mode) or stat.S_ISLNK(metadata.st_mode):
        raise SystemExit(f"nftables config include is not a regular file: {path}")
    if metadata.st_uid != 0 or metadata.st_gid != 0 or stat.S_IMODE(metadata.st_mode) & 0o022:
        raise SystemExit(f"nftables config include lacks root authority: {path}")
    if metadata.st_size > 4 * 1024 * 1024:
        raise SystemExit(f"nftables config include is too large: {path}")
    total_bytes += metadata.st_size
    if total_bytes > 16 * 1024 * 1024:
        raise SystemExit("nftables config include graph is too large")
    visited.add(path)
    content = path.read_text(encoding="utf-8")
    for raw_line in content.splitlines():
        line = raw_line.split("#", 1)[0].strip()
        if not line:
            continue
        if reserved_name in line:
            raise SystemExit(f"nftables config reserves installer-owned table name: {path}")
        match = include_re.fullmatch(line)
        if match is None:
            continue
        pattern = match.group(1)
        if not pattern.startswith("/"):
            raise SystemExit(f"relative nftables include is not supported: {pattern}")
        matches = sorted(glob.glob(pattern))
        if not matches:
            raise SystemExit(f"nftables include does not match a regular file: {pattern}")
        for included in matches:
            inspect(Path(included))


inspect(root)
PY
}

service_start_ruleset() {
  local config_path="$1"
  printf 'include "%s"\n' "$config_path"
  replacement_ruleset
}

service_reload_ruleset() {
  local config_path="$1"
  printf 'flush ruleset\ninclude "%s"\n' "$config_path"
  # `add table` makes an operator config collision abort the whole transaction
  # instead of silently replacing or merging an unowned reserved table.
  add_ruleset
}

check_service_boundary() {
  local config_path="$1"
  require_runtime
  assert_table_authority
  assert_service_config "$config_path"
  service_reload_ruleset "$config_path" | "$NFT_BIN" --check --file - || \
    die "nftables rejected the atomic service-reload boundary transaction"
}

service_start_boundary() {
  local config_path="$1"
  require_runtime
  assert_table_authority
  assert_service_config "$config_path"
  service_start_ruleset "$config_path" | "$NFT_BIN" --check --file - || \
    die "nftables rejected the atomic service-start boundary transaction"
  service_start_ruleset "$config_path" | "$NFT_BIN" --file - || \
    die "unable to atomically load nftables.service with the managed native-port boundary"
  verify_boundary
}

service_reload_boundary() {
  local config_path="$1"
  require_runtime
  assert_table_authority
  assert_service_config "$config_path"
  service_reload_ruleset "$config_path" | "$NFT_BIN" --check --file - || \
    die "nftables rejected the atomic service-reload boundary transaction"
  service_reload_ruleset "$config_path" | "$NFT_BIN" --file - || \
    die "unable to atomically reload nftables.service with the managed native-port boundary"
  verify_boundary
}

assert_snapshot_path() {
  local snapshot_path="$1"
  local parent
  [[ "$snapshot_path" == /* && "$snapshot_path" != *$'\n'* && \
    "$snapshot_path" != *$'\r'* ]] || \
    die "native-boundary snapshot path must be a clean absolute path"
  parent="$(dirname -- "$snapshot_path")"
  [[ -d "$parent" && ! -L "$parent" ]] || \
    die "native-boundary snapshot parent is missing or unsafe: $parent"
  [[ "$(stat -c '%U:%G' "$parent")" == "root:root" ]] || \
    die "native-boundary snapshot parent must be owned by root:root: $parent"
  (( (8#$(stat -c '%a' "$parent") & 8#022) == 0 )) || \
    die "native-boundary snapshot parent must not be writable by group/other: $parent"
  if [[ -e "$snapshot_path" || -L "$snapshot_path" ]]; then
    [[ -f "$snapshot_path" && ! -L "$snapshot_path" ]] || \
      die "native-boundary snapshot target is not a safe regular file: $snapshot_path"
    [[ "$(stat -c '%U:%G' "$snapshot_path")" == "root:root" ]] || \
      die "native-boundary snapshot target must be owned by root:root: $snapshot_path"
    (( (8#$(stat -c '%a' "$snapshot_path") & 8#077) == 0 )) || \
      die "native-boundary snapshot target must have mode 0600 or stricter: $snapshot_path"
  fi
}

snapshot_boundary() {
  local snapshot_path="$1"
  local state parent base staged
  require_runtime
  assert_table_authority
  assert_snapshot_path "$snapshot_path"
  state="$(table_authority)" || die "unable to inspect nftables table authority"
  parent="$(dirname -- "$snapshot_path")"
  base="$(basename -- "$snapshot_path")"
  staged="$(mktemp --tmpdir="$parent" ".${base}.new.XXXXXXXX")"
  trap 'rm -f -- "$staged"' RETURN
  chmod 0600 "$staged"
  {
    printf '# TRex WebUI native boundary snapshot v1: %s\n' "$state"
    if [[ "$state" == "managed" ]]; then
      "$NFT_BIN" list table "$TABLE_FAMILY" "$TABLE_NAME"
    fi
  } >"$staged" || die "unable to capture the managed native-boundary snapshot"
  chown root:root "$staged"
  chmod 0600 "$staged"
  mv -f -- "$staged" "$snapshot_path"
  staged=""
  trap - RETURN
}

verify_restored_snapshot() {
  local snapshot_path="$1"
  local expected_state="$2"
  local observed parent base staged
  observed="$(table_authority)" || die "unable to inspect restored nftables table authority"
  [[ "$observed" == "$expected_state" ]] || \
    die "restored native-boundary authority is $observed, expected $expected_state"
  [[ "$expected_state" == "managed" ]] || return 0

  parent="$(dirname -- "$snapshot_path")"
  base="$(basename -- "$snapshot_path")"
  staged="$(mktemp --tmpdir="$parent" ".${base}.verify.XXXXXXXX")"
  trap 'rm -f -- "$staged"' RETURN
  "$NFT_BIN" list table "$TABLE_FAMILY" "$TABLE_NAME" >"$staged" || \
    die "unable to inspect the restored managed native-boundary table"
  cmp -s "$staged" <(tail -n +2 "$snapshot_path") || \
    die "restored managed native-boundary table does not match the captured ruleset"
  rm -f -- "$staged"
  staged=""
  trap - RETURN
}

restore_boundary() {
  local snapshot_path="$1"
  local header state
  require_runtime
  assert_snapshot_path "$snapshot_path"
  [[ -s "$snapshot_path" ]] || die "native-boundary snapshot is empty: $snapshot_path"
  header="$(head -n 1 "$snapshot_path")"
  case "$header" in
    '# TRex WebUI native boundary snapshot v1: absent')
      state="absent"
      [[ "$(wc -l <"$snapshot_path")" -eq 1 ]] || \
        die "absent native-boundary snapshot contains unexpected rules"
      ;;
    '# TRex WebUI native boundary snapshot v1: managed')
      state="managed"
      grep -Fq "table $TABLE_FAMILY $TABLE_NAME {" "$snapshot_path" || \
        die "managed native-boundary snapshot has the wrong table identity"
      grep -Fq "comment \"$TABLE_MARKER\"" "$snapshot_path" || \
        die "managed native-boundary snapshot has no ownership marker"
      ;;
    *)
      die "native-boundary snapshot header is invalid"
      ;;
  esac

  assert_table_authority
  if [[ "$state" == "absent" ]]; then
    printf 'destroy table %s %s\n' "$TABLE_FAMILY" "$TABLE_NAME" | \
      "$NFT_BIN" --check --file - || \
      die "nftables rejected the absent native-boundary rollback"
    printf 'destroy table %s %s\n' "$TABLE_FAMILY" "$TABLE_NAME" | \
      "$NFT_BIN" --file - || \
      die "unable to restore the previously absent native-boundary state"
  else
    {
      printf 'destroy table %s %s\n' "$TABLE_FAMILY" "$TABLE_NAME"
      tail -n +2 "$snapshot_path"
    } | "$NFT_BIN" --check --file - || \
      die "nftables rejected the captured managed native-boundary ruleset"
    {
      printf 'destroy table %s %s\n' "$TABLE_FAMILY" "$TABLE_NAME"
      tail -n +2 "$snapshot_path"
    } | "$NFT_BIN" --file - || \
      die "unable to restore the captured managed native-boundary ruleset"
  fi
  verify_restored_snapshot "$snapshot_path" "$state"
}

main() {
  local command="${1:-}"
  case "$command" in
    check)
      [[ $# -eq 1 ]] || { usage >&2; exit 2; }
      check_boundary
      ;;
    apply)
      [[ $# -eq 1 ]] || { usage >&2; exit 2; }
      apply_boundary
      ;;
    verify)
      [[ $# -eq 1 ]] || { usage >&2; exit 2; }
      verify_boundary
      ;;
    present)
      [[ $# -eq 1 ]] || { usage >&2; exit 2; }
      present_boundary
      ;;
    check-service)
      [[ $# -eq 2 ]] || { usage >&2; exit 2; }
      check_service_boundary "$2"
      ;;
    service-start)
      [[ $# -eq 2 ]] || { usage >&2; exit 2; }
      service_start_boundary "$2"
      ;;
    service-reload)
      [[ $# -eq 2 ]] || { usage >&2; exit 2; }
      service_reload_boundary "$2"
      ;;
    snapshot)
      [[ $# -eq 2 ]] || { usage >&2; exit 2; }
      snapshot_boundary "$2"
      ;;
    restore)
      [[ $# -eq 2 ]] || { usage >&2; exit 2; }
      restore_boundary "$2"
      ;;
    -h|--help)
      [[ $# -eq 1 ]] || { usage >&2; exit 2; }
      usage
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
}

main "$@"
