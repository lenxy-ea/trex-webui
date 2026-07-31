# Project Provenance

This document records the known origin, interoperability references, and
redistribution policy for TRex WebUI. It is an engineering provenance record,
not a legal opinion.

## Project identity

TRex WebUI is an independent, unofficial Web interface for Cisco TRex. It is
not affiliated with, sponsored by, or endorsed by Cisco Systems, Inc. Cisco and
other product names and marks are the property of their respective owners.

Original TRex WebUI contributions are licensed under the Apache License 2.0:

```text
Copyright 2026 TRex WebUI contributors
```

## Upstream interoperability

The project interoperates with operator-supplied Cisco TRex software and its
stateless Python APIs:

- Cisco TRex: <https://github.com/cisco-system-traffic-generator/trex-core>
- trex-stateless-gui:
  <https://github.com/cisco-system-traffic-generator/trex-stateless-gui>

Both upstream repositories publish their source under the Apache License 2.0.
They are separate works with their own copyright ownership and release
processes.

TRex WebUI's compatibility goals and operator workflows were informed by
trex-stateless-gui. Project documentation names upstream FXML views and
controller behavior where that history explains a compatibility decision.
The Web application and backend are implemented in React/TypeScript and
Python/FastAPI rather than shipping the upstream JavaFX application.

The TRex server, stateless Python client, Scapy service, and
trex-stateless-gui source or binaries are not intended to be included in a
TRex WebUI release archive. Operators install TRex separately and configure
the backend adapter to use that installation.

## Contribution provenance policy

Contributors must have the right to submit their work under Apache-2.0.

- Do not copy or translate upstream source merely because its repository is
  publicly readable.
- When adapting Apache-2.0 material, identify the source, retain applicable
  copyright and NOTICE text, mark modified files, and document the adaptation
  in the pull request and this file.
- When behavior is implemented from public specifications or interoperability
  testing, cite the source that established the contract.
- Do not submit proprietary code, confidential packet captures, generated
  reports, credentials, real lab identifiers, or material produced under terms
  that prohibit redistribution.
- Every new dependency, font, icon set, or other asset must have a compatible
  license and retained attribution.

No copied upstream source is intentionally accepted into a release without
this review. If an audit identifies such material, release preparation must
stop until its origin, license, notices, and modification history are recorded.

## Third-party dependencies

Direct application dependencies and their notices are listed in
`THIRD_PARTY_NOTICES.md`. Each release also carries
`SBOM.web.cdx.json` and `SBOM.python.cdx.json` as complete resolved Web and
Python dependency inventories and dependency graphs. Runtime components are
marked `required`; build/test components are marked `excluded`. Each SBOM root
records the source commit, and its deterministic identity is scoped to that
commit, dependency domain, and declared reproducible-build timestamp. The Web
graph includes installed, resolvable npm peer relationships as well as ordinary
and optional dependencies. Dependency licenses do not change the Apache-2.0
license for original TRex WebUI code. CI requires every direct runtime
dependency to have one notice-table row whose package name, resolved version,
and SPDX license match the lockfile and installed package metadata.

## Release traceability

A public release should be built from a reviewed Git commit and include:

- `LICENSE`, `NOTICE`, and `THIRD_PARTY_NOTICES.md`;
- the two generated CycloneDX SBOM files;
- the source commit identity and release manifest;
- dependency-audit results from CI; and
- the applicable hardware acceptance evidence or an explicit unsupported
  environment statement.

Release notes must distinguish software validation from physical lab limits.
Passing on one TRex/NIC/OS combination does not certify configurations outside
`docs/SUPPORT_MATRIX.md`.
