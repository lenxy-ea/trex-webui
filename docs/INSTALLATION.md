# Install and operate TRex WebUI

The supported production path installs an immutable release archive, not a
live Git checkout. A release contains the built frontend and locked Python
runtime inputs, so Node.js and npm are not required on the target host.

## Choose the deployment mode

| Mode | Use it when | Lifecycle authority |
| --- | --- | --- |
| `managed-local` | TRex and WebUI run on the same AlmaLinux host | The installer owns the persistent local daemon, systemd units, logs, and native-port nftables boundary |
| `external-daemon` | An independently managed or remote daemon already exists | The operator owns daemon persistence, firewalling, logs, and recovery |

The release-qualified baseline is AlmaLinux 9.x on x86_64 with Python 3.11,
Nginx, systemd, and TRex v3.08. Managed-local mode expects the TRex distribution
at `/opt/trex-core` unless `--trex-root` is supplied.

## Prepare two explicit operator inputs

Use the real management subnet and a reviewed TRex YAML. The documentation
network below is only a placeholder:

```bash
MANAGEMENT_CIDR="192.0.2.0/24" # replace with the narrow real management subnet

sudo install -d -o root -g root -m 0700 /var/lib/trex-webui-bootstrap
sudo install -o root -g root -m 0600 /path/to/reviewed-trex_cfg.yaml \
  /var/lib/trex-webui-bootstrap/trex_cfg.yaml
```

The imported YAML must be a 1-byte-to-1-MiB regular file below a root-owned,
non-group/world-writable path. Installation copies it atomically to
`/var/lib/trex-webui/trex_cfg.yaml` as `trex-webui:trex-webui` `0640`. A later
failure restores the exact previous file.

`--allow-cidr` atomically writes the Nginx management allowlist. Omitting it
retains an existing allowlist; on a new host, omission keeps non-loopback
access denied. The installer never silently adds `0.0.0.0/0`.

## Recommended: install an attested published release

Select a published prerelease, download all of its assets into a new directory,
and run the downloaded bootstrap through Bash. GitHub downloads do not preserve
the executable bit, so direct `./script` execution is intentionally not used.

```bash
TAG="v0.1.0-rc.2" # choose the published version to install
VERSION="${TAG#v}"
RELEASE_DIR="$(mktemp -d -t trex-webui-release.XXXXXXXX)"

gh release download "$TAG" \
  --repo lenxy-ea/trex-webui \
  --dir "$RELEASE_DIR"
export GH_TOKEN="$(gh auth token)"

sudo --preserve-env=GH_TOKEN \
  bash "$RELEASE_DIR/trex-webui-${VERSION}.verified-upgrade.sh" \
  --tag "$TAG" \
  --metadata "$RELEASE_DIR/trex-webui-${VERSION}.release.json" \
  -- \
  --install-nginx \
  --install-python-deps \
  --trex-config /var/lib/trex-webui-bootstrap/trex_cfg.yaml \
  --allow-cidr "$MANAGEMENT_CIDR" \
  --verify \
  --verify-trex
```

Remove `--verify-trex` only when the real TRex control plane is intentionally
offline. Add `--firewalld` when this host uses firewalld and the HTTP service
must be opened there. For an independently managed daemon, add
`--external-daemon` and omit local TRex lifecycle assumptions.

The bootstrap verifies the exact tag, signer workflow, source commit, GitHub
artifact attestations, metadata inventory, checksums, hardware evidence, archive
layout, and payload manifest before executing archive-carried code. It then
uses the transaction engine to activate a content-addressed release at
`/opt/trex-webui/current`, retaining the immediate predecessor at
`/opt/trex-webui/previous`.

## One day-two command surface

Every installed release carries the high-level operator command:

```bash
CLI=/opt/trex-webui/current/deploy/trex-webui
```

It presents six stable workflows while the hardened Shell installers remain the
only mutation authority:

