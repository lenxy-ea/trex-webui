# Changelog

All notable changes to TRex WebUI will be documented in this file.

The project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html) for
published releases.

## [Unreleased]

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

The initial public source release is planned as `v0.1.0-rc.1`. Pre-public
development history was not released as versioned changelog entries.
