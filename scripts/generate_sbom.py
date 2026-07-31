#!/usr/bin/env python3
"""Generate deterministic CycloneDX inventories from the project lock files."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import subprocess
import uuid
from collections import defaultdict
from collections.abc import Iterable
from datetime import datetime, timezone
from importlib import metadata
from pathlib import Path
from urllib.parse import quote

from packaging.requirements import InvalidRequirement, Requirement
from packaging.version import InvalidVersion, Version


PYTHON_LICENSE_ALIASES = {
    "Apache 2.0": "Apache-2.0",
    "License :: OSI Approved :: Apache Software License": "Apache-2.0",
    "License :: OSI Approved :: BSD License": "BSD-3-Clause",
    "License :: OSI Approved :: MIT License": "MIT",
    "MIT License": "MIT",
    "PSFL": "PSF-2.0",
}


def canonical_name(value: str) -> str:
    return re.sub(r"[-_.]+", "-", value).casefold()


def source_epoch(project_root: Path) -> int:
    configured = os.environ.get("SOURCE_DATE_EPOCH")
    if configured:
        return int(configured)
    result = subprocess.run(
        ["git", "-C", str(project_root), "show", "-s", "--format=%ct", "HEAD"],
        check=True,
        capture_output=True,
        text=True,
    )
    return int(result.stdout.strip())


def iso_timestamp(epoch: int) -> str:
    return (
        datetime.fromtimestamp(epoch, tz=timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def source_commit(project_root: Path) -> str:
    result = subprocess.run(
        ["git", "-C", str(project_root), "rev-parse", "--verify", "HEAD^{commit}"],
        check=True,
        capture_output=True,
        text=True,
    )
    commit = result.stdout.strip().casefold()
    if not re.fullmatch(r"[0-9a-f]{40,64}", commit):
        raise ValueError(f"invalid Git commit identity: {commit!r}")
    return commit


def application_bom_ref(kind: str, name: str, version: str) -> str:
    return (
        f"application:{quote(kind, safe='')}:"
        f"{quote(name, safe='')}@{quote(version, safe='')}"
    )


def npm_name(package_path: str, package: dict[str, object]) -> str:
    declared = package.get("name")
    if isinstance(declared, str) and declared:
        return declared
    marker = "node_modules/"
    if marker not in package_path:
        raise ValueError(f"unable to derive npm package name from {package_path}")
    return package_path.rsplit(marker, 1)[1]


def npm_purl(name: str, version: str) -> str:
    if name.startswith("@") and "/" in name:
        namespace, package_name = name.split("/", 1)
        return (
            f"pkg:npm/{quote(namespace, safe='')}/"
            f"{quote(package_name, safe='')}@{quote(version, safe='')}"
        )
    return f"pkg:npm/{quote(name, safe='')}@{quote(version, safe='')}"


def integrity_hash(integrity: object) -> list[dict[str, str]]:
    if not isinstance(integrity, str) or "-" not in integrity:
        return []
    algorithm, encoded = integrity.split("-", 1)
    algorithm_name = {
        "sha256": "SHA-256",
        "sha384": "SHA-384",
        "sha512": "SHA-512",
    }.get(algorithm.casefold())
    if not algorithm_name:
        return []
    try:
        digest = base64.b64decode(encoded, validate=True).hex()
    except ValueError:
        return []
    return [{"alg": algorithm_name, "content": digest}]


def npm_dependency_candidates(package_path: str, dependency_name: str) -> Iterable[str]:
    current = package_path
    while True:
        yield (
            f"{current}/node_modules/{dependency_name}"
            if current
            else f"node_modules/{dependency_name}"
        )
        if "/node_modules/" in current:
            current = current.rsplit("/node_modules/", 1)[0]
        elif current.startswith("node_modules/"):
            current = ""
        else:
            return


def resolve_npm_dependency(
    packages: dict[str, dict[str, object]],
    package_path: str,
    dependency_name: str,
) -> str:
    for candidate in npm_dependency_candidates(package_path, dependency_name):
        if candidate in packages:
            return candidate
    owner = package_path or "<application>"
    raise ValueError(
        f"{owner} declares {dependency_name!r}, but package-lock.json "
        "contains no resolvable package entry"
    )


def declared_npm_dependencies(
    package: dict[str, object],
    *,
    include_development: bool,
) -> set[str]:
    fields = ["dependencies", "optionalDependencies"]
    if include_development:
        fields.append("devDependencies")
    names: set[str] = set()
    for field in fields:
        declared = package.get(field, {})
        if not isinstance(declared, dict):
            raise ValueError(f"npm package field {field!r} must be an object")
        for name in declared:
            if not isinstance(name, str) or not name:
                raise ValueError(f"npm package field {field!r} has an invalid name")
            names.add(name)
    return names


def resolved_npm_dependencies(
    packages: dict[str, dict[str, object]],
    package_path: str,
    package: dict[str, object],
    *,
    include_development: bool,
) -> set[str]:
    resolved = {
        resolve_npm_dependency(packages, package_path, dependency_name)
        for dependency_name in declared_npm_dependencies(
            package,
            include_development=include_development,
        )
    }
    peer_dependencies = package.get("peerDependencies", {})
    peer_metadata = package.get("peerDependenciesMeta", {})
    if not isinstance(peer_dependencies, dict):
        raise ValueError("npm package field 'peerDependencies' must be an object")
    if not isinstance(peer_metadata, dict):
        raise ValueError("npm package field 'peerDependenciesMeta' must be an object")
    for dependency_name in peer_dependencies:
        if not isinstance(dependency_name, str) or not dependency_name:
            raise ValueError(
                "npm package field 'peerDependencies' has an invalid name"
            )
        metadata_entry = peer_metadata.get(dependency_name, {})
        if not isinstance(metadata_entry, dict):
            raise ValueError(
                "npm package field 'peerDependenciesMeta' has an invalid entry "
                f"for {dependency_name!r}"
            )
        try:
            resolved.add(
                resolve_npm_dependency(
                    packages,
                    package_path,
                    dependency_name,
                )
            )
        except ValueError:
            if metadata_entry.get("optional") is True:
                continue
            raise
    return resolved


def web_inventory(
    lock_path: Path,
) -> tuple[
    str,
    str,
    str,
    list[dict[str, object]],
    list[dict[str, object]],
]:
    payload = json.loads(lock_path.read_text(encoding="utf-8"))
    if payload.get("lockfileVersion") != 3:
        raise ValueError("web SBOM generation requires package-lock v3")
    raw_packages = payload.get("packages")
    if not isinstance(raw_packages, dict) or "" not in raw_packages:
        raise ValueError("web lockfile is missing the root package entry")
    packages: dict[str, dict[str, object]] = {}
    for package_path, package in raw_packages.items():
        if not isinstance(package_path, str) or not isinstance(package, dict):
            raise ValueError("web lockfile contains an invalid package entry")
        packages[package_path] = package

    root = packages[""]
    root_name = root.get("name") or payload.get("name") or "trex-webui-web"
    root_version = root.get("version") or payload.get("version")
    if not isinstance(root_name, str) or not isinstance(root_version, str):
        raise ValueError("web lockfile is missing root name/version")
    root_ref = application_bom_ref("web", root_name, root_version)

    components: list[dict[str, object]] = []
    refs_by_path: dict[str, str] = {}
    for package_path, package in sorted(packages.items()):
        if not package_path:
            continue
        version = package.get("version")
        license_name = package.get("license")
        if not isinstance(version, str):
            raise ValueError(f"{package_path} is missing a version")
        if not isinstance(license_name, str):
            raise ValueError(f"{package_path} is missing a license")
        name = npm_name(package_path, package)
        component_ref = f"npm:{package_path}@{version}"
        refs_by_path[package_path] = component_ref
        component: dict[str, object] = {
            "type": "library",
            "bom-ref": component_ref,
            "name": name,
            "version": version,
            "scope": (
                "excluded"
                if package.get("dev") is True
                else "optional"
                if package.get("optional") is True
                else "required"
            ),
            "licenses": [{"expression": license_name}],
            "purl": npm_purl(name, version),
            "properties": [
                {"name": "trex-webui:npm-package-path", "value": package_path},
            ],
        }
        hashes = integrity_hash(package.get("integrity"))
        if hashes:
            component["hashes"] = hashes
        resolved = package.get("resolved")
        if isinstance(resolved, str) and resolved.startswith(("https://", "http://")):
            component["externalReferences"] = [
                {"type": "distribution", "url": resolved}
            ]
        components.append(component)

    dependencies: list[dict[str, object]] = []
    root_dependencies = {
        refs_by_path[package_path]
        for package_path in resolved_npm_dependencies(
            packages,
            "",
            root,
            include_development=True,
        )
    }
    dependencies.append(
        {"ref": root_ref, "dependsOn": sorted(root_dependencies)}
    )
    for package_path, package in sorted(packages.items()):
        if not package_path:
            continue
        resolved_dependencies = {
            refs_by_path[resolved_path]
            for resolved_path in resolved_npm_dependencies(
                packages,
                package_path,
                package,
                include_development=False,
            )
        }
        dependencies.append(
            {
                "ref": refs_by_path[package_path],
                "dependsOn": sorted(resolved_dependencies),
            }
        )
    return root_name, root_version, root_ref, components, dependencies


def locked_python_packages(lock_path: Path) -> dict[str, dict[str, object]]:
    packages: dict[str, dict[str, object]] = {}
    current: dict[str, object] | None = None
    requirement_pattern = re.compile(r"^([A-Za-z0-9_.-]+)==([^\s\\]+)")
    hash_pattern = re.compile(r"^\s+--hash=sha256:([0-9a-f]{64})")
    for line in lock_path.read_text(encoding="utf-8").splitlines():
        requirement_match = requirement_pattern.match(line)
        if requirement_match:
            name, version = requirement_match.groups()
            current = {"name": name, "version": version, "hashes": []}
            packages[canonical_name(name)] = current
            continue
        hash_match = hash_pattern.match(line)
        if hash_match and current is not None:
            current["hashes"].append(hash_match.group(1))
    return packages


def read_requirement_file(
    requirement_path: Path,
    *,
    visited: set[Path] | None = None,
) -> list[Requirement]:
    resolved_path = requirement_path.resolve()
    seen = visited if visited is not None else set()
    if resolved_path in seen:
        return []
    seen.add(resolved_path)

    requirements: list[Requirement] = []
    for line_number, raw_line in enumerate(
        resolved_path.read_text(encoding="utf-8").splitlines(),
        start=1,
    ):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("-r ") or line.startswith("--requirement "):
            included_name = line.split(maxsplit=1)[1].strip()
            if not included_name:
                raise ValueError(
                    f"{resolved_path}:{line_number}: empty requirement include"
                )
            requirements.extend(
                read_requirement_file(
                    resolved_path.parent / included_name,
                    visited=seen,
                )
            )
            continue
        if line.startswith("-"):
            raise ValueError(
                f"{resolved_path}:{line_number}: unsupported requirement option"
            )
        try:
            requirements.append(Requirement(line))
        except InvalidRequirement as exc:
            raise ValueError(
                f"{resolved_path}:{line_number}: invalid requirement: {line!r}"
            ) from exc
    return requirements


def distribution_license(
    distribution: metadata.Distribution,
) -> tuple[str, bool] | None:
    expression = distribution.metadata.get("License-Expression")
    if expression:
        return expression.strip(), True
    license_name = distribution.metadata.get("License")
    if license_name:
        value = license_name.strip()
        normalized = PYTHON_LICENSE_ALIASES.get(value)
        return (normalized, True) if normalized else (value, False)
    classifiers = [
        value
        for value in distribution.metadata.get_all("Classifier", [])
        if value.startswith("License :: OSI Approved ::")
    ]
    classifier_map = {
        "License :: OSI Approved :: Apache Software License": "Apache-2.0",
        "License :: OSI Approved :: BSD License": "BSD-3-Clause",
        "License :: OSI Approved :: MIT License": "MIT",
    }
    mapped = {classifier_map.get(value) for value in classifiers}
    mapped.discard(None)
    if len(mapped) == 1:
        return mapped.pop(), True
    return None


def selected_python_distributions(
    locked: dict[str, dict[str, object]],
    distributions: Iterable[metadata.Distribution] | None,
) -> dict[str, metadata.Distribution]:
    installed: dict[str, list[metadata.Distribution]] = {}
    source = metadata.distributions() if distributions is None else distributions
    for distribution in source:
        name = distribution.metadata.get("Name")
        if name:
            installed.setdefault(canonical_name(name), []).append(distribution)

    selected: dict[str, metadata.Distribution] = {}
    for key, package in sorted(locked.items()):
        name = str(package["name"])
        version = str(package["version"])
        distribution = next(
            (
                item
                for item in installed.get(key, [])
                if item.version == version
            ),
            None,
        )
        if distribution is None:
            raise ValueError(f"{name}=={version} is not installed")
        selected[key] = distribution
    return selected


def locked_requirement_target(
    requirement: Requirement,
    locked: dict[str, dict[str, object]],
    *,
    owner: str,
) -> str:
    target = canonical_name(requirement.name)
    package = locked.get(target)
    if package is None:
        raise ValueError(
            f"{owner} requires {requirement}, but it is absent from the lock"
        )
    locked_version = str(package["version"])
    if requirement.specifier:
        try:
            satisfies = requirement.specifier.contains(
                Version(locked_version),
                prereleases=True,
            )
        except InvalidVersion as exc:
            raise ValueError(
                f"{package['name']} has invalid locked version {locked_version!r}"
            ) from exc
        if not satisfies:
            raise ValueError(
                f"{owner} requires {requirement}, but the lock contains "
                f"{package['name']}=={locked_version}"
            )
    return target


def requirement_marker_applies(
    requirement: Requirement,
    active_extras: set[str],
) -> bool:
    if requirement.marker is None:
        return True
    return any(
        requirement.marker.evaluate({"extra": extra})
        for extra in sorted({"", *active_extras})
    )


def python_inventory(
    lock_path: Path,
    required_packages: set[str],
    direct_requirements: list[Requirement],
    application_ref: str,
    distributions: Iterable[metadata.Distribution] | None = None,
) -> tuple[list[dict[str, object]], list[dict[str, object]]]:
    locked = locked_python_packages(lock_path)
    required_keys = {canonical_name(name) for name in required_packages}
    selected = selected_python_distributions(locked, distributions)

    components: list[dict[str, object]] = []
    refs_by_key: dict[str, str] = {}
    for key, package in sorted(locked.items()):
        name = str(package["name"])
        version = str(package["version"])
        distribution = selected[key]
        license_result = distribution_license(distribution)
        if not license_result:
            raise ValueError(f"{name}=={version} has no usable license metadata")
        license_name, is_spdx_expression = license_result
        license_entry = (
            {"expression": license_name}
            if is_spdx_expression
            else {"license": {"name": license_name}}
        )
        component_ref = (
            f"pkg:pypi/{quote(name, safe='')}@{quote(version, safe='')}"
        )
        refs_by_key[key] = component_ref
        component: dict[str, object] = {
            "type": "library",
            "bom-ref": component_ref,
            "name": name,
            "version": version,
            "scope": "required" if key in required_keys else "excluded",
            "licenses": [license_entry],
            "purl": component_ref,
        }
        hashes = package["hashes"]
        component["properties"] = [
            {
                "name": "trex-webui:pip-lock-candidate-hash-count",
                "value": str(len(hashes)),
            }
        ]
        components.append(component)

    active_extras: defaultdict[str, set[str]] = defaultdict(set)
    root_dependencies: set[str] = set()
    for requirement in direct_requirements:
        target = locked_requirement_target(
            requirement,
            locked,
            owner="<application>",
        )
        root_dependencies.add(refs_by_key[target])
        active_extras[target].update(requirement.extras)

    edges_by_key: dict[str, set[str]] = {
        key: set() for key in locked
    }
    changed = True
    while changed:
        changed = False
        for key in sorted(locked):
            distribution = selected[key]
            owner = f"{locked[key]['name']}=={locked[key]['version']}"
            for raw_requirement in distribution.requires or []:
                try:
                    requirement = Requirement(raw_requirement)
                except InvalidRequirement as exc:
                    raise ValueError(
                        f"{owner} has invalid Requires-Dist metadata: "
                        f"{raw_requirement!r}"
                    ) from exc
                if not requirement_marker_applies(
                    requirement,
                    active_extras[key],
                ):
                    continue
                target = locked_requirement_target(
                    requirement,
                    locked,
                    owner=owner,
                )
                target_ref = refs_by_key[target]
                if target_ref not in edges_by_key[key]:
                    edges_by_key[key].add(target_ref)
                    changed = True
                before = len(active_extras[target])
                active_extras[target].update(requirement.extras)
                if len(active_extras[target]) != before:
                    changed = True

    dependencies: list[dict[str, object]] = [
        {
            "ref": application_ref,
            "dependsOn": sorted(root_dependencies),
        }
    ]
    dependencies.extend(
        {
            "ref": refs_by_key[key],
            "dependsOn": sorted(edges_by_key[key]),
        }
        for key in sorted(locked)
    )
    return components, dependencies


def validate_dependency_graph(
    application_ref: str,
    components: list[dict[str, object]],
    dependencies: list[dict[str, object]],
) -> None:
    component_refs = [component.get("bom-ref") for component in components]
    if any(not isinstance(reference, str) or not reference for reference in component_refs):
        raise ValueError("every SBOM component must have a non-empty bom-ref")
    if len(component_refs) != len(set(component_refs)):
        raise ValueError("SBOM component bom-ref values must be unique")
    if application_ref in component_refs:
        raise ValueError("application bom-ref collides with a dependency component")

    known_refs = {application_ref, *component_refs}
    dependency_refs: list[str] = []
    for dependency in dependencies:
        reference = dependency.get("ref")
        depends_on = dependency.get("dependsOn")
        if not isinstance(reference, str) or not reference:
            raise ValueError("every dependency graph entry must have a ref")
        if not isinstance(depends_on, list) or any(
            not isinstance(target, str) or not target for target in depends_on
        ):
            raise ValueError(
                f"dependency graph entry {reference!r} has invalid dependsOn"
            )
        if len(depends_on) != len(set(depends_on)):
            raise ValueError(
                f"dependency graph entry {reference!r} has duplicate edges"
            )
        unknown = sorted(set(depends_on) - known_refs)
        if unknown:
            raise ValueError(
                f"dependency graph entry {reference!r} references unknown "
                f"components: {', '.join(unknown)}"
            )
        dependency_refs.append(reference)
    if len(dependency_refs) != len(set(dependency_refs)):
        raise ValueError("dependency graph ref values must be unique")
    if set(dependency_refs) != known_refs:
        missing = sorted(known_refs - set(dependency_refs))
        extra = sorted(set(dependency_refs) - known_refs)
        raise ValueError(
            "dependency graph must contain exactly the application and every "
            f"component; missing={missing}, extra={extra}"
        )


def write_bom(
    output_path: Path,
    *,
    application_name: str,
    application_version: str,
    application_ref: str,
    components: list[dict[str, object]],
    dependencies: list[dict[str, object]],
    timestamp: str,
    sbom_kind: str,
    source_commit: str,
) -> None:
    if not re.fullmatch(r"[0-9a-f]{40,64}", source_commit):
        raise ValueError(f"invalid Git commit identity: {source_commit!r}")
    validate_dependency_graph(application_ref, components, dependencies)
    identity_payload = {
        "application": {
            "name": application_name,
            "version": application_version,
            "bom-ref": application_ref,
        },
        "components": components,
        "dependencies": dependencies,
        "kind": sbom_kind,
        "source_commit": source_commit,
        "timestamp": timestamp,
    }
    identity = hashlib.sha256(
        json.dumps(
            identity_payload,
            sort_keys=True,
            separators=(",", ":"),
        ).encode()
    ).hexdigest()
    serial = uuid.uuid5(
        uuid.NAMESPACE_URL,
        (
            "https://trex-webui.invalid/sbom/"
            f"{quote(sbom_kind, safe='')}/"
            f"{quote(application_name, safe='')}/"
            f"{quote(application_version, safe='')}/"
            f"{source_commit}/{identity}"
        ),
    )
    bom = {
        "$schema": "http://cyclonedx.org/schema/bom-1.6.schema.json",
        "bomFormat": "CycloneDX",
        "specVersion": "1.6",
        "serialNumber": f"urn:uuid:{serial}",
        "version": 1,
        "metadata": {
            "timestamp": timestamp,
            "tools": {
                "components": [
                    {
                        "type": "application",
                        "name": "trex-webui-sbom-generator",
                        "version": "1",
                    }
                ]
            },
            "component": {
                "type": "application",
                "bom-ref": application_ref,
                "name": application_name,
                "version": application_version,
            },
            "properties": [
                {
                    "name": "trex-webui:sbom-kind",
                    "value": sbom_kind,
                },
                {
                    "name": "trex-webui:vcs-commit",
                    "value": source_commit,
                },
            ],
        },
        "components": components,
        "dependencies": dependencies,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(bom, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def generate_sboms(
    project_root: Path,
    output_dir: Path,
) -> tuple[Path, Path]:
    project_root = project_root.resolve()
    output_dir = output_dir.resolve()

    epoch = source_epoch(project_root)
    timestamp = iso_timestamp(epoch)
    commit = source_commit(project_root)
    (
        web_name,
        web_version,
        web_ref,
        web_components,
        web_dependencies,
    ) = web_inventory(
        project_root / "apps/web/package-lock.json"
    )
    root_package = json.loads(
        (project_root / "package.json").read_text(encoding="utf-8")
    )
    root_name = root_package.get("name")
    python_version = root_package.get("version")
    if not isinstance(root_name, str) or not isinstance(python_version, str):
        raise ValueError("root package.json is missing name/version")
    python_name = f"{root_name}-api"
    python_ref = application_bom_ref(
        "python",
        python_name,
        python_version,
    )
    production_python = locked_python_packages(
        project_root / "apps/api/requirements.lock"
    )
    direct_python = read_requirement_file(
        project_root / "apps/api/requirements-dev.txt"
    )
    python_components, python_dependencies = python_inventory(
        project_root / "apps/api/requirements-dev.lock",
        set(production_python),
        direct_python,
        python_ref,
    )

    web_output = output_dir / "SBOM.web.cdx.json"
    python_output = output_dir / "SBOM.python.cdx.json"
    write_bom(
        web_output,
        application_name=web_name,
        application_version=web_version,
        application_ref=web_ref,
        components=web_components,
        dependencies=web_dependencies,
        timestamp=timestamp,
        sbom_kind="web",
        source_commit=commit,
    )
    write_bom(
        python_output,
        application_name=python_name,
        application_version=python_version,
        application_ref=python_ref,
        components=python_components,
        dependencies=python_dependencies,
        timestamp=timestamp,
        sbom_kind="python",
        source_commit=commit,
    )
    return web_output, python_output


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", type=Path, default=Path.cwd())
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    web_output, python_output = generate_sboms(
        args.project_root.resolve(),
        args.output_dir.resolve(),
    )

    print(f"Web SBOM: {web_output}")
    print(f"Python SBOM: {python_output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
