# Exact-tag attested releases

TRex WebUI releases use an exact-tag, fail-closed chain. GitHub builds the
archive from the tag commit, binds the archive to the Standard and six-port
operator-provided hardware reports, attests every install input, uploads one
fixed 12-asset set to an existing draft prerelease, and publishes that exact
release as an immutable prerelease.

## 1. Produce qualification reports

Start from the clean commit that will be tagged. Run the required current-source
gates against the six-port lab and retain the passing JSON paths printed by the
commands:

```bash
scripts/npmw run verify:major -- --base-url http://127.0.0.1 \
  --config-file /var/lib/trex-webui/trex_cfg.yaml
scripts/npmw run e2e:six-port -- --base-url http://127.0.0.1
scripts/npmw run e2e:api-restart -- --base-url http://127.0.0.1
```

The release workflow consumes the Standard and six-port report assets supplied
by the operator. Both must describe the exact clean tag source and the same
packaged frontend/API build identity. `scripts/release_evidence.py` checks their
structure, source/build/config bindings, verdicts, traffic-session bindings,
and cleanup postconditions. GitHub attests the exact report bytes received by
the workflow; that attestation does **not** independently prove that the reports
originated from physical hardware. The operator remains responsible for the
lab provenance and custody of those reports.

## 2. Enable immutability, then create the tag and draft prerelease

Before creating the draft, enable **Settings > General > Releases > Enable
release immutability**. GitHub applies this setting only to releases created
after it is enabled, so enabling it after the draft exists is too late for this
release. The gate checks the repository's immutable-releases Administration
endpoint before it downloads or mutates any release asset and again before
publication.

Configure the protected `release` GitHub Actions environment with a
`RELEASE_ADMIN_TOKEN` secret. Use a fine-grained token with only repository
**Administration: read** for this repository. The workflow's normal
`GITHUB_TOKEN` performs contents writes, downloads, attestations, and the final
publication. The admin-read secret is passed only to the immutable-setting GET;
it is removed from every upload, delete, PATCH, attestation, and local contract
validator subprocess. A missing or unauthorized secret fails before any asset
mutation.

Restrict the environment to a custom deployment tag policy for the exact tag
being released (for example `v0.1.0-rc.2`, type `tag`). Do not select protected
branches or `main`: this workflow is intentionally dispatched from the tag ref.
For a single-maintainer repository, add that maintainer as the required reviewer
and leave self-review enabled; preventing self-review with no second reviewer
deadlocks the release. Replace the exact tag policy for each release. A broader
`v*` tag policy reduces maintenance but also widens the deployment boundary.

The tag is always `v<package.json version>` and must resolve directly to the
clean source commit. Create the draft with its target pinned to that commit:

```bash
version="$(python3 -c 'import json; print(json.load(open("package.json"))["version"])')"
tag="v${version}"
source_sha="$(git rev-parse HEAD)"
git tag --annotate "$tag" --message "TRex WebUI ${tag}"
git push origin "$tag"
gh release create "$tag" --verify-tag --draft --prerelease \
  --target "$source_sha" --title "TRex WebUI ${tag}"
```

Upload only the two qualification reports before dispatching the workflow:

```bash
gh release upload "$tag" \
  /absolute/path/to/standard-e2e-report.json \
  /absolute/path/to/six-port-e2e-report.json
```

## 3. Dispatch the release workflow from the tag

Pass release-asset basenames, not local paths:

```bash
gh workflow run release.yml --ref "$tag" \
  -f standard_report_asset=standard-e2e-report.json \
  -f six_port_report_asset=six-port-e2e-report.json
```

`.github/workflows/release.yml` reruns the complete reusable, non-hardware CI,
persists the release database ID plus exact tag/target/source and starter-report
identities, downloads the two reports by asset ID, builds the v3 archive and its
two SBOMs, creates the checksum/evidence/bootstrap metadata, and signs GitHub
artifact attestations. The gate allows only the two report assets plus ten
generated assets. It uploads missing assets to the persisted release ID, never
clobbers an uploaded same-name mismatch, and deletes only an incomplete GitHub
`starter` placeholder by its exact asset ID before retrying that upload.

