# TRex WebUI Project Roadmap

## Product Direction

Build a modern, single-user, data-center-grade WebUI for TRex. The baseline is full replacement of `trex-stateless-gui`; the goal is a more complete lab console with better workflows, reporting, automation, and observability.

Multi-user/RBAC is intentionally out of scope for the initial product.

Development and validation will use real TRex hardware directly. Mock data and mock adapters are not part of the normal product path.

## Reference Style

Use these products as conceptual references, not as skins to copy:

- `trex-stateless-gui`: baseline feature coverage.
- Keysight/Ixia IxNetwork: dense L2/L3 traffic configuration, flow groups, real-time stats, QuickTest-style workflows.
- Spirent TestCenter/TestCenter+: modern web-based test workflows, resource/lab orientation, analytics/reporting.

## Target Architecture

```text
React + TypeScript WebUI
  -> REST commands
  -> WebSocket/SSE live events
  -> FastAPI backend
  -> TRex adapter layer
  -> STLClient / JSON-RPC over ZMQ / rpc_proxy_server / daemon APIs
  -> TRex server
```

Recommended initial stack:

- Frontend: React, TypeScript, Vite, TanStack Query, Zustand, ECharts or Recharts.
- Backend: FastAPI, pydantic, WebSocket, SQLite, structured logging.
- TRex integration: official Python STLClient first; JSON-RPC proxy where useful; Scapy for packet/profile tooling.
- Runtime integration: backend-owned TRex service/daemon control, config generation, log capture, health checks, and guarded privileged operations.
- Development support: real TRex/hardware environment configuration and explicit blocker reporting when hardware is unavailable.

## Real Hardware Policy

- Product features are developed against real TRex server and hardware.
- Do not silently substitute mock data for missing hardware.
- Component-level fixtures are allowed only for narrow visual/unit tests.
- Feature validation must exercise the backend and real TRex.
- Hardware or privilege gaps should be reported as blockers with the exact failing command, host, port, config path, or permission.

## Runtime And Config Ownership

The WebUI should own controlled TRex runtime workflows through the backend:

- Service/daemon status, start, stop, restart, and optionally start-live.
- TRex process and daemon logs, including startup failure diagnostics.
- Safe restart after config changes.
- Command preview and command-result capture for privileged operations.
- Confirmation and audit records for stop/restart/reset/force/config overwrite actions.

The WebUI should generate and manage TRex config files:

- Generate `/etc/trex_cfg.yaml` or a selected `--cfg` path.
- Validate fields such as `port_limit`, `version`, `interfaces`, `port_info`, IP/default gateway, source/destination MAC, platform thread layout, ZMQ publisher options, and CPU/thread assignments.
- Preview YAML before write, diff against the active config, and keep versions for rollback.
- Detect NIC/interface inventory from the real TRex host where possible.
- Restart/reload TRex only through a guarded workflow after config deployment.

## Navigation Model

- Overview: connection status, server health, port matrix, active traffic, warnings, live KPIs.
- Ports: status, ownership, link, attributes, L2/L3 config, counters, service mode.
- Traffic: loaded profiles, assigned streams, start/stop/pause/resume, multiplier updates.
- Profiles: YAML/JSON import/export, profile library, validation, diff, clone, version history.
- Packet Lab: structured packet builder, PCAP import/export, Scapy/raw view, Field Engine editor.
- Capture: monitor/record, filters, packet preview, PCAP export, optional Wireshark integration.
- Tests: guided runs, RFC2544-style flows, loss/latency checks, soak/burst templates.
- Reports: run history, stats snapshots, charts, exports.
- System: TRex instances, daemon/service control, config generator/editor, active config diff, compatibility/capability view.
- Logs: server log, UI/backend log, advanced JSON request/response trace.

## Milestones

### Current assessment (2026-07-31)

Milestone names describe product scope, not release readiness. A feature is only
"verified" when the current source and frontend build identities appear in a
passing real-hardware Standard E2E archive.

