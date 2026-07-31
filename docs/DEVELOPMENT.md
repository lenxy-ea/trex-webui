# Development Notes

## M0 Scope

The current foundation targets real TRex-backed development:

- Backend environment contract for real TRex host, ports, paths, and daemon settings.
- Backend runtime manager with an allowlist for daemon/service commands.
- Config model and renderer for `trex_cfg.yaml`.
- Frontend operational overview that displays backend readiness and blockers without fake traffic data.
- Unit tests for command safety, config generation, API contracts, and UI blocker states.
- Hardware integration test entrypoint gated by `TREX_WEBUI_RUN_HARDWARE_TESTS=1`.

## Toolchain Baseline

- Node.js 24 LTS is the project runtime. `.nvmrc` and `.node-version` both pin `24.16.0`.
- npm 11.x is the package manager baseline; `package.json` records `npm@11.13.0`.
- The WebUI runs React 19, Vite 8, TypeScript 6, ESLint 10 flat config, Vitest 4, and jsdom 29.
- The root and WebUI `engines` fields require `node >=24 <25` and `npm >=11`.

On a fresh clone, install the pinned project runtime and locked JavaScript
dependencies before running project scripts:

```bash
scripts/bootstrap_node.sh
scripts/npmw ci
scripts/npmw --prefix apps/web ci
```

`scripts/npmw` prefers the project-local Node runtime and validates a compatible
Node 24/npm 11 pair when falling back to `PATH`. Use `ci`, not `install`, for
fresh setup and CI so the checked-in lockfiles remain authoritative.

Playwright screenshot verification is part of the UI workflow. The WebUI package
pins `playwright@1.60.0`; use the wrapper so the validated Node 24 toolchain is
first on `PATH`:

```bash
.venv/bin/uvicorn app.main:app --app-dir apps/api --host 127.0.0.1 --port 8080
scripts/npmw run dev:web -- --host 127.0.0.1 --port 5176
scripts/npmw run screenshot:web -- --url http://127.0.0.1:5176 --prefix workbench
```

Both development services stay on loopback by default. Binding either service
to `0.0.0.0` is an explicit remote-development opt-in and exposes an
unauthenticated control surface. Use it only on an isolated management network
with a restrictive host firewall; this application has no built-in
authentication or RBAC.

The backend must be reachable on port 8080 for screenshots that exercise `/api`;
otherwise Vite will correctly proxy `/api` as HTTP 502 and the captured page will
show the backend blocker. Avoid `npx playwright`, `npm exec playwright`, or direct
`node apps/web/scripts/capture-workbench.mjs` commands unless Node 24 is already
first on `PATH`; an older system Node can fail inside Playwright before the
browser launches.

The screenshot preflight also checks `/api/system/environment` for the current
backend readiness contract. If it warns that keys such as `host_valid` or
`configuration_errors` are missing, the API process is stale; restart the API
server before trusting the screenshot.

If the Playwright browser cache is missing after a fresh install, populate it with:

```bash
scripts/npmw --prefix apps/web exec -- playwright install chromium
```

## Real Acceptance Workflow

When the API, Nginx, and real TRex hardware are online, run the HTTP-level
acceptance workflow from the repo root:

```bash
scripts/npmw run acceptance:trex -- --base-url http://127.0.0.1
```

The script selects a live catalog profile, clears stats, starts RX capture,
starts traffic, polls real stats, stops capture, explicitly stops traffic,
collects post-stop stats/capture/port state, saves a run report archive through
`/api/trex/reports/save`, downloads it back, and writes a local evidence copy
under `.logs/`. The archived payload includes a `traffic_session` with start
and stop results plus sanitized capture/stats evidence, so it can verify the
full profile -> stats/capture -> stop -> report loop. The capture is stopped
inside the active traffic window by the separate `--observe-seconds` timer, not
only after the requested TRex `--duration` expires. Defaults are intentionally
low impact: `udp_1pkt_simple.py`, TX port `0`, RX capture port `1`, `5kpps`,
`2` seconds requested duration, and `1` second observation. Use `--profile`,
`--tx-port`, `--rx-port`, `--multiplier`, `--duration`, `--observe-seconds`,
and repeated `--tunable key=value` options for other profiles.

Run report history is exposed through `GET /api/trex/reports/trends?limit=N`.
The backend scans the real report archive directory, skips unreadable or
oversized JSON files, returns verdict counts, key metric deltas, recent records,
and a backend-owned history conclusion. Unknown verdicts and skipped archives
are treated as warning evidence rather than clean history.
Run report snapshots support operator-selected templates (`Operational Snapshot`,
`Throughput Validation`, `Latency Validation`, and `Capture Troubleshooting`);
the selected template contributes criteria to the report verdict and is persisted
in Markdown, JSON payload, CSV, PDF, archives, and comparisons.

## Standard E2E Workflow

Use the standard E2E when validating the whole product loop rather than one
profile/capture slice:

```bash
scripts/npmw run e2e:standard -- --base-url http://127.0.0.1
```

The workflow starts from the daemon path: it requires an already reachable
root-owned `trex_daemon_server`, uploads a custom TRex YAML through
`/api/system/daemon/trex/start`,
waits for real ports, runs a latency profile, runs a separate packet-capture
phase, stops traffic, verifies post-stop stats/capture/port state, saves a JSON
run report archive, downloads it back, and writes a local copy under
`.logs/standard-e2e/`.

The script never bootstraps the privileged daemon from the hardened API. It
restarts the TRex runtime through that daemon by default and leaves the daemon
and TRex server running but traffic-idle afterward. In the default same-host
deployment, `deploy/install.sh` owns the persistent root
`trex-daemon-server.service`, its loopback readiness check, and boot recovery.
With `--external-daemon`, the separately managed local or remote supervisor owns
those guarantees. The API remains unprivileged in both modes and never
bootstraps or supervises the daemon.

