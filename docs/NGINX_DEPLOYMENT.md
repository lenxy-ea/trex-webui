# Hardened Nginx Management-LAN Deployment

This deployment keeps the TRex control plane inside the FastAPI backend and exposes
only the WebUI through Nginx. The API runs as a dedicated unprivileged account;
the privileged TRex daemon remains a separate root-owned process reached through
its allowlisted RPC interface. The default same-host deployment installs that
process as `trex-daemon-server.service`; a remote TRex deployment must opt out
explicitly with `--external-daemon`.

## Layout

- Nginx listens on port 80 but permits only loopback clients until an operator
  explicitly allowlists a management subnet.
- Verified archive payloads are stored in root-controlled, content-addressed
  trees under `/opt/trex-webui/releases/sha256-<payload-digest>`. The digest
  binds the packaged manifest; validated candidate-owned `.venv` and optional
  `.env` additions become part of the serving bundle without changing that
  payload identity. Root-owned relative symlinks `/opt/trex-webui/current` and
  `/opt/trex-webui/previous` select the serving release and the complete
  retained N-1 serving bundle.
- In that versioned layout, Nginx serves
  `/opt/trex-webui/current/apps/web/dist`; the API WorkingDirectory, application
  path, Python runtime, and project profile catalog also resolve through
  `/opt/trex-webui/current`. One selector switch therefore moves source, static
  assets, runtime, and the release-owned catalog together.
- A direct checkout install remains a development/initial-provisioning path and
  serves its rendered `--web-root` (default `/var/www/trex-webui/dist`). It does
  not by itself claim the archive release transaction guarantees.
- Textual static assets of at least 1 KiB are compressed dynamically for clients
  that advertise gzip support. If a release later supplies a matching `.gz`
  sibling, `gzip_static` serves that precompressed file instead.
- API requests under `/api/` are proxied to `127.0.0.1:8080`.
- The stats SSE endpoint `/api/trex/stats/stream` disables proxy buffering.
- FastAPI binds only to `127.0.0.1:8080` and runs as `trex-webui:trex-webui`.
- In the default local mode, `trex-daemon-server.service` runs as root, keeps the
  upstream wrapper in foreground `start-live` mode through
  `/usr/libexec/trex-webui/trex_daemon_supervisor.py`, and binds its
  root-equivalent RPC endpoint only to `127.0.0.1:8090`.
- Upstream TRex and Scapy bind native TCP ports 4500, 4501, and 4507 to wildcard
  addresses. Managed-local mode therefore installs a dedicated nftables table
  before the daemon can start; it rejects those ports on every non-loopback
  interface. An installer-owned `nftables.service` drop-in loads the operator's
  main ruleset and that reserved table in the same nft transaction; the reload
  transaction's global flush is therefore never published without the reject
  rule. The daemon is `PartOf=nftables.service`, so a service stop/restart
  removes wildcard listeners before rules disappear. Per-unit systemd IP
  filtering is an additional descendant-process boundary, not the sole
  authority.
- WebUI-owned state lives under `/var/lib/trex-webui`; captures, reports, and
  config-version audit data remain under `/var/log/trex`.
- Release-selection state lives separately under root-only
  `/var/lib/trex-webui-deploy`. Its durable journal is reconciled before the API,
  managed daemon, or Nginx may start.
- On an SELinux-enabled versioned host, only each physical
  `releases/sha256-*/apps/web/dist` subtree receives the persistent
  `httpd_sys_content_t` policy required by Nginx. The API tree and optional
  `.env` deliberately remain outside that HTTP-readable type.

## Installer-Managed Host Provisioning

The hardened unit deliberately does not fall back to root. `deploy/install.sh`
creates the dedicated `trex-webui` system group and non-login user when absent,
then strictly revalidates them before building or publishing application
artifacts, configuration, and services. Deployment-lock acquisition,
service-state capture, and an explicitly requested Nginx package install occur
before that identity check. It rejects UID
or GID 0, IDs in the ordinary-user range from `/etc/login.defs`, a home other
than `/var/lib/trex-webui`, a shell other than an executable `nologin`, a primary
group mismatch, unexpected group members, and supplemental group membership.
Conflicting pre-existing identities fail the install instead of being modified
or silently reused.

The same installer idempotently provisions:

- `/var/lib/trex-webui` and its writable `profiles` directory as
  `trex-webui:trex-webui` `0750`.
- `/var/log/trex` as `root:trex-webui` setgid `2750`, with `captures`, `reports`,
  and `config-versions` owned by the service at `0750`.
- A missing `/var/lib/trex-webui/trex_cfg.yaml` from the regular, non-symlink
  legacy `/etc/trex_cfg.yaml`, using a same-directory no-clobber publication and
  final `trex-webui:trex-webui` `0640` ownership.
- `/etc/trex-webui`, `/etc/nginx/trex-webui/access.d`, and
  `/etc/nginx/trex-webui/security.d` with root-controlled ownership.

In the default managed-local mode it additionally provisions
`trex_daemon_server.log` as `root:trex-webui` `0640`, installs its
`copytruncate` logrotate policy, and atomically publishes the root-owned,
executable, non-symlink
`/usr/libexec/trex-webui/trex_daemon_supervisor.py` and
`daemon_rpc_probe.py`, plus the executable
`trex_native_boundary.sh`, and the marked
`/etc/systemd/system/nftables.service.d/trex-webui-native-boundary.conf`
drop-in. Those runtime inputs roll back with the daemon unit rather than being
imported from a checkout while an archive upgrade replaces it. Before any
runtime mutation, the installer snapshots whether the reserved nft table was
absent or saves its exact installer-owned ruleset. A later install failure
restores that state only after the daemon rollback is proven safe; if stopping
or restoring the daemon becomes uncertain, rollback retains the current reject
table fail closed instead of reopening wildcard native listeners. When the
live boundary was mutated, rollback also retains the newly published safe
daemon unit, supervisor/helper, and nftables drop-in until the failed
transaction is retired. Thus even a managed-snapshot restore failure cannot
silently remove the boundary on a later daemon restart, nftables reload, or reboot.
External mode leaves all of these local daemon artifacts untouched.

Before restart, the installer makes `apps/api/app`, the candidate-owned `.venv`,
any installer-created runtime tree, and the project `profiles` catalog
root-owned, readable/executable, and non-writable by the service. An optional
project `.env` must be a regular non-symlink and is reduced to
`root:trex-webui` `0640`; the preferred systemd input remains the root-owned
`/etc/trex-webui/trex-webui.env`. Archive upgrade copies that optional file into
the prepared candidate through the release engine rather than making
`current/.env` point outside the selected bundle. In managed-local mode,
`runuser` executes both `import app.main` and
`default_client_class(get_environment())` as `trex-webui` under the exact paths
that will be written into the units. This imports the real TRex SDK without
connecting to hardware. External-daemon mode imports `app.main` only: its
operator-owned SDK and transport authority is deliberately not replaced with
the managed-local systemd contract. With `--install-python-deps`, the smoke runs
against the complete candidate and its candidate-owned runtime before service
readiness can commit the selector.

Keep `/opt/trex-webui`, every selected release and candidate-owned runtime, and
`/opt/trex-core` owned by root and readable/executable by the service account.
Do not add `trex-webui` to `wheel`, `sudo`, `docker`, or a device-access group.
The API does not need Linux capabilities or direct access to TRex NICs.

The systemd template sets these deployment defaults before reading the optional
root-owned `/etc/trex-webui/trex-webui.env` file:

