from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pytest


PROJECT_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = PROJECT_ROOT / "scripts" / "release_contract.py"


def load_script():
    spec = importlib.util.spec_from_file_location("trex_webui_release_contract_test", SCRIPT_PATH)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


contract = load_script()
VERSION = "0.1.0-rc.2"
SHA = "1" * 40
REPOSITORY = "lenxy-ea/trex-webui"
RELEASE_REF = f"refs/tags/v{VERSION}"
SIGNER_WORKFLOW = f"{REPOSITORY}/.github/workflows/release.yml"
SIGNER_WORKFLOW_REF = f"{SIGNER_WORKFLOW}@{RELEASE_REF}"


def github_provenance() -> dict[str, object]:
    return contract.build_release_provenance(
        version=VERSION,
        source_sha=SHA,
        source_dirty=False,
        repository=REPOSITORY,
        release_ref=RELEASE_REF,
        signer_workflow_ref=SIGNER_WORKFLOW_REF,
        signer_workflow_sha=SHA,
        require_publishable=True,
    )


def manifest(provenance: dict[str, object]) -> dict[str, object]:
    return {
        "schema": contract.RELEASE_MANIFEST_SCHEMA,
        "version": VERSION,
        "git_commit": SHA,
        "git_dirty": False,
        "release_repository": provenance.get("repository"),
        "release_ref": provenance.get("release_ref"),
        "signer_workflow": provenance.get("signer_workflow"),
        "release_provenance": provenance,
    }


def test_github_release_provenance_is_exact_and_deterministic() -> None:
    first = github_provenance()
    second = github_provenance()

    assert first == second
    assert contract.canonical_json_bytes(first) == contract.canonical_json_bytes(second)
    assert first == {
        "schema": "trex-webui-release-provenance/v1",
        "kind": "github-actions",
        "publishable": True,
        "repository": REPOSITORY,
        "release_ref": RELEASE_REF,
        "release_tag": f"v{VERSION}",
        "source_sha": SHA,
        "source_dirty": False,
        "signer_workflow": SIGNER_WORKFLOW,
        "signer_workflow_ref": SIGNER_WORKFLOW_REF,
        "signer_workflow_sha": SHA,
    }


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"release_ref": "refs/heads/main"}, "refs/tags"),
        ({"release_ref": "refs/tags/v0.1.0-rc.1"}, "package version"),
        (
            {"signer_workflow_ref": f"{REPOSITORY}/.github/workflows/ci.yml@{RELEASE_REF}"},
            "signer workflow ref",
        ),
        ({"signer_workflow_sha": "2" * 40}, "signer workflow SHA"),
        ({"source_dirty": True}, "clean source"),
        ({"repository": "lenxy-ea/trex-webui.git"}, "canonical"),
    ],
)
def test_github_release_provenance_fails_closed_on_drift(
    overrides: dict[str, object],
    message: str,
) -> None:
    values: dict[str, object] = {
        "version": VERSION,
        "source_sha": SHA,
        "source_dirty": False,
        "repository": REPOSITORY,
        "release_ref": RELEASE_REF,
        "signer_workflow_ref": SIGNER_WORKFLOW_REF,
        "signer_workflow_sha": SHA,
        "require_publishable": True,
    }
    values.update(overrides)
    with pytest.raises(contract.ReleaseContractError, match=message):
        contract.build_release_provenance(**values)


def test_partial_release_context_is_rejected_instead_of_becoming_local() -> None:
    with pytest.raises(contract.ReleaseContractError, match="partial"):
        contract.build_release_provenance(
            version=VERSION,
            source_sha=SHA,
            source_dirty=False,
            repository=REPOSITORY,
        )


def test_local_build_is_explicitly_not_publishable() -> None:
    provenance = contract.build_release_provenance(
        version=VERSION,
        source_sha=SHA,
        source_dirty=True,
    )

    assert provenance["kind"] == "local-build"
    assert provenance["publishable"] is False
    local_manifest = manifest(provenance)
    local_manifest["git_dirty"] = True
    with pytest.raises(contract.ReleaseContractError, match="not publishable"):
        contract.validate_manifest_release_contract(local_manifest, publishable=True)


def test_manifest_aliases_and_expected_policy_are_strict() -> None:
    payload = manifest(github_provenance())
    observed = contract.validate_manifest_release_contract(
        payload,
        publishable=True,
        expected_repository=REPOSITORY,
        expected_release_ref=RELEASE_REF,
        expected_signer_workflow=SIGNER_WORKFLOW,
        expected_source_sha=SHA,
    )
    assert observed == github_provenance()

    for key in ("release_repository", "release_ref", "signer_workflow"):
        changed = dict(payload)
        changed[key] = "wrong"
        with pytest.raises(contract.ReleaseContractError, match=key):
            contract.validate_manifest_release_contract(changed)


def test_attestation_policy_uses_all_exact_identity_constraints() -> None:
    assert contract.attestation_policy(github_provenance()) == {
        "repository": REPOSITORY,
        "signer_workflow": SIGNER_WORKFLOW,
        "source_ref": RELEASE_REF,
        "source_digest": SHA,
        "signer_digest": SHA,
    }


def test_strict_json_rejects_duplicate_keys_and_non_finite_values() -> None:
    with pytest.raises(contract.ReleaseContractError, match="duplicate JSON key"):
        contract.strict_json_loads(b'{"schema":"one","schema":"two"}')
    with pytest.raises(contract.ReleaseContractError, match="non-finite"):
        contract.strict_json_loads(b'{"value":NaN}')


def test_cli_publishable_validation_fails_for_local_manifest(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    provenance = contract.build_release_provenance(
        version=VERSION,
        source_sha=SHA,
        source_dirty=False,
    )
    path = tmp_path / "manifest.json"
    path.write_text(json.dumps(manifest(provenance)), encoding="utf-8")

    assert contract.main(["validate-manifest", str(path), "--publishable"]) == 1
    assert "not publishable" in capsys.readouterr().err
