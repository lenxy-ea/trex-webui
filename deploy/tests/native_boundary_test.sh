#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BOUNDARY="$PROJECT_ROOT/deploy/trex_native_boundary.sh"
PYTHON_BIN="/usr/bin/python3"

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

run_netns_probe() (
  set -Eeuo pipefail
  local probe_root server_pid="" peer_pid="" reload_probe_pid=""
  probe_root="$(mktemp -d -t trex-native-boundary-netns.XXXXXX)"
  cleanup_netns_probe() {
    local status=$?
    trap - EXIT
    set +e
    [[ -z "$server_pid" ]] || kill "$server_pid" >/dev/null 2>&1
    [[ -z "$server_pid" ]] || wait "$server_pid" >/dev/null 2>&1
    [[ -z "$peer_pid" ]] || kill "$peer_pid" >/dev/null 2>&1
    [[ -z "$peer_pid" ]] || wait "$peer_pid" >/dev/null 2>&1
    [[ -z "$reload_probe_pid" ]] || kill "$reload_probe_pid" >/dev/null 2>&1
    [[ -z "$reload_probe_pid" ]] || wait "$reload_probe_pid" >/dev/null 2>&1
    rm -rf -- "$probe_root"
    exit "$status"
  }
  trap cleanup_netns_probe EXIT

  ip link set lo up
  "$BOUNDARY" apply
  "$BOUNDARY" verify
  cat >"$probe_root/nftables.conf" <<'EOF'
table inet operator_rules {
  chain input {
    type filter hook input priority 0; policy accept;
  }
}
EOF
  chown root:root "$probe_root/nftables.conf"
  chmod 0600 "$probe_root/nftables.conf"
  "$BOUNDARY" check-service "$probe_root/nftables.conf"

  unshare --net -- sleep 30 &
  peer_pid=$!
  for _ in $(seq 1 50); do
    [[ -e "/proc/$peer_pid/ns/net" ]] && break
    sleep 0.02
  done
  [[ -e "/proc/$peer_pid/ns/net" ]] || fail "peer network namespace did not start"

  ip link add trex-host type veth peer name trex-peer
  ip link set trex-peer netns "$peer_pid"
  ip address add 192.0.2.1/30 dev trex-host
  ip link set trex-host up
  nsenter --target "$peer_pid" --net ip link set lo up
  nsenter --target "$peer_pid" --net ip address add 192.0.2.2/30 dev trex-peer
  nsenter --target "$peer_pid" --net ip link set trex-peer up

  "$PYTHON_BIN" - "$probe_root/ready" <<'PY' &
from __future__ import annotations

import select
import socket
import sys
from pathlib import Path

sockets: list[socket.socket] = []
for port in (4500, 4501, 4507):
    listener = socket.socket()
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    listener.bind(("0.0.0.0", port))
    listener.listen()
    sockets.append(listener)
Path(sys.argv[1]).write_text("ready\n", encoding="utf-8")
while True:
    readable, _, _ = select.select(sockets, [], [])
    for listener in readable:
        connection, _ = listener.accept()
        connection.close()
PY
  server_pid=$!
  for _ in $(seq 1 100); do
    [[ -s "$probe_root/ready" ]] && break
    sleep 0.02
  done
  [[ -s "$probe_root/ready" ]] || fail "isolated native-port listeners did not start"

  "$PYTHON_BIN" - <<'PY' || fail "loopback clients could not reach all native ports"
import socket

for port in (4500, 4501, 4507):
    with socket.create_connection(("127.0.0.1", port), timeout=1):
        pass
PY

  if nsenter --target "$peer_pid" --net "$PYTHON_BIN" - <<'PY'
import socket

reachable = []
for port in (4500, 4501, 4507):
    try:
        with socket.create_connection(("192.0.2.1", port), timeout=1):
            reachable.append(port)
    except OSError:
        pass
if reachable:
    raise SystemExit(f"non-loopback peer reached protected native ports: {reachable}")
PY
  then
    :
  else
    fail "isolated non-loopback rejection probe failed"
  fi

  nsenter --target "$peer_pid" --net "$PYTHON_BIN" - \
    "$probe_root/reload-probe.stop" "$probe_root/reload-probe.success" <<'PY' &
from __future__ import annotations

import socket
import sys
from pathlib import Path

stop_path = Path(sys.argv[1])
success_path = Path(sys.argv[2])
while not stop_path.exists():
    for port in (4500, 4501, 4507):
        try:
            with socket.create_connection(("192.0.2.1", port), timeout=0.05):
                success_path.write_text(f"{port}\n", encoding="utf-8")
        except OSError:
            pass
PY
  reload_probe_pid=$!
  for _ in $(seq 1 30); do
    "$BOUNDARY" service-reload "$probe_root/nftables.conf"
  done
  : >"$probe_root/reload-probe.stop"
  wait "$reload_probe_pid"
  reload_probe_pid=""
  [[ ! -e "$probe_root/reload-probe.success" ]] || \
    fail "non-loopback listener became reachable during an atomic nftables reload"
  /usr/sbin/nft list table inet operator_rules >/dev/null || \
    fail "nftables service reload did not retain the operator-owned main config"

  # Exact restoration of a previously absent boundary is only safe after the
  # daemon and every native listener are gone.
  kill "$server_pid" >/dev/null 2>&1 || true
  wait "$server_pid" || true
  server_pid=""

  # Exercise the installer transaction itself: a later failure must restore
  # both an absent table and a previously managed (but older) exact ruleset.
  # shellcheck source=deploy/install.sh
  source "$PROJECT_ROOT/deploy/install.sh"
  trap cleanup_netns_probe EXIT
  DRY_RUN=0
  MANAGE_LOCAL_DAEMON=1
  RUN_RESTART=1
  NFTABLES_CONFIG_PATH="$probe_root/nftables.conf"
  NATIVE_BOUNDARY_SNAPSHOT_ROOT="$probe_root"
  systemctl() {
    if [[ "$*" == "show nftables.service --property=LoadState --value" ]]; then
      printf 'loaded\n'
      return 0
    fi
    if [[ "$*" == "show nftables.service --property=ExecStart --value" ]]; then
      printf '{ path=/sbin/nft ; argv[]=/sbin/nft -f %s ; }\n' "$NFTABLES_CONFIG_PATH"
      return 0
    fi
    if [[ "$*" == "show nftables.service --property=ExecReload --value" ]]; then
      printf '{ path=/sbin/nft ; argv[]=/sbin/nft flush ruleset; include "%s"; ; }\n' \
        "$NFTABLES_CONFIG_PATH"
      return 0
    fi
    if [[ "$*" == "is-active --quiet trex-daemon-server.service" ]]; then
      return 1
    fi
    if [[ "$*" == "show trex-daemon-server.service --property=ActiveState --value" ]]; then
      printf 'inactive\n'
      return 0
    fi
    return 1
  }
  rollback_probe() {
    NATIVE_BOUNDARY_SNAPSHOT=""
    NATIVE_BOUNDARY_SNAPSHOT_CAPTURED=0
    NATIVE_BOUNDARY_RUNTIME_MUTATED=0
    preflight_native_boundary
    "$BOUNDARY" apply
    NATIVE_BOUNDARY_RUNTIME_MUTATED=1
    restore_native_boundary_snapshot
    rm -f -- "$NATIVE_BOUNDARY_SNAPSHOT"
    NATIVE_BOUNDARY_SNAPSHOT=""
    NATIVE_BOUNDARY_SNAPSHOT_CAPTURED=0
  }

  /usr/sbin/nft flush ruleset
  rollback_probe
  if "$BOUNDARY" present; then
    fail "failed install rollback did not restore a previously absent boundary"
  fi

  /usr/sbin/nft -f - <<EOF
table inet trex_webui_native_boundary {
  comment "Managed by TRex WebUI deploy/install.sh."
  chain legacy_input {
    type filter hook input priority -7; policy accept;
    tcp dport 4999 drop
  }
}
EOF
  /usr/sbin/nft list table inet trex_webui_native_boundary \
    >"$probe_root/prior-managed.rules"
  rollback_probe
  /usr/sbin/nft list table inet trex_webui_native_boundary \
    >"$probe_root/restored-managed.rules"
  cmp -s "$probe_root/prior-managed.rules" "$probe_root/restored-managed.rules" || \
    fail "failed install rollback did not restore the exact prior managed ruleset"
)