| Milestone | Implementation status | Remaining acceptance work |
| --- | --- | --- |
| M0 | Implemented and locally gated | Keep Python/Node baselines, dependency audits, CI shards, and production build green; a local gate does not prove that hosted CI ran. |
| M1 | Six-port control loop implemented | The persistent traffic plan exposes three logical port pairs with per-group profiles and runtime state. Every supported hardware row still needs source-bound real-traffic/capture evidence; public documentation does not treat a lab's current link state as a product guarantee. |
| M2 | Partially verified on available hardware | Custom daemon YAML start, capture, service-mode restoration, and guarded traffic resume/update flows are implemented. Port configuration writes, full config rollback, and the supported hardware/version matrix still need certification. |
| M3 | Substantial coverage; not certified as complete | Publish an explicit original-GUI capability matrix and attach real-hardware evidence for every supported row. Unsupported TRex/version rows must return capability blockers, not disappear from the UI. |
| M4 | Partial | Reports and run evidence exist; guided benchmarks, profile history/diff, a versioned automation contract, and compatibility/capability discovery remain product work. |

The deployment target is a single operator on a trusted management network.
Application-level multi-user authentication and RBAC remain out of scope. Until
that decision changes, Internet or untrusted-LAN exposure is unsupported; use a
narrow Nginx allowlist plus TLS and authentication at the reverse-proxy boundary.

The public repository deliberately does not embed a deployment's active PCI
addresses, MACs, IPs, cabling, or live link state. The fictional six-port i350
file under `examples/` documents only the configuration shape and is not a
certified hardware row. Each release handoff must instead cite a final
current-source archive containing the exact configuration identity, observed
port inventory, link preconditions, postcondition cleanup, and any physical
blocker for that host. Test totals, gate IDs, and archive paths are intentionally
not hard-coded here because they are valid only for the source and hardware
identity that generated them.

### Production-candidate gate

A trusted-management-network release candidate requires all of the following:

1. **Control-plane lifecycle:** capture memory/byte budgets, deterministic
   capture cleanup, non-destructive disconnect, bounded SSE subscribers, and
   serialized daemon mutations have automated regression coverage. Optional
   traffic hard-stop leases are WAL-backed before hardware access, bounded to
   300 seconds, and enforced by an API-lifespan reaper across API restart.
2. **Host boundary:** the API runs as the dedicated non-login `trex-webui`
   account, has no Linux capabilities, writes only declared state/output roots,
   and remains reachable only through the Nginx management-network policy.
3. **Artifact integrity and authenticity:** release archives have a verified SHA-256 digest,
   hostile tar metadata is rejected before extraction, the canonical payload is
   recomputed both inside the tar and after private extraction, Git-less
   Standard E2E evidence revalidates the installed packaged files, deployment
   paths carry explicit ownership markers, and handled pre-commit failures
   trigger rollback. A publisher signature and trusted verification policy are
   still required; a checksum delivered beside its archive is not a signature.
4. **Browser and API evidence:** CI runs backend tests, frontend test shards,
   typecheck, lint, build, production dependency audits, and a read-only
   Playwright smoke through the production Nginx path. The target-host gate also
   runs the explicitly opted-in browser write acceptance on the canonical first
   logical pair: `1kpps` with `duration=-1`, a route-issued canonical UTC
   60-second `hard_stop_at`, session-CAS Pause/Resume/Stop, exact configured-port
   inventory checks, selected-pair cleanup, and revision-CAS restoration of the
   original traffic plan. Before any write, the gate must also prove
   `/api/system/environment.connect_timeout_seconds` is an integer from 1
   through 3 and record it in evidence; its `deadline + 5s` recovery margin is
   an observed acceptance threshold, not a theoretical worst-case bound or
   hard-real-time guarantee, because a fenced operation may issue multiple
   sequential SDK RPCs.
5. **Current real-hardware evidence:** `scripts/npmw run verify:major --
   --base-url http://127.0.0.1 --config-file
   /path/to/validated/trex_cfg.yaml --browser-write-acceptance` passes and
   produces matching local/server Standard E2E archives containing the gate ID,
   Git SHA/dirty state, source digest, frontend asset manifest digest, API
   identity/config digest, traffic-idle postcondition, and zero remaining
   capture recorders.

