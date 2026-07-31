#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DAEMON_UNIT="$PROJECT_ROOT/deploy/systemd/trex-daemon-server.service"
NFTABLES_DROPIN="$PROJECT_ROOT/deploy/systemd/nftables-trex-webui.conf"
API_UNIT="$PROJECT_ROOT/deploy/systemd/trex-webui-api.service"
RECONCILE_UNIT="$PROJECT_ROOT/deploy/systemd/trex-webui-release-reconcile.service"
RETRY_UNIT="$PROJECT_ROOT/deploy/systemd/trex-webui-release-retry.service"
ACK_UNIT="$PROJECT_ROOT/deploy/systemd/trex-webui-release-consumer-ack.service"
PROBE="$PROJECT_ROOT/deploy/daemon_rpc_probe.py"
SUPERVISOR="$PROJECT_ROOT/deploy/trex_daemon_supervisor.py"
SUPERVISOR_TEST="$PROJECT_ROOT/deploy/tests/daemon_supervisor_test.py"
NATIVE_BOUNDARY="$PROJECT_ROOT/deploy/trex_native_boundary.sh"
NATIVE_BOUNDARY_TEST="$PROJECT_ROOT/deploy/tests/native_boundary_test.sh"
DEPLOY_VERIFY="$PROJECT_ROOT/deploy/verify.sh"
LOGROTATE_POLICY="$PROJECT_ROOT/deploy/logrotate/trex-daemon-server"

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

assert_unit_line() {
  local file="$1"
  local line="$2"
  grep -Fqx "$line" "$file" || fail "$(basename -- "$file") is missing: $line"
}

[[ -f "$DAEMON_UNIT" && ! -L "$DAEMON_UNIT" ]] || fail "daemon unit template is missing or unsafe"
[[ -f "$RECONCILE_UNIT" && ! -L "$RECONCILE_UNIT" ]] || \
  fail "release reconciler unit template is missing or unsafe"
[[ -f "$RETRY_UNIT" && ! -L "$RETRY_UNIT" ]] || \
  fail "release retry unit template is missing or unsafe"
[[ -f "$ACK_UNIT" && ! -L "$ACK_UNIT" ]] || \
  fail "release consumer acknowledgement unit template is missing or unsafe"
[[ -f "$NFTABLES_DROPIN" && ! -L "$NFTABLES_DROPIN" ]] || \
  fail "nftables integration drop-in is missing or unsafe"
[[ -f "$PROBE" && ! -L "$PROBE" ]] || fail "strict daemon RPC probe is missing or unsafe"
[[ -f "$SUPERVISOR" && ! -L "$SUPERVISOR" && -x "$SUPERVISOR" ]] || \
  fail "daemon supervisor launcher is missing, unsafe, or not executable"
[[ -f "$SUPERVISOR_TEST" && ! -L "$SUPERVISOR_TEST" ]] || \
  fail "daemon supervisor lifecycle test is missing or unsafe"
[[ -f "$NATIVE_BOUNDARY" && ! -L "$NATIVE_BOUNDARY" && -x "$NATIVE_BOUNDARY" ]] || \
  fail "daemon native boundary is missing, unsafe, or not executable"
[[ -f "$NATIVE_BOUNDARY_TEST" && ! -L "$NATIVE_BOUNDARY_TEST" && -x "$NATIVE_BOUNDARY_TEST" ]] || \
  fail "daemon native boundary test is missing, unsafe, or not executable"
[[ -f "$DEPLOY_VERIFY" && ! -L "$DEPLOY_VERIFY" && -x "$DEPLOY_VERIFY" ]] || \
  fail "deployment verifier is missing, unsafe, or not executable"
[[ -f "$LOGROTATE_POLICY" && ! -L "$LOGROTATE_POLICY" ]] || fail "daemon logrotate policy is missing or unsafe"
assert_unit_line "$DAEMON_UNIT" "# Managed by TRex WebUI deploy/install.sh."
assert_unit_line "$DAEMON_UNIT" "AssertFileIsExecutable=/opt/trex-core/scripts/trex_daemon_server"
assert_unit_line "$DAEMON_UNIT" \
  "AssertFileIsExecutable=/usr/libexec/trex-webui/trex_daemon_supervisor.py"
