from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path

import pytest


PROJECT_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = PROJECT_ROOT / "scripts" / "release_metadata.py"


def load_script():
    spec = importlib.util.spec_from_file_location(
        "trex_webui_release_metadata_test", SCRIPT_PATH
    )
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


metadata = load_script()
VERSION = "0.1.0-rc.2"
SHA = "1" * 40
REPOSITORY = "lenxy-ea/trex-webui"
RELEASE_REF = f"refs/tags/v{VERSION}"
SIGNER_WORKFLOW = f"{REPOSITORY}/.github/workflows/release.yml"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def descriptor(path: Path) -> dict[str, object]:
    return {"file": path.name, "sha256": digest(path), "size": path.stat().st_size}


def write_json(path: Path, payload: object) -> None:
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def fixture(tmp_path: Path) -> dict[str, Path]:
    paths = {
        "archive": tmp_path / f"trex-webui-{VERSION}.tar.gz",
        "checksum": tmp_path / f"trex-webui-{VERSION}.tar.gz.sha256",
        "release-evidence": tmp_path / f"trex-webui-{VERSION}.evidence.json",
        "sbom-web": tmp_path / "SBOM.web.cdx.json",
        "sbom-python": tmp_path / "SBOM.python.cdx.json",
        "standard-report": tmp_path / "standard-e2e-gate-fixture.json",
        "six-port-report": tmp_path / "six-port-e2e-fixture.json",
        "verified-upgrade": tmp_path / f"trex-webui-{VERSION}.verified-upgrade.sh",
        "archive-safety": tmp_path / f"trex-webui-{VERSION}.archive-safety.py",
        "release-contract": tmp_path / f"trex-webui-{VERSION}.release-contract.py",
        "release-metadata": tmp_path / f"trex-webui-{VERSION}.release-metadata.py",
    }
    for role, path in paths.items():
        if role in {"checksum", "release-evidence"}:
            continue
        path.write_bytes(f"{role} fixture\n".encode())
    paths["checksum"].write_text(
        f"{digest(paths['archive'])}  {paths['archive'].name}\n",
        encoding="ascii",
    )
    evidence = {
        "schema": "trex-webui-release-evidence/v1",
        "release": {
            "name": f"trex-webui-{VERSION}",
            "version": VERSION,
            "repository": REPOSITORY,
            "release_ref": RELEASE_REF,
            "release_tag": f"v{VERSION}",
            "source_sha": SHA,
            "source_digest": "2" * 64,
            "payload_digest": "3" * 64,
            "signer_workflow": SIGNER_WORKFLOW,
            "signer_workflow_ref": f"{SIGNER_WORKFLOW}@{RELEASE_REF}",
            "signer_workflow_sha": SHA,
        },
        "attestation_policy": {
            "repository": REPOSITORY,
            "signer_workflow": SIGNER_WORKFLOW,
            "source_ref": RELEASE_REF,
            "source_digest": SHA,
            "signer_digest": SHA,
        },
        "artifacts": {
            "release_archive": descriptor(paths["archive"]),
            "checksum_sidecar": descriptor(paths["checksum"]),
            "sboms": [
                descriptor(paths["sbom-web"]),
                descriptor(paths["sbom-python"]),
            ],
        },
        "acceptance": [
            {
                "workflow": "standard-e2e",
                "verdict": "pass",
                **descriptor(paths["standard-report"]),
            },
            {
                "workflow": "six-port-e2e",
                "verdict": "pass",
                **descriptor(paths["six-port-report"]),
            },
        ],
    }
    write_json(paths["release-evidence"], evidence)
    return paths


def build(paths: dict[str, Path]) -> dict[str, object]:
    return metadata.build_metadata(
        version=VERSION,
        repository=REPOSITORY,
        release_ref=RELEASE_REF,
        signer_workflow=SIGNER_WORKFLOW,
        source_sha=SHA,
        paths=paths,
    )


def test_metadata_is_deterministic_and_verifies_one_complete_artifact_directory(
    tmp_path: Path,
) -> None:
    paths = fixture(tmp_path)

    first = build(paths)
    repeated = build(paths)

    assert first == repeated
    assert {item["role"] for item in first["artifacts"]} == metadata.REQUIRED_ROLES
    assert {item["name"] for item in first["artifacts"]} == {
        path.name for path in paths.values()
    }
    assert metadata.validate_metadata(
        first,
        artifact_dir=tmp_path,
        expected_repository=REPOSITORY,
        expected_release_ref=RELEASE_REF,
        expected_signer_workflow=SIGNER_WORKFLOW,
        expected_source_sha=SHA,
    ) == first


def test_metadata_fails_closed_when_any_artifact_is_swapped(tmp_path: Path) -> None:
    paths = fixture(tmp_path)
    payload = build(paths)
    paths["standard-report"].write_text("tampered\n", encoding="utf-8")

    with pytest.raises(metadata.ReleaseMetadataError, match="artifact changed"):
        metadata.validate_metadata(payload, artifact_dir=tmp_path)


@pytest.mark.parametrize(
    ("field", "wrong", "message"),
    [
        ("expected_repository", "someone/else", "repository mismatch"),
        ("expected_release_ref", "refs/tags/v0.1.0-rc.1", "release ref mismatch"),
        (
            "expected_signer_workflow",
            "lenxy-ea/trex-webui/.github/workflows/ci.yml",
            "signer workflow mismatch",
        ),
        ("expected_source_sha", "9" * 40, "source SHA mismatch"),
    ],
)
def test_metadata_fails_closed_on_wrong_attestation_policy(
    tmp_path: Path,
    field: str,
    wrong: str,
    message: str,
) -> None:
    payload = build(fixture(tmp_path))
    arguments = {
        "expected_repository": REPOSITORY,
        "expected_release_ref": RELEASE_REF,
        "expected_signer_workflow": SIGNER_WORKFLOW,
        "expected_source_sha": SHA,
    }
    arguments[field] = wrong
    with pytest.raises(metadata.ReleaseMetadataError, match=message):
        metadata.validate_metadata(payload, artifact_dir=tmp_path, **arguments)


def test_evidence_report_must_be_in_the_metadata_artifact_directory(
    tmp_path: Path,
) -> None:
    paths = fixture(tmp_path)
    payload = build(paths)
    qualification = tmp_path / "qualification"
    qualification.mkdir()
    paths["six-port-report"].rename(qualification / paths["six-port-report"].name)

    with pytest.raises(metadata.ReleaseMetadataError, match="cannot inspect"):
        metadata.validate_metadata(payload, artifact_dir=tmp_path)


def test_publish_refuses_to_replace_existing_metadata(tmp_path: Path) -> None:
    payload = build(fixture(tmp_path))
    output = tmp_path / "release.json"
    metadata.publish_json(output, payload)
    with pytest.raises(metadata.ReleaseMetadataError, match="refusing to replace"):
        metadata.publish_json(output, payload)