Historical reports or reports without identity fields do not satisfy item 5.
When hardware is unavailable, the release remains blocked and the exact RPC,
daemon, port, permission, or config failure is recorded; fixtures cannot waive
this gate.

As of 2026-07-31, the RC implementation covers items 1, 2, and the browser-write
portion of item 4, but the final current-source form of item 5 must still be
generated after the last tracked edit. Item 3 has strong corruption/tamper
detection but not publisher authentication. The archive upgrader is globally
serialized and stops a matching API before live-source mutation, but the
multi-resource transaction is not crash-atomic: it has no durable phase
journal/reconciler, handled rollback is best-effort while the shell remains
alive, and a committed install does not keep a complete N-1 known-good release.
These are M4.0 release-engineering gaps, not waived production properties.

The persistent supervisor replaced the transient acceptance daemon with an
installer-managed, root-owned systemd unit whose JSON-RPC endpoint is
loopback-only. Native TRex/Scapy TCP 4500/4501/4507 remain upstream wildcard
listeners, so managed-local mode enforces a separate non-loopback nftables
reject boundary. Reboot activation, deliberate MainPID crash recovery, graceful
restart, and configuration-level workload lifecycle require source-bound target
host evidence; no live lab link state in this roadmap constitutes certification.

### M0: Foundation

- Scaffold frontend/backend monorepo.
- Add typed API contracts.
- Add real TRex environment configuration.
- Add backend runtime manager skeleton for service status, logs, and command allowlist.
- Add config generator schema for `trex_cfg.yaml`.
- Add base layout, navigation, theme, status primitives.
- Add CI-friendly lint/type/test commands.

### M1: Online Control POC

- Connect/disconnect to TRex.
- Discover server info and ports.
- Display real TRex service/daemon status.
- Acquire/release/reset ports.
- Stream live port stats to WebUI.
- Start/stop traffic using a known profile.
- Show logs and command errors.

### M2: Replacement MVP

- Profile import/export.
- Profile-to-port assignment.
- Stream list and core stream properties.
- Live dashboard for global, port, latency, and stream stats.
- Multiplier/rate update during traffic.
- Basic capture monitor/record/export.
- Port attributes and L2/L3 configuration.
- Service mode on/off workflows for ports that need L2/L3, ARP, ICMP, IPv6 ND, or capture operations.
- Advanced JSON request/response logger.
- Generate, preview, validate, and write TRex config files through guarded backend flows.
- Restart TRex after config deployment with confirmation and result logging.

### M3: Full Original GUI Coverage

- Advanced profile/stream builder.
- PCAP-based stream creation and PCAP export.
- Packet crafting with structured builder and raw expert views.
- Field Engine editor.
- IPv6 neighbor discovery.
- Hardware counters where exposed.
- TRex daemon/service start/stop/restart/start-live where supported.
- Config diff, version history, rollback, and active config detection.

### M4: Beyond Original GUI

- Test templates and guided benchmark runs.
- Run history and reproducible run bundles.
- Report exports.
- Profile versioning/diff/reuse.
- REST automation API for CI.
- Compatibility matrix and adapter capability flags for TRex versions.
- Hardware inventory and guided config creation from discovered NICs.

### M4 delivery sequence

#### M4.0: Production baseline

- Complete the production-candidate gate above on a clean checkout and on the
  target AlmaLinux host.
- Publish the supported Python, Node, Nginx, systemd, TRex server, STL client,
  NIC, and driver versions alongside the release evidence.
- Define artifact signing, its trust root, and mandatory pre-extraction
  verification; validate the signed Git-less artifact on a clean host.
- Replace in-place source publication with a versioned release switch, add a
  durable transaction journal plus startup/next-run reconciler, and inject
  `SIGKILL`/reboot failures at every publication phase.
- Retain a content-addressed N-1 bundle containing source, static assets,
  runtime, unit/config, and evidence; add capacity preflight and bounded backup
  retention instead of accumulating unbounded timestamp directories.