assert_unit_line "$DAEMON_UNIT" "User=root"
assert_unit_line "$DAEMON_UNIT" "Group=root"
assert_unit_line "$DAEMON_UNIT" "PartOf=nftables.service"
assert_unit_line "$DAEMON_UNIT" "WorkingDirectory=/opt/trex-core/scripts"
assert_unit_line "$DAEMON_UNIT" \
  "ExecStart=/usr/bin/python3 -I /usr/libexec/trex-webui/trex_daemon_supervisor.py --daemon-bin /opt/trex-core/scripts/trex_daemon_server --generation-file /run/trex-webui/daemon-generation -- --daemon-port 8090 --trex-host 127.0.0.1 start-live"
grep -Fq 'DAEMON_GENERATION="/run/trex-webui/daemon-generation"' "$DEPLOY_VERIFY" || \
  fail "deployment verifier does not pin the daemon generation path"
grep -Fq -- '--generation-file $DAEMON_GENERATION -- --daemon-port $DAEMON_RPC_PORT' \
  "$DEPLOY_VERIFY" || \
  fail "deployment verifier does not match the generation-aware daemon ExecStart"
grep -Fq 'uuid.UUID(value)' "$DEPLOY_VERIFY" || \
  fail "deployment verifier does not validate the daemon generation UUID"
assert_unit_line "$DAEMON_UNIT" "RuntimeDirectory=trex-webui"
assert_unit_line "$DAEMON_UNIT" "RuntimeDirectoryMode=0755"
assert_unit_line "$DAEMON_UNIT" \
  "ExecStartPre=/usr/bin/bash /usr/libexec/trex-webui/trex_native_boundary.sh apply"
assert_unit_line "$DAEMON_UNIT" \
  "ExecStartPost=/usr/bin/bash /usr/libexec/trex-webui/trex_native_boundary.sh verify"
assert_unit_line "$DAEMON_UNIT" \
  "ExecStartPost=/usr/bin/python3 /usr/libexec/trex-webui/daemon_rpc_probe.py --host 127.0.0.1 --port 8090 --timeout 20 ready"
assert_unit_line "$DAEMON_UNIT" "Restart=on-failure"
assert_unit_line "$DAEMON_UNIT" "KillMode=mixed"
assert_unit_line "$DAEMON_UNIT" "UMask=0027"
assert_unit_line "$DAEMON_UNIT" \
  "StandardOutput=append:/var/log/trex/trex_daemon_server.log"
assert_unit_line "$DAEMON_UNIT" \
  "StandardError=append:/var/log/trex/trex_daemon_server.log"
assert_unit_line "$DAEMON_UNIT" \
  "ExecStartPre=/usr/bin/chown root:trex-webui /var/log/trex/trex_daemon_server.log"
assert_unit_line "$DAEMON_UNIT" \
  "ExecStartPre=/usr/bin/chmod 0640 /var/log/trex/trex_daemon_server.log"
assert_unit_line "$DAEMON_UNIT" "IPAddressAllow=localhost"
assert_unit_line "$DAEMON_UNIT" "IPAddressDeny=any"
assert_unit_line "$NFTABLES_DROPIN" "# Managed by TRex WebUI deploy/install.sh."
assert_unit_line "$NFTABLES_DROPIN" "ExecStart="
assert_unit_line "$NFTABLES_DROPIN" \
  "ExecStart=/usr/bin/bash /usr/libexec/trex-webui/trex_native_boundary.sh service-start /etc/sysconfig/nftables.conf"
assert_unit_line "$NFTABLES_DROPIN" "ExecReload="
assert_unit_line "$NFTABLES_DROPIN" \
  "ExecReload=/usr/bin/bash /usr/libexec/trex-webui/trex_native_boundary.sh service-reload /etc/sysconfig/nftables.conf"
if grep -Eq -- '--trex-host (0\.0\.0\.0|::)' "$DAEMON_UNIT"; then
  fail "daemon unit exposes RPC beyond loopback"
fi
if grep -Eq -- '^ConditionPathIsExecutable=' "$DAEMON_UNIT"; then
  fail "daemon unit uses unsupported ConditionPathIsExecutable"
fi
assert_unit_line "$API_UNIT" \
  "After=network-online.target trex-webui-release-reconcile.service"
assert_unit_line "$API_UNIT" \
  "Requires=trex-webui-release-reconcile.service"