```text
TREX_WEBUI_TREX_CONFIG_PATH=/var/lib/trex-webui/trex_cfg.yaml
TREX_WEBUI_PROFILE_ROOTS=/opt/trex-core/scripts/stl:/opt/trex-webui/current/profiles:/var/lib/trex-webui/profiles
TREX_WEBUI_RUNTIME_STATE_PATH=/var/lib/trex-webui/runtime-state.json
TREX_WEBUI_DAEMON_GENERATION_PATH=/run/trex-webui/daemon-generation
```

These are the values rendered for a versioned archive deployment. A direct
checkout install renders its exact project root in place of `current`. The first
two profile roots are read-only catalog inputs; new and duplicated profiles go
to the final service-owned root. A custom writable config, log, or profile path
also needs a matching `ReadWritePaths=` entry in a systemd drop-in. Do not point
an atomic-write config workflow back at `/etc/trex_cfg.yaml`: it would require
making `/etc` writable to the API.

## Install

Published production installs should use the attested release-first workflow in
[INSTALLATION.md](INSTALLATION.md). It does not require Node.js on the target
and activates one content-addressed API/frontend/runtime selector.

`deploy/trex-webui` is the concise operator layer over the hardened installers.
From a normal checkout on a development host, it can aggregate the complete
read-only preflight and then explicitly select the checkout path:

```bash
sudo deploy/trex-webui doctor --operation install
sudo deploy/trex-webui install --checkout
```

The high-level command installs locked Python dependencies, installs Nginx when
missing, and runs deployment verification by default. The low-level equivalent
remains `deploy/install.sh --install-nginx --install-python-deps --verify` and
is the mutation authority used by both high-level and release workflows. This
default is the same-host managed-daemon mode.

Managed-local mode requires `/usr/sbin/nft`, `nftables.service`, and the
root-owned, non-group-writable `/etc/sysconfig/nftables.conf` from the
`nftables` package. The installer validates the operator ruleset, kernel
support, and ownership of the reserved table without changing rules. The
daemon unit then atomically applies and verifies the exact table before it can
launch TRex. The nftables service preserves the vendor start semantics, while
its reload atomically flushes, loads the operator ruleset, and republishes the
boundary, leaving no fail-open interval. A missing binary, unsupported rule,
malformed config, reserved-table collision, or pre-existing unowned table
fails closed.

Before any managed-local deployment mutation, the optional
`/etc/trex-webui/trex-webui.env` must be a root-owned `0600` regular,
non-symlink file. It may tune non-authoritative API settings, but it must not
assign the managed TRex host, sync/async/Scapy/daemon ports, supervisor mode, or
TRex scripts directory, daemon executable, profile roots, or
runtime-state/daemon-generation paths. Use `--external-daemon` when those
connection settings must be operator-controlled. Post-restart installation and
`deploy/verify.sh` validates the loaded unit, the persisted unit file, the
root-controlled virtualenv, the full Uvicorn `MainPID` command line, and (in
managed-local mode) the `MainPID` environment from `/proc`, rather than trusting
only one declaration. The loaded service must also retain the installer
identity, loopback bind, source/read-write path separation, empty capability
sets, and the complete systemd sandbox contract. These API checks still run
with `--skip-daemon`; that option skips only the locally managed TRex daemon.

To relocate a managed-local TRex installation, set
`TREX_DAEMON_SCRIPTS_DIR` and `TREX_DAEMON_BIN` in the root deployment
environment before running install or upgrade. Both paths must be canonical,
contain only the deployment-safe path character set, live below `/opt`, `/srv`,
or `/usr/local`, and keep the executable inside the scripts directory. The
scripts tree must be recursively root-owned and not group/world writable; every
ancestor and any file symlink target must satisfy the same trust rule. It must
also be disjoint from the WebUI source/static/backup, state, log, and installed
libexec lifecycles. The root supervisor repeats that trust check before parsing
and immediately before import, pins `TREX_EXT_LIBS` to the validated tree, and
runs Python in isolated mode. Installation and verification require the daemon
unit, API unit, loaded service declarations, live command line, live API
environment, and `/api/system/environment` to agree on the exact paths.

The managed supervisor publishes a new root-owned
`/run/trex-webui/daemon-generation` UUID atomically on every service start.
Runtime state schema v2 records that UUID and the exact TRex target on each
capture lease and traffic session. Matching Capture IDs, filters, ports, and
traffic states are not sufficient after the daemon generation changes. Traffic
is never automatically re-adopted. Capture reconciliation may clear an old
local lease without hardware mutation only when a systemd generation rollover
is proven and the old recorder ID is absent; if the same numeric ID is present,
it is treated as a recorder owned by the new daemon and is protected by a
fail-closed blocker. External-daemon mode has no trusted generation source, so
ownership is intentionally limited to one API process and is not recovered
after an API restart.

An operator-confirmed `POST /api/system/daemon/trex/stop` remains available
when an expired hard-stop lease or a daemon-generation mismatch blocks normal
STL control. It terminates the whole TRex workload through daemon
`force_trex_kill`; only a boolean daemon result authorizes the backend to
retire the old durable traffic session and pending traffic WAL as stopped.
This is an explicit recovery action, not cross-generation traffic adoption.

A capture start persists `preparing` before acquisition, Service Mode, or
recorder RPC. Its exact recorder baseline, port-ownership snapshot, intended
acquire/service changes, and each intent/confirmation substage survive an API
crash. Status lag, missing IDs, ambiguous new recorders, or a missing unique
identity retains that ledger and blocks disconnect cleanup. Once exactly one
new recorder matches the persisted TX/RX/BPF identity, the lease is promoted
to `cleanup_required` before recorder removal; restart reconciliation can then
finish recorder removal, Service Mode restoration, and port release even when
another crash lands between those steps.

Traffic start/update/pause/resume/stop use the same write-ahead rule: the exact
session CAS, runtime authority, target-port baseline, operation, and nonce are
fsynced before the live SDK call. Completion atomically promotes the resulting
session state; exact same-generation evidence can recover after an API crash,
while partial, concurrent, or changed-authority evidence remains fail closed.
When Start carries `hard_stop_at`, its canonical UTC deadline is part of that
pre-hardware WAL. The API accepts only a future deadline within 300 seconds and
an independent FastAPI-lifespan reaper enforces it even if no browser or HTTP
request survives. After an API restart, the reaper stops only the exact
persisted target/generation, session ID, group ports, and port authority; it
never force-adopts a matching-looking run. For expired pending Start WAL, the
API attempts only an exact rollback and clears the intent only after proving
that rollback; otherwise it retains a durable fail-closed blocker. The expired
intent is never replayed. A fully stopped group clears its deadline, while a
partial Stop retains it until every group port is stopped.

An old v1 runtime-state file is rejected without modification. Do not delete it
as an install convenience. First prove through the real TRex control plane that
all traffic is idle and the capture inventory is empty, then archive or remove
the obsolete state in an explicit maintenance step.

The installer atomically publishes and enables the release reconciler plus the
API and, in managed-local mode, daemon units. API and daemon units require and
start after the reconciler; an Nginx drop-in applies the same failure-propagating
ordering. The installer starts the root-owned daemon before the API, waits for
its loopback JSON-RPC readiness, and then starts the unprivileged API. It never
grants the API root, sudo, Linux capabilities, or permission to invoke
`systemctl`.

For a WebUI that connects to a daemon supervised separately on this host or
another TRex host, set `TREX_WEBUI_TREX_HOST` appropriately and use the explicit
external mode:

```bash
deploy/install.sh --external-daemon --install-nginx --install-python-deps
```

`--external-daemon` is a complete local-daemon opt-out: install, upgrade, and
post-install verification do not install, enable, start, stop, restart, or probe
the local `trex-daemon-server.service`. Any already installed local unit is left
untouched. The remote supervisor, RPC firewall, boot persistence, and log
policy remain the external operator's responsibility. For a remote daemon, that
also includes restricting its management ports to the WebUI host.