if [[ "${1:-}" == "--netns-probe" ]]; then
  [[ "$(id -u)" -eq 0 ]] || fail "network namespace probe must run as root"
  run_netns_probe
  printf 'PASS: native listeners stay confined through atomic reload and install rollback restores exact prior state\n'
  exit 0
fi

[[ "$(id -u)" -eq 0 ]] || fail "native boundary test must run as root"
[[ -f "$BOUNDARY" && ! -L "$BOUNDARY" && -x "$BOUNDARY" ]] || \
  fail "native boundary runtime is missing, unsafe, or not executable"

TEST_ROOT="$(mktemp -d -t trex-native-boundary-test.XXXXXX)"
cleanup() {
  local status=$?
  trap - EXIT
  rm -rf -- "$TEST_ROOT"
  exit "$status"
}
trap cleanup EXIT

FAKE_NFT="$TEST_ROOT/nft"
FAKE_NFT_STATE="$TEST_ROOT/state"
FAKE_NFT_LOG="$TEST_ROOT/nft.log"
SERVICE_CONFIG="$TEST_ROOT/nftables.conf"
export FAKE_NFT_STATE FAKE_NFT_LOG
printf '# operator nftables fixture\n' >"$SERVICE_CONFIG"
chown root:root "$SERVICE_CONFIG"
chmod 0600 "$SERVICE_CONFIG"