assert_unit_line "$API_UNIT" "Wants=network-online.target"
assert_unit_line "$API_UNIT" \
  "Environment=TREX_WEBUI_RUNTIME_STATE_PATH=/var/lib/trex-webui/runtime-state.json"
assert_unit_line "$API_UNIT" "# @@TREX_WEBUI_DAEMON_MODE_ENV@@"
assert_unit_line "$API_UNIT" \
  'ExecStartPre=/opt/trex-webui/.venv/bin/python -c "import fastapi, httptools, uvicorn, uvicorn.supervisors.statreload, uvloop, watchfiles.run, websockets"'
assert_unit_line "$API_UNIT" \
  'ExecStart=/opt/trex-webui/.venv/bin/python -m uvicorn app.main:app --app-dir /opt/trex-webui/apps/api --host 127.0.0.1 --port 8080'
if grep -Eq -- '^(After|Wants)=.*trex-daemon-server' "$API_UNIT"; then
  fail "base API unit pulls a local daemon into external deployments"
fi
assert_unit_line "$LOGROTATE_POLICY" "# Managed by TRex WebUI deploy/install.sh."
assert_unit_line "$LOGROTATE_POLICY" "    maxsize 1M"
assert_unit_line "$LOGROTATE_POLICY" "    rotate 14"
assert_unit_line "$LOGROTATE_POLICY" "    copytruncate"
assert_unit_line "$LOGROTATE_POLICY" "    create 0640 root trex-webui"

if command -v systemd-analyze >/dev/null 2>&1; then
  verify_output="$(
    set -Eeuo pipefail
    exec 2>&1
    verify_root=""
    verify_daemon_unit=""
    verify_api_unit=""
    verify_reconcile_unit=""
    verify_retry_unit=""
    verify_ack_unit=""
    cleanup_verify_units() {
      local status=$?
      trap - EXIT
      set +e
      if [[ -n "$verify_api_unit" || -n "$verify_daemon_unit" || \
        -n "$verify_reconcile_unit" || -n "$verify_retry_unit" || \
        -n "$verify_ack_unit" ]]; then
        rm -f -- \
          "$verify_api_unit" "$verify_daemon_unit" "$verify_reconcile_unit" \
          "$verify_retry_unit" "$verify_ack_unit" >/dev/null 2>&1
      fi
      if [[ -n "$verify_root" ]]; then
        rmdir -- "$verify_root" >/dev/null 2>&1
      fi
      exit "$status"
    }
    trap cleanup_verify_units EXIT

    verify_root="$(mktemp -d -t trex-systemd-verify.XXXXXX)" &&
    verify_daemon_unit="$verify_root/$(basename -- "$DAEMON_UNIT")" &&
    verify_api_unit="$verify_root/$(basename -- "$API_UNIT")" &&
    verify_reconcile_unit="$verify_root/$(basename -- "$RECONCILE_UNIT")" &&
    verify_retry_unit="$verify_root/$(basename -- "$RETRY_UNIT")" &&
    verify_ack_unit="$verify_root/$(basename -- "$ACK_UNIT")" &&
    cp -- "$DAEMON_UNIT" "$verify_daemon_unit" &&
    cp -- "$RECONCILE_UNIT" "$verify_reconcile_unit" &&
    cp -- "$RETRY_UNIT" "$verify_retry_unit" &&
    cp -- "$ACK_UNIT" "$verify_ack_unit" &&
    sed \
      -e 's#^ExecStartPre=/opt/trex-webui/[.]venv/bin/python #ExecStartPre=/usr/bin/python3 #' \
      -e 's#^ExecStart=/opt/trex-webui/[.]venv/bin/python #ExecStart=/usr/bin/python3 #' \
      "$API_UNIT" >"$verify_api_unit" &&
    grep -Fqx \
      'ExecStartPre=/usr/bin/python3 -c "import fastapi, httptools, uvicorn, uvicorn.supervisors.statreload, uvloop, watchfiles.run, websockets"' \
      "$verify_api_unit" &&
    grep -Fqx \
      'ExecStart=/usr/bin/python3 -m uvicorn app.main:app --app-dir /opt/trex-webui/apps/api --host 127.0.0.1 --port 8080' \
      "$verify_api_unit" &&
    systemd-analyze verify \
      "$verify_daemon_unit" "$verify_api_unit" "$verify_reconcile_unit" \
      "$verify_retry_unit" "$verify_ack_unit"
  )" || {
    printf '%s\n' "$verify_output" >&2
    fail "systemd-analyze verify rejected the supervisor units"
  }
  if grep -Eqi 'Unknown key|Failed to prepare filename|Failed to parse' <<<"$verify_output"; then
    printf '%s\n' "$verify_output" >&2
    fail "systemd-analyze reported an ignored or invalid unit directive"
  fi
