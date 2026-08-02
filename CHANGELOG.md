# Changelog

All notable changes to TRex WebUI will be documented in this file.

The project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html) for
published releases.

## [Unreleased]

### Added

- A read-only deployment doctor that aggregates host, dependency, SELinux,
  TRex, configuration, management-network, release-selector, transaction, and
  live traffic/capture/Quick Validation checks with text or versioned JSON
  output.
- One high-level `deploy/trex-webui` surface for release-first install, upgrade,
  status, verification, and guarded N-1 rollback while retaining the existing
  fail-closed Shell transaction engines as the mutation authority.
- Transactional import of an explicit reviewed TRex YAML and a canonical narrow
  management CIDR, including exact rollback on later deployment failure.

### Changed

- Production documentation now starts with the attested archive workflow,
  invokes downloaded bootstrap assets through Bash, and uses physical selected
  paths for direct deployment verification.
- Archive installs default to locked Python dependency installation and
  post-activation verification through the high-level entrypoint; Node.js is
  not required on the target host.

### Security

- Management access remains deny-by-default, rejects open-Internet,
  unspecified, multicast, and non-canonical networks, and never overwrites an
  existing allowlist unless the operator supplies `--allow-cidr`.
- Imported TRex configurations must be regular, non-symlink, bounded files
  below root-owned, non-group/world-writable path authority.

## [0.1.0-rc.2] - 2026-08-01

### Added

- Backend-owned traffic evidence v1 with immutable start identity, mutation
  history, commanded cleanup evidence, and revision-bound report archives.
- Real-hardware qualification gates for all three I350 port pairs and for
  systemd API crash/restart adoption of an active traffic session.
- Guided Quick Validation v1 for bounded saved-plan runs, per-port packet and
  loss evidence, exact cleanup, and crash-safe recovery state.
- Exact-tag release provenance, dual SBOM/evidence validation, GitHub artifact
  attestations, and a fail-closed verified-upgrade bootstrap.
- Transactional versioned releases with durable activation journals, a stable
  current/previous selector, boot-time reconciliation, and guarded N-1
  reactivation for the installer-managed local daemon. External-daemon N-1 is
  rejected because its independent mutation authority cannot be fenced locally.

### Security

- Bound report saves now hold the runtime mutation fence and require the exact
  current evidence-v1 traffic session ID and positive revision; reserved
  evidence fields can no longer be supplied by the browser.
- Traffic started by a guided or acceptance run carries a persisted hard-stop
  lease that the runtime supervisor can enforce after browser or API failure.
- Publishable artifacts are restricted to a clean exact tag, source SHA, and
  pinned signer workflow identity before release assets can be trusted.
- SELinux-enabled versioned installs persist and verify an exact HTTP content
  policy for release frontend trees without labeling API source or `.env` as
  Nginx-readable content.
- Versioned releases normalize traversal permissions and restore the persisted
  SELinux context across the complete release and Python runtime before any
  systemd consumer can execute it.
- Recovery ABI v2 is published at a generation-specific path; an exact,
  terminal-only migration quarantines immutable ABI v1 units behind inert
  bridge drop-ins so two recovery engines can never own selector semantics.

### Changed

- Multi-port topology, traffic plan, reports, and profile selection now derive
  their active-run state from one backend authority instead of transient local
  UI state.
- Run Reports, Dashboard chart proportions, close guards, and dense desktop
  workflows were refined for clearer operational scanning and safer actions.
- The package version is pinned to `0.1.0-rc.2` across both npm workspaces.
- Systemd consumer readiness compares stable executable identity rather than
  transient process IDs and start timestamps, so a verified rollback can be
  durably acknowledged after consumers restart.

### Known limitations

- The project remains a release candidate for one trusted operator on a
  management network; application-level authentication and RBAC are not yet
  implemented.
- The reference qualification target is TRex v3.08 on AlmaLinux 9.8 x86_64
  with six Intel I350 ports; each passing report certifies only its exact
  source, build, configuration, and observed hardware identity.
- Exact-tag attestations, hardware qualification, and target-host verified
  upgrade remain release-specific gates; direct-checkout installs do not gain
  the archive transaction guarantees.

## [0.1.0-rc.1] - 2026-07-31

### Added

- Apache-2.0 project licensing, third-party notices, and provenance
  documentation.
- Security reporting, contribution, conduct, and community support policies.
- A tested-platform support matrix and GitHub issue/pull-request templates.
- Hashed Python runtime/development locks, a pinned Node/npm bootstrap, complete
  CycloneDX dependency graphs, dependency-license checks, and deterministic
  public-source/release archives.
- A path-bound public-source scanner that rejects credentials, private-network
  identifiers, unsafe generated bundles, and internal project instructions.

### Security

- Documented the single-operator trusted-management-network boundary and the
  private vulnerability-reporting process.
- Hardened the persistent TRex daemon supervisor with isolated Python startup,
  root-controlled import authority, generation-bound runtime ownership, and
  strict managed-path markers.
- Added full persisted/loaded/live systemd API service verification, including
  the exact runtime argv, sandbox paths, capabilities, and syscall deny groups.
- Made archive upgrades verify a private immutable snapshot before extraction,
  and made install/upgrade verification fail closed when activation is deferred.

### Changed

- Sanitized shipped defaults, fixtures, and the six-port Intel I350 example so
  clean clones start on loopback with no lab-specific identity.
- Pinned the release-candidate version to `0.1.0-rc.1` across both npm
  workspaces and expanded CI to audit all Web dependencies plus the complete
  locked Python development environment.

### Known limitations

- The first public release remains a release candidate.
- Application-level authentication and RBAC are not implemented.
- Public-Internet and untrusted-LAN deployments are unsupported.
- Real-hardware certification currently covers TRex v3.08 on the reference
  AlmaLinux 9.8 x86_64 lab; broader compatibility is best effort.

`v0.1.0-rc.1` was the initial public source release. Pre-public development
history was not released as separate versioned changelog entries.
