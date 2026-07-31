# Support Matrix

TRex WebUI is currently a release candidate for a single operator controlling
real TRex hardware from a desktop browser. "Validated" means the combination
has passed the project's automated checks and, where stated, the real-hardware
gate. "Best effort" means maintainers will consider reproducible reports but do
not claim release certification.

## Validated baseline

| Layer | Validated baseline | Support status |
| --- | --- | --- |
| Host OS | AlmaLinux 9.8, x86_64 | Validated |
| Related OS family | RHEL-compatible 9.x, x86_64 | Best effort; not release-certified |
| Init and firewall | systemd with nftables 1.0.9 and `/etc/sysconfig/nftables.conf` | Required for managed-local deployment |
| Reverse proxy | Nginx 1.20.1 | Validated; equivalent RHEL-family package versions are best effort |
| Python | CPython 3.11 | Required and validated |
| Build toolchain | Node.js 24.16.0 and npm 11 | Required to build and test; not required to serve a prebuilt Web bundle |
| Browser | Playwright Chromium 1.60 test runtime; current desktop Chromium-family browser | Validated |
| TRex | v3.08 stateless/STL control plane | Validated |
| NIC topology | Six Intel i350 ports in three configured pairs | Configuration/control path validated; each deployment must supply a current inventory |
| Real traffic/capture | A selected configured pair that passes the gate's link and idle preconditions | Validated only when the release archive binds the source, active config, and observed hardware |
| Full-port inventory | Six configured ports | State, inventory, and cleanup paths validated; traffic certification for each pair requires its own current link evidence |
| Deployment model | Same-host managed daemon behind Nginx; external daemon with an operator-owned supervisor | Managed-local validated; external supervisor is operator responsibility |

Exact package and dependency versions for a release are recorded in its lock
files and `SBOM.web.cdx.json` / `SBOM.python.cdx.json`.

## Required operating boundary

- One trusted operator.
- Desktop browser on a trusted management network.
- Nginx deny-by-default allowlist in front of the loopback-only API.
- In managed-local mode, native TRex TCP ports 4500, 4501, and 4507 remain
  loopback-only through the installer-owned nftables boundary.
- No direct public-Internet or untrusted-LAN exposure.
- No application-level authentication, tenant isolation, or RBAC.

Anyone who can reach the WebUI may be able to mutate traffic-generator state.
TLS or reverse-proxy authentication can add transport and perimeter controls,
but does not turn the application into a multi-user authorization system.

## Unsupported or unverified

| Environment or feature | Status |
| --- | --- |
| Public Internet, untrusted LAN, or shared multi-user access | Unsupported |
| RBAC, SSO, tenant isolation, or per-user audit authority | Not implemented |
| Mobile or tablet layout | Unsupported |
| Windows or macOS production host | Unsupported |
| Debian/Ubuntu production installer path | Unverified |
| Containers, Kubernetes, or hosts without systemd | Unsupported for managed-local mode |
| Non-x86_64 production host | Unverified |
| TRex versions other than v3.08 | Unverified; adapter changes may be required |
| ASTF and stateful traffic workflows | Outside the current validated scope |
| NICs other than the reference Intel i350 | Best effort if supported by TRex/DPDK; not certified |
| More than six ports | Intended by data contracts but not release-certified |
| Safari, Firefox, and non-Chromium embedded browsers | Unverified |

TRex v3.08 cannot pause a finite-duration STL run in the validated environment.
The validated pause/resume workflow uses continuous traffic plus the
application's bounded hard-stop lease. This is a compatibility constraint, not
a hard-real-time stop guarantee.

## Support changes

A pull request that broadens this matrix must include reproducible environment
details and the appropriate automated and real-hardware evidence. Hardware
unavailability must be recorded as a blocker, not replaced with mock product
data. See `CONTRIBUTING.md` and `SUPPORT.md`.