Exit criterion: a new host can verify and install the signed/checksummed artifact,
pass the production browser smoke and current-source Standard E2E on real
hardware, survive the documented reboot dependency sequence, reconcile an
interrupted deployment, and atomically select the complete previous release
after an injected failure.

#### M4.1: Contract and data-authority convergence

- Split the FastAPI entrypoint into domain routers and request/response DTOs;
  remove untyped `dict[str, object]` responses from operator-critical commands.
- Version the automation API and generate or validate the TypeScript client
  contract from OpenAPI in CI.
- Give connection, port ownership, capture lifecycle, traffic session, and run
  evidence one backend authority each. Frontend optimistic state must be bounded
  and reconciled explicitly with that authority.
- Break the monolithic React workspaces into independently loaded boundaries;
  keep capture/history arrays bounded and generate reports only while requested.
- Meet the keyboard, focus, labeling, live-region, reduced-motion, and unsaved-
  work warning baseline for every operator workflow.

Exit criterion: contract drift fails CI, operator-critical responses have typed
schemas, no duplicated state authority is needed to explain a command outcome,
and the production browser audit completes with no uncaught console/request or
critical accessibility errors.

Current progress: the main shell and five large workspaces are lazy-loaded and
capture history is bounded. Runtime target selection, capture leases, traffic
plans, and traffic sessions now share a crash-safe schema-v2 authority. Managed
sessions are bound to the exact target and daemon generation; start uses a
required nullable CAS and every pause/resume/stop/update mutation is fenced by
the current session ID. Traffic and capture hardware changes are preceded by a
durable mutation intent and recovered only from exact baseline evidence. A
hard-stopped Start persists its per-group deadline in that WAL; the independent
lifespan reaper can reconcile it after an API restart only against the exact
target/generation, session, ports, and ownership, and expired pending Start WAL
is never replayed. Typed DTOs cover the traffic runtime as well as
system/connect/stats/capture critical slices, but `apps/api/app/main.py` remains
a large unsplit entrypoint, several port/profile/daemon/report responses remain
dictionary-shaped, and OpenAPI-to-TypeScript drift is not yet a CI gate. The
production smoke proves a read-only path. The opt-in write acceptance
implementation covers bounded first-pair control and fail-closed complete-port
inventory, but a new current-source real-hardware gate is still pending; neither
replaces a full accessibility audit or certification of every supported
hardware row.

#### M4.2: Guided benchmark runs

- Implement quick validation, throughput/loss, latency, burst, and soak run
  templates as backend-owned state machines.
- Record preconditions, exact profile/config/tunables, port ownership, samples,
  cleanup actions, and postconditions in a reproducible run bundle.
- Make cancellation and timeout cleanup first-class and retryable.

Exit criterion: every template can be replayed from its bundle and proves
traffic idle, temporary ownership released, service mode restored, and capture
recorders removed after pass, fail, cancellation, or timeout.

#### M4.3: Compatibility and capability model

- Detect TRex/STL/daemon versions and adapter capabilities at connection time.
- Replace version heuristics in the UI with typed capability flags and explicit
  unsupported reasons.
- Maintain the real-hardware matrix for supported TRex releases, NICs, drivers,
  capture modes, latency features, daemon methods, and config fields.

Exit criterion: every M1-M4 operator action is either verified for a published
matrix row or disabled with a precise backend-owned capability blocker.

#### M4.4: Reusable assets and evidence operations

- Add profile version history, semantic diff, validated snippets, and rollback.
- Add searchable run history, retention controls, archive export/import, and
  comparison across source/config/profile identities.
- Define stable, authenticated CI automation endpoints only after the current
  single-operator trust boundary is intentionally expanded.

Exit criterion: profile and run artifacts are content-addressed, auditable,
retention-bounded, and restorable, with migrations and backward compatibility
covered by release tests.

## Build Rule

For every feature, start from the workflow:

1. What is the lab engineer trying to verify?
2. Which TRex API capability owns it?
3. What live feedback proves it is working?
4. What artifact should remain after the run?

If the feature cannot answer those four questions, it should not enter the main console yet.