```bash
# Aggregate host, dependencies, TRex, config, network, release, and live-state checks.
sudo "$CLI" doctor --operation upgrade

# Summarize selectors, release identity, transaction, services, API, traffic, and captures.
sudo "$CLI" status

# Run the selected release's verifier without supplying internal selector paths.
sudo "$CLI" verify --trex

# Preview an archive upgrade without changing the host.
sudo "$CLI" upgrade \
  --archive /path/to/trex-webui-<version>.tar.gz \
  --sha256 <64-hex-sha256> \
  --dry-run

# Upgrade a locally trusted archive; runtime dependencies and deployment verify are defaults.
sudo "$CLI" upgrade \
  --archive /path/to/trex-webui-<version>.tar.gz \
  --sha256 <64-hex-sha256>

# Reactivate the retained N-1 selector after proving traffic/capture/validation quiescence.
sudo "$CLI" rollback --dry-run
sudo "$CLI" rollback --trex
```

Use the attested bootstrap for artifacts obtained from GitHub. Direct
`upgrade --archive` is for an archive and digest whose trust and custody have
already been established independently. It still performs private archive
snapshotting, safe extraction, content validation, activation journaling,
health verification, and automatic rollback.

`install` and `upgrade` require exactly one source:

- `--archive PATH` is the production-shaped path;
- `--checkout` is an explicit development/maintenance path and cannot roll back
  a preceding `git pull` or other source-tree mutation.

Both commands run doctor first, install locked Python runtime dependencies,
verify the deployment, and install Nginx only when it is absent. Optional flags
include `--trex-root`, `--trex-config`, `--allow-cidr`, `--open-firewall`,
`--external-daemon`, `--allow-daemon-runtime-restart`, and `--verify-trex`.

## Machine-readable results

Use JSON for automation without parsing console prose:

```bash
sudo "$CLI" doctor --operation upgrade --format json
sudo "$CLI" status --format json
sudo "$CLI" upgrade --archive /path/to/release.tar.gz \
  --sha256 <64-hex-sha256> --dry-run --format json
```

The schema reports `schema_version`, command, status, check summaries, and
actionable remedies. A blocked mutation remains labeled as the requested
`install` or `upgrade` command and embeds its complete preflight. Engine failures
include the exact argv, exit code, captured output, and final error line.

Important exit behavior:

- `doctor`: `0` when ready, `2` when blockers exist;
- `status`: `0` when API and transaction state are healthy, `1` when degraded;
- `install`, `upgrade`, and `rollback`: `2` for rejected input/preflight, or the
  transaction engine's exit code after execution;
- `verify`: the selected deployment verifier's exit code.

## Failure and recovery behavior

An install or upgrade does not commit the selector until the API, Nginx,
runtime identity, static assets, and requested TRex check pass. Failure restores
the prior configuration, allowlist, service declarations, service state,
runtime, static tree, native-port boundary, and selected release as applicable.
The root-only journal is reconciled again at boot before consumers start.

Rollback is deliberately limited to the retained `previous` selector and the
installer-managed local daemon. It is refused while traffic is active, a
mutation is pending, capture recorders exist, service-mode cleanup is incomplete,
Quick Validation is active/recovering, or release recovery is unfinished.

## Development checkout

For local UI/API development, follow the dependency and dev-server steps in the
main [README](../README.md#development-quick-start). A checkout deployment is
available only as an explicit development path:

```bash
sudo deploy/trex-webui doctor --operation install \
  --trex-config /var/lib/trex-webui-bootstrap/trex_cfg.yaml \
  --allow-cidr "$MANAGEMENT_CIDR"

sudo deploy/trex-webui install --checkout \
  --trex-config /var/lib/trex-webui-bootstrap/trex_cfg.yaml \
  --allow-cidr "$MANAGEMENT_CIDR"
```

The detailed systemd, nftables, SELinux, Nginx, archive, and recovery contracts
remain documented in [NGINX_DEPLOYMENT.md](NGINX_DEPLOYMENT.md). The exact-tag
publisher and attestation workflow is documented in [RELEASE.md](RELEASE.md).
