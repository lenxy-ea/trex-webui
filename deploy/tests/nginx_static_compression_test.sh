#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# shellcheck source=deploy/path_safety.sh
source "$PROJECT_ROOT/deploy/path_safety.sh"

NGINX_TEMPLATE="$PROJECT_ROOT/deploy/nginx/trex-webui.conf"

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

for directive in \
  '    gzip on;' \
  '    gzip_static on;' \
  '    gzip_vary on;' \
  '    gzip_min_length 1024;' \
  '    gzip_comp_level 5;' \
  '        application/javascript' \
  '        text/css'; do
  grep -Fqx "$directive" "$NGINX_TEMPLATE" || \
    fail "Nginx template omitted compression contract: $directive"
done

[[ "$(grep -Ec '^[[:space:]]+gzip off;$' "$NGINX_TEMPLATE")" -eq 2 ]] || \
  fail "both API proxy locations must opt out of static-response compression"
grep -Fq 'proxy_buffering off;' "$NGINX_TEMPLATE" || \
  fail "SSE proxy buffering contract changed"
grep -Fq 'expires 7d;' "$NGINX_TEMPLATE" || \
  fail "static asset cache lifetime changed"
grep -Fq 'deny all;' "$NGINX_TEMPLATE" || \
  fail "default-deny access contract changed"

if ! command -v nginx >/dev/null 2>&1; then
  printf 'SKIP: nginx is unavailable; compression directives were checked statically\n'
  exit 0
fi
if ! nginx -V 2>&1 | grep -Fq -- '--with-http_gzip_static_module'; then
  fail "installed nginx lacks --with-http_gzip_static_module"
fi
if ! command -v curl >/dev/null 2>&1 || ! command -v gzip >/dev/null 2>&1; then
  printf 'SKIP: curl or gzip is unavailable; nginx module and directives were checked\n'
  exit 0
fi

TEST_ROOT="$(mktemp -d -t trex-webui-nginx-compression.XXXXXX)"
trex_write_managed_marker "$TEST_ROOT"
chmod 0755 "$TEST_ROOT"
PID_FILE="$TEST_ROOT/nginx.pid"
MAIN_CONFIG="$TEST_ROOT/nginx.conf"
SERVER_CONFIG="$TEST_ROOT/trex-webui.conf"
NGINX_PID=""

cleanup() {
  local status=$?
  trap - EXIT
  set +e
  if [[ -f "$PID_FILE" ]]; then
    NGINX_PID="$(<"$PID_FILE")"
  fi
  if [[ "$NGINX_PID" =~ ^[1-9][0-9]*$ ]] && kill -0 "$NGINX_PID" 2>/dev/null; then
    kill -QUIT "$NGINX_PID" 2>/dev/null || true
    for _ in $(seq 1 100); do
      kill -0 "$NGINX_PID" 2>/dev/null || break
      sleep 0.02
    done
    if kill -0 "$NGINX_PID" 2>/dev/null; then
      kill -TERM "$NGINX_PID" 2>/dev/null || true
    fi
  fi
  trex_safe_remove_tree "$TEST_ROOT" "Nginx compression test root" || status=1
  exit "$status"
}
trap cleanup EXIT

mkdir -m 0755 "$TEST_ROOT/access.d" "$TEST_ROOT/security.d" "$TEST_ROOT/dist" "$TEST_ROOT/dist/assets"
printf '<!doctype html><html><body><div id="root"></div></body></html>\n' >"$TEST_ROOT/dist/index.html"
for _ in $(seq 1 512); do
  printf '%s\n' 'export const compressionFixture = "trex-webui-static-compression";' \
    >>"$TEST_ROOT/dist/assets/compression-fixture.js"
done
chmod 0644 "$TEST_ROOT/dist/index.html" "$TEST_ROOT/dist/assets/compression-fixture.js"

PYTHON_BIN="$(command -v python3.11 || command -v python3 || true)"
[[ -n "$PYTHON_BIN" ]] || fail "Python is required to reserve a loopback test port"
PORT="$($PYTHON_BIN -c 'import socket; sock = socket.socket(); sock.bind(("127.0.0.1", 0)); print(sock.getsockname()[1]); sock.close()')"
[[ "$PORT" =~ ^[1-9][0-9]*$ ]] || fail "unable to select a loopback test port"

