from __future__ import annotations

import hashlib
import importlib.util
import io
import json
import os
import re
import subprocess
import tarfile
from pathlib import Path

import pytest
import yaml


PROJECT_ROOT = Path(__file__).resolve().parents[2]
RELEASE_WORKFLOW = PROJECT_ROOT / ".github" / "workflows" / "release.yml"
CI_WORKFLOW = PROJECT_ROOT / ".github" / "workflows" / "ci.yml"
GITHUB_RELEASE_GATE = PROJECT_ROOT / "scripts" / "github_release_gate.py"
VERIFIED_UPGRADE = PROJECT_ROOT / "deploy" / "verified_upgrade.sh"
RELEASE_METADATA = PROJECT_ROOT / "scripts" / "release_metadata.py"
VERSION = "0.1.0-rc.2"
SOURCE_SHA = "1" * 40
REPOSITORY = "lenxy-ea/trex-webui"
RELEASE_REF = f"refs/tags/v{VERSION}"
SIGNER_WORKFLOW = f"{REPOSITORY}/.github/workflows/release.yml"


def workflow(path: Path) -> dict[str, object]:
    parsed = yaml.load(path.read_text(encoding="utf-8"), Loader=yaml.BaseLoader)
    assert isinstance(parsed, dict)
    return parsed


def load_release_metadata():
    spec = importlib.util.spec_from_file_location(
        "trex_webui_release_metadata_swap_test", RELEASE_METADATA
    )
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


release_metadata = load_release_metadata()


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def evidence_descriptor(path: Path) -> dict[str, object]:
    return {"file": path.name, "sha256": sha256(path), "size": path.stat().st_size}


def test_release_workflow_is_manual_exact_tag_and_reuses_complete_ci() -> None:
    release = workflow(RELEASE_WORKFLOW)
    triggers = release["on"]
    assert isinstance(triggers, dict)
    assert set(triggers) == {"workflow_dispatch"}
    inputs = triggers["workflow_dispatch"]["inputs"]
    assert set(inputs) == {"standard_report_asset", "six_port_report_asset"}
    assert all(value["required"] == "true" for value in inputs.values())
    assert release["permissions"] == {}
    assert release["concurrency"]["cancel-in-progress"] == "false"

    jobs = release["jobs"]
    assert jobs["quality-gates"]["uses"] == "./.github/workflows/ci.yml"
    assert jobs["quality-gates"]["permissions"] == {"contents": "read"}
    assert jobs["release"]["needs"] == "quality-gates"
    assert jobs["release"]["permissions"] == {
        "attestations": "write",
        "contents": "write",
        "id-token": "write",
    }

    ci = workflow(CI_WORKFLOW)
    assert "workflow_call" in ci["on"]
    assert "scripts/tests/github_release_gate_test.py" in CI_WORKFLOW.read_text(
        encoding="utf-8"
    )


def test_every_external_action_is_pinned_to_a_full_commit_sha() -> None:
    release = workflow(RELEASE_WORKFLOW)
    uses = []
    for job in release["jobs"].values():
        if isinstance(job, dict) and isinstance(job.get("uses"), str):
            uses.append(job["uses"])
        if isinstance(job, dict):
            for step in job.get("steps", []):
                if isinstance(step, dict) and isinstance(step.get("uses"), str):
                    uses.append(step["uses"])
    external = [value for value in uses if not value.startswith("./")]
    assert external
    assert all(re.fullmatch(r"[^@\s]+@[0-9a-f]{40}", value) for value in external)