Before publication the gate downloads all 12 assets by asset ID, verifies API
size/digest metadata and local SHA-256, reruns the metadata/evidence/archive
contracts, and applies the exact repository/workflow/ref/source/signer policy to
each artifact attestation. It then PATCHes that release ID to
`draft=false, prerelease=true` and requires the result to be immutable. Review
the two operator reports and the tag target before dispatch: a passing workflow
publishes the prerelease. A partial draft rerun uploads only missing assets; an
exact immutable published rerun performs final validation without mutation.

GitHub's release-by-tag REST endpoint does not expose draft releases. The gate
therefore resolves the initial draft through the authenticated, bounded release
listing, requires one exact tag match, and immediately pins its numeric release
ID. Every subsequent read, download, upload, and publication check uses that
exact ID and fails if the tag, target, state, or asset identities change.

## 4. Run a verified archive upgrade

Download every published asset into one new directory. The metadata inventory names
the exact files required by the bootstrap:

```bash
release_dir="$(mktemp -d -t trex-webui-release.XXXXXXXX)"
gh release download "$tag" --dir "$release_dir"
export GH_TOKEN="$(gh auth token)"
sudo --preserve-env=GH_TOKEN \
  bash "$release_dir/trex-webui-<version>.verified-upgrade.sh" \
  --tag "$tag" \
  --metadata "$release_dir/trex-webui-<version>.release.json" \
  -- --install-python-deps --verify
```

The bootstrap requires root so its private snapshots cannot be modified by the
calling user. Before any archive listing, extraction, or archive-carried code
execution, it verifies GitHub attestations with all of these fixed constraints:

- repository `lenxy-ea/trex-webui`;
- signer workflow `lenxy-ea/trex-webui/.github/workflows/release.yml`;
- source ref `refs/tags/<tag>`;
- source and signer digest equal to the tag commit;
- GitHub-hosted runner provenance.

It snapshots every metadata-named asset, re-verifies those snapshots, checks all
digests and report/SBOM bindings, validates and safely extracts the v3 payload,
then executes `deploy/upgrade.sh` from that verified payload. An installed rc.1
v2 upgrader is never asked to parse a v3 archive.

The target archive contains `deploy/trex-webui`, the stable operator-facing
entrypoint. After the first verified install, use the selected release to
inspect the deployment without remembering physical release or Web-root paths:

```bash
CLI=/opt/trex-webui/current/deploy/trex-webui
sudo "$CLI" doctor --operation upgrade
sudo "$CLI" status
sudo "$CLI" verify --trex
```

For an archive whose trust and custody were established independently, the same
entrypoint can preview or execute the transaction engine directly:

```bash
sudo "$CLI" upgrade --archive /path/to/trex-webui-<version>.tar.gz \
  --sha256 <64-hex-sha256> --dry-run
```

The GitHub release path above remains preferred because it verifies the exact
tag, signer, attestations, metadata, evidence, and archive before executing
release-carried code. See [INSTALLATION.md](INSTALLATION.md) for configuration
import, management CIDR, JSON output, and rollback examples.

## 5. Verify the durable serving selection

The production archive path does not synchronize files over a serving checkout.
It stores the verified payload under
`/opt/trex-webui/releases/sha256-<payload-digest>`, creates a candidate-owned
Python runtime, and renders both stable consumers through one selector:

- API WorkingDirectory, `--app-dir`, Python runtime, and profile catalog use
  `/opt/trex-webui/current`;
- Nginx serves `/opt/trex-webui/current/apps/web/dist`;
- `/opt/trex-webui/previous` retains the complete immediate predecessor serving
  bundle.

Every activation phase is fsynced to root-only
`/var/lib/trex-webui-deploy/transaction.json`. The candidate is committed only
after API readiness and `deploy/verify.sh` prove the selected source/runtime,
frontend bytes, installed/loaded service declarations, and Nginx path. On the
first migration from an rc.1-style in-place install, the upgrader first snapshots
the serving API, static tree, profiles, optional `.env`, and exact loaded Python
runtime as a content-addressed rollback baseline.

### SELinux activation contract