Changing or restarting the managed local daemon can terminate a TRex process
and invalidate an active reservation. Before any such mutation, deployment
queries the loopback RPC state and fails closed when TRex is running, is
reserved, or the daemon is active but a trustworthy RPC state cannot be read.
Only an explicit maintenance-window invocation may cross that barrier:

```bash
deploy/install.sh --allow-daemon-runtime-restart
deploy/upgrade.sh --archive trex-webui-*.tar.gz \
  --allow-daemon-runtime-restart --verify
```

The flag is an operator acknowledgement that deployment may interrupt TRex,
discard current runtime state, and require clients to reconnect. Do not add it
to unattended routine upgrades. Transaction rollback restores the previous
unit, installed libexec launcher, probe, native-boundary helper, logrotate
policy, and enabled/active
service state; it cannot reconstruct a terminated TRex workload or reservation.

Omit `--install-python-deps` only when the current trusted API runtime is
intentionally being retained. Before its first write, the installer reconciles
the on-disk unit, systemd's loaded unit, and (when active) MainPID interpreter.
Every existing authority must use the exact expected WorkingDirectory,
ExecStartPre, Uvicorn argv/app-dir, and one identical interpreter. A trusted
current-root `.venv.runtime-<timestamp>-<pid>` remains pinned; with no existing
unit authority the fallback is the complete project `.venv`. Missing markers,
an unsafe runtime, another project root, or any authority conflict fails closed.

The installed Nginx configuration returns HTTP 403 to non-loopback clients by
default. Prefer installing the exact management subnet through the same
transaction as configuration and release activation:

```bash
sudo deploy/trex-webui install --checkout \
  --trex-config /var/lib/trex-webui-bootstrap/trex_cfg.yaml \
  --allow-cidr 192.0.2.0/24
```

Replace `192.0.2.0/24` with the real, narrowly scoped management subnet. The
base server supplies the final `deny all`. The source YAML must be staged below
a root-owned, non-writable path. Both files are published atomically and are
restored on any later install, restart, or verify failure. Omitting
`--allow-cidr` retains an existing policy and leaves a new host loopback-only;
`0.0.0.0/0`, multicast, unspecified, and non-canonical networks are rejected.

For SELinux enforcing hosts and firewalld-managed hosts:

```bash
deploy/install.sh --install-nginx --selinux --firewalld
```

The explicit `--selinux` flag applies the direct-checkout web-root context. A
versioned archive install is stricter: whenever SELinux is enabled, it
automatically requires `semanage`, `matchpathcon`, `restorecon`, and
`setsebool`, then installs an exact persistent `httpd_sys_content_t` rule for
`/opt/trex-webui/releases/sha256-[0-9a-f]{64}/apps/web/dist(/.*)?`, and relabels
the physical current/previous frontend trees before restart. Install
`policycoreutils-python-utils` on AlmaLinux if `semanage` is missing. The
installer fails rather than serve a selector with default `/opt` or temporary
staging labels; it does not label the release API tree or `.env` as web content.
The exact path rule and persistent HTTP network-connect boolean are host policy,
not selector state, and are intentionally retained after a handled release
rollback.

`--firewalld` opens HTTP only. The managed-local native TRex boundary is
independent and is installed whether firewalld is active, stopped, or absent.
It owns a dedicated nftables table and does not enable `nftables.service`; when
that service is enabled separately, the managed drop-in makes start/reload
transactional with the boundary. `systemctl stop` or `restart
nftables.service` also stops/restarts the managed daemon in the safe order. A
direct administrator command such as `nft flush ruleset` bypasses systemd and
is therefore prohibited while the daemon is active. If an out-of-band flush
occurs, stop the daemon immediately, then start it and run the root verification
command before resuming traffic.

Preview an install or upgrade without changing the host:

```bash
sudo deploy/trex-webui doctor --operation install
sudo deploy/trex-webui install --checkout --dry-run
```

Run an install or upgrade and verify the deployed entrypoints afterward:

```bash
sudo deploy/trex-webui install --checkout
```

Add the real TRex overview check when the hardware/control plane is expected to
be online:

```bash
sudo deploy/trex-webui install --checkout --verify-trex
```

For a development checkout only, an operator may hand the already-updated tree
to the installer:

```bash
deploy/upgrade.sh --verify
```

This path cannot protect the preceding `git pull` or other source mutation and
has no outer source backup. Do not mutate a live production checkout underneath
the API; use the verified archive workflow below for rollback-backed production
upgrades.

After adding the allowlist, open `http://<host-management-ip>/` from a host in
that subnet. A 403 from any other network is the expected default.

## Release Package

Build a portable release archive from a prepared checkout:

```bash
scripts/npmw run package:deploy
```

The archive is written under `dist/releases/` with a mandatory matching
`.sha256` file. Packaging requires a Git checkout, `sha256sum`, and Python 3.11,
and validates the finished tar metadata and embedded payload identity before
publishing either file. It
contains:

- `apps/web/dist` prebuilt with Node.js 24.
- FastAPI backend source under `apps/api`.
- `deploy/install.sh`, `deploy/upgrade.sh`, Nginx, and systemd templates.
- `RELEASE_MANIFEST.json` with the full Git object ID, dirty state, source
  digest, build time, command hints, and a canonical manifest for every other
  regular payload file. Each file entry records path, type, mode, size, and
  SHA-256; the payload digest is computed from that sorted manifest. The release
  manifest excludes only itself to avoid a recursive digest.

For a published release, the recommended target-host path is the root-only
verified-upgrade bootstrap in [RELEASE.md](RELEASE.md). It validates the exact
tag, signer workflow, GitHub artifact attestations, metadata inventory, hardware
report bindings, SBOMs, archive, and checksum before executing the archive
upgrader. If an operator must inspect a manually extracted package, use a trusted
copy of `archive_safety.py` obtained separately from the unverified archive, then
verify again after extraction:

```bash
sha256sum -c trex-webui-*.tar.gz.sha256
python3.11 /trusted/trex-webui/archive_safety.py trex-webui-*.tar.gz
tar --extract --gzip --no-same-owner --same-permissions --file trex-webui-*.tar.gz
cd trex-webui-*
python3.11 deploy/archive_safety.py verify-tree .
deploy/install.sh --skip-build --install-python-deps --install-nginx
```

The checksum must arrive through a trusted channel; an archive and sidecar
delivered together detect corruption but do not prove publisher authenticity.
Never execute a validator extracted from the same unverified tar as the
pre-extraction safety check.

The lower-assurance archive entrypoint remains available when the archive digest
arrives through an independently trusted channel:

```bash
deploy/upgrade.sh --archive trex-webui-*.tar.gz --install-python-deps --verify
```

Keep the generated `trex-webui-*.tar.gz.sha256` beside the archive. Archive
upgrade verifies that digest before any tar listing, extraction, release-store
or journal write, or packaged script execution. For a digest delivered through a separate
trusted channel, pass it explicitly with `--sha256 <64-hex-digest>`. Validation
also rejects absolute or non-canonical paths, `..`, multiple package roots,
duplicate entries, symlinks, hard links, devices, FIFOs, setuid/setgid files,
group/world-writable entries, oversized entries, and packages missing the
required runtime/install files. It then recomputes the embedded file manifest
while reading the tar, extracts into a private staging directory, recomputes the
same identity from the extracted tree without Git, and rejects missing, extra,
content-changed, or mode-changed files before it writes the release store or
transaction journal. The package-time source digest is provenance metadata; the
separately delivered archive SHA-256 is an integrity anchor, not a cryptographic
publisher signature.

After installation, the real-hardware Standard E2E can run without `.git`:

```bash
/opt/trex-webui/current/.venv/bin/python \
  /opt/trex-webui/current/scripts/trex_standard_e2e.py \
  --base-url http://127.0.0.1
```

