## Summary

Describe the operator-visible outcome and why the change is needed.

## Scope and boundaries

- Affected workflow:
- API/UI/deployment/hardware boundary:
- TRex versions and topology involved:
- Disruptive operations:

## Validation

List each command and result. For a major change, include the local and server
Standard E2E report paths. If real hardware is unavailable, state the exact
blocker; do not substitute mock evidence.

```text
scripts/npmw test
scripts/npmw run verify:major -- --base-url http://127.0.0.1
```

## Risk and rollback

Describe failure modes, persistent-state or hardware impact, and how an
operator can return to the previous safe state.

## Visual evidence

For UI changes, include sanitized desktop screenshots. Remove private
addresses, MAC/PCI identifiers, report names, packet content, and other lab
metadata.

## Provenance

List new dependencies, assets, copied/adapted material, and their licenses.
Explain any relationship to upstream TRex or trex-stateless-gui code.

## Checklist

- [ ] The change is focused and its user-visible failure states are tested.
- [ ] Hardware/service mutations retain confirmation, authority, and rollback boundaries.
- [ ] Documentation and `CHANGELOG.md` are updated when behavior or support changed.
- [ ] Dependency manifests, third-party notices, and SBOM generation are updated when needed.
- [ ] No credentials, private lab identifiers, PCAPs, runtime state, or generated reports are committed.
- [ ] I have the right to submit this contribution under Apache-2.0.
- [ ] I followed `SECURITY.md` for any vulnerability-related material.
