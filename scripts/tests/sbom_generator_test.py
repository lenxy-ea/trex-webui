from __future__ import annotations

import importlib.util
import json
from email.message import Message
from importlib import metadata
from pathlib import Path

import pytest
from packaging.requirements import Requirement


PROJECT_ROOT = Path(__file__).resolve().parents[2]
SBOM_SCRIPT_PATH = PROJECT_ROOT / "scripts" / "generate_sbom.py"
LICENSE_SCRIPT_PATH = PROJECT_ROOT / "scripts" / "check_dependency_licenses.py"


def load_script(module_name: str, path: Path):
    spec = importlib.util.spec_from_file_location(module_name, path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


generator = load_script("trex_webui_sbom_generator", SBOM_SCRIPT_PATH)
license_checker = load_script(
    "trex_webui_dependency_license_checker",
    LICENSE_SCRIPT_PATH,
)


def test_npm_purl_preserves_encoded_scope() -> None:
    assert (
        generator.npm_purl("@adobe/css-tools", "4.5.0")
        == "pkg:npm/%40adobe/css-tools@4.5.0"
    )
    assert generator.npm_purl("react", "19.2.7") == "pkg:npm/react@19.2.7"


def test_python_license_aliases_are_spdx_expressions() -> None:
    assert generator.PYTHON_LICENSE_ALIASES["MIT License"] == "MIT"
    assert generator.PYTHON_LICENSE_ALIASES["Apache 2.0"] == "Apache-2.0"
    assert generator.PYTHON_LICENSE_ALIASES["PSFL"] == "PSF-2.0"


def test_uv_dual_license_is_approved_and_emitted_as_spdx() -> None:
    expected = "MIT OR Apache-2.0"
    uv_distribution = metadata.distribution("uv")

    assert expected in license_checker.APPROVED_PYTHON_LICENSES
    assert license_checker.distribution_license(uv_distribution) == expected
    assert generator.distribution_license(uv_distribution) == (expected, True)


class FakeDistribution:
    def __init__(
        self,
        name: str,
        version: str,
        *,
        requires: list[str] | None = None,
    ) -> None:
        package_metadata = Message()
        package_metadata["Name"] = name
        package_metadata["License-Expression"] = "MIT"
        self.metadata = package_metadata
        self.version = version
        self.requires = requires or []


def dependency_entry(
    dependencies: list[dict[str, object]],
    reference: str,
) -> dict[str, object]:
    return next(item for item in dependencies if item["ref"] == reference)


def test_web_dependency_graph_uses_lockfile_resolution(tmp_path: Path) -> None:
    lock_path = tmp_path / "package-lock.json"
    lock_path.write_text(
        json.dumps(
            {
                "name": "fixture-web",
                "version": "1.0.0",
                "lockfileVersion": 3,
                "packages": {
                    "": {
                        "name": "fixture-web",
                        "version": "1.0.0",
                        "dependencies": {"alpha": "1.0.0", "shared": "1.0.0"},
                        "devDependencies": {"tool": "1.0.0"},
                    },
                    "node_modules/alpha": {
                        "version": "1.0.0",
                        "license": "MIT",
                        "dependencies": {
                            "nested": "1.0.0",
                            "shared": "1.0.0",
                        },
                        "peerDependencies": {
                            "peer-required": "^1.0.0",
                            "peer-optional": "^1.0.0",
                            "peer-missing-optional": "^1.0.0",
                        },
                        "peerDependenciesMeta": {
                            "peer-optional": {"optional": True},
                            "peer-missing-optional": {"optional": True},
                        },
                    },
                    "node_modules/alpha/node_modules/nested": {
                        "version": "1.0.0",
                        "license": "MIT",
                    },
                    "node_modules/peer-optional": {
                        "version": "1.0.0",
                        "license": "MIT",
                    },
                    "node_modules/peer-required": {
                        "version": "1.0.0",
                        "license": "MIT",
                    },
                    "node_modules/shared": {
                        "version": "1.0.0",
                        "license": "MIT",
                    },
                    "node_modules/tool": {
                        "version": "1.0.0",
                        "license": "MIT",
                        "dev": True,
                        "dependencies": {"shared": "1.0.0"},
                    },
                },
            }
        ),
        encoding="utf-8",
    )

    (
        application_name,
        application_version,
        application_ref,
        components,
        dependencies,
    ) = generator.web_inventory(lock_path)
    refs_by_path = {
        component["properties"][0]["value"]: component["bom-ref"]
        for component in components
    }

    assert application_name == "fixture-web"
    assert application_version == "1.0.0"
    assert dependency_entry(dependencies, application_ref)["dependsOn"] == sorted(
        [
            refs_by_path["node_modules/alpha"],
            refs_by_path["node_modules/shared"],
            refs_by_path["node_modules/tool"],
        ]
    )
    assert dependency_entry(
        dependencies,
        refs_by_path["node_modules/alpha"],
    )["dependsOn"] == sorted(
        [
            refs_by_path["node_modules/alpha/node_modules/nested"],
            refs_by_path["node_modules/peer-optional"],
            refs_by_path["node_modules/peer-required"],
            refs_by_path["node_modules/shared"],
        ]
    )
    assert dependency_entry(
        dependencies,
        refs_by_path["node_modules/tool"],
    )["dependsOn"] == [refs_by_path["node_modules/shared"]]
    assert {item["ref"] for item in dependencies} == {
        application_ref,
        *refs_by_path.values(),
    }


def test_web_dependency_graph_rejects_unresolved_lock_edges(
    tmp_path: Path,
) -> None:
    lock_path = tmp_path / "package-lock.json"
    lock_path.write_text(
        json.dumps(
            {
                "name": "fixture-web",
                "version": "1.0.0",
                "lockfileVersion": 3,
                "packages": {
                    "": {
                        "name": "fixture-web",
                        "version": "1.0.0",
                        "dependencies": {"missing": "1.0.0"},
                    }
                },
            }
        ),
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="no resolvable package entry"):
        generator.web_inventory(lock_path)


def test_web_dependency_graph_rejects_unresolved_required_peer(
    tmp_path: Path,
) -> None:
    lock_path = tmp_path / "package-lock.json"
    lock_path.write_text(
        json.dumps(
            {
                "name": "fixture-web",
                "version": "1.0.0",
                "lockfileVersion": 3,
                "packages": {
                    "": {
                        "name": "fixture-web",
                        "version": "1.0.0",
                        "dependencies": {"alpha": "1.0.0"},
                    },
                    "node_modules/alpha": {
                        "version": "1.0.0",
                        "license": "MIT",
                        "peerDependencies": {"missing-peer": "^1.0.0"},
                    },
                },
            }
        ),
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="no resolvable package entry"):
        generator.web_inventory(lock_path)


def test_python_dependency_graph_uses_active_requires_dist_only(
    tmp_path: Path,
) -> None:
    lock_path = tmp_path / "requirements.lock"
    lock_path.write_text(
        "\n".join(
            [
                "alpha==1.0.0 \\",
                "    --hash=sha256:" + "1" * 64,
                "beta==2.0.0 \\",
                "    --hash=sha256:" + "2" * 64,
                "feature-dep==3.0.0 \\",
                "    --hash=sha256:" + "3" * 64,
                "unused-extra==4.0.0 \\",
                "    --hash=sha256:" + "4" * 64,
                "",
            ]
        ),
        encoding="utf-8",
    )
    distributions = [
        FakeDistribution(
            "alpha",
            "1.0.0",
            requires=[
                "beta>=2",
                "feature-dep>=3; extra == 'feature'",
                "unused-extra>=4; extra == 'unused'",
            ],
        ),
        FakeDistribution("beta", "2.0.0"),
        FakeDistribution("feature-dep", "3.0.0"),
        FakeDistribution("unused-extra", "4.0.0"),
    ]
    application_ref = "application:python:fixture-api@1.0.0"

    components, dependencies = generator.python_inventory(
        lock_path,
        required_packages={
            "alpha",
            "beta",
            "feature-dep",
            "unused-extra",
        },
        direct_requirements=[Requirement("alpha[feature]==1.0.0")],
        application_ref=application_ref,
        distributions=distributions,
    )
    refs = {component["name"]: component["bom-ref"] for component in components}

    assert dependency_entry(dependencies, application_ref)["dependsOn"] == [
        refs["alpha"]
    ]
    assert dependency_entry(dependencies, refs["alpha"])["dependsOn"] == sorted(
        [refs["beta"], refs["feature-dep"]]
    )
    assert dependency_entry(
        dependencies,
        refs["unused-extra"],
    )["dependsOn"] == []
    assert {item["ref"] for item in dependencies} == {
        application_ref,
        *refs.values(),
    }


def test_python_dependency_graph_rejects_active_unlocked_edges(
    tmp_path: Path,
) -> None:
    lock_path = tmp_path / "requirements.lock"
    lock_path.write_text(
        "alpha==1.0.0 \\\n"
        "    --hash=sha256:" + "1" * 64 + "\n",
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="absent from the lock"):
        generator.python_inventory(
            lock_path,
            required_packages={"alpha"},
            direct_requirements=[Requirement("alpha==1.0.0")],
            application_ref="application:python:fixture-api@1.0.0",
            distributions=[
                FakeDistribution(
                    "alpha",
                    "1.0.0",
                    requires=["missing>=1"],
                )
            ],
        )


def test_bom_identity_is_commit_scoped_and_reproducible(tmp_path: Path) -> None:
    components = [
        {
            "type": "library",
            "bom-ref": "pkg:npm/alpha@1.0.0",
            "name": "alpha",
            "version": "1.0.0",
        }
    ]
    application_ref = "application:web:fixture@1.0.0"
    dependencies = [
        {"ref": application_ref, "dependsOn": ["pkg:npm/alpha@1.0.0"]},
        {"ref": "pkg:npm/alpha@1.0.0", "dependsOn": []},
    ]
    commit_one = "1" * 40
    commit_two = "2" * 40
    first = tmp_path / "first.json"
    repeated = tmp_path / "repeated.json"
    second_commit = tmp_path / "second-commit.json"
    second_timestamp = tmp_path / "second-timestamp.json"

    for output_path, source_commit, timestamp in (
        (first, commit_one, "2026-07-31T00:00:00Z"),
        (repeated, commit_one, "2026-07-31T00:00:00Z"),
        (second_commit, commit_two, "2026-07-31T00:00:00Z"),
        (second_timestamp, commit_one, "2026-07-31T00:00:01Z"),
    ):
        generator.write_bom(
            output_path,
            application_name="fixture",
            application_version="1.0.0",
            application_ref=application_ref,
            components=components,
            dependencies=dependencies,
            timestamp=timestamp,
            sbom_kind="web",
            source_commit=source_commit,
        )

    first_payload = json.loads(first.read_text(encoding="utf-8"))
    second_payload = json.loads(second_commit.read_text(encoding="utf-8"))
    second_timestamp_payload = json.loads(
        second_timestamp.read_text(encoding="utf-8")
    )
    metadata_properties = {
        item["name"]: item["value"]
        for item in first_payload["metadata"]["properties"]
    }

    assert first.read_bytes() == repeated.read_bytes()
    assert first_payload["serialNumber"] != second_payload["serialNumber"]
    assert (
        first_payload["serialNumber"]
        != second_timestamp_payload["serialNumber"]
    )
    assert first_payload["metadata"]["component"]["bom-ref"] == application_ref
    assert first_payload["dependencies"] == dependencies
    assert metadata_properties["trex-webui:vcs-commit"] == commit_one
    assert metadata_properties["trex-webui:sbom-kind"] == "web"


def test_project_sboms_are_complete_and_reproducible(tmp_path: Path) -> None:
    first = tmp_path / "first"
    repeated = tmp_path / "repeated"

    generator.generate_sboms(PROJECT_ROOT, first)
    generator.generate_sboms(PROJECT_ROOT, repeated)

    for filename, lock_path in (
        ("SBOM.web.cdx.json", PROJECT_ROOT / "apps/web/package-lock.json"),
        (
            "SBOM.python.cdx.json",
            PROJECT_ROOT / "apps/api/requirements-dev.lock",
        ),
    ):
        first_path = first / filename
        repeated_path = repeated / filename
        payload = json.loads(first_path.read_text(encoding="utf-8"))
        component_refs = {
            component["bom-ref"] for component in payload["components"]
        }
        dependency_refs = {
            dependency["ref"] for dependency in payload["dependencies"]
        }
        application_ref = payload["metadata"]["component"]["bom-ref"]

        assert first_path.read_bytes() == repeated_path.read_bytes()
        assert payload["$schema"] == (
            "http://cyclonedx.org/schema/bom-1.6.schema.json"
        )
        assert payload["bomFormat"] == "CycloneDX"
        assert payload["specVersion"] == "1.6"
        assert dependency_refs == {application_ref, *component_refs}
        if lock_path.suffix == ".json":
            locked = json.loads(lock_path.read_text(encoding="utf-8"))["packages"]
            assert len(payload["components"]) == len(locked) - 1
            refs_by_path = {
                component["properties"][0]["value"]: component["bom-ref"]
                for component in payload["components"]
            }
            graph = {
                dependency["ref"]: set(dependency["dependsOn"])
                for dependency in payload["dependencies"]
            }
            for package_path, package in locked.items():
                if not package_path:
                    continue
                for peer_name in package.get("peerDependencies", {}):
                    metadata_entry = package.get(
                        "peerDependenciesMeta",
                        {},
                    ).get(peer_name, {})
                    try:
                        peer_path = generator.resolve_npm_dependency(
                            locked,
                            package_path,
                            peer_name,
                        )
                    except ValueError:
                        assert metadata_entry.get("optional") is True
                        continue
                    assert (
                        refs_by_path[peer_path]
                        in graph[refs_by_path[package_path]]
                    )
        else:
            locked_count = sum(
                1
                for line in lock_path.read_text(encoding="utf-8").splitlines()
                if line and line[0].isalnum() and "==" in line
            )
            assert len(payload["components"]) == locked_count


def test_direct_runtime_notices_match_locks_and_installed_licenses(
    tmp_path: Path,
) -> None:
    notice_path = PROJECT_ROOT / "THIRD_PARTY_NOTICES.md"
    common_arguments = {
        "node_lock_path": PROJECT_ROOT / "apps/web/package-lock.json",
        "python_requirements_path": PROJECT_ROOT / "apps/api/requirements.txt",
        "python_lock_path": PROJECT_ROOT / "apps/api/requirements.lock",
    }

    assert (
        license_checker.direct_runtime_notice_findings(
            notice_path=notice_path,
            **common_arguments,
        )
        == []
    )

    missing_notice = tmp_path / "THIRD_PARTY_NOTICES.md"
    missing_notice.write_text(
        "\n".join(
            line
            for line in notice_path.read_text(encoding="utf-8").splitlines()
            if not line.startswith("| `react-dom` |")
        )
        + "\n",
        encoding="utf-8",
    )
    findings = license_checker.direct_runtime_notice_findings(
        notice_path=missing_notice,
        **common_arguments,
    )

    assert any("react-dom" in finding and "missing" in finding for finding in findings)