The script defaults to a disruptive-but-complete validation: it restarts TRex so
the custom YAML start is proven. Use `--reuse-running-trex` only when you want to
validate the traffic/report phases against an already-running TRex instance.
For release evidence, always pass `--config-file /path/to/validated/trex_cfg.yaml`
with the exact host-reviewed PCI order, addressing, and CPU topology. The
script's generated two-port configuration is only a harness convenience and
must not be treated as a portable hardware default.

[`examples/trex_cfg.yaml`](../examples/trex_cfg.yaml) demonstrates a fictional
six-port i350 configuration shape. Its PCI functions, locally administered
MACs, RFC 5737 IPs, NUMA socket, and CPU assignments are documentation
placeholders. It is deliberately separate from the active production config and
is neither link evidence nor certification for any hardware/version row. Follow
[`examples/README.md`](../examples/README.md) and replace every host-specific
value before attempting a daemon start.

The E2E is intentionally two-phase. On this real TRex build, RX capture enables
service mode on the receiver and cannot coexist with latency/flow_stats on the
same receiver port at the same instant. Treat that as a product constraint: the
standard archive records latency evidence and capture evidence as two real
phases in one report, and Run Reports recognizes this archive as
`workflow=standard-e2e`.

For an RC gate, add the explicitly opted-in production browser write acceptance:

```bash
scripts/npmw run verify:major -- --base-url http://127.0.0.1 \
  --config-file /path/to/validated/trex_cfg.yaml \
  --browser-write-acceptance
```

Never run this command with the unedited public example. The browser gate
starts only after Standard E2E has restarted and validated the host-configured
TRex runtime. It
refuses to write unless the configured acceptance pair is exactly the canonical
first logical pair, both selected links are up, every configured traffic port is
known idle and unowned, and capture inventory is empty. It uses `1kpps` with
`duration=-1` so Pause/Resume is observable across the supported acceptance
path, while a per-group canonical UTC `hard_stop_at` 60 seconds ahead provides
an API-owned safety lease.

On a normal Start response, the gate binds only the exact returned
traffic-session ID, carries it through each per-port Pause/Resume and explicit
first-pair Stop, and requires the stopped runtime to clear the lease. Preflight,
Start, Running, and every Pause/Resume/Stop boundary revalidate the complete
configured runtime inventory; missing, duplicate, extra, or non-idle
non-selected rows fail closed before the next write. If the Start response is lost after
commit, cleanup never adopts a later runtime session or issues a guessed stop.
Preflight simultaneously reads `/api/system/environment` with the ports,
traffic-runtime, and capture contracts; missing, non-integer, or out-of-range
`connect_timeout_seconds` blocks before the plan write. The RC gate accepts only
1 through 3 seconds and records the accepted value in preflight and final
evidence. Under that prerequisite it waits through `hard_stop_at + 5s`, then
requires every configured port exactly once and stopped/unowned, the exact
pending Start WAL cleared, and the exact gate-written groups plus revision still
current before restoring the original plan.

Stats, ports, runtime snapshots, and the hard-stop reaper share the runtime
mutation fence. An in-flight operation may issue several sequential SDK calls,
each subject to the connection timeout, and scheduler delay can further
postpone when expiry is observed. The fixed five-second grace is therefore an
observed RC acceptance threshold for `connect_timeout_seconds <= 3`, not a
theoretical worst-case bound or a hard-real-time promise that TRex stops at the
exact deadline.

## M1 Control Surface

The backend exposes a first online-control surface around the real TRex STL client:

- `GET /api/trex/probe`: connect and report server version/system info; invalid configured host or sync/async ports return `trex_environment_invalid` before importing STLClient or opening a TRex connection.
- `POST /api/trex/connect`: apply and persist the runtime host/sync/async/scapy/client-name/timeout target in the schema-v2 runtime-state file, close and retire the previous cached STL client/stats sampler under the global runtime-mutation fence, and return the same real system overview shape as `/api/system/overview`. It does not write `.env`; an API restart restores the persisted target. Active/unknown traffic or any managed capture lease blocks a target change, and managed-local mode remains pinned to `127.0.0.1:4501/4500/4507`.
- `POST /api/trex/disconnect`: run capture cleanup before closing the cached STL session. A cleanup or SDK disconnect failure retains the client/runtime authority and returns the blocker so the frontend remains connected; only complete cleanup clears the stats sampler and connection state. A requested new target is validated before the old healthy session is disconnected.
- `GET /api/trex/ports`: connect and return port IDs, acquired ports, port info, warnings, and server metadata.
- `GET /api/trex/stats?ports=0&ports=1`: return live STL stats for selected ports or all ports.
- `GET /api/trex/profiles`: scan `TREX_WEBUI_PROFILE_ROOTS` and return allowed STL profile files plus root readiness; dirty profile roots return `profile_root_path_invalid` root records instead of crashing or masquerading as empty roots.
- `GET /api/trex/profiles/preview?profile_path=...`: return a bounded text preview for allowed `.py`, `.yaml`, `.yml`, and `.json` profiles without executing profile code; binary `.pcap`/`.cap` profiles return an explicit blocker, dirty request paths return `profile_path_invalid`, and invalid-only profile roots return `profile_root_path_invalid`.
- `GET /api/trex/traffic/runtime`: return the authoritative persisted traffic
  plan, plan revision, six-port config identity, live per-port ownership/state,
  and the current target/generation-bound traffic session. An empty six-port
  plan initializes `pair-0`, `pair-1`, and `pair-2` from consecutive port pairs.
- `PUT /api/trex/traffic/plan`: replace the complete plan only when
  `plan_revision` matches, with non-overlapping groups, known config ports, and
  backend-resolved profile paths.