In release mode, evidence generation validates the manifest structure and
recomputes the packaged file set, content hashes, sizes, and modes before any
hardware action. It permits only explicit operational additions that are not
part of the release payload: `.venv`, strictly validated top-level
`.venv.runtime-*`, `.env`, `.logs`, `profiles`, managed-path markers, Node
dependency caches, and Python bytecode caches. A versioned runtime is excluded
only when its generated name, root ownership, non-writable mode, non-mount
directory type, and managed/runtime/release markers all match. A missing,
modified, or injected packaged file fails closed. The reported source identity
retains the package-time Git SHA/dirty state and adds the verified payload
digest. `scripts/npmw run verify:major` remains the full-source checkout gate because a
portable runtime archive intentionally omits frontend source, Git metadata, and
the full checkout/tooling surface; packaged backend tests do not make it
equivalent to the checkout gate.

For the canonical `/opt/trex-webui` archive path, the upgrader does not overwrite
a serving checkout. It privately verifies and extracts the archive, validates
its v3 payload manifest, copies it into
`/opt/trex-webui/releases/sha256-<payload-digest>`, fsyncs the candidate, and
persists each selection phase in
`/var/lib/trex-webui-deploy/transaction.json`. Capacity is checked before the
copy with a 128 MiB safety reserve by default. The release store and selectors
must share a filesystem so each `current` or `previous` publication is one
same-directory atomic symlink replacement.

The outer upgrader and child installer hold one root-only non-blocking `flock`
transaction at `/run/lock/trex-webui/deploy.lock`; a second deploy fails before
mutation, while the child validates and inherits the same locked file descriptor.
The descriptor intentionally remains inherited by the verified foreground
deploy chain. If a wrapper is killed while a child may still be mutating the
host, reconciliation stays fail-closed on the lock until that last child exits,
then the already-running retry loop recovers automatically. The verified
upgrade/install entrypoints require every deployment command to remain in the
foreground and wait for its descendants; background/daemon escape is forbidden.
Their one
`systemctl start --no-block` request queues a service in PID 1, so the service
process cannot inherit the client descriptor, and long-running services are
started and stopped only through systemd. If a command violates this contract,
the inherited descriptor deliberately keeps retry busy rather than allowing a
rollback to race a possible host mutator. Containment of arbitrary third-party
descendants is not claimed; optional package/build tools such as dnf, npm, and
pip remain external foreground-command contract boundaries.
The separately installed release engine also serializes journal and selector
operations with a root-only lock under `/var/lib/trex-webui-deploy`. In managed
local mode, the outer upgrade preflight applies the same fail-closed daemon
runtime/reservation guard before candidate activation. Use
`--allow-daemon-runtime-restart` only for an approved disruptive window. For an
archive, that consent authorizes at most one cold convergence of the old daemon
generation before release prepare, and only after the ordinary strict
`safe-restart` probe fails. The wrapper then clears the flag: it is never stored
in the release journal or forwarded to candidate install/rollback. If the daemon
is already safe, inactive, or does not need a candidate restart, the unused
consent is simply discarded. Use `--external-daemon` when the daemon is
supervised separately, either locally or remotely; that mode, unlike the
one-shot runtime override, is passed to the candidate installer.

On the first archive migration from an in-place installation, the upgrader first
captures the serving API source, served static tree, project profiles, optional
`.env`, and exact loaded Python runtime as a verified content-addressed baseline.
It commits that complete baseline as `current` before preparing the new
candidate. A pre-commit crash can therefore return the stable consumers to a
runnable legacy baseline instead of removing `current` and leaving the new unit
paths unresolved.

After the candidate is prepared, the upgrader stops only an API whose loaded
WorkingDirectory, interpreter, Uvicorn argv, and `--app-dir` match the known
installation authority. It atomically selects the candidate as `current`, keeps
the former `current` as `previous`, installs the stable API/Nginx consumers,
starts services, requires direct readiness and `deploy/verify.sh`, and only then
marks the journal `committed`. A normal pre-commit failure invokes the same
reconciler immediately. `SIGKILL`, power loss, or reboot leaves the durable
journal for `trex-webui-release-reconcile-v2.service`, which runs before API,
managed daemon, and Nginx and restores the exact pre-transaction selectors. A
durably committed phase is never implicitly rolled back; reconciliation verifies
it and completes bounded retention cleanup.

Recovery ABI v2 lives under `/usr/libexec/trex-webui/recovery-v2` and has its
own units, consumer drop-ins, and immutable manifests. A host with ABI v1 is
migrated only after its v1 manifests verify exactly, all v1 recovery units are
inactive and job-free, and both engines interpret the same retired terminal
journal. Manifest-owned bridge drop-ins then clear every v1 command and place an
inert `/usr/bin/true` barrier behind the corresponding v2 unit. The v1 files are
preserved for auditability, but they never remain a second semantic authority.
The terminal/quiescent checks run again immediately before `daemon-reload`, and
the loaded bridge graph is rejected if any v1 unit still has an active job or
main PID.

Archive activation and rollback are explicit maintenance windows, not a
zero-downtime promise. Nginx and the API are fenced while their shared release
generation changes, so clients may receive connection failures during that
interval. Once the edge accepts a request again, static `/` and proxied API
responses come from one wholly old or wholly new generation; the release tests
continuously verify that invariant in both activation and rollback directions.

These guarantees apply to release selection, not to reconstruction of live TRex
traffic. A daemon maintenance override may terminate a workload or reservation,
and neither selector rollback nor boot reconciliation can recreate that
hardware state.

### Explicit N-1 rollback

After a committed versioned upgrade, inspect the exact retained selectors:

```bash
sudo /usr/libexec/trex-webui/recovery-v2/release_transaction.py status
readlink /opt/trex-webui/current
readlink /opt/trex-webui/previous
```

Do not edit either symlink manually. In a maintenance window with traffic idle,
reactivate the complete retained predecessor through the guarded wrapper:

```bash
sudo /opt/trex-webui/current/deploy/upgrade.sh --rollback-previous \
  --verify-base-url http://127.0.0.1
```

`--rollback-previous` cannot be combined with an archive, `--external-daemon`,
dependency/package installation, host-policy changes, or deferred restart. The
managed-local rollback preflight requires a reachable idle/unreserved daemon,
stopped and unowned ports, no traffic mutation recovery, no capture recorder,
and no active/recovering Quick Validation. `--verify-trex` adds a post-switch
overview check; it is not what establishes the mandatory pre-switch quiescence.

The wrapper holds the global deployment lock, requires the existing API and
Nginx to consume `current`, arms the boot reconciler, validates the retained
runtime and frontend, and prepares a new durable transaction. After the final
live preflight, it stops the API so no new WebUI mutation can race selector
activation. It then reloads the persistent runtime state with the exact current
release code and rechecks daemon `safe-restart` before swapping `current` and
`previous`. It restarts both consumers and commits only after the API
MainPID/runtime identity, direct health response, Nginx configuration, and exact
served `index.html` bytes match the selected predecessor. A handled failure or
later boot reconciliation before commit restores the newer release and restarts
the consumers against it. External-daemon deployments must use a separately
reviewed redeployment procedure because this host cannot fence their supervisor.

This operation rolls back the release-owned API source, Python runtime, static
assets, and profile catalog as one selector. It deliberately preserves
`/var/lib/trex-webui`, `/var/log/trex`, the active TRex configuration, Nginx
access/security snippets, and live hardware state. Review application state and
schema compatibility before rollback; N-1 selection is not a database or TRex
workload restore.