fi

/usr/bin/python3 "$SUPERVISOR_TEST" || fail "daemon supervisor lifecycle tests failed"
"$NATIVE_BOUNDARY_TEST" || fail "daemon native boundary tests failed"

TEST_ROOT="$(mktemp -d -t trex-daemon-service-test.XXXXXX)"
SERVER_PID=""
cleanup() {
  local status=$?
  trap - EXIT
  set +e
  if [[ -n "$SERVER_PID" ]]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
  rm -f -- "$TEST_ROOT/port" "$TEST_ROOT/state"
  rmdir "$TEST_ROOT"
  exit "$status"
}
trap cleanup EXIT
printf 'idle\n' >"$TEST_ROOT/state"

/usr/bin/python3 - "$TEST_ROOT/port" "$TEST_ROOT/state" <<'PY' &
from __future__ import annotations

import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

port_path = Path(sys.argv[1])
state_path = Path(sys.argv[2])


class Handler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length", "0"))
        request = json.loads(self.rfile.read(length))
        state = state_path.read_text(encoding="utf-8").strip()
        method = request.get("method")
        if method == "connectivity_check":
            result = True
        elif method == "get_running_status":
            result = {
                "state": 3 if state == "running" else 1,
                "verbose": "Running" if state == "running" else "Idle",
            }
        elif method == "is_reserved":
            result = state == "reserved"
        else:
            self.send_response(400)
            self.end_headers()
            return
        body = json.dumps(
            {"jsonrpc": "2.0", "id": request.get("id"), "result": result},
            separators=(",", ":"),
        ).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:
        return


server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
port_path.write_text(str(server.server_port), encoding="utf-8")
server.serve_forever()
PY
SERVER_PID=$!
for _ in $(seq 1 50); do
  [[ -s "$TEST_ROOT/port" ]] && break
  sleep 0.02
done
[[ -s "$TEST_ROOT/port" ]] || fail "mock daemon RPC did not start"
RPC_PORT="$(<"$TEST_ROOT/port")"

/usr/bin/python3 "$PROBE" --host 127.0.0.1 --port "$RPC_PORT" --timeout 2 ready || \
  fail "strict readiness probe rejected a valid loopback daemon"
/usr/bin/python3 "$PROBE" --host 127.0.0.1 --port "$RPC_PORT" --timeout 2 safe-restart || \
  fail "safe-restart probe rejected Idle/unreserved daemon state"

printf 'running\n' >"$TEST_ROOT/state"
if /usr/bin/python3 "$PROBE" --host 127.0.0.1 --port "$RPC_PORT" --timeout 2 safe-restart >/dev/null 2>&1; then
  fail "safe-restart probe accepted running TRex state"
fi
printf 'reserved\n' >"$TEST_ROOT/state"
if /usr/bin/python3 "$PROBE" --host 127.0.0.1 --port "$RPC_PORT" --timeout 2 safe-restart >/dev/null 2>&1; then
  fail "safe-restart probe accepted a daemon reservation"
fi
if HTTP_PROXY=http://proxy.invalid:3128 HTTPS_PROXY=http://proxy.invalid:3128 NO_PROXY= \
  /usr/bin/python3 "$PROBE" --host 127.0.0.1 --port "$RPC_PORT" --timeout 2 ready >/dev/null 2>&1; then
  :
else
  fail "strict daemon probe incorrectly honored environment proxy variables"
fi
if /usr/bin/python3 "$PROBE" --host 0.0.0.0 --port "$RPC_PORT" --timeout 1 ready >/dev/null 2>&1; then
  fail "strict daemon probe accepted a non-loopback host"
fi

printf 'PASS: persistent daemon supervisor, readiness, restart guard, and log contract\n'
