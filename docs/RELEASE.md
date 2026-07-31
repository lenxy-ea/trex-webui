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

## 4. Run a verified archive upgrade

Download every published asset into one new directory. The metadata inventory names
the exact files required by the bootstrap:

```bash
release_dir="$(mktemp -d -t trex-webui-release.XXXXXXXX)"
gh release download "$tag" --dir "$release_dir"
export GH_TOKEN="$(gh auth token)"
sudo --preserve-env=GH_TOKEN \
  "$release_dir/trex-webui-<version>.verified-upgrade.sh" \
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

When SELinux is enabled, the versioned installer automatically requires
`semanage`, `matchpathcon`, `restorecon`, and `setsebool`, persists the exact
`/opt/trex-webui/releases/sha256-<digest>/apps/web/dist` policy as
`httpd_sys_content_t`, and relabels the physical `current` and `previous`
frontend trees before Nginx restarts. The API tree and optional `.env` stay
outside that HTTP-readable type. On AlmaLinux, install
`policycoreutils-python-utils` before the verified upgrade if `semanage` is not
already present; missing or mismatched policy fails the upgrade. The exact
release-path rule and HTTP network-connect boolean are durable host policy and
remain installed across selector rollback.

The root-owned `trex-webui-release-reconcile.service` is required before the
API, managed daemon, and Nginx. At boot it obtains the deployment lock and rolls
back any uncommitted selector transaction; a committed journal is verified and
retained. During an active upgrade, the outer process already owns that lock, so
each transient oneshot invocation reports the deployment as active without
racing the transaction. Because the unit deliberately has no `RemainAfterExit`,
later consumer starts invoke the reconciler again before they proceed.

Inspect the committed state and stable consumers:

```bash
sudo /usr/libexec/trex-webui/release_transaction.py status
readlink /opt/trex-webui/current
readlink /opt/trex-webui/previous
systemctl show trex-webui-api.service \
  --property=WorkingDirectory --property=ExecStart
sudo grep -F 'root /opt/trex-webui/current/apps/web/dist;' \
  /etc/nginx/conf.d/trex-webui.conf
sudo /opt/trex-webui/current/deploy/verify.sh \
  --project-root "$(readlink -f /opt/trex-webui/current)" \
  --service-project-root /opt/trex-webui/current \
  --web-root /opt/trex-webui/current/apps/web/dist \
  --base-url http://127.0.0.1
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
