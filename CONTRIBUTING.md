# Contributing to TRex WebUI

Thank you for improving TRex WebUI. This is an independent, unofficial Cisco
TRex frontend built for real lab hardware. Contributions should preserve its
fail-closed control boundaries and dense single-operator workflow.

By submitting a contribution, you agree that it is licensed under the Apache
License 2.0 and confirm that you have the right to submit it. Do not contribute
code, screenshots, captures, or documentation copied from another project
unless its license permits redistribution and its attribution is preserved.
See `docs/PROVENANCE.md` and `THIRD_PARTY_NOTICES.md`.

## Before opening a pull request

1. Search existing issues and pull requests.
2. Use a GitHub issue for material behavior changes so the workflow and
   hardware impact can be agreed before implementation.
3. Read `docs/DEVELOPMENT.md`, `docs/SUPPORT_MATRIX.md`, and the deployment
   security boundary in `docs/NGINX_DEPLOYMENT.md`.
4. Never test disruptive operations on shared or production hardware without
   the operator's explicit authorization.

Security vulnerabilities must follow `SECURITY.md`, not the public issue
tracker. General help and scope boundaries are described in `SUPPORT.md`.

## Development setup

The baseline is Node.js 24, npm 11, Python 3.11, and a desktop Chromium browser.
Follow the setup commands in `README.md` and the detailed workflow in
`docs/DEVELOPMENT.md`.

Use typed fixtures only for isolated tests. Do not make a product workflow look
healthy by substituting mock data when TRex hardware or privileges are
unavailable.

## Make a focused change

- Keep TRex transport details behind backend adapters.
- Preserve confirmation, allowlist, runtime-ownership, and rollback boundaries
  around hardware or service mutations.
- Keep the UI suitable for a dense desktop operations console. Mobile support
  is outside the current support matrix.
- Add tests for changed contracts, failure states, and user-visible behavior.
- Update documentation and `CHANGELOG.md` when behavior, dependencies, support,
  or deployment requirements change.
- Do not commit `.env` files, credentials, PCAPs, generated reports, runtime
  state, private addresses, real MAC addresses, or other lab-specific data.
- `public-source-policy.json` is a narrow exception for deterministic packet
  and hardware fixtures. Every `bindings` entry maps one normalized source path
  to its exact values grouped by identifier kind; authorization never transfers
  to another path. Generated bundles have their own exact-value scope. Do not
  add a lab identifier to make the scanner pass.
- Avoid unrelated formatting or refactoring in the same pull request.

## Validate

Run the checks that apply to the change:

```bash
scripts/npmw test
scripts/tests/public_source_test.sh
.venv/bin/python -m pip_audit -r apps/api/requirements-dev.lock
scripts/npmw --prefix apps/web audit --audit-level=high
```

Major TRex WebUI changes require the repository's real-hardware gate:

```bash
scripts/npmw run verify:major -- --base-url http://127.0.0.1 \
  --config-file /path/to/validated/trex_cfg.yaml
```

External contributors are not expected to own the reference lab. If hardware
is unavailable, run all safe local checks, state the exact skipped gate and
environment blocker in the pull request, and do not replace it with mock
evidence. A maintainer must complete the real-hardware acceptance gate before a
major change is released.

## Pull request content

A reviewable pull request includes:

- the operator problem and resulting behavior;
- the affected API, UI, deployment, or hardware boundary;
- tests run and their results;
- the exact hardware blocker for any skipped integration gate;
- operational risk and rollback steps for disruptive changes;
- screenshots for visible UI changes, with lab identifiers removed; and
- source and license details for every new third-party asset or dependency.

Keep commits focused and write commit messages that explain the behavior
change. Maintainers may ask for a change to be split when independent risk
boundaries are combined.

## Review and conduct

Reviews prioritize correctness, hardware safety, security boundaries,
operator-visible failure states, and maintainability. Participation is governed
by `CODE_OF_CONDUCT.md`.
