#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TEST_ROOT="$(mktemp -d -t trex-webui-public-source-test.XXXXXX)"

cleanup() {
  local status=$?
  trap - EXIT
  rm -rf -- "$TEST_ROOT"
  exit "$status"
}
trap cleanup EXIT

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

expect_failure() {
  local expected="$1"
  shift
  local output
  if output=$("$@" 2>&1); then
    fail "command unexpectedly succeeded: $*"
  fi
  [[ "$output" == *"$expected"* ]] || \
    fail "failure did not contain '$expected': $output"
}

SAFE_ROOT="$TEST_ROOT/safe"
mkdir -p "$SAFE_ROOT/docs" "$SAFE_ROOT/examples"
printf '%s\n' \
  'Local API: 127.0.0.1' \
  'Documentation peer: 192.0.2.1' \
  'Unspecified MAC: 00:00:00:00:00:00' \
  >"$SAFE_ROOT/README.md"
printf 'port_limit: 0\ninterfaces: []\n' >"$SAFE_ROOT/examples/trex_cfg.yaml"
python3 "$PROJECT_ROOT/scripts/check_public_source.py" "$SAFE_ROOT" >/dev/null

PRIVATE_ROOT="$TEST_ROOT/private-address"
mkdir -p "$PRIVATE_ROOT/src"
printf 'MANAGEMENT_ADDRESS = "%s%s"\n' "10.23." "45.67" \
  >"$PRIVATE_ROOT/src/settings.py"
expect_failure "outside the exact source-scope values" \
  python3 "$PROJECT_ROOT/scripts/check_public_source.py" "$PRIVATE_ROOT"

MAC_ROOT="$TEST_ROOT/global-mac"
mkdir -p "$MAC_ROOT/docs"
printf 'adapter: %s%s\n' "00:1b:21:" "11:22:33" >"$MAC_ROOT/docs/hardware.md"
expect_failure "outside the exact source-scope values" \
  python3 "$PROJECT_ROOT/scripts/check_public_source.py" "$MAC_ROOT"

PCI_ROOT="$TEST_ROOT/pci"
mkdir -p "$PCI_ROOT/examples"
printf 'interfaces: ["%s%s"]\n' "0000:81:" "00.0" >"$PCI_ROOT/examples/trex_cfg.yaml"
expect_failure "outside the exact source-scope values" \
  python3 "$PROJECT_ROOT/scripts/check_public_source.py" "$PCI_ROOT"

LOCAL_MAC_ROOT="$TEST_ROOT/unlisted-local-mac"
mkdir -p "$LOCAL_MAC_ROOT/tests"
printf 'fixture: %s%s\n' "0a:16:3e:" "aa:bb:cc" >"$LOCAL_MAC_ROOT/tests/data.txt"
expect_failure "outside the exact source-scope values" \
  python3 "$PROJECT_ROOT/scripts/check_public_source.py" "$LOCAL_MAC_ROOT"

POLICY_ROOT="$TEST_ROOT/policy"
mkdir -p "$POLICY_ROOT/tests"
fixture_ipv4="10.23.""45.67"
fixture_mac="0a:16:3e:""aa:bb:cc"
fixture_bdf="0000:81:""00.0"
printf 'peer: %s%s\nadapter: %s%s\ninterface: %s%s\n' \
  "10.23." "45.67" \
  "0a:16:3e:" "aa:bb:cc" \
  "0000:81:" "00.0" \
  >"$POLICY_ROOT/tests/fixture.txt"
printf '%s\n' \
  '{' \
  '  "version": 2,' \
  '  "scopes": [' \
  '    {' \
  '      "bindings": {' \
  '        "tests/fixture.txt": {' \
  "          \"ipv4\": [\"$fixture_ipv4\"]," \
  "          \"mac\": [\"$fixture_mac\"]," \
  "          \"pci_bdf\": [\"$fixture_bdf\"]" \
  '        }' \
  '      },' \
  '      "reason": "Deterministic scanner policy fixture identifiers."' \
  '    }' \
  '  ],' \
  '  "generated_scopes": []' \
  '}' \
  >"$POLICY_ROOT/public-source-policy.json"
