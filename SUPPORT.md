# Support

TRex WebUI is a community-maintained, pre-release project. Support is provided
on a best-effort basis and is not a warranty, service-level agreement, or
commercial support contract.

## Where to ask

- Use GitHub Issues for reproducible bugs and supported-environment
  regressions.
- Use a feature request issue for a concrete TRex operator workflow.
- Use GitHub Discussions for usage questions if Discussions are enabled for
  the repository.
- Report vulnerabilities only through the private process in `SECURITY.md`.

Search existing issues and documentation before opening a new report. The
issue templates request the minimum diagnostic context maintainers need.

## Supported scope

The current scope is TRex v3.08 stateless operation from a single-operator
desktop console deployed on a trusted management network. The validated host is
AlmaLinux 9.8 x86_64, with best-effort compatibility for closely related
RHEL-family 9.x systems.

The project does not support public-Internet exposure, untrusted-LAN exposure,
multi-user access, RBAC, mobile layouts, or hosted/SaaS operation. See
`docs/SUPPORT_MATRIX.md` for the complete matrix and `docs/NGINX_DEPLOYMENT.md`
for mandatory security boundaries.

## A useful support request

Include:

- release tag or commit SHA;
- host OS and architecture;
- TRex server version and deployment mode;
- Python, Node/npm, Nginx, systemd, and nftables versions when relevant;
- NIC model, configured port count, and link state when relevant;
- exact reproduction steps, expected result, and actual result;
- the smallest relevant sanitized log or browser console excerpt; and
- tests or verification commands already run.

Before attaching evidence, remove secrets, traffic payloads, report archives,
private addresses, MAC addresses, PCI identifiers, usernames, and other lab or
customer information. Do not upload PCAPs unless maintainers explicitly request
a synthetic capture that contains no sensitive data.

## What maintainers cannot provide

Maintainers cannot guarantee:

- response or resolution times;
- remote administration of an operator's host or TRex appliance;
- recovery of traffic, captures, or configuration after an unsafe external
  operation;
- compatibility with unlisted operating systems, TRex releases, NICs, or
  browsers; or
- private consulting through the public issue tracker.

Operational emergencies should be handled by the lab owner using established
host and network procedures, not by waiting for a project issue response.