cat >"$FAKE_NFT" <<'FAKE'
#!/usr/bin/env bash
set -Eeuo pipefail

state="$(<"$FAKE_NFT_STATE")"
case "$*" in
  "-j list tables")
    case "$state" in
      absent)
        printf '%s\n' '{"nftables":[{"metainfo":{"json_schema_version":1}}]}'
        ;;
      managed)
        printf '%s\n' '{"nftables":[{"metainfo":{"json_schema_version":1}},{"table":{"family":"inet","name":"trex_webui_native_boundary","handle":1,"comment":"Managed by TRex WebUI deploy/install.sh."}}]}'
        ;;
      unmanaged)
        printf '%s\n' '{"nftables":[{"metainfo":{"json_schema_version":1}},{"table":{"family":"inet","name":"trex_webui_native_boundary","handle":1,"comment":"owned by another administrator"}}]}'
        ;;
      *)
        exit 1
        ;;
    esac
    ;;
  "--check --file -")
    payload="$(cat)"
    printf 'check\n%s\n' "$payload" >>"$FAKE_NFT_LOG"
    [[ "${FAKE_NFT_FAIL_CHECK:-0}" -eq 0 ]]
    ;;
  "--file -")
    payload="$(cat)"
    printf 'apply\n%s\n' "$payload" >>"$FAKE_NFT_LOG"
    printf 'managed\n' >"$FAKE_NFT_STATE"
    ;;
  "-j list table inet trex_webui_native_boundary")
    [[ "$state" == "managed" ]] || exit 1
    printf '%s\n' '{"nftables":[{"metainfo":{"json_schema_version":1}},{"table":{"family":"inet","name":"trex_webui_native_boundary","handle":1,"comment":"Managed by TRex WebUI deploy/install.sh."}},{"chain":{"family":"inet","table":"trex_webui_native_boundary","name":"input","handle":1,"type":"filter","hook":"input","prio":-5,"policy":"accept"}},{"rule":{"family":"inet","table":"trex_webui_native_boundary","chain":"input","handle":3,"expr":[{"match":{"op":"!=","left":{"meta":{"key":"iifname"}},"right":"lo"}},{"match":{"op":"==","left":{"payload":{"protocol":"tcp","field":"dport"}},"right":{"set":[4500,4501,4507]}}},{"reject":{"type":"tcp reset"}}]}}]}'
    ;;
  *)
    printf 'unexpected fake nft invocation: %s\n' "$*" >&2
    exit 1
    ;;
esac
FAKE
chmod 0755 "$FAKE_NFT"

printf 'absent\n' >"$FAKE_NFT_STATE"
TREX_WEBUI_NFT_BIN="$FAKE_NFT" "$BOUNDARY" check || \
  fail "check rejected a host with no conflicting table"
[[ "$(<"$FAKE_NFT_STATE")" == "absent" ]] || \
  fail "check changed nftables state"
TREX_WEBUI_NFT_BIN="$FAKE_NFT" "$BOUNDARY" check-service "$SERVICE_CONFIG" || \
  fail "check-service rejected a safe operator nftables config"
[[ "$(<"$FAKE_NFT_STATE")" == "absent" ]] || \
  fail "check-service changed nftables state"
printf 'table inet trex_webui_native_boundary {}\n' >"$SERVICE_CONFIG"
if TREX_WEBUI_NFT_BIN="$FAKE_NFT" \
  "$BOUNDARY" check-service "$SERVICE_CONFIG" >/dev/null 2>&1; then
  fail "check-service accepted an operator config that uses the reserved table"
fi
printf 'table inet trex_webui_native_boundary {}\n' >"$TEST_ROOT/included.nft"
chown root:root "$TEST_ROOT/included.nft"
chmod 0600 "$TEST_ROOT/included.nft"
printf 'include "%s"\n' "$TEST_ROOT/included.nft" >"$SERVICE_CONFIG"
if TREX_WEBUI_NFT_BIN="$FAKE_NFT" \
  "$BOUNDARY" check-service "$SERVICE_CONFIG" >/dev/null 2>&1; then
  fail "check-service accepted an included config that uses the reserved table"