- `POST /api/trex/traffic/group/{group_id}/start`: start one persisted group
  against the supplied plan revision and return the exact persisted session.
  `expected_session_id` is required but nullable: `null` proves the caller
  expects no active session, while adding to one requires its exact ID. An
  optional `hard_stop_at` must be a future absolute UTC timestamp no more than
  300 seconds away; it is persisted on that session group, not in the plan.
- `POST /api/trex/traffic/start`: load an allowed clean profile path, attach
  streams, start traffic, and persist its target/generation-bound session;
  requires confirmation token `start-traffic` plus the same required nullable
  start CAS, accepts the same optional per-group `hard_stop_at`, and returns it
  with the session. Dirty profile paths or roots return explicit profile
  blockers before STLClient work.
- `POST /api/trex/traffic/update`: update a complete managed traffic group
  through real `STLClient.update(ports, mult, force, total)` without reloading
  the profile or stream table. The request must include the exact current
  `expected_session_id`; stale/missing session authority is rejected before live
  TRex mutation.
- `GET /api/trex/capture/files`, `POST /api/trex/capture/files/download`, and `POST /api/trex/capture/files/open`: browse saved `.pcap`/`.cap` files under the backend capture root, download bounded browser-safe PCAP content, or launch a configured local analyzer. Analyzer launch is disabled unless `TREX_WEBUI_CAPTURE_OPEN_COMMAND` is set; the backend uses an argv list without shell interpolation and always appends the resolved capture file path under `daemon_log.parent/captures`.
- `GET /api/trex/capture/status` and capture command responses include backend-normalized `port_usage` rows derived from real capture filters, so the WebUI can show active RX/TX recorder occupancy per port without re-parsing TRex-private status shapes.
- `POST /api/trex/ports/acquire`: acquire ports; `force=true` requires confirmation token `force-acquire`.
- `POST /api/trex/ports/release`: release ports.
- `POST /api/trex/ports/reset`: reset ports; requires confirmation token `reset`.
- `POST /api/trex/ports/service-mode`: toggle service mode; requires confirmation token `service-mode`.
- `POST /api/trex/traffic/stop`: stop explicit ports owned by the current
  managed session; requires confirmation token `stop` and the exact current
  `expected_session_id`.
- `POST /api/trex/traffic/pause` and `POST /api/trex/traffic/resume`:
  pause/resume explicit managed ports with the exact current
  `expected_session_id`. Persisted per-port state allows one port of a pair to
  be paused/resumed without losing the mixed group/session state.

Every traffic start/update/pause/resume/stop and capture start/cleanup path
persists a target/generation/baseline-bound mutation intent before its first
live side effect. A normal completion atomically promotes the intent into the
session or lease. A process crash is reconciled only from exact nonce and live
baseline evidence; ambiguous or changed authority remains durable
`cleanup_required` and blocks further mutation instead of guessing.

For a hard-stopped Start, that WAL also contains the exact group deadline
before acquisition, stream installation, or Start RPC. A reaper started and
stopped with the FastAPI lifespan enforces expired leases without depending on
GET traffic or a surviving browser. After an API restart it may stop only the
persisted target/generation, session ID, group ports, and port authority; a
mismatch fails closed. An expired pending Start intent receives only an exact
rollback attempt and is cleared only after rollback is proven; otherwise the
durable blocker is retained. It is never replayed. Pause/Resume and a partial
Stop retain the deadline while any group port remains active; an explicit
full-group Stop or successful lease cleanup clears `hard_stop_at`.