sed \
  -e "s|listen 80 default_server;|listen 127.0.0.1:$PORT;|" \
  -e '/^[[:space:]]*listen \[::\]:80 default_server;$/d' \
  -e "s|root /var/www/trex-webui/dist;|root $TEST_ROOT/dist;|" \
  -e "s|include /etc/nginx/trex-webui/access.d/\*.conf;|include $TEST_ROOT/access.d/*.conf;|" \
  -e "s|include /etc/nginx/trex-webui/security.d/\*.conf;|include $TEST_ROOT/security.d/*.conf;|" \
  -e "s|access_log /var/log/nginx/trex-webui.access.log;|access_log $TEST_ROOT/access.log;|" \
  -e "s|error_log /var/log/nginx/trex-webui.error.log;|error_log $TEST_ROOT/server-error.log;|" \
  "$NGINX_TEMPLATE" >"$SERVER_CONFIG"

printf '%s\n' \
  "pid $PID_FILE;" \
  "error_log $TEST_ROOT/error.log notice;" \
  'events { worker_connections 64; }' \
  'http {' \
  '    include /etc/nginx/mime.types;' \
  '    default_type application/octet-stream;' \
  "    include $SERVER_CONFIG;" \
  '}' >"$MAIN_CONFIG"

nginx -t -p "$TEST_ROOT/" -c "$MAIN_CONFIG"
nginx -p "$TEST_ROOT/" -c "$MAIN_CONFIG"
NGINX_PID="$(<"$PID_FILE")"

ASSET_URL="http://127.0.0.1:$PORT/assets/compression-fixture.js"
for _ in $(seq 1 100); do
  if curl -fsS --noproxy '*' "$ASSET_URL" >/dev/null 2>&1; then
    break
  fi
  sleep 0.02
done
curl -fsS --noproxy '*' "$ASSET_URL" >/dev/null || fail "temporary Nginx did not become ready"

curl -fsS --noproxy '*' -H 'Accept-Encoding: identity' \
  -D "$TEST_ROOT/identity.headers" -o /dev/null "$ASSET_URL"
if grep -Eiq '^Content-Encoding:' "$TEST_ROOT/identity.headers"; then
  fail "identity response was unexpectedly compressed"
fi

curl -fsS --noproxy '*' --compressed -H 'Accept-Encoding: gzip' \
  -D "$TEST_ROOT/dynamic.headers" -o "$TEST_ROOT/dynamic.js" "$ASSET_URL"
grep -Eiq '^Content-Encoding:[[:space:]]*gzip' "$TEST_ROOT/dynamic.headers" || \
  fail "dynamic static-asset response omitted Content-Encoding: gzip"
grep -Eiq '^Vary:.*Accept-Encoding' "$TEST_ROOT/dynamic.headers" || \
  fail "compressed static-asset response omitted Vary: Accept-Encoding"
grep -Eiq '^Cache-Control:[[:space:]]*max-age=604800' "$TEST_ROOT/dynamic.headers" || \
  fail "compressed asset changed the seven-day cache contract"
grep -Eiq '^Content-Security-Policy:' "$TEST_ROOT/dynamic.headers" || \
  fail "compressed asset omitted the existing security headers"
cmp "$TEST_ROOT/dist/assets/compression-fixture.js" "$TEST_ROOT/dynamic.js" || \
  fail "dynamically compressed response did not decode to the source asset"

gzip -c "$TEST_ROOT/dist/assets/compression-fixture.js" \
  >"$TEST_ROOT/dist/assets/compression-fixture.js.gz"
chmod 0644 "$TEST_ROOT/dist/assets/compression-fixture.js.gz"
STATIC_GZIP_SIZE="$(stat -c '%s' "$TEST_ROOT/dist/assets/compression-fixture.js.gz")"
curl -fsS --noproxy '*' --compressed -H 'Accept-Encoding: gzip' \
  -D "$TEST_ROOT/static.headers" -o "$TEST_ROOT/static.js" "$ASSET_URL?precompressed=1"
grep -Eiq '^Content-Encoding:[[:space:]]*gzip' "$TEST_ROOT/static.headers" || \
  fail "precompressed static response omitted Content-Encoding: gzip"
grep -Eiq "^Content-Length:[[:space:]]*$STATIC_GZIP_SIZE" "$TEST_ROOT/static.headers" || \
  fail "gzip_static did not serve the precompressed sibling"
cmp "$TEST_ROOT/dist/assets/compression-fixture.js" "$TEST_ROOT/static.js" || \
  fail "precompressed response did not decode to the source asset"

printf 'PASS: Nginx dynamic and precompressed static asset delivery\n'