def test_release_commands_use_the_fixed_id_gate_and_publish_only_after_verification() -> None:
    content = RELEASE_WORKFLOW.read_text(encoding="utf-8")
    gate = GITHUB_RELEASE_GATE.read_text(encoding="utf-8")
    assert GITHUB_RELEASE_GATE.stat().st_mode & 0o777 == 0o755
    assert 'expected_tag="v${version}"' in content
    assert '[[ "$GITHUB_REF" == "$expected_ref" ]]' in content
    assert 'git rev-parse --verify "${GITHUB_REF}^{commit}"' in content
    assert "--github-release-context" in content
    assert "scripts/release_evidence.py create" in content
    assert "scripts/release_metadata.py verify" in content
    assert "actions/attest-build-provenance@977bb373ede98d70efdf65b84cb5f73e068dcc2a" in content
    assert "steps.artifacts.outputs.standard_report" in content
    assert "steps.artifacts.outputs.six_port_report" in content
    for command in ("prepare", "upload", "verify", "publish"):
        assert f"scripts/github_release_gate.py {command}" in content
    assert "steps.release_gate.outputs.published != 'true'" in content
    assert "RELEASE_ADMIN_TOKEN: ${{ secrets.RELEASE_ADMIN_TOKEN }}" in content
    release = workflow(RELEASE_WORKFLOW)
    release_job = release["jobs"]["release"]
    assert release_job["environment"] == "release"
    assert release_job["env"]["GH_TOKEN"] == "${{ github.token }}"
    assert "RELEASE_ADMIN_TOKEN" not in release_job["env"]
    admin_steps = {
        step["name"]
        for step in release_job["steps"]
        if isinstance(step, dict)
        and isinstance(step.get("env"), dict)
        and "RELEASE_ADMIN_TOKEN" in step["env"]
    }
    assert admin_steps == {
        "Persist exact release ID and download operator evidence",
        "Upload only missing exact-ID assets",
        "Publish or final-validate the immutable prerelease",
    }
    for prohibited in (
        "gh release upload",
        "gh release edit",
        "gh release create",
        "--clobber",
    ):
        assert prohibited not in content
        assert prohibited not in gate
    assert 'API_VERSION = "2026-03-10"' in gate
    assert '"PATCH"' in gate
    assert '{"draft": False, "prerelease": True}' in gate
    assert "verify_immutable_release" in gate


def test_verified_upgrade_attests_snapshots_before_archive_use() -> None:
    subprocess.run(["bash", "-n", str(VERIFIED_UPGRADE)], check=True)
    content = VERIFIED_UPGRADE.read_text(encoding="utf-8")
    assert 'readonly RELEASE_REPOSITORY="lenxy-ea/trex-webui"' in content
    assert (
        'readonly RELEASE_SIGNER_WORKFLOW="lenxy-ea/trex-webui/.github/workflows/release.yml"'
        in content
    )
    for flag in (
        "--repo",
        "--signer-workflow",
        "--source-ref",
        "--source-digest",
        "--signer-digest",
        "--deny-self-hosted-runners",
    ):
        assert flag in content
    assert "X-GitHub-Api-Version: 2026-03-10" in content
    assert '[[ "$EUID" -eq 0 ]]' in content
    assert "snapshot_initial_inputs" in content
    assert "snapshot_and_verify_release_assets" in content
    assert '--artifact-dir "$SNAPSHOT_DIR"' in content
    assert 'archive_path="$SNAPSHOT_DIR/${ARTIFACT_NAMES[archive]}"' in content

    main = content[content.index("main() {") :]
    assert main.index("verify_attestation") < main.index("read_attested_inventory")
    assert main.index("snapshot_and_verify_release_assets") < main.index(
        "validate_metadata_and_archive"
    )
    assert main.index("validate_metadata_and_archive") < main.index("run_v3_upgrader")

    validate = content[
        content.index("validate_metadata_and_archive() {") : content.index(
            "run_v3_upgrader() {"
        )
    ]
    assert validate.index("archive_safety.py") < validate.index("tar --extract")
    run = content[content.index("run_v3_upgrader() {") : content.index("main() {")]
    assert 'upgrader="$PAYLOAD_ROOT/deploy/upgrade.sh"' in run
    assert '--archive "$archive_path"' in run
    assert "/opt/trex-webui/deploy/upgrade.sh" not in run