- `GET /api/system/daemon`: return the real daemon dialog payload: environment, daemon `show` status, daemon JSON-RPC connectivity, action previews, active config YAML snapshot, and daemon log tail; daemon service `running=true` requires a successful `show` command plus running text, connectivity must be a boolean daemon result or it returns `daemon_connectivity_result_invalid`, daemon log RPC results must be base64 strings or they return `daemon_log_result_invalid`, local daemon paths in readiness are reported with clean-absolute validity flags before filesystem probes, invalid host or integer environment values are reported in readiness `configuration_errors`, and invalid Runtime-level config/log size limits or paths return explicit blockers before file reads.
- `GET /api/system/daemon/config/metadata`: read real daemon config metadata and devices info through JSON-RPC; metadata must be the daemon's field-list array with JSON object entries that match the upstream `MetaField` basics: field-list entries require clean non-empty `id` and `name` strings with no leading/trailing whitespace or NUL bytes, `LIST` item schemas may omit `id` because list elements are not YAML map keys, `type` must be clean and known (`NUMBER`, `FLOAT`, `LIST`, `OBJECT`, `STRING`, `BOOLEAN`, `IP`, `MAC`, or `ENUM`), `description` must be a string when present, `default` must be scalar when present, `mandatory` must be boolean when present, and `mandatory_if_not_set` must be a clean non-empty string when present. `OBJECT` fields require nested `attributes` field lists, `LIST` fields require `item` field objects, and `ENUM` fields require non-empty `values` lists made of clean strings, finite numbers, or booleans so config selection can round-trip to YAML without fake coercion. Devices info must match upstream `dpdk_nic_bind.py --json`: a JSON object keyed by clean PCI slot strings (`domain:bus:slot.func` or `bus:slot.func`) with object values. Invalid metadata returns `daemon_metadata_result_invalid`, oversized metadata returns `daemon_metadata_result_too_large`, and unavailable, invalid, or oversized devices info returns `daemon_devices_info_unavailable`, `daemon_devices_info_result_invalid`, or `daemon_devices_info_result_too_large` while preserving usable metadata and not passing fake device data to the frontend.
- `GET /api/system/daemon/devices`: read real daemon devices info through JSON-RPC `get_devices_info`; RPC errors or exceptions return `daemon_devices_info_unavailable`, invalid result shape or dirty PCI slot keys return `daemon_devices_info_result_invalid`, and oversized results return `daemon_devices_info_result_too_large`, always with `devices_info=null` on failure.
- `GET /api/system/daemon/config/default`: read the real daemon default config through JSON-RPC `get_trex_config`; the daemon result must be a base64 string that decodes to non-blank UTF-8 YAML without NUL content. Non-string, blank, or NUL-containing results return `daemon_config_result_invalid`, invalid base64 or invalid UTF-8 returns `daemon_config_decode_failed`, and oversized daemon base64 config results return `daemon_config_result_too_large` without content.
- `GET /api/system/daemon/config/versions`, `POST /api/system/daemon/config/versions/save`, `POST /api/system/daemon/config/versions/load`, and `POST /api/system/daemon/config/versions/diff`: manage backend-owned TRex config versions under `daemon_log.parent/config-versions`; version filenames are generated and validated by the backend, content is bounded UTF-8 YAML without NUL bytes, generated validation-error previews are rejected on save, `load` returns content to the editor without starting TRex, and `diff` returns a bounded unified diff against supplied editor content or the active config snapshot.
- `GET /api/system/daemon/preview/{action}`: preview an allowlisted daemon command.
- `POST /api/system/daemon/{action}`: wrapper lifecycle compatibility surface. In managed-supervisor mode, `start`, `stop`, `restart`, and `start-live` are disabled with an explicit blocker because systemd is the only daemon PID authority and the API has neither root nor `systemctl` permission. External-daemon lifecycle also remains the remote supervisor's responsibility. This restriction does not disable `POST /api/system/daemon/trex/start` or `/trex/stop`, which continue to control the TRex workload through guarded JSON-RPC rather than stopping the daemon process.
- `GET /api/system/daemon/status`: run the real daemon `show` command and parse running state; failed `show` commands always report `running=false` even if stdout contains running text.
- `GET /api/system/daemon/trex/status`: read real TRex process state through daemon JSON-RPC `is_running`, `get_running_status`, and `get_trex_cmds`; running status must include daemon `TRexStatus` state values `1`/`2`/`3` and a string `verbose`, otherwise it returns `daemon_running_status_result_invalid` before reading commands, and commands must be clean `[pid, command]` string pairs with positive numeric PID strings or it returns `daemon_trex_cmds_result_invalid`.
- `GET /api/system/daemon/trex/version`: read the real TRex binary version through daemon JSON-RPC `get_trex_version`; daemon version results must be base64 strings that decode to non-blank UTF-8 text, non-string or blank results return `daemon_version_result_invalid`, invalid base64 or invalid UTF-8 returns `daemon_version_decode_failed`, and oversized daemon base64 version results return `daemon_version_result_too_large` without exposing replacement text as a version.
- `GET /api/system/daemon/trex/log`: read the real TRex process log through daemon JSON-RPC `get_trex_log`; daemon log results must be base64 strings, non-string results return `daemon_trex_log_result_invalid`, invalid Runtime-level log size limits return explicit blockers before RPC, invalid base64 returns `daemon_trex_log_decode_failed`, and oversized daemon base64 log results return `daemon_trex_log_result_too_large`.
- `GET /api/system/daemon/files`: list daemon-accessible TRex files through daemon JSON-RPC `get_files_path` and `get_files_list`; the route query path limit uses the Runtime daemon file-path limit, non-string, relative, NUL-containing, or whitespace-padded Runtime-level request paths return `daemon_files_path_invalid` before RPC, whitespace-only request paths return `daemon_files_path_missing` before RPC, oversized request paths return `daemon_files_path_too_long` before RPC, blank, whitespace-padded, non-absolute, NUL-containing, or oversized daemon `get_files_path` results return `daemon_files_path_result_invalid` before `get_files_list`, and file-list entries must be clean non-empty entry names: no leading/trailing whitespace, no NUL, no `/`, not `.`/`..`, and not oversized, otherwise the route returns `daemon_files_list_result_invalid`.
- `GET /api/system/daemon/files/content`: read daemon-accessible file content through daemon JSON-RPC `get_file`; route query path and `max_bytes` limits reuse the Runtime daemon file-path/content limits, non-string, relative, NUL-containing, or whitespace-padded Runtime-level file paths return `daemon_file_path_invalid` before RPC, invalid Runtime-level size limits return `daemon_file_max_bytes_invalid` before RPC, oversized Runtime-level file paths return `daemon_file_path_too_long` before RPC, non-string daemon file results return `daemon_file_result_invalid`, invalid base64 returns `daemon_file_decode_failed`, and oversized daemon base64 file results return `daemon_file_result_too_large` without preview content.
- `GET /api/system/daemon/trex/running-info`: read real daemon running-info JSON through daemon JSON-RPC `get_running_info`; daemon results must be JSON strings that decode to JSON objects, non-string or non-object results return `daemon_running_info_result_invalid`, invalid JSON returns `daemon_running_info_decode_failed`, and oversized daemon JSON strings return `daemon_running_info_result_too_large`.
- `GET /api/system/daemon/trex/latest-dump`: read real daemon latest stats dump JSON through daemon JSON-RPC `get_latest_dump`; daemon results must be JSON strings that decode to JSON objects, non-string or non-object results return `daemon_latest_dump_result_invalid`, invalid JSON returns `daemon_latest_dump_decode_failed`, and oversized daemon JSON strings return `daemon_latest_dump_result_too_large`.
- `GET /api/system/daemon/trex/reservation`: read real reservation state through daemon JSON-RPC `is_reserved` without synthesizing owner details the daemon does not expose.
- `POST /api/system/daemon/trex/reservation/reserve`: reserve TRex through daemon JSON-RPC `reserve_trex`, using the supplied user or the backend runtime user from `getpass.getuser()`; the request model uses the Runtime reservation-user limit, non-string, NUL-containing, or whitespace-padded explicit users return `daemon_reservation_user_invalid`, blank users return `daemon_reservation_user_missing`, and oversized users return `daemon_reservation_user_too_long` before RPC.
- `POST /api/system/daemon/trex/reservation/cancel`: cancel a matching TRex reservation through daemon JSON-RPC `cancel_reservation`; the request model uses the Runtime reservation-user limit, non-string, NUL-containing, or whitespace-padded explicit users return `daemon_reservation_user_invalid`, blank users return `daemon_reservation_user_missing`, oversized users return `daemon_reservation_user_too_long`, and only a boolean `true` result is treated as canceled, while `false` returns `daemon_cancel_reservation_not_canceled`.
- `POST /api/system/daemon/trex/start`: require confirmation token `start-trex` when confirmation is enabled, save a backend config version before upload, upload bounded UTF-8 config bytes through daemon `push_file`, resolve daemon files path, then call `start_trex` with `stateless=true` and the backend runtime user; the request model uses the same full daemon config limit as Runtime validation, NUL-containing backend runtime users return `daemon_start_user_invalid`, oversized backend runtime users return `daemon_start_user_too_long` before config upload, omitted `config_content` reads the real config file with strict UTF-8 decoding up to the full daemon config byte limit rather than the preview limit, non-string or NUL-containing Runtime-level content returns `daemon_config_content_invalid`, blank content returns `daemon_config_content_missing`, generated validation-error previews beginning with `### errors in config` return `daemon_config_content_invalid_generated` before daemon RPC, invalid UTF-8 returns `config_decode_failed`, oversized or truncated content returns `daemon_config_content_too_large`, invalid timeout returns `daemon_start_timeout_invalid`, invalid configured default timeout also returns `daemon_start_timeout_invalid` before config upload, failed pre-start local backup returns `daemon_config_backup_failed`, false config uploads return `daemon_config_upload_failed`, non-boolean upload results return `daemon_config_upload_result_invalid`, blank, whitespace-padded, non-absolute, NUL-containing, or oversized daemon files paths return `daemon_files_path_unavailable` before `start_trex`, the daemon's positive integer run sequence is exposed as `sequence`, non-positive or non-integer start results are reported as blockers rather than fake success, and the uploaded config filename is sanitized from the same runtime user used for start, with dot-only filenames normalized to `trex-webui`.
- `POST /api/system/daemon/trex/stop`: require confirmation token `stop-trex` when confirmation is enabled, then call daemon `force_trex_kill`; boolean `true` returns `stopped=true`, boolean `false` returns `ok=true` with `stopped=false` so the UI can log the original dialog message `TRex is not running`, and non-boolean results return `daemon_stop_result_invalid`.