The imported first-migration baseline is deliberately a minimal serving bundle,
not a copy of the old deployment tooling. The first rollback into that baseline
must therefore be launched from the still-current rc.2 tree as shown above. If
an operator then needs to reactivate the newer release, its verified wrapper is
now under `/opt/trex-webui/previous/deploy/upgrade.sh`; use that path for the
next `--rollback-previous` transaction. Normal rc.2-and-later predecessors keep
their own wrapper under the selected tree.

For a dry run from the extracted package:

```bash
deploy/trex-webui install --checkout --dry-run
```

When the target host already has nginx and a working `.venv`, the smaller upgrade
command is:

```bash
deploy/upgrade.sh --skip-build --skip-python-deps
```

Verify an installed package without changing the host:

```bash
sudo /opt/trex-webui/current/deploy/trex-webui verify
```

or through the project wrapper from a full checkout:

```bash
scripts/npmw run deploy:verify
```

## Script Behavior

`deploy/install.sh` is idempotent for host provisioning. In direct-checkout
mode it strictly creates or validates the service identity, provisions writable
state and log boundaries, secures runtime read paths, uses the project-local
Node.js 24 runtime, runs `scripts/npmw run build:web`, and atomically exchanges
the rendered `--web-root` with a staged static directory while retaining a
rollback copy through the installer transaction. In archive mode,
`deploy/upgrade.sh` invokes the same installer with a verified physical
`releases/sha256-*` candidate and `--versioned-release`; static publication is
then already owned by the `current` selector, so the installer neither copies
it into `/var/www` nor creates a second static authority.

The installer publishes the root-owned release reconciler and its boot-order
unit/drop-in, then installs Nginx and API configuration plus, in managed-local
mode, the daemon unit, logrotate policy, libexec launcher, probe, and native
boundary. It validates Nginx, starts the local daemon first, verifies loopback
RPC, and restarts `trex-webui-api.service` plus `nginx`. `--external-daemon`
omits every local-daemon file, service, and verification operation. By default
the project root is resolved from the script location. When `--project-root` or
`--web-root` are provided in direct mode, systemd and Nginx are rendered with
those paths; archive callers render them against the stable `current` selector.
If `--skip-build` is provided, the script uses the existing `apps/web/dist` and
does not require the project-local Node.js runtime. If
`--install-python-deps` is provided, it creates a sibling Python 3.11
virtualenv, installs `apps/api/requirements.lock` with hashes enforced and
binary wheels only, runs `pip check`, secures the candidate-owned runtimes, and
performs the service-user app plus TRex SDK import smoke before restart.
Test and audit dependencies are not installed on the runtime host. The Nginx and systemd files are rendered to
same-directory temporary files and atomically replaced while rollback copies
remain available. A later `nginx -t`, systemd reload, service restart, or verify
failure restores or removes the files written by that run, reloads the restored
unit state, and restores the captured enabled/active state for the managed
daemon, API, and Nginx. A failed first install stops newly introduced units.
If `--verify` is provided, the script runs `deploy/verify.sh` after service
reload/restart. `--verify` and `--verify-trex` cannot be combined with
`--skip-restart`: a deferred unit cannot prove the newly installed runtime or
sandbox is the process serving requests.

The managed daemon launcher executes the unmodified upstream wrapper in the same
foreground process with `start-live`, so systemd remains the single PID
authority. It applies two narrow TRex v3.08 lifecycle fixes before entering the
vendor program: a stopped `t-rex-64` `Popen` is bounded-waited and reaped (with
PGID-validated SIGKILL only after timeout), and the vendor SIGTERM path closes
its JSON-RPC listener without calling blocking `BaseServer.shutdown()` from the
serving thread. This prevents zombie children, prevents workload resources from
becoming stranded behind an unreaped process, and avoids the old 30-second
`TimeoutStopSec` forced kill. The launcher fails closed if the expected
upstream classes or process-group ownership are not present.
Wrapper-level `start`, `stop`, and `restart` actions are disabled in managed
mode so there is one supervisor and one PID authority.
Operator-visible TRex start/stop remains available through the daemon's guarded
JSON-RPC methods; it controls the TRex workload, not the daemon supervisor.
Daemon stdout/stderr appends to `/var/log/trex/trex_daemon_server.log`. The
installed logrotate rule uses `copytruncate`, so rotation does not replace the
inode behind systemd's open descriptor and does not require a daemon restart.
Post-stop acceptance must inspect `/proc/<daemon-main-pid>/task/<pid>/children`
and process states in addition to `systemd-cgls`: cgroup listings omit zombie
tasks and therefore cannot by themselves prove that TRex resources were
released. The daemon may retain its 1 GiB hugepage backing pool after a workload
stops; acceptance proves that a later workload reuses that pool without
per-cycle growth rather than requiring the kernel free-page count to return to
its pre-daemon value.

The checked-in Nginx template enables dynamic gzip for eligible JavaScript, CSS,
JSON, manifest, and SVG responses and sends `Vary: Accept-Encoding`. The current
Vite build does not create precompressed siblings, so dynamic compression is the
active path today; `gzip_static` is already enabled for a future release package
that includes verified `.gz` files. Both API locations explicitly disable gzip,
preserving the existing control-response and SSE transport behavior. Asset cache
semantics remain the existing seven-day expiry.

Direct-checkout static backups still use timestamped directories and do not have
an automatic count/age/size retention policy; monitor and prune only reviewed,
inactive entries under the documented managed prefix. Production archive
selection is different: capacity is checked before candidate copy and terminal
reconciliation keeps only the validated `current` and `previous` release trees.
An unknown entry in the release store is not deleted automatically; it blocks
cleanup for operator inspection.

With `--install-python-deps`, the installer builds `.venv.release-<id>` and an
independent `.venv.runtime-<id>`, then exchanges the candidate `.venv` only after
the old API has stopped. In direct mode, the unit pins the validated versioned
runtime. In archive mode, the stable unit intentionally executes
`/opt/trex-webui/current/.venv/bin/python`, so the Python environment moves with
the same release selector as API source and static assets. The API must pass a
bounded direct readiness probe at `http://127.0.0.1:8080/api/health`; the
installed unit, loaded unit, running `MainPID`, selected release, and candidate
manifest must agree before Nginx restart and deployment verification succeed.
A normal installer failure restores the files and service state written by that
run. A killed archive transaction is recovered by selector reconciliation, not
by guessing which virtualenv is newest.

For an archive release, restart, readiness, identity checks, and mandatory
`deploy/verify.sh` are the preconditions for the outer selector commit. The
complete former release, including its runtime, remains at `previous`; cleanup
retains only that N-1 plus `current`. A cleanup failure after a durable commit is
reported without converting the committed candidate into an implicit rollback.
For a direct checkout install, the older installer-scoped runtime cleanup rules
still apply and do not create a content-addressed N-1 release. Because dependency
publication and process restart are one transaction,
`--install-python-deps` cannot be combined with `--skip-restart`.
Without dependency publication, `--skip-restart` is a deferred-activation
maintenance operation: it may install static/config files but does not prove the
new API unit or runtime healthy and must not be recorded as a verified upgrade;
therefore it also cannot be combined with `--verify` or `--verify-trex`.
Without dependency publication, an existing trusted versioned runtime pin is
also retained across ordinary restarts; the installer never selects a runtime by
glob or recency and never treats that retained tree as a candidate created by
the current transaction.

Both installer entrypoints acquire the global deployment lock before mutation.
The lock parent is root-owned `0700`; the single-link regular lock file is
root-owned `0600`. Symlink, FIFO, hard-link, forged-FD, wrong-inode, closed-FD,
and concurrent-owner cases fail closed. A non-default lock path also needs the
same explicit `.trex-webui-managed` ownership grant as other custom destructive
targets.