fi
printf '# operator nftables fixture\n' >"$SERVICE_CONFIG"

TREX_WEBUI_NFT_BIN="$FAKE_NFT" "$BOUNDARY" apply || \
  fail "apply rejected a supported empty nftables namespace"
TREX_WEBUI_NFT_BIN="$FAKE_NFT" "$BOUNDARY" verify || \
  fail "verify rejected the exact managed table"
TREX_WEBUI_NFT_BIN="$FAKE_NFT" "$BOUNDARY" present || \
  fail "present did not recognize the managed table"
TREX_WEBUI_NFT_BIN="$FAKE_NFT" "$BOUNDARY" apply || \
  fail "second apply was not idempotent"
grep -Fq 'destroy table inet trex_webui_native_boundary' "$FAKE_NFT_LOG" || \
  fail "atomic replacement does not destroy the prior managed table in its batch"
grep -Fq 'iifname != "lo" tcp dport { 4500, 4501, 4507 } reject with tcp reset' \
  "$FAKE_NFT_LOG" || fail "native control ports are not rejected outside loopback"
[[ "$(grep -c '^apply$' "$FAKE_NFT_LOG")" -eq 2 ]] || \
  fail "idempotent apply did not publish exactly one transaction per invocation"

printf 'unmanaged\n' >"$FAKE_NFT_STATE"
if TREX_WEBUI_NFT_BIN="$FAKE_NFT" "$BOUNDARY" apply >/dev/null 2>&1; then
  fail "apply replaced an unowned table"
fi
[[ "$(grep -c '^apply$' "$FAKE_NFT_LOG")" -eq 2 ]] || \
  fail "unowned-table refusal still attempted an apply transaction"

printf 'absent\n' >"$FAKE_NFT_STATE"
if FAKE_NFT_FAIL_CHECK=1 TREX_WEBUI_NFT_BIN="$FAKE_NFT" \
  "$BOUNDARY" apply >/dev/null 2>&1; then
  fail "apply continued after nftables syntax/capability validation failed"
fi
[[ "$(<"$FAKE_NFT_STATE")" == "absent" ]] || \
  fail "failed preflight changed nftables state"

if TREX_WEBUI_NFT_BIN="$TEST_ROOT/missing-nft" \
  "$BOUNDARY" check >/dev/null 2>&1; then
  fail "check did not fail closed when nft was unavailable"
fi

printf 'absent\n' >"$FAKE_NFT_STATE"
: >"$FAKE_NFT_LOG"
TREX_WEBUI_NFT_BIN="$FAKE_NFT" "$BOUNDARY" service-start "$SERVICE_CONFIG" || \
  fail "service-start rejected the atomic managed load transaction"
if grep -Fq 'flush ruleset' "$FAKE_NFT_LOG"; then
  fail "nftables service-start changed the vendor no-flush semantics"
fi
grep -Fq 'destroy table inet trex_webui_native_boundary' "$FAKE_NFT_LOG" || \
  fail "nftables service-start did not replace the already-owned runtime table"
grep -Fq "include \"$SERVICE_CONFIG\"" "$FAKE_NFT_LOG" || \
  fail "nftables service-start omitted the operator main config"
: >"$FAKE_NFT_LOG"
TREX_WEBUI_NFT_BIN="$FAKE_NFT" "$BOUNDARY" service-reload "$SERVICE_CONFIG" || \
  fail "service-reload rejected the atomic managed reload transaction"
grep -Fq 'flush ruleset' "$FAKE_NFT_LOG" || \
  fail "nftables service integration does not keep flush and boundary publication in one batch"
grep -Fq 'add table inet trex_webui_native_boundary' "$FAKE_NFT_LOG" || \
  fail "nftables service-reload does not fail closed on a reserved-table collision"
if grep -Fq 'destroy table inet trex_webui_native_boundary' "$FAKE_NFT_LOG"; then
  fail "nftables service-reload can replace a table introduced by the operator config"
fi
grep -Fq "include \"$SERVICE_CONFIG\"" "$FAKE_NFT_LOG" || \
  fail "nftables service integration omitted the operator main config"

if [[ -x /usr/sbin/nft ]] && command -v ip >/dev/null 2>&1 && \
  command -v nsenter >/dev/null 2>&1 && command -v unshare >/dev/null 2>&1 && \
  unshare --net -- true >/dev/null 2>&1; then
  unshare --net -- "$0" --netns-probe || \
    fail "real nftables boundary failed in isolated network namespaces"
else
  printf 'SKIP: real native boundary probe requires nft, ip, nsenter, and network-namespace capability\n'
fi

printf 'PASS: native TRex nftables boundary is owned, idempotent, exact, and fail-closed\n'