The API returns explicit blockers such as `trex_connect_failed`, `trex_command_failed`, and `confirmation_required` rather than fabricating healthy data. `TREX_WEBUI_TREX_HOST` is a hostname or IP address, not a URL; schemes, paths, credentials, embedded ports, edge whitespace, NUL bytes, and bracketed IPv6 literals are captured as `configuration_errors` and blocked as `trex_environment_invalid` or `daemon_host_invalid` before real connections. Bare IPv6 hosts are accepted and bracketed only when building the daemon HTTP URL. Invalid `.env` integer values are captured as `configuration_errors`, surfaced through readiness, and block STL/daemon calls before using fallback default ports or opening real connections. Daemon JSON-RPC HTTP responses are stream-read with an 8 MiB body ceiling before strict UTF-8 JSON parsing that rejects non-finite `NaN`/`Infinity` values. Daemon JSON-RPC responses must be JSON-RPC 2.0 objects with the matching request id and exactly one real outcome: `result` or a non-empty `error` object; `error:null` is not accepted as an absent error or valid error object. Invalid daemon responses return `daemon_rpc_failed` instead of leaking adapter exceptions, daemon error objects surface their message text in payload `error`, invalid daemon RPC environment timeouts return `daemon_rpc_timeout_invalid` before opening a daemon connection, and daemon `running-info`/`latest-dump` JSON strings reject non-finite numbers before exposing stats data.

The frontend now uses a TRex Workbench shell instead of a generic overview dashboard. The visible runtime frame is a top menu/command bar, left topology tree, original-style central Port view, floating workflow dialogs, bottom log dock, and status footer. This matches the original TRex GUI/Ixia/Spirent style while keeping modern web controls. Frontend daemon API helpers cover the real backend daemon endpoints for devices info, file browsing/content, TRex process status/version/logs, running-info/latest-dump, and reservation state so future UI work consumes project-owned contracts rather than raw fetch calls.

The Port Control view follows `ports/Port.fxml` and `ports/PortAttributes.fxml`: `Control`, `Configuration`, and `Hardware counters` tabs, the Control attribute grid, and bottom Acquire/Force Acquire/Release/Reset buttons. Traffic stop/pause/resume remains in the top command toolbar, matching the original GUI separation.

The Dashboard floating window follows `dashboard/Dashboard.fxml`: 10 global stat panels, `Ports`/`Streams`/`Latency`/`Charts`/`Utilization` tabs, and `Clear`. It polls real `GET /api/trex/stats` while preserving backend blockers such as `trex_connect_failed`.