When SELinux is enabled, the versioned installer automatically requires
`semanage`, `matchpathcon`, `restorecon`, and `setsebool`. It persists the exact
`/opt/trex-webui/releases/sha256-<digest>/apps/web/dist` policy as
`httpd_sys_content_t`. Before every selector activation, it normalizes only the
release root, `apps`, and `apps/web` traversal ancestors to mode `0755`, then
runs `restorecon -RF` over the complete physical release tree for the candidate
and the selected `current` and `previous` targets. This recovers policy-derived
labels for the API source and Python runtime even when archive extraction or
virtualenv staging inherited `user_tmp_t`; only the exact frontend subtree
receives the HTTP-readable type. The API tree and optional `.env` remain outside
that type.

Directory modes are excluded from the content digest, so this narrow ancestor
normalization does not change payload identity. The policy store, restored
xattrs, release tree, and selector ancestors are persisted before the selector
may switch. On AlmaLinux, install `policycoreutils-python-utils` before the
verified upgrade if `semanage` is not already present; missing or mismatched
policy fails the upgrade. The exact release-path rule and HTTP network-connect
boolean remain durable across selector rollback.

### Recovery ABI v2

Production has one canonical recovery semantics authority:
`/usr/libexec/trex-webui/recovery-v2/release_transaction.py`. Its immutable
bootstrap is beside it at
`/usr/libexec/trex-webui/recovery-v2/bootstrap_release_infrastructure.py`.
Recovery ABI v2 installs these units:

- `trex-webui-release-reconcile-v2.service` for the ordinary boot and consumer
  barrier;
- `trex-webui-release-retry-v2.service` for an independent, unbounded retry
  when the outer deployment lock is busy;
- `trex-webui-release-consumer-ack-v2.service` for durable acknowledgement of
  restored baseline consumers.

The common immutable profile is recorded in
`/var/lib/trex-webui-deploy/infrastructure-v2-common.json`; a managed-local host
also has
`/var/lib/trex-webui-deploy/infrastructure-v2-managed-local.json`. Direct v2
consumer dependencies are manifest-owned files at:

- `/etc/systemd/system/trex-webui-api.service.d/trex-webui-release-reconcile-v2.conf`;
- `/etc/systemd/system/nginx.service.d/trex-webui-release-reconcile-v2.conf`;
- `/etc/systemd/system/trex-daemon-server.service.d/trex-webui-release-reconcile-v2.conf`
  on managed-local hosts.

Provider runtimes and units are fsynced first, consumer dependencies are
published only after that durability barrier, and the manifest is published
last.

An upgrade from recovery ABI v1 never overwrites or deletes the immutable v1
engine, bootstrap, units, drop-ins, or the
`/var/lib/trex-webui-deploy/infrastructure-common.json` and
`/var/lib/trex-webui-deploy/infrastructure-managed-local.json` manifests.
Before the first v2 publication, the upgrader uses the installed v1 bootstrap
to exact-verify the complete v1 profile, requires all three v1 recovery units
to be inactive and job-free, and requires both the installed v1 engine and the
candidate v2 engine to interpret the same fully retired terminal journal. A
non-terminal journal, retained rollback authority, selector disagreement, or
v1 artifact drift stops migration before authority changes.

The terminal interpretation and quiescent-unit checks are repeated immediately
before `daemon-reload`. After reload, every bridged v1 unit must still be
inactive, job-free, and have no main PID. This closes the crash-resume window
between durable v2 publication and systemd manager graph replacement.

After those checks, v2 publishes manifest-owned bridge drop-ins named
`trex-webui-recovery-v2-bridge.conf` at:

- `/etc/systemd/system/trex-webui-release-reconcile.service.d/`;
- `/etc/systemd/system/trex-webui-release-retry.service.d/`;
- `/etc/systemd/system/trex-webui-release-consumer-ack.service.d/`.

Each bridge clears the old `ExecStart` and `ExecStartPost`, substitutes
`/usr/bin/true`, and adds `Requires=` / `After=` edges to its corresponding v2
unit. Thus legacy consumer edges remain a compatibility barrier but cannot
execute v1 recovery semantics. The direct v2 consumer drop-ins are published
after this cutover. The retained v1 bytes remain auditable, but there is never
a second live recovery semantics authority. On a clean host the same bridge
drop-ins are inert because no v1 unit exists, and v2 is installed directly.