python3 "$PROJECT_ROOT/scripts/check_public_source.py" "$POLICY_ROOT" >/dev/null

LEGACY_POLICY_ROOT="$TEST_ROOT/legacy-policy"
mkdir -p "$LEGACY_POLICY_ROOT/tests"
printf 'peer: %s\n' "$fixture_ipv4" >"$LEGACY_POLICY_ROOT/tests/fixture.txt"
printf '%s\n' \
  '{' \
  '  "version": 1,' \
  "  \"allowlist\": {\"ipv4\": [\"$fixture_ipv4\"], \"mac\": [], \"pci_bdf\": []}," \
  '  "scopes": [],' \
  '  "generated_scopes": []' \
  '}' \
  >"$LEGACY_POLICY_ROOT/public-source-policy.json"
expect_failure "version must be 2" \
  python3 "$PROJECT_ROOT/scripts/check_public_source.py" "$LEGACY_POLICY_ROOT"

UNSCOPED_ROOT="$TEST_ROOT/unscoped-policy"
cp -a "$POLICY_ROOT" "$UNSCOPED_ROOT"
printf 'peer: %s\n' "$fixture_ipv4" >"$UNSCOPED_ROOT/tests/unscoped.txt"
expect_failure "tests/unscoped.txt" \
  python3 "$PROJECT_ROOT/scripts/check_public_source.py" "$UNSCOPED_ROOT"

printf 'second peer: %s%s\n' "10.23." "45.68" >>"$POLICY_ROOT/tests/fixture.txt"
expect_failure "45.68" \
  python3 "$PROJECT_ROOT/scripts/check_public_source.py" "$POLICY_ROOT"

STALE_POLICY_ROOT="$TEST_ROOT/stale-policy"
mkdir -p "$STALE_POLICY_ROOT/tests"
printf 'peer: %s%s\n' "10.23." "45.67" >"$STALE_POLICY_ROOT/tests/fixture.txt"
stale_ipv4="10.23.""45.68"
printf '%s\n' \
  '{' \
  '  "version": 2,' \
  '  "scopes": [' \
  '    {' \
  '      "bindings": {' \
  '        "tests/fixture.txt": {' \
  "          \"ipv4\": [\"$fixture_ipv4\", \"$stale_ipv4\"]" \
  '        }' \
  '      },' \
  '      "reason": "Deterministic scanner policy fixture identifiers."' \
  '    }' \
  '  ],' \
  '  "generated_scopes": []' \
  '}' \
  >"$STALE_POLICY_ROOT/public-source-policy.json"
expect_failure "unused exact ipv4 value" \
  python3 "$PROJECT_ROOT/scripts/check_public_source.py" "$STALE_POLICY_ROOT"

CROSS_SCOPE_ROOT="$TEST_ROOT/cross-scope"
mkdir -p "$CROSS_SCOPE_ROOT/tests"
fixture_ipv4_second="10.23.""45.68"
printf 'peer: %s\n' "$fixture_ipv4" >"$CROSS_SCOPE_ROOT/tests/a.txt"
printf 'peer: %s\n' "$fixture_ipv4_second" >"$CROSS_SCOPE_ROOT/tests/b.txt"
printf '%s\n' \
  '{' \
  '  "version": 2,' \
  '  "scopes": [' \
  '    {' \
  '      "bindings": {' \
  "        \"tests/a.txt\": {\"ipv4\": [\"$fixture_ipv4\"]}," \
  "        \"tests/b.txt\": {\"ipv4\": [\"$fixture_ipv4_second\"]}" \
  '      },' \
  '      "reason": "Each scanner fixture value is bound to one exact source path."' \
  '    }' \
  '  ],' \
  '  "generated_scopes": []' \
  '}' \
  >"$CROSS_SCOPE_ROOT/public-source-policy.json"
python3 "$PROJECT_ROOT/scripts/check_public_source.py" "$CROSS_SCOPE_ROOT" >/dev/null

printf 'peer: %s\n' "$fixture_ipv4_second" >"$CROSS_SCOPE_ROOT/tests/a.txt"
printf 'peer: %s\n' "$fixture_ipv4" >"$CROSS_SCOPE_ROOT/tests/b.txt"
expect_failure "tests/a.txt" \
  python3 "$PROJECT_ROOT/scripts/check_public_source.py" "$CROSS_SCOPE_ROOT"