@pytest.mark.parametrize("move_tag", [False, True])
def test_verified_upgrade_uses_snapshot_and_rechecks_tag_before_execution(
    tmp_path: Path,
    move_tag: bool,
) -> None:
    release_root = f"trex-webui-{VERSION}"
    archive = tmp_path / f"{release_root}.tar.gz"
    upgrade_log = tmp_path / "upgrade.log"
    upgrade_content = (
        "#!/usr/bin/env bash\n"
        "set -Eeuo pipefail\n"
        "printf '%s\\n' \"$@\" >\"$UPGRADE_LOG\"\n"
    ).encode()
    with tarfile.open(archive, mode="w:gz") as output:
        member = tarfile.TarInfo(f"{release_root}/deploy/upgrade.sh")
        member.mode = 0o755
        member.size = len(upgrade_content)
        output.addfile(member, io.BytesIO(upgrade_content))

    paths = {
        "archive": archive,
        "checksum": Path(f"{archive}.sha256"),
        "release-evidence": tmp_path / f"{release_root}.evidence.json",
        "sbom-web": tmp_path / "SBOM.web.cdx.json",
        "sbom-python": tmp_path / "SBOM.python.cdx.json",
        "standard-report": tmp_path / "standard-e2e-fixture.json",
        "six-port-report": tmp_path / "six-port-e2e-fixture.json",
        "verified-upgrade": tmp_path / f"{release_root}.verified-upgrade.sh",
        "archive-safety": tmp_path / f"{release_root}.archive-safety.py",
        "release-contract": tmp_path / f"{release_root}.release-contract.py",
        "release-metadata": tmp_path / f"{release_root}.release-metadata.py",
    }
    paths["checksum"].write_text(
        f"{sha256(archive)}  {archive.name}\n", encoding="ascii"
    )
    for role in ("sbom-web", "sbom-python", "standard-report", "six-port-report"):
        paths[role].write_text(f"{role}\n", encoding="utf-8")
    paths["verified-upgrade"].write_bytes(VERIFIED_UPGRADE.read_bytes())
    paths["verified-upgrade"].chmod(0o755)
    paths["release-metadata"].write_bytes(RELEASE_METADATA.read_bytes())
    paths["release-metadata"].chmod(0o755)
    paths["archive-safety"].write_text(
        "#!/usr/bin/env python3\n"
        "import sys\n"
        f"print({'a' * 64!r} if len(sys.argv) > 1 and sys.argv[1] == 'verify-tree' else {release_root!r})\n",
        encoding="utf-8",
    )
    paths["release-contract"].write_text(
        "#!/usr/bin/env python3\nraise SystemExit(0)\n", encoding="utf-8"
    )

    evidence = {
        "schema": "trex-webui-release-evidence/v1",
        "release": {
            "name": release_root,
            "version": VERSION,
            "repository": REPOSITORY,
            "release_ref": RELEASE_REF,
            "release_tag": f"v{VERSION}",
            "source_sha": SOURCE_SHA,
            "source_digest": "2" * 64,
            "payload_digest": "3" * 64,
            "signer_workflow": SIGNER_WORKFLOW,
            "signer_workflow_ref": f"{SIGNER_WORKFLOW}@{RELEASE_REF}",
            "signer_workflow_sha": SOURCE_SHA,
        },
        "attestation_policy": {
            "repository": REPOSITORY,
            "signer_workflow": SIGNER_WORKFLOW,
            "source_ref": RELEASE_REF,
            "source_digest": SOURCE_SHA,
            "signer_digest": SOURCE_SHA,
        },
        "artifacts": {
            "release_archive": evidence_descriptor(paths["archive"]),
            "checksum_sidecar": evidence_descriptor(paths["checksum"]),
            "sboms": [
                evidence_descriptor(paths["sbom-web"]),
                evidence_descriptor(paths["sbom-python"]),
            ],
        },
        "acceptance": [
            {
                "workflow": "standard-e2e",
                "verdict": "pass",
                **evidence_descriptor(paths["standard-report"]),
            },
            {
                "workflow": "six-port-e2e",
                "verdict": "pass",
                **evidence_descriptor(paths["six-port-report"]),
            },
        ],
    }
    paths["release-evidence"].write_text(
        json.dumps(evidence, sort_keys=True) + "\n", encoding="utf-8"
    )
    metadata_document = release_metadata.build_metadata(
        version=VERSION,
        repository=REPOSITORY,
        release_ref=RELEASE_REF,
        signer_workflow=SIGNER_WORKFLOW,
        source_sha=SOURCE_SHA,
        paths=paths,
    )
    metadata_path = tmp_path / f"{release_root}.release.json"
    metadata_path.write_text(
        json.dumps(metadata_document, sort_keys=True) + "\n", encoding="utf-8"
    )

    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    gh_log = tmp_path / "gh.log"
    api_count = tmp_path / "api-count"
    mutation_marker = tmp_path / "mutated"
    fake_gh = fake_bin / "gh"
    fake_gh.write_text(
        "#!/usr/bin/env bash\n"
        "set -Eeuo pipefail\n"
        "if [[ \"${1:-}\" == api ]]; then\n"
        "  count=0\n"
        "  [[ ! -e \"$API_COUNT\" ]] || count=\"$(<\"$API_COUNT\")\"\n"
        "  count=$((count + 1))\n"
        "  printf '%s\\n' \"$count\" >\"$API_COUNT\"\n"
        "  if [[ \"$MOVE_TAG\" == 1 && \"$count\" -ge 2 ]]; then\n"
        "    printf '%s\\n' \"$MOVED_SHA\"\n"
        "  else\n"
        "    printf '%s\\n' \"$SOURCE_SHA\"\n"
        "  fi\n"
        "  exit 0\n"
        "fi\n"
        "[[ \"${1:-}\" == attestation && \"${2:-}\" == verify ]] || exit 91\n"
        "artifact=${3:-}\n"
        "printf '%s\\n' \"$artifact\" >>\"$GH_LOG\"\n"
        "if [[ \"$(basename -- \"$artifact\")\" == \"$ARCHIVE_NAME\" && "
        "\"$artifact\" != \"$ORIGINAL_ARCHIVE\" && ! -e \"$MUTATION_MARKER\" ]]; then\n"
        "  printf 'swapped after snapshot\\n' >\"$ORIGINAL_ARCHIVE\"\n"
        "  : >\"$MUTATION_MARKER\"\n"
        "fi\n",
        encoding="utf-8",
    )
    fake_gh.chmod(0o755)

    environment = os.environ.copy()
    environment.update(
        {
            "PATH": f"{fake_bin}:{environment['PATH']}",
            "SOURCE_SHA": SOURCE_SHA,
            "GH_LOG": str(gh_log),
            "API_COUNT": str(api_count),
            "MOVE_TAG": "1" if move_tag else "0",
            "MOVED_SHA": "9" * 40,
            "ARCHIVE_NAME": archive.name,
            "ORIGINAL_ARCHIVE": str(archive),
            "MUTATION_MARKER": str(mutation_marker),
            "UPGRADE_LOG": str(upgrade_log),
        }
    )
    completed = subprocess.run(
        [
            str(paths["verified-upgrade"]),
            "--tag",
            f"v{VERSION}",
            "--metadata",
            str(metadata_path),
            "--",
            "--dry-run",
        ],
        cwd=tmp_path,
        env=environment,
        text=True,
        capture_output=True,
        check=False,
    )

    if move_tag:
        assert completed.returncode != 0
        assert "release tag moved after initial verification" in completed.stderr
        assert not upgrade_log.exists()
    else:
        assert completed.returncode == 0, completed.stderr
    assert archive.read_text(encoding="utf-8") == "swapped after snapshot\n"
    if not move_tag:
        arguments = upgrade_log.read_text(encoding="utf-8").splitlines()
        assert arguments[0] == "--archive"
        assert arguments[1] != str(archive)
        assert "/artifacts/" in arguments[1]
        assert arguments[-1] == "--dry-run"
    assert len(gh_log.read_text(encoding="utf-8").splitlines()) == 13
    assert api_count.read_text(encoding="utf-8").strip() == "2"