All deployment targets are canonicalized with `realpath`, reject symbolic-link
components and overly broad roots, and must be pairwise disjoint. The standard
managed prefixes are `/opt/trex-webui`, `/var/www/trex-webui`, and
`/var/backups/trex-webui`. A custom install, web, backup, or release-output tree
must have a regular `.trex-webui-managed` file containing exactly
`trex-webui-managed-v1` in that directory or an ancestor. This marker is an
explicit ownership grant for destructive synchronization; do not place it on a
broad shared directory.

`deploy/upgrade.sh` is the explicit upgrade entrypoint. Without `--archive`, it
wraps `deploy/install.sh` for the current checkout or extracted package, but it
cannot roll back source changes made before invocation and is therefore a
development/maintenance path. With `--archive`, it verifies the digest and safe
release layout, applies the matching-service maintenance barrier, prepares and
activates a content-addressed candidate, and delegates to that candidate's
installer with `--skip-build --versioned-release`. The production archive path
requires a candidate-owned Python runtime, restart/readiness, and deployment
verification before commit. Use `--dry-run` to print the release preparation,
selection, and install commands before changing a host.

Useful options:

```bash
deploy/trex-webui doctor --operation install --format json
deploy/trex-webui install --archive trex-webui-*.tar.gz --sha256 <64-hex-digest>
deploy/trex-webui install --checkout --trex-config /reviewed/trex_cfg.yaml --allow-cidr 192.0.2.0/24
deploy/trex-webui upgrade --archive trex-webui-*.tar.gz --sha256 <64-hex-digest> --dry-run
/opt/trex-webui/current/deploy/trex-webui status --format json
/opt/trex-webui/current/deploy/trex-webui verify --trex
/opt/trex-webui/current/deploy/trex-webui rollback --dry-run
deploy/install.sh --skip-build
deploy/install.sh --skip-restart
deploy/install.sh --skip-enable
deploy/install.sh --install-python-deps
deploy/install.sh --trex-config /reviewed/trex_cfg.yaml
deploy/install.sh --allow-cidr 192.0.2.0/24
deploy/install.sh --external-daemon
deploy/install.sh --allow-daemon-runtime-restart
deploy/install.sh --project-root /opt/trex-webui
deploy/install.sh --web-root /var/www/trex-webui/dist
deploy/install.sh --verify --verify-base-url http://127.0.0.1
deploy/install.sh --verify --verify-trex
deploy/upgrade.sh --archive trex-webui-*.tar.gz --verify --verify-trex
deploy/upgrade.sh --archive trex-webui-*.tar.gz --external-daemon --verify
deploy/upgrade.sh --archive trex-webui-*.tar.gz --allow-daemon-runtime-restart --verify
deploy/upgrade.sh --archive trex-webui-*.tar.gz --sha256 <64-hex-digest> --dry-run
/opt/trex-webui/current/deploy/upgrade.sh --rollback-previous --verify-base-url http://127.0.0.1
```

## Verification

`deploy/verify.sh` checks the production deployment path rather than the Vite dev
server:

- `trex-webui-api.service` and `nginx` are active unless `--skip-systemd` is used.
- The API unit's root-owned on-disk file, exact `FragmentPath`, reload state,
  unprivileged identity, working directory, `ExecStartPre`, Uvicorn argv,
  root-controlled virtualenv, complete `MainPID` cmdline, capability boundary,
  syscall filter, and read-only/read-write sandbox all agree. This remains
  mandatory in external-daemon mode.
- In managed local mode, `trex-daemon-server.service` is active, its loaded
  command is foreground/loopback-only, `127.0.0.1:8090` answers the expected
  JSON-RPC readiness call, the exact installer-owned nftables boundary rejects
  non-loopback TCP 4500/4501/4507, the loaded nftables start/reload commands
  keep the operator config and boundary in one transaction, the daemon
  generation is a root-owned canonical UUID, and the daemon log has the
  required ownership/mode. External mode skips every local-daemon assertion.
- In a versioned deployment,
  `/opt/trex-webui/current/apps/web/dist/index.html` references assets that exist
  inside the selected release and are reachable through Nginx. A direct checkout
  install verifies its explicitly rendered `--web-root` instead.
- The versioned `current`/`previous` selectors, release trees, root-only journal,
  installed transient oneshot reconciler, and Nginx dependency ordering match
  the selected candidate contract. The reconciler deliberately does not remain
  active after exit, so every later consumer start can invoke it again.
- When SELinux is enabled, every regular file/directory in the physical current
  and previous frontend trees has both persisted and applied
  `httpd_sys_content_t`; the corresponding API tree and optional `.env` do not.
- `GET /` returns the React mount point.
- `GET /api/health` returns `{"status":"ok"}`.
- `GET /api/system/environment` exposes the current backend environment contract.
- `/api/trex/stats/stream` returns HTTP 200 and emits event bytes through the
  Nginx SSE proxy unless `--skip-sse` is used.
- With `--trex`, `GET /api/system/overview` must succeed and include real
  `port_ids`.

Useful verification commands:

```bash
sudo deploy/verify.sh --base-url http://127.0.0.1
sudo deploy/verify.sh --base-url http://<host-management-ip> --trex
deploy/verify.sh --skip-daemon --trex
deploy/verify.sh --skip-systemd --skip-sse
```

Use `--skip-daemon` only for the direct verifier in an intentionally external
deployment; `deploy/install.sh --external-daemon --verify` and
`deploy/upgrade.sh --external-daemon --verify` propagate that policy
automatically.

When a managed-local installation intentionally overrides
`DAEMON_LIBEXEC_ROOT`, `DAEMON_SUPERVISOR_TARGET`,
`DAEMON_RPC_PROBE_TARGET`, `DAEMON_NATIVE_BOUNDARY_TARGET`,
`NFTABLES_CONFIG_PATH`, `NFTABLES_SYSTEMD_DROPIN_ROOT`, or
`NFTABLES_SYSTEMD_DROPIN_TARGET`, run a direct `deploy/verify.sh` with the same
exported values. Install and upgrade retain those exported values for their
built-in `--verify` call, so the verifier checks the actual custom authority
rather than the default paths. The operator-owned nftables configuration is
read-only to WebUI and is accepted only when its complete include graph is
root-owned and not group/world writable. Non-default destructive targets such
as the libexec and systemd drop-in roots still require the trusted
`.trex-webui-managed` ownership marker described above.

The repository-level compression contract can be exercised without installing or
reloading the host configuration:

```bash
deploy/tests/nginx_static_compression_test.sh
```

It renders the template into a temporary, isolated Nginx instance, runs
`nginx -t`, and verifies identity, dynamic gzip, and `gzip_static` responses with
`curl`, including `Content-Encoding`, `Vary`, security headers, decoded content,
and the existing seven-day asset cache policy.

## Major Change Acceptance Gate

For every major TRex WebUI change, the Nginx deployment path must be validated
through the fixed real-hardware Standard E2E gate:

```bash
scripts/npmw run verify:major -- --base-url http://127.0.0.1 \
  --config-file /path/to/validated/trex_cfg.yaml
```

The wrapper runs deployment archive/rollback, runtime-transaction, and global-lock
tests; API and sharded Web tests; typecheck, lint, production build, and a
production-browser smoke through Nginx. It then atomically publishes the fresh
`apps/web/dist`, runs the Nginx/API deployment probe, executes
`scripts/npmw run e2e:standard`, and verifies the fresh report archive generated
by that gate run. When `--browser-write-acceptance` is selected, the guarded
browser writes run after Standard E2E has started and validated the configured
TRex runtime, so a healthy but initially stopped TRex process is a supported
baseline. A major change is accepted only when the Standard E2E archive has
`workflow=standard-e2e` and `verdict=pass`, matching current source/build
identity, idle traffic, and zero active capture recorders.
Run the Python runtime and Node production dependency audits separately; this
local wrapper also does not prove that hosted CI executed.
The wrapper itself holds the same deployment lock as install/upgrade for the
whole gate. It captures a source identity before local checks and the frontend
build, then rejects drift before binding the resulting build identity and gate
ID; the archive verifier checks both identities again after the hardware run.
Keep the local evidence under `.logs/standard-e2e-gate/` and the
matching server archive under `/var/log/trex/reports/` as the acceptance
evidence. If the real lab environment is unavailable, record the exact blocker
instead of substituting mock data.
The wrapper bounds each local gate step and the real Standard E2E step to 30
minutes by default. Use `--step-timeout SECONDS` or `--e2e-timeout SECONDS`
only for a known slow lab, and treat any timeout as a failed acceptance gate.