The root-owned `trex-webui-release-reconcile-v2.service` is required before the
API, managed daemon, and Nginx. At boot it obtains the deployment lock and rolls
back any uncommitted selector transaction; a committed journal is verified and
retained. During an active upgrade, the outer process already owns that lock, so
each transient oneshot invocation reports the deployment as active without
racing the transaction. Because the unit deliberately has no `RemainAfterExit`,
later consumer starts invoke the canonical v2 reconciler again before they
proceed.

Inspect the committed state and stable consumers:

```bash
sudo /usr/libexec/trex-webui/recovery-v2/release_transaction.py status
systemctl status trex-webui-release-reconcile-v2.service \
  trex-webui-release-retry-v2.service \
  trex-webui-release-consumer-ack-v2.service
readlink /opt/trex-webui/current
readlink /opt/trex-webui/previous
systemctl show trex-webui-api.service \
  --property=WorkingDirectory --property=ExecStart
sudo grep -F 'root /opt/trex-webui/current/apps/web/dist;' \
  /etc/nginx/conf.d/trex-webui.conf
sudo /opt/trex-webui/current/deploy/verify.sh \
  --project-root "$(readlink -f /opt/trex-webui/current)" \
  --service-project-root /opt/trex-webui/current \
  --web-root "$(readlink -f /opt/trex-webui/current)/apps/web/dist" \
  --base-url http://127.0.0.1
```

If an interrupted transaction needs another reconciliation attempt after the
deployment lock holder has exited, invoke the v2 systemd authority rather than
an old engine path:

```bash
sudo systemctl start trex-webui-release-reconcile-v2.service
sudo /usr/libexec/trex-webui/recovery-v2/release_transaction.py status
```

Do not hand-edit `current`, `previous`, the release store, or the journal.

## 6. Exercise explicit N-1 rollback when required

In an approved maintenance window, with no traffic/capture operation in flight,
reactivate the retained predecessor through the guarded wrapper:

```bash
sudo /opt/trex-webui/current/deploy/upgrade.sh \
  --rollback-previous \
  --verify-base-url http://127.0.0.1
```

The rollback path requires the installer-managed local daemon and deliberately
rejects `--external-daemon`, because an external supervisor remains a separate
mutation authority that this host cannot fence. Its live preflight requires the
managed daemon to be reachable, idle, and unreserved; all ports stopped and
unowned; no traffic mutation recovery, capture recorder, or active/recovering
Quick Validation. `--verify-trex` adds a post-switch overview check.

The wrapper requires the existing API and Nginx to consume `current`, holds the
global deployment lock, arms boot reconciliation, validates the complete
predecessor, and starts a new durable selector transaction. After the last live
preflight it stops the API, closing the WebUI mutation authority. While the API
is stopped, it reloads `/var/lib/trex-webui/runtime-state.json` with the exact
current release's `RuntimeStateStore` and rechecks daemon `safe-restart`; only
then may it swap `current` and `previous`. It restarts API and Nginx and commits
only after exact API runtime/health and served-frontend checks pass. A pre-commit
failure returns to the newer release. The operation does not restore
runtime-state, reports, captures, active TRex configuration, a terminated
workload, or a daemon reservation; those state roots intentionally remain
outside release selection.

The first-migration legacy baseline intentionally contains only what the stable
consumers need to serve: API source, frontend assets, profiles, optional `.env`,
and the exact Python runtime. Launch the first rollback from the still-current
rc.2 wrapper shown above. After that selector swap, the newer release and its
wrapper are at `/opt/trex-webui/previous`; use
`/opt/trex-webui/previous/deploy/upgrade.sh --rollback-previous` if a guarded
reactivation of that newer release is required.

## 7. Handle failures and verify target hosts

If build, attestation, metadata, archive, browser, API, or hardware evidence
validation fails before PATCH, the release remains a draft. Preserve the exact
failing log/report path and rerun only after correcting the failed input. A
same-name uploaded mismatch is intentionally not replaced; create a new fixed
tag and draft rather than erasing contradictory bytes. If GitHub accepted the
publication PATCH but the runner failed before its last checks, rerun the same
tag: the gate recognizes the immutable published prerelease and performs only
the complete final validation.

After publication, independently run the verified upgrade and target-host
checks in this document. A clean checkout, checksum-only archive, GitHub
attestation over operator-supplied bytes, or successful immutable-release
attestation is not a substitute for physical-lab provenance or target-host
verification.