The TRex Daemon floating window follows `TRexDaemonDialog.fxml`: host/port connect row, config edit region, YAML preview, Log view, and bottom reservation plus Stop/Start timeout/Start controls. It is backed by real daemon JSON-RPC endpoints through the backend; config, logs, runtime state, and reservation state are read from real sources, generated config validation disables Start just like the original dialog, the Start timeout field filters input to digits like the original controller, Start keeps the original bottom-row command shape but uses a visible confirmation before sending the backend `start-trex` token with the current YAML preview, Stop likewise asks before posting `stop-trex`, and command results/blockers are surfaced through the dialog and Log View. The Log View includes real start progress from the backend result (`config_uploaded`, `timeout_seconds`, and daemon run `sequence`) plus the real daemon `get_running_status` verbose state when available, so Start/Stop refreshes show actual upload/start/runtime state instead of only local success text. Config upload blockers such as `daemon_config_upload_failed` are labeled as `Config upload to TRex host failed: ...`, matching the original controller's upload stage instead of flattening them into generic start failures. Malformed YAML returned by `Load default config` is logged as `Unable to parse received default config YAML: ...`, shown in the YAML error preview, and disables Start instead of silently generating a replacement config from empty values. Connected and pending-command controls follow the original availability model: Connect is disabled while connected, Load default config is disabled until usable config metadata exists, and Load default config, Start timeout, Start, and Stop are disabled while a TRex command is running. Disconnect keeps the original controller's user-action log line (`Disconnected from http://host:port`) after clearing live daemon overview state; closing the floating window follows the original `closeHandler()` lifecycle by clearing connected daemon state instead of preserving a stale hidden connection. This is local UI history, not a synthesized daemon status. The config editor accepts only daemon metadata field-list entries that match the backend `MetaField` contract, so missing field `id` values cannot become fake YAML keys; `LIST.item` schemas may still omit `id`, matching real TRex metadata. ENUM controls preserve backend scalar value types when generating YAML rather than turning numeric or boolean choices into strings. Interface list entries mirror the original select-interface workflow by offering choices only from real daemon `get_devices_info` data; when devices info is unavailable, the UI keeps manual entry and does not synthesize dummy devices. Devices info failures are logged as devices-info issues without disabling config editing when metadata is still usable; config metadata failures collapse and disable the config edit pane like upstream `controlsDisabledOnMetadataNotExists`. Config scalar parsing is strict: NUMBER uses the upstream Java integer range, malformed FLOAT text is rejected instead of being truncated through JavaScript `parseFloat`, malformed IP fields such as `default_gw` or `ip` are rejected before Start, and BOOLEAN/STRING fields must keep their real YAML scalar type instead of being coerced by JavaScript.

The Traffic Profiles floating window follows `TrafficProfileDialog.fxml`: left profile action/list region and right stream action/table region. It consumes the real profile catalog only to populate the profile list; stream/profile builders should extend this dialog shape rather than reintroducing a card dashboard shell.

The Stream Builder packet editor is backend-owned: React edits typed workbench
fields, while the API renders TRex YAML, packet bytes, packet preview rows, and
PCAP/YAML round-trip metadata. ICMPv6 control messages now cover Echo,
Neighbor Solicitation/Advertisement, and Router Solicitation/Advertisement;
Router/Neighbor control messages force code `0`, IPv6 Hop Limit `255`, fixed
IPv6 address modes, and fixed frame length so generated packets stay valid on
real TRex. GRE editing covers Ethernet/IPv4/GRE and Ethernet/IPv6/GRE with
checksum/key/sequence fields plus an inner IPv4/UDP payload editor; the live
HTTP contract, backend renderer, PCAP import/export, and frontend packet-type
union must be updated together whenever new packet types are added.
GRE key/sequence Field Engine writes the optional GRE key and sequence words at
runtime, but GRE checksum must stay absent because TRex VM does not recalculate
GRE checksums after option writes.
Packet viewer Expert VM templates are frontend-authored JSON snippets that
ride the existing `advanced_vm` backend passthrough. Outer IPv4/UDP/TCP
templates must derive write offsets from the current outer L2 length, including
VLAN tags and MPLS labels, and must emit TRex checksum fixups with `l2_len`,
`l3_len`, and UDP/TCP `l4_type` constants (`11`/`13`).

Frontend ownership after the Workbench refactor:

- `apps/web/src/App.tsx` owns backend fetching, command handlers, form state, derived labels, and floating dialog selection.
- `apps/web/src/components/workbench/WorkbenchChrome.tsx`, `TopologyPane.tsx`, `LogDock.tsx`, and `StatusFooter.tsx` render the shared operational frame.
- `apps/web/src/components/workbench/PortControlWorkspace.tsx`, `DashboardWorkspace.tsx`, `TrafficProfilesWorkspace.tsx`, and `TrexDaemonDialog.tsx` render the current workflows as pure components that receive project-owned DTOs and callbacks.
- `TrexDaemonDialog.tsx` is lazy-loaded because it uses CodeMirror for YAML/log viewing; keep heavy third-party controls out of the initial bundle.
- `PortControlWorkspace.tsx` orchestrates `PortDetailTabs.tsx`, `PortAttributesPanel.tsx`, and `PortActionBar.tsx`; extend those paths when adding real Port Configuration or Hardware Counters behavior.
- `apps/web/src/components/workbench/format.ts` contains display-only formatting helpers. Do not put TRex transport parsing or backend fallback logic in the frontend display layer.

## Upstream UI Reference

The discontinued GUI is cloned locally for design reference at:

```bash
.references/trex-stateless-gui
```

Keep this directory ignored and treat it as source material, not project code. Useful reference entry points:

- `src/main/resources/fxml/MainView.fxml`: menu bar, command toolbar, topology tree, central work area, bottom log view, connection footer.
- `src/main/resources/fxml/ports/Port.fxml`: port tabs for `Control`, `Configuration`, and `Hardware counters`.
- `src/main/resources/fxml/TrafficProfileDialog.fxml`: profile list/actions on the left and profile/stream workspace on the right.
- `src/main/resources/fxml/StreamPropertiesView.fxml`: stream mode, rate, burst, RX stats, and next-stream form grouping.
- `src/main/resources/fxml/dashboard/Dashboard.fxml`: dashboard shell for global stats, ports, streams, latency, and charts.
- `src/main/resources/fxml/TRexDaemonDialog.fxml`: daemon host/port connection, config edit/YAML preview, log view, and start/stop controls.
- `src/main/resources/fxml/pkt_capture/Layout.fxml`: packet capture monitor/record split.

