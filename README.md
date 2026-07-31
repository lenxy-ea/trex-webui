# TRex WebUI

TRex WebUI is a modern, single-operator console for Cisco TRex. It provides
traffic-profile control, live statistics, packet capture, port operations,
configuration workflows, and run evidence through a React frontend and FastAPI
backend.

The product path is intentionally backed by a real TRex server. Missing hardware,
permissions, or connectivity are reported as blockers; they are never replaced
with mock traffic data.

> [!WARNING]
> TRex WebUI has no built-in user authentication or RBAC. Development services
> bind to `127.0.0.1` by default. Do not expose the API, Vite development server,
> TRex daemon, STL, or Scapy ports to the Internet or an untrusted LAN.

The supported production topology is one operator on a trusted management
network. Nginx is deny-by-default, the API is loopback-only and unprivileged, and
the privileged TRex daemon is either owned by the installer-managed local
systemd supervisor or explicitly delegated to an external supervisor. See the
[deployment guide](docs/NGINX_DEPLOYMENT.md), [support matrix](docs/SUPPORT_MATRIX.md),
and [project roadmap](docs/PROJECT_ROADMAP.md) before operating real hardware.

## Repository layout

```text
apps/api    FastAPI backend and TRex control-plane adapters
apps/web    React/Vite operator console
deploy      Nginx, systemd, packaging, upgrade, and verification tooling
docs        Architecture, development, deployment, and support notes
examples    Non-production configuration examples
scripts     Toolchain wrappers and real-hardware acceptance workflows
```

## Prerequisites

- A supported Linux host; see [docs/SUPPORT_MATRIX.md](docs/SUPPORT_MATRIX.md).
- Node.js 24.16.0 and npm 11.x. The repository bootstrap installs the pinned
  project-local runtime on supported Linux/x64 hosts.
- Python 3.11 for the FastAPI backend and tests.
- A separately installed TRex server for hardware workflows.

## Fresh-clone setup

Run these commands from the repository root:

```bash
scripts/bootstrap_node.sh
scripts/npmw ci
scripts/npmw --prefix apps/web ci
python3.11 -m venv .venv
.venv/bin/python -m pip install --require-hashes --only-binary=:all: \
  -r apps/api/requirements-dev.lock
cp .env.example .env
```

`scripts/npmw` prefers the pinned runtime under `.tools/` and also accepts a
compatible Node 24/npm 11 installation already on `PATH`. Use `npm ci`, through
the wrapper, for lockfile-reproducible installs; do not replace it with
`npm install` in setup or CI instructions.

The copied environment file keeps both the development API and the TRex
control-plane target on loopback. Review the paths in `.env` before a hardware
workflow.

## Local development

Start the backend and frontend on loopback:

```bash
.venv/bin/uvicorn app.main:app --app-dir apps/api --reload --host 127.0.0.1 --port 8080
scripts/npmw run dev:web -- --host 127.0.0.1 --port 5176
```

Open `http://127.0.0.1:5176/`. To capture a local Playwright screenshot:

```bash
scripts/npmw run screenshot:web -- --url http://127.0.0.1:5176 --prefix workbench
```

### Remote development is an explicit opt-in

Binding either development service to `0.0.0.0` exposes an unauthenticated
control surface. Do so only on an isolated, trusted management network after
restricting access with a host firewall:

```bash
.venv/bin/uvicorn app.main:app --app-dir apps/api --reload --host 0.0.0.0 --port 8080
scripts/npmw run dev:web -- --host 0.0.0.0 --port 5176
```

This is not a production deployment. Use Nginx allowlists plus independently
managed TLS/authentication for any non-loopback production access.

## Connecting TRex hardware

The default `.env.example` targets a TRex installation on the same host. A
remote TRex daemon is supported only through an explicitly operator-managed
external topology. Set both values deliberately:

```dotenv
TREX_WEBUI_TREX_HOST=trex.example.test
TREX_WEBUI_DAEMON_SUPERVISOR=external
```

Restrict remote daemon/STL/Scapy ports to the WebUI host and independently
provide authentication, firewall policy, service persistence, and log handling.
TRex WebUI does not add authentication to those upstream control protocols.

[examples/trex_cfg.yaml](examples/trex_cfg.yaml) is a fictional six-port i350
schema example using documentation-only addresses. It is not hardware-certified
and must never be deployed unchanged. Follow
[examples/README.md](examples/README.md) to replace every PCI address, MAC/IP
value, NUMA socket, and worker-core assignment with values verified on your host.

## Tests

The normal local checks do not send traffic:

```bash
scripts/npmw test
scripts/npmw run typecheck:web
scripts/npmw run lint:web
scripts/npmw run build:web
.venv/bin/python -m pip_audit -r apps/api/requirements-dev.lock
scripts/npmw --prefix apps/web audit --audit-level=high
```

Hardware tests are always explicit:

```bash
TREX_WEBUI_RUN_HARDWARE_TESTS=1 \
  .venv/bin/python -m pytest apps/api/tests/integration
```

The traffic and capture smokes require their own opt-ins because they mutate
real ports:

```bash
TREX_WEBUI_RUN_HARDWARE_TESTS=1 TREX_WEBUI_RUN_TRAFFIC_SMOKE=1 \
  .venv/bin/python -m pytest apps/api/tests/integration

TREX_WEBUI_RUN_HARDWARE_TESTS=1 TREX_WEBUI_RUN_CAPTURE_SMOKE=1 \
  .venv/bin/python -m pytest apps/api/tests/integration
```

## Major-change acceptance

Major TRex WebUI changes require a real-hardware Standard E2E with a
host-validated configuration:

```bash
scripts/npmw run verify:major -- --base-url http://127.0.0.1 \
  --config-file /path/to/validated/trex_cfg.yaml
```

The optional production browser write acceptance performs real control-plane
writes and must be requested separately. It runs after Standard E2E has started
and validated the host-configured TRex runtime:

```bash
scripts/npmw run verify:major -- --base-url http://127.0.0.1 \
  --config-file /path/to/validated/trex_cfg.yaml \
  --browser-write-acceptance
```

Never point either command at the unedited public example. The gate must finish
with traffic idle, temporary ownership released, capture recorders removed, and
a fresh local/server report pair. A hardware, link, RPC, permission, or config
failure remains a release blocker rather than a fixture-based pass. See
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for the full evidence contract.

## Community and project policy

- [CONTRIBUTING.md](CONTRIBUTING.md) — development and contribution workflow
- [SECURITY.md](SECURITY.md) — private vulnerability reporting
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) — community conduct
- [SUPPORT.md](SUPPORT.md) — support boundaries
- [docs/SUPPORT_MATRIX.md](docs/SUPPORT_MATRIX.md) — supported platform matrix
- [docs/PROVENANCE.md](docs/PROVENANCE.md) — upstream and third-party provenance
- [CHANGELOG.md](CHANGELOG.md) — release history

Licensing terms are in [LICENSE](LICENSE), with attribution and third-party
notices in [NOTICE](NOTICE) and
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