printf 'peer: %s\n' "$fixture_ipv4" >"$CROSS_SCOPE_ROOT/tests/a.txt"
printf 'peer: %s\nrelocated: %s\n' \
  "$fixture_ipv4_second" "$fixture_ipv4" >"$CROSS_SCOPE_ROOT/tests/b.txt"
expect_failure "tests/b.txt" \
  python3 "$PROJECT_ROOT/scripts/check_public_source.py" "$CROSS_SCOPE_ROOT"

PARTIAL_ROOT="$TEST_ROOT/partial-package"
mkdir -p "$PARTIAL_ROOT/apps/web/dist/assets"
printf 'const peer="%s";const mac="%s";\n' \
  "$fixture_ipv4" "$fixture_mac" \
  >"$PARTIAL_ROOT/apps/web/dist/assets/index-fixture.js"
printf '%s\n' \
  '{' \
  '  "version": 2,' \
  '  "scopes": [' \
  '    {' \
  '      "bindings": {' \
  '        "src/source-fixture.ts": {' \
  "          \"ipv4\": [\"$fixture_ipv4\"]," \
  "          \"mac\": [\"$fixture_mac\"]," \
  "          \"pci_bdf\": [\"$fixture_bdf\"]" \
  '        }' \
  '      },' \
  '      "reason": "Canonical source fixture omitted from the package subset."' \
  '    }' \
  '  ],' \
  '  "generated_scopes": [' \
  '    {' \
  '      "pattern": "apps/web/dist/assets/*.js",' \
  '      "values": {' \
  "        \"ipv4\": [\"$fixture_ipv4\"]," \
  "        \"mac\": [\"$fixture_mac\"]" \
  '      },' \
  '      "reason": "Generated bundle carries exact source-approved fixture identifiers."' \
  '    }' \
  '  ]' \
  '}' \
  >"$PARTIAL_ROOT/public-source-policy.json"
expect_failure "existing regular file" \
  python3 "$PROJECT_ROOT/scripts/check_public_source.py" "$PARTIAL_ROOT"
python3 "$PROJECT_ROOT/scripts/check_public_source.py" \
  --partial-tree "$PARTIAL_ROOT" >/dev/null

printf 'const extraPeer="%s%s";\n' "10.23." "45.68" \
  >>"$PARTIAL_ROOT/apps/web/dist/assets/index-fixture.js"
expect_failure "45.68" \
  python3 "$PROJECT_ROOT/scripts/check_public_source.py" \
    --partial-tree "$PARTIAL_ROOT"

SECRET_ROOT="$TEST_ROOT/secret"
mkdir -p "$SECRET_ROOT"
printf '%s%s\n' "ghp_" "abcdefghijklmnopqrstuvwxyz012345" >"$SECRET_ROOT/token.txt"
expect_failure "possible GitHub token" \
  python3 "$PROJECT_ROOT/scripts/check_public_source.py" "$SECRET_ROOT"

LARGE_ROOT="$TEST_ROOT/large"
mkdir -p "$LARGE_ROOT"
truncate -s 4194305 "$LARGE_ROOT/unchecked.txt"
expect_failure "content scan limit" \
  python3 "$PROJECT_ROOT/scripts/check_public_source.py" "$LARGE_ROOT"

LINK_ROOT="$TEST_ROOT/link"
mkdir -p "$LINK_ROOT"
ln -s /etc/passwd "$LINK_ROOT/passwd"
expect_failure "symbolic links are not allowed" \
  python3 "$PROJECT_ROOT/scripts/check_public_source.py" "$LINK_ROOT"

INTERNAL_ROOT="$TEST_ROOT/internal"
mkdir -p "$INTERNAL_ROOT/.pensieve"
printf 'internal\n' >"$INTERNAL_ROOT/.pensieve/note.md"
expect_failure "internal-only path" \
  python3 "$PROJECT_ROOT/scripts/check_public_source.py" "$INTERNAL_ROOT"

printf 'Public source validation tests passed.\n'