## Quality Gates

For small code edits, keep the usual local checks green:

```bash
scripts/npmw --version
scripts/npmw test
scripts/npmw run typecheck:web
scripts/npmw run lint:web
scripts/npmw run test:web
scripts/npmw run build:web
scripts/npmw run screenshot:web -- --url http://127.0.0.1:5176 --prefix workbench
scripts/npmw --prefix apps/web audit --audit-level=moderate
```

For every major change, `scripts/npmw run e2e:standard` is the fixed acceptance
gate.
Use the wrapper below for normal major-change validation because it also runs
the local checks, deploy probe, Nginx sync, and archive verification:

```bash
scripts/npmw run verify:major -- --base-url http://127.0.0.1 \
  --config-file /path/to/validated/trex_cfg.yaml
```

This wrapper runs release/archive rollback tests, virtualenv/runtime transaction
tests, the global deployment-lock suite, API tests, four Web test shards by
default, Web typecheck/lint/build, and `git diff --check`. It publishes the fresh
`apps/web/dist` with a rollback directory, runs a strictly read-only production
browser smoke through Nginx, runs the Nginx/API deployment probe, binds a
gate ID to the current source and frontend build identities, and then executes
`scripts/npmw run e2e:standard`. The Standard E2E step is mandatory for major
changes because it proves the product loop:
daemon custom YAML start, profile start, stats/latency, packet capture, stop,
postcondition cleanup, and report archive creation. The gate verifies a fresh
local JSON generated during that gate run under `.logs/standard-e2e-gate/` and
fails unless the archive has `standard_e2e=true`, `workflow=standard-e2e`,
`verdict=pass`, the expected source/build/API/config identities, idle traffic
ports, and zero active capture recorders. Treat the
matching server-side archive under `/var/log/trex/reports/` as the acceptance
evidence for the change.
The final handoff for a major change must include the local evidence file and
matching server archive path, or the exact hardware/environment blocker if the
Standard E2E cannot run. Do not mark a major TRex WebUI slice complete from unit
tests alone.

`verify:major` does not run dependency audits and does not prove that the hosted
CI workflow executed. Run the Python runtime and Node production dependency
audits separately, and use the CI result as independent evidence for a
distributable release:

```bash
.venv/bin/python -m pip_audit -r apps/api/requirements-dev.lock
scripts/npmw --prefix apps/web audit --audit-level=high
```

`scripts/npmw run verify:major` is intentionally disruptive by default: it
restarts TRex through the daemon so custom YAML startup remains covered. If a
lab owner has already prepared a running TRex instance and explicitly wants to
avoid restart, pass `--reuse-running-trex`. Use
`--config-file path/to/trex_cfg.yaml` when a change must be validated against a
specific hardware config.

The gate assumes the standard LAN deployment root `/var/www/trex-webui/dist`.
Use `--web-root` for a different Nginx static directory, or
`--skip-web-root-sync` only when validating against an intentionally unchanged
deployed frontend.
Each local gate step defaults to a 30 minute timeout, and the real Standard E2E
step also defaults to 30 minutes. Use `--step-timeout SECONDS` or
`--e2e-timeout SECONDS` only when the lab is known to need a longer bounded
window; a timeout is a gate failure and should be reported with its log path.

The old Node 16-compatible Vite/esbuild line is retired. Do not downgrade the frontend toolchain to regain Node 16 or Node 20 compatibility; TRex WebUI development should stay on the Node 24 LTS baseline unless the whole project baseline is intentionally revised.

## Real Hardware Contract

Before validating online workflows, configure:

```bash
TREX_WEBUI_TREX_HOST=127.0.0.1
TREX_WEBUI_TREX_SYNC_PORT=4501
TREX_WEBUI_TREX_ASYNC_PORT=4500
TREX_WEBUI_TREX_SCAPY_PORT=4507
TREX_WEBUI_TREX_DAEMON_PORT=8090
TREX_WEBUI_TREX_SCRIPTS_DIR=/opt/trex-core/scripts
TREX_WEBUI_TREX_DAEMON_BIN=/opt/trex-core/scripts/trex_daemon_server
TREX_WEBUI_TREX_CONFIG_PATH=/var/lib/trex-webui/trex_cfg.yaml
```

`/var/lib/trex-webui/trex_cfg.yaml` is the standard production authority because
the unprivileged service can atomically version and replace it. A development
process may deliberately use the legacy `/etc/trex_cfg.yaml` only when its Unix
permissions and non-systemd trust boundary are understood.

`TREX_WEBUI_TREX_HOST` must be only the host name or IP address. Loopback is the
safe development and managed-local default. Documentation-only remote examples
are `192.0.2.10`, `trex.example.test`, and `2001:db8::10`; configure ports
through the separate port variables. The backend reports blockers when paths,
privileges, or TRex connectivity are not ready.

The production runtime supervisor has two explicit deployment modes:

