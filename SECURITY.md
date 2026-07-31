# Security Policy

## Supported versions

TRex WebUI is currently a release candidate. Security fixes are made on the
default branch and, once releases are published, on the latest release line.
Older snapshots, forks, and unmaintained tags are not supported.

| Version | Security support |
| --- | --- |
| Default branch | Yes, pre-release |
| Latest published release line | Yes |
| Older releases and snapshots | No |

## Report a vulnerability privately

Do not open a public issue, discussion, or pull request for a suspected
vulnerability.

Use the repository's GitHub **Security** tab and select **Report a
vulnerability**. This opens a private vulnerability report visible only to the
reporter and repository maintainers. Include:

- the affected commit or release;
- the supported deployment mode and relevant environment details;
- clear reproduction steps or a minimal proof of concept;
- the expected security boundary and observed impact;
- any suggested mitigation; and
- whether the issue is already public or under active exploitation.

Remove credentials, private keys, packet payloads, customer data, real
management addresses, MAC addresses, and other lab identifiers from evidence.
If GitHub private vulnerability reporting is not available, use a private
contact method explicitly published by an active maintainer on their GitHub
profile. If none is available, do not publish the details; open a
content-free issue asking the repository owner to enable private vulnerability
reporting.

Maintainers aim to acknowledge a complete report within seven calendar days,
provide a status update within 30 days, and coordinate disclosure after a fix
or mitigation is available. These are response targets, not a service-level
agreement. The project does not currently operate a bug bounty.

## Security boundary

The supported deployment is a single-operator console on a trusted management
network. The application has no built-in login, multi-user isolation, or RBAC.
It is not supported on the public Internet or an untrusted LAN. Anyone who can
reach the WebUI may be able to issue traffic-generator control operations.

The absence of application-level RBAC is a documented product limitation, not
by itself a vulnerability. Bypassing the documented Nginx allowlist, escaping
backend file or command boundaries, accessing native TRex control ports from a
non-loopback interface in managed-local mode, or crossing persisted runtime
ownership boundaries are in scope for private security reports.

See `docs/SUPPORT_MATRIX.md` and `docs/NGINX_DEPLOYMENT.md` before assessing a
deployment.

## Disclosure and remediation

Maintainers will validate the report, identify affected versions, prepare tests
and a fix, and agree on a disclosure date with the reporter when practical.
Credit is offered unless the reporter asks to remain anonymous. Maintainers may
publish an advisory without attribution when a report is incomplete,
duplicative, abusive, or already public.