For a release candidate, use a host-validated active config and explicitly opt
into the bounded browser write path:

```bash
scripts/npmw run verify:major -- --base-url http://127.0.0.1 \
  --config-file /path/to/validated/trex_cfg.yaml \
  --browser-write-acceptance
```

Never use the unedited public example as the active configuration. The write
gate accepts only the canonical first logical pair with both selected links up,
idle/unowned configured traffic ports, and zero captures. In the validated TRex
v3.08 environment, finite-duration STL traffic cannot be paused, so the gate
writes that pair at `1kpps` with `duration=-1`; the browser route injects a
canonical UTC per-group
`hard_stop_at` exactly 60 seconds ahead into Start. With a normal response it
passes only the returned session ID as CAS on every Pause/Resume/Stop, narrows
Stop to that exact pair, and proves that cleanup cleared the lease. Preflight,
Start, Running, and every mutation boundary revalidate the complete configured
inventory; missing, duplicate, or extra rows and any non-idle non-selected port
fail closed before the next write.

If the Start response is lost after commit, the gate never guesses or adopts a
runtime session and never issues a broad Stop. Its preflight also reads
`/api/system/environment` in parallel and blocks before the plan write unless
`connect_timeout_seconds` is an integer from 1 through 3; that accepted value is
stored in browser evidence and its final cleanup record. Under this RC timing
prerequisite it waits through `hard_stop_at + 5s`, then requires every
configured port exactly once and stopped/unowned, the exact pending Start WAL
cleared, and the exact gate-written groups plus revision still current before
restoring the original plan. Any missing inventory, changed authority, active
port, retained WAL/lease, or plan drift blocks restoration.

The five-second grace is an observed RC acceptance threshold, not a
hard-real-time Stop guarantee or theoretical worst-case bound. A fenced
operation can issue several sequential SDK RPCs, each subject to the configured
connection timeout. Stats, ports, runtime snapshots, and the reaper share the
runtime mutation fence, so expiry observation can be delayed by an in-flight
SDK call or scheduling. This RC gate caps the synchronized connection timeout
at three seconds and passes only when observed recovery completes inside the
five-second threshold. A pass certifies only the selected pair and hardware
identity recorded in that archive; every other configured pair requires its own
current link and real-traffic evidence.

## Security

This project is intentionally a single-operator TRex console. Anyone who can reach
the Nginx site can issue TRex control commands through the backend. Single-user
means the application does not implement RBAC; it does not mean the service is
safe to publish to an untrusted LAN or the Internet.

### Systemd boundary

The packaged service uses the following boundary:

- `trex-webui:trex-webui` is a static, non-login system identity.
- `NoNewPrivileges=true`, an empty capability bounding/ambient set, private
  devices and temporary storage, kernel/control-group protections, namespace and
  syscall restrictions, and `ProtectSystem=strict` prevent privilege inheritance
  and broad filesystem writes.
- `/opt/trex-webui` and `/opt/trex-core` are read-only to the service.
- `/var/lib/trex-webui` plus the `captures`, `reports`, and `config-versions`
  subdirectories under `/var/log/trex` are the only standard writable paths.
  `StateDirectory=trex-webui` creates the state root with the correct owner;
  host provisioning creates the three log subdirectories.
- `/var/lib/trex-webui/trex_cfg.yaml` is the WebUI-managed config copy. This
  preserves atomic replace/version/restore without granting write access to
  `/etc`.
- `/var/lib/trex-webui/runtime-state.json` is the systemd-pinned persistent
  connection/capture/traffic runtime authority.
- The API keeps network access because it must reach STL, Scapy, and daemon RPC
  ports on the real TRex host. Inbound API access remains loopback-only behind
  Nginx.

The API must not start a privileged `trex_daemon_server` by elevating itself.
The default installer instead owns a separate root
`trex-daemon-server.service`, while the API remains unable to invoke
`systemctl`, inherit daemon privileges, or execute wrapper lifecycle commands.
The API uses guarded JSON-RPC methods for TRex workload start/stop and config
upload. With `NoNewPrivileges=true`, a legacy local daemon bootstrap command
that requires sudo/root correctly fails with a permission blocker instead of
escaping the API boundary.

The managed unit runs the upstream wrapper in foreground `start-live` mode,
enables `on-failure` recovery at boot, and passes `--trex-host 127.0.0.1`
explicitly because the upstream default is `0.0.0.0`. The daemon RPC has
root-equivalent traffic-control effects and must never be exposed to an
untrusted network. Its loaded listener and JSON-RPC readiness are deployment
verification requirements, not assumptions derived from a process name.
The upstream STL publisher/RPC and Scapy server independently hardcode wildcard
binds. The managed unit therefore applies
`inet trex_webui_native_boundary` before startup and verifies its exact
non-loopback reject rule afterward. `IPAddressAllow=localhost` plus
`IPAddressDeny=any` protects the service cgroup when supported; nftables remains
the required authority because systemd documents that cgroup IP filters can be
ineffective on kernels or container managers without cgroup eBPF support.

Use `--external-daemon` only when an operator-managed local or remote supervisor
owns the TRex daemon. That flag leaves all installer-managed local daemon unit,
service, RPC, native-boundary table/helper, and log state untouched. For a
remote host, restrict ports 8090, 4500, 4501, and 4507 to the WebUI host at the
management firewall. In either case, prove the external supervisor's boot
recovery independently.

The managed daemon keeps umask `0027`; its log remains
`root:trex-webui` `0640` under the setgid log directory. Log rotation uses
`copytruncate` because systemd appends stdout/stderr through a long-lived file
descriptor. Replacing or renaming the active log without reopening that
descriptor would make new records continue into the rotated inode.

Path ownership for the standard deployment is:

| Path | API access | Owner/mode expectation |
| --- | --- | --- |
| `/opt/trex-webui` | selector/release authority | `root:root`, not group/world writable |
| `/opt/trex-webui/releases/sha256-*` | read/execute | verified root-owned release tree with traversable `0755` release/`apps` ancestors; the complete tree is restored to persisted SELinux policy before startup, while only `apps/web/dist` receives the versioned `httpd_sys_content_t` policy |
| `/opt/trex-webui/current` | read/execute | root-owned relative symlink to `releases/sha256-*`; stable API/Nginx consumer |
| `/opt/trex-webui/previous` | inactive N-1 | absent on first release or a root-owned relative symlink to a distinct complete release |
| `/opt/trex-webui/current/.env` (optional) | read | release-attached `root:trex-webui` `0640` regular file; prefer `/etc/trex-webui/trex-webui.env` |
| `/opt/trex-webui/current/.venv` and `.venv.runtime-*` | read/execute | candidate-owned trusted runtime/release markers, not group/world writable |
| `/opt/trex-core` | read/execute | `root:root`, not group/world writable |
| `/var/lib/trex-webui-deploy` | no API access | `root:root` `0700`; release journal/lock are regular `0600` single-link files |
| `/usr/libexec/trex-webui/recovery-v2/release_transaction.py` | no API access | `root:root` `0755`, regular non-symlink canonical boot reconciler |
| `/usr/libexec/trex-webui/release_transaction.py` (ABI v1, migrated hosts only) | no API access | immutable audit/migration artifact; its systemd units are quarantined by v2-owned inert bridge drop-ins |
| `/var/lib/trex-webui` | read/write | `trex-webui:trex-webui`, `0750` |
| `/var/lib/trex-webui/trex_cfg.yaml` | read/write/replace | `trex-webui:trex-webui`, `0640` |
| `/var/lib/trex-webui/runtime-state.json` | read/write/replace | `trex-webui:trex-webui`, `0640` after first publication |
| `/run/trex-webui/daemon-generation` | read | `root:root`, `0644`, canonical UUID replaced on each managed daemon start |
| `/var/log/trex` | read/traverse only | `root:trex-webui`, setgid `2750` |
| `captures`, `reports`, `config-versions` | read/write | `trex-webui:trex-webui`, `0750` |
| `trex_daemon_server.log` | read | `root:trex-webui`, `0640` |
| `/etc/trex-webui/trex-webui.env` | non-authoritative API tuning in managed mode; connection authority in external mode | `root:root`, `0600`, regular non-symlink |