- Local managed mode is the default. `deploy/install.sh` and
  `deploy/upgrade.sh` publish and enable a root-owned
  `trex-daemon-server.service`, bind RPC only to `127.0.0.1:8090`, wait for
  bounded JSON-RPC readiness, reject upstream wildcard-bound native TCP
  4500/4501/4507 through the installer-owned nftables boundary, and start the
  API afterward. The API unit pins persistent runtime state to
  `/var/lib/trex-webui/runtime-state.json`. The daemon service runs the
  root-owned `/usr/libexec/trex-webui/trex_daemon_supervisor.py`, which executes
  the unmodified upstream wrapper in foreground `start-live` mode with
  `on-failure` recovery. The installed launcher and RPC probe are atomically
  versioned and rolled back with the unit, independent of checkout replacement.
  The optional `/etc/trex-webui/trex-webui.env` is preflighted before mutation
  as a root-owned `0600` non-symlink file and cannot override the managed host,
  control ports, supervisor, runtime-state path, or daemon-generation path.
  Deployment acceptance reads those effective values from the API `MainPID`
  under `/proc`.
  On every daemon-service start, the supervisor atomically replaces
  `/run/trex-webui/daemon-generation` with a root-owned canonical UUID. Runtime
  state schema v2 binds every managed capture lease and traffic session to that
  generation and to the exact host/sync/async/Scapy target. An API restart may
  recover ownership only when all fields still match. Traffic is never
  re-adopted across a daemon restart or target change. Capture reconciliation
  has one narrower safe case for a systemd generation rollover: if the old
  recorder ID is absent from the new daemon, it clears only the stale local
  lease and performs no recorder/service-mode/port mutation; if that numeric ID
  is reused, it fails closed and protects the new recorder.
- External mode requires `--external-daemon` and an operator-managed local or
  remote supervisor. Install, upgrade, and verification then leave every local
  daemon unit, process, RPC listener, and log untouched. For a remote daemon,
  restrict daemon/STL/Scapy ports to the WebUI host; in either topology,
  independently prove boot recovery. Because an external supervisor does not
  provide a trusted generation file, capture and traffic ownership uses a
  process-local marker and is never automatically recovered by a new API
  process.

Remote mode is an explicit security opt-in, not a discovery fallback. TRex WebUI
does not provide built-in authentication or RBAC, and it does not add
authentication to upstream daemon/STL/Scapy protocols. Keep the API behind a
restrictive reverse proxy and firewall, allow only the dedicated WebUI host to
reach remote control ports, and never expose them to the Internet or an
untrusted LAN.

Runtime state v1 is intentionally not migrated or guessed. A v1 file, a missing
authority, a corrupt generation, or an unreadable generation file fails closed
without rewriting the file. An operator may remove an obsolete state file only
after independently proving that traffic is idle and there are zero live
capture recorders; deployment must never delete it automatically.

Capture start is also journaled before its live RPC. A `pending_start` lease
retains the baseline recorder IDs, target/generation, filter, ports,
service-mode state, and temporary acquisitions. If the post-start status has
not yet exposed one uniquely attributable recorder, reconciliation and
disconnect fail closed and retain the ledger. Once a unique recorder is proven,
the lease is atomically promoted to `cleanup_required` before removal. If
recorder removal succeeds but service-mode restoration or port release fails,
an API restart resumes those remaining cleanup steps without touching a reused
ID from another daemon generation.

The API unit has no capabilities, has `NoNewPrivileges=true`, and cannot invoke
`systemctl`; never grant it sudo merely to manage the privileged dependency.
Managed mode therefore disables upstream wrapper `start`, `stop`, `restart`,
and `start-live` actions at the API boundary. TRex workload start/stop remains
available through `/api/system/daemon/trex/start` and `/trex/stop` JSON-RPC
workflows.

Installer and upgrader preflight the local daemon before any managed supervisor
mutation. Without `--allow-daemon-runtime-restart`, they fail closed when RPC
reports TRex running or reserved, or when the daemon is active but its RPC state
cannot be trusted. That flag is maintenance consent to interrupt the TRex
runtime/reservation and must not be a default CI or unattended-upgrade option.
Rollback restores supervisor files and service state, not a terminated TRex
workload or reservation.

TRex v3.08 exits its session thread after `SIGUSR1` without waiting on the
launched `t-rex-64` `Popen`, and its SIGTERM handler otherwise calls blocking
server shutdown from the serving thread. The managed launcher applies
fail-closed compatibility patches for both cases: workload stop returns only
after the child is reaped (or a timeout escalates to a PID/PGID-validated
SIGKILL), and daemon SIGTERM closes the listener without the same-thread
deadlock. Tests must check `/proc` child/status data and hugepage reuse/no-growth;
`systemd-cgls` alone hides zombie tasks. A stopped workload may leave the live
daemon's 1 GiB hugepage pool allocated, so the hardware check is repeated
start/stop reuse without per-cycle growth, not an unconditional return to the
kernel free-page baseline.

Managed daemon stdout/stderr is appended to
`/var/log/trex/trex_daemon_server.log` as `root:trex-webui` `0640`. Its
logrotate rule uses `copytruncate` so the long-lived systemd output descriptor
does not continue writing invisibly to a renamed inode.

Before Standard E2E, verify the selected mode's supervisor contract. For local
mode, the managed unit must be active and loopback RPC-ready; for external mode,
verify the remote firewall, RPC readiness, persistence, and log policy.

API and hardware integration tests call endpoint functions directly instead of `fastapi.testclient.TestClient`. In the managed sandbox used for this project, Starlette's threadpool path for synchronous endpoints can block; route registration is still tested, real TRex adapter behavior is covered by the gated hardware suite, and live ASGI/HTTP behavior is verified by running the backend service in a non-isolated environment.

Hardware integration test entrypoint:

```bash
TREX_WEBUI_RUN_HARDWARE_TESTS=1 .venv/bin/python -m pytest apps/api/tests/integration
```

This suite verifies real probe, port discovery, and stats endpoints. The short
profile start/stats/stop smoke is intentionally gated by an additional switch
because it sends real traffic on the configured TRex ports:

```bash
TREX_WEBUI_RUN_HARDWARE_TESTS=1 TREX_WEBUI_RUN_TRAFFIC_SMOKE=1 .venv/bin/python -m pytest apps/api/tests/integration
```

The packet-capture smoke is also opt-in because it enables service mode and
sends a short UDP profile:

```bash
TREX_WEBUI_RUN_HARDWARE_TESTS=1 TREX_WEBUI_RUN_CAPTURE_SMOKE=1 .venv/bin/python -m pytest apps/api/tests/integration
```