For a custom writable path, add both the environment value and the sandbox
exception. For example:

```ini
# systemctl edit trex-webui-api.service
[Service]
Environment=TREX_WEBUI_TREX_CONFIG_PATH=/srv/trex-webui/trex_cfg.yaml
ReadWritePaths=/srv/trex-webui
```

Provision `/srv/trex-webui` as `trex-webui:trex-webui` before restart. A
`ReadWritePaths=` entry relaxes only systemd's mount sandbox; normal Unix and
SELinux permissions still apply. `ProtectHome=true` intentionally rejects
writable roots under `/home`, `/root`, or `/run/user`.

The optional capture analyzer launcher is headless by default. A desktop
Wireshark launch generally needs access to a user's home, display socket, and
devices and is therefore incompatible with the standard `PrivateTmp`,
`PrivateDevices`, and `ProtectHome` boundary. Use server-side PCAP download, or
review a narrowly scoped systemd drop-in rather than disabling all hardening.

### Nginx access, authentication, and TLS

The checked-in server allows only `127.0.0.0/8` and `::1`, then loads explicit
`allow` entries from `/etc/nginx/trex-webui/access.d/*.conf` before its final
`deny all`. This makes an accidental install safe while keeping management-LAN
deployment straightforward. Never use `allow all` for convenience.

For defense in depth, enable Basic Authentication after TLS is working:

```bash
sudo dnf install -y httpd-tools
sudo install -d -o root -g nginx -m 0750 /etc/nginx/trex-webui/security.d
sudo htpasswd -c /etc/nginx/trex-webui/htpasswd trex-operator
sudo chown root:nginx /etc/nginx/trex-webui/htpasswd
sudo chmod 0640 /etc/nginx/trex-webui/htpasswd
sudo tee /etc/nginx/trex-webui/security.d/basic-auth.conf >/dev/null <<'EOF'
auth_basic "TRex WebUI";
auth_basic_user_file /etc/nginx/trex-webui/htpasswd;
EOF
sudo nginx -t && sudo systemctl reload nginx
```

Basic Authentication and the subnet allowlist are both enforced. Do not send
Basic credentials over cleartext HTTP. A server-context TLS include can enable
HTTPS without editing the managed base file:

```nginx
# /etc/nginx/trex-webui/security.d/tls.conf
listen 443 ssl http2;
listen [::]:443 ssl http2;
ssl_certificate /etc/pki/tls/certs/trex-webui.crt;
ssl_certificate_key /etc/pki/tls/private/trex-webui.key;
ssl_protocols TLSv1.2 TLSv1.3;
ssl_session_cache shared:trex_webui_tls:10m;
ssl_session_tickets off;
add_header Strict-Transport-Security "max-age=31536000" always;
```

Keep the private key readable only by root and the Nginx worker group. Validate
the certificate name against the management DNS name. The include enables HTTPS
alongside port 80; enforce HTTPS by closing port 80 at the management firewall or
installing a separately reviewed HTTP-to-HTTPS redirect server.

Security includes are server-context snippets, not arbitrary full Nginx
configurations. Always run `nginx -t` before reload. Enabling authentication also
means unauthenticated `deploy/verify.sh` requests will return 401; use equivalent
authenticated health probes for that deployment.

### Installer-enforced host contract

`deploy/install.sh` enforces these steps idempotently:

1. Create the `trex-webui` system group and non-login user, and fail on a
   conflicting pre-existing regular account instead of silently reusing it.
2. Keep the selected release, API source, candidate-owned virtual environments,
   and project profile catalog root-owned and non-writable by `trex-webui`;
   prove their readability and every required `/opt/trex-core` traversal with
   the non-root SDK import smoke test.
3. Create `/var/lib/trex-webui` and its writable profile root as
   `trex-webui:trex-webui` `0750`; seed `trex_cfg.yaml` from the legacy
   `/etc/trex_cfg.yaml` only when the state copy does not already exist.
4. Create `/var/log/trex` as `root:trex-webui` setgid `2750`; create captures,
   reports, and config-versions as service-owned `0750`. In managed-local mode
   only, make the root-owned daemon log group-readable without transferring
   daemon ownership to the API and install its `copytruncate` logrotate policy
   with the same ownership contract.
5. Create `/etc/trex-webui`, `access.d`, and `security.d` as root-controlled
   directories and preserve local access/auth/TLS snippets across upgrades.
   The installer does not rewrite an operator-supplied `trex-webui.env`; the
   operator must keep it a regular non-symlink owned by `root:root` at `0600`.
6. In the default local mode, install and enable the separate root-owned
   `trex-daemon-server.service`, bind its RPC only to `127.0.0.1:8090`, prove
   the nftables boundary for native TCP 4500/4501/4507, prove bounded JSON-RPC
   readiness, and start the API afterward. With
   `--external-daemon`, leave every local daemon artifact and service untouched.
   Do not add sudoers entries, Linux capabilities, device groups, or a writable
   `/opt/trex-core` path to make daemon bootstrap appear to work.
7. Before changing or restarting the managed daemon, fail closed if loopback
   RPC reports a running TRex process or reservation, or if an active daemon's
   RPC state is unknown. Only `--allow-daemon-runtime-restart` records explicit
   maintenance consent to interrupt that state.
8. Publish managed Nginx/systemd/logrotate files through same-directory atomic
   replaces, retain installer rollback copies through validation/restart/verify,
   and restore both files and reloaded service-manager state after handled
   failures.
9. Install a root-owned release engine, oneshot boot reconciler, and Nginx
   dependency drop-in. Require the reconciler before the API, managed daemon,
   and Nginx so no stable consumer starts against an unreviewed interrupted
   selector state.
10. Serialize installer and archive-upgrader mutations with the root-only global
    deployment lock. For archive upgrades, fsync a manifest-verified
    content-addressed candidate and every journal phase, atomically update
    `current`/`previous`, require direct API readiness plus
    on-disk/loaded/process/runtime/static identity before commit, and retain the
    complete N-1 release.
11. On upgrade, preserve `/var/lib/trex-webui`, `/var/log/trex`, the preferred
    root-owned environment file, and Nginx access/security includes; never
    recursively chown a selected release tree to the service account.

Template-level validation commands are:

```bash
systemd-analyze verify deploy/systemd/trex-daemon-server.service
systemd-analyze verify deploy/systemd/trex-webui-api.service
systemd-analyze verify deploy/systemd/trex-webui-release-reconcile-v2.service
systemd-analyze security --offline=yes \
  deploy/systemd/trex-webui-api.service
sudo nginx -t
sudo deploy/verify.sh --base-url http://127.0.0.1
```
