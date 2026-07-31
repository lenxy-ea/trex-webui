#!/usr/bin/env python3
"""Fail when locked Node or installed Python dependencies use unapproved licenses."""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from importlib import metadata
from pathlib import Path
from typing import Iterable


APPROVED_NODE_LICENSES = {
    "0BSD",
    "Apache-2.0",
    "BSD-2-Clause",
    "BSD-3-Clause",
    "BlueOak-1.0.0",
    "CC-BY-4.0",
    "CC0-1.0",
    "ISC",
    "MIT",
    "MIT-0",
    "MPL-2.0",
    "OFL-1.1",
}

APPROVED_PYTHON_LICENSES = {
    "Apache-2.0",
    "Apache-2.0 OR BSD-2-Clause",
    "BSD-2-Clause",
    "BSD-3-Clause",
    "MIT",
    "MIT OR Apache-2.0",
    "MPL-2.0",
    "PSF-2.0",
}
PYTHON_LICENSE_ALIASES = {
    "Apache 2.0": "Apache-2.0",
    "BSD": "BSD-3-Clause",
    "License :: OSI Approved :: Apache Software License": "Apache-2.0",
    "License :: OSI Approved :: BSD License": "BSD-3-Clause",
    "License :: OSI Approved :: MIT License": "MIT",
    "MIT License": "MIT",
    "PSFL": "PSF-2.0",
}


def node_licenses(lock_path: Path) -> tuple[Counter[str], list[str]]:
    payload = json.loads(lock_path.read_text(encoding="utf-8"))
    counts: Counter[str] = Counter()
    rejected: list[str] = []
    for package_path, package in sorted(payload.get("packages", {}).items()):
        if not package_path:
            continue
        license_name = package.get("license")
        display_name = package.get("name") or package_path.removeprefix("node_modules/")
        if not isinstance(license_name, str) or not license_name.strip():
            rejected.append(f"{display_name}: missing SPDX license")
            continue
        counts[license_name] += 1
        if license_name not in APPROVED_NODE_LICENSES:
            rejected.append(f"{display_name}: {license_name}")
    return counts, rejected


def distribution_license(distribution: metadata.Distribution) -> str | None:
    expression = distribution.metadata.get("License-Expression")
    if expression:
        return expression.strip()
    classifiers = [
        value
        for value in distribution.metadata.get_all("Classifier", [])
        if value.startswith("License :: OSI Approved ::")
    ]
    mapped = {PYTHON_LICENSE_ALIASES.get(value) for value in classifiers}
    mapped.discard(None)
    if len(mapped) == 1:
        return mapped.pop()
    license_name = distribution.metadata.get("License")
    if license_name:
        value = license_name.strip()
        return PYTHON_LICENSE_ALIASES.get(value, value)
    return None


def canonical_name(value: str) -> str:
    return re.sub(r"[-_.]+", "-", value).casefold()


def locked_python_packages(lock_path: Path) -> dict[str, tuple[str, str]]:
    packages: dict[str, tuple[str, str]] = {}
    pattern = re.compile(r"^([A-Za-z0-9_.-]+)==([^\s\\]+)")
    for line in lock_path.read_text(encoding="utf-8").splitlines():
        match = pattern.match(line)
        if match:
            name, version = match.groups()
            packages[canonical_name(name)] = (name, version)
    return packages


def installed_python_distributions(
    distributions: Iterable[metadata.Distribution] | None = None,
) -> dict[str, list[metadata.Distribution]]:
    installed: dict[str, list[metadata.Distribution]] = {}
    source = metadata.distributions() if distributions is None else distributions
    for distribution in source:
        name = distribution.metadata.get("Name")
        if not name:
            continue
        installed.setdefault(canonical_name(name), []).append(distribution)
    return installed


def python_licenses(
    lock_path: Path,
    distributions: Iterable[metadata.Distribution] | None = None,
) -> tuple[Counter[str], list[str]]:
    counts: Counter[str] = Counter()
    rejected: list[str] = []
    locked = locked_python_packages(lock_path)
    installed = installed_python_distributions(distributions)

    for key, (locked_name, locked_version) in sorted(locked.items()):
        candidates = installed.get(key, [])
        distribution = next(
            (item for item in candidates if item.version == locked_version),
            None,
        )
        if distribution is None:
            actual_versions = sorted({item.version for item in candidates})
            actual = ", ".join(actual_versions) if actual_versions else "not installed"
            rejected.append(
                f"{locked_name}=={locked_version}: locked version {actual}"
            )
            continue
        license_name = distribution_license(distribution)
        if not license_name:
            rejected.append(
                f"{locked_name}=={locked_version}: missing license metadata"
            )
            continue
        counts[license_name] += 1
        if license_name not in APPROVED_PYTHON_LICENSES:
            rejected.append(f"{locked_name}=={locked_version}: {license_name}")
    return counts, rejected


def direct_node_runtime_dependencies(
    lock_path: Path,
) -> tuple[dict[str, tuple[str, str, str | None]], list[str]]:
    payload = json.loads(lock_path.read_text(encoding="utf-8"))
    packages = payload.get("packages", {})
    root = packages.get("", {})
    direct = root.get("dependencies", {})
    findings: list[str] = []
    dependencies: dict[str, tuple[str, str, str | None]] = {}

    if not isinstance(direct, dict):
        return {}, ["Node lockfile root dependencies are missing or invalid"]

    for name in sorted(direct):
        package = packages.get(f"node_modules/{name}")
        if not isinstance(package, dict):
            findings.append(f"Node direct dependency {name} is missing from the lockfile")
            continue
        version = package.get("version")
        license_name = package.get("license")
        if not isinstance(version, str) or not version:
            findings.append(f"Node direct dependency {name} has no locked version")
            continue
        if not isinstance(license_name, str) or not license_name.strip():
            findings.append(f"Node direct dependency {name}@{version} has no SPDX license")
            license_name = None
        dependencies[name] = (name, version, license_name)
    return dependencies, findings


def direct_python_requirements(
    requirements_path: Path,
) -> tuple[dict[str, tuple[str, str]], list[str]]:
    requirements: dict[str, tuple[str, str]] = {}
    findings: list[str] = []
    pattern = re.compile(
        r"^\s*([A-Za-z0-9][A-Za-z0-9_.-]*)(?:\[[^\]]+\])?"
        r"\s*==\s*([^\s;\\]+)\s*(?:#.*)?$"
    )

    for line_number, line in enumerate(
        requirements_path.read_text(encoding="utf-8").splitlines(),
        start=1,
    ):
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        match = pattern.match(line)
        if match is None:
            findings.append(
                f"{requirements_path}:{line_number}: direct runtime requirement "
                "must use an exact == version pin"
            )
            continue
        name, version = match.groups()
        key = canonical_name(name)
        if key in requirements:
            findings.append(f"Python direct dependency {name} is declared more than once")
            continue
        requirements[key] = (name, version)
    return requirements, findings


def direct_python_runtime_dependencies(
    *,
    requirements_path: Path,
    lock_path: Path,
    distributions: Iterable[metadata.Distribution] | None = None,
) -> tuple[dict[str, tuple[str, str, str | None]], list[str]]:
    requirements, findings = direct_python_requirements(requirements_path)
    locked = locked_python_packages(lock_path)
    installed = installed_python_distributions(distributions)
    dependencies: dict[str, tuple[str, str, str | None]] = {}

    for key, (declared_name, declared_version) in sorted(requirements.items()):
        locked_entry = locked.get(key)
        if locked_entry is None:
            findings.append(
                f"Python direct dependency {declared_name} is missing from "
                f"{lock_path}"
            )
            continue
        locked_name, locked_version = locked_entry
        if locked_version != declared_version:
            findings.append(
                f"Python direct dependency {declared_name} pins "
                f"{declared_version}, but the runtime lock contains {locked_version}"
            )

        candidates = installed.get(key, [])
        distribution = next(
            (item for item in candidates if item.version == locked_version),
            None,
        )
        license_name: str | None = None
        if distribution is None:
            actual_versions = sorted({item.version for item in candidates})
            actual = ", ".join(actual_versions) if actual_versions else "not installed"
            findings.append(
                f"{locked_name}=={locked_version}: installed version is {actual}"
            )
        else:
            license_name = distribution_license(distribution)
            if not license_name:
                findings.append(
                    f"{locked_name}=={locked_version}: missing license metadata"
                )
        dependencies[key] = (locked_name, locked_version, license_name)

    return dependencies, findings


def notice_table_rows(
    notice_text: str,
    *,
    heading: str,
    label: str,
) -> tuple[list[tuple[str, str, str]], list[str]]:
    section_marker = f"## {heading}"
    section_start = notice_text.find(section_marker)
    if section_start < 0:
        return [], [f"{label} notice section {section_marker!r} is missing"]
    section = notice_text[section_start + len(section_marker) :]
    next_section = re.search(r"^## ", section, flags=re.MULTILINE)
    if next_section:
        section = section[: next_section.start()]
    first_subheading = re.search(r"^### ", section, flags=re.MULTILINE)
    if first_subheading:
        section = section[: first_subheading.start()]

    rows: list[tuple[str, str, str]] = []
    findings: list[str] = []
    for line in section.splitlines():
        if not line.strip().startswith("|"):
            continue
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if not cells or cells[0] in {"Package", "Component", "Direct dependency"}:
            continue
        if all(re.fullmatch(r":?-{3,}:?", cell) for cell in cells):
            continue
        if len(cells) != 4:
            findings.append(f"{label} notice table row must have exactly four columns")
            continue
        package_match = re.fullmatch(r"`([^`]+)`", cells[0])
        if package_match is None:
            findings.append(
                f"{label} notice package must be one exact backtick name: {cells[0]}"
            )
            continue
        rows.append((package_match.group(1), cells[1], cells[2]))
    if not rows:
        findings.append(f"{label} notice dependency table is empty")
    return rows, findings


def compare_notice_rows(
    *,
    label: str,
    expected: dict[str, tuple[str, str, str | None]],
    rows: list[tuple[str, str, str]],
    canonicalize: bool,
) -> list[str]:
    findings: list[str] = []
    actual: dict[str, tuple[str, str, str]] = {}

    for name, version, license_name in rows:
        key = canonical_name(name) if canonicalize else name
        if key in actual:
            findings.append(f"{label} notice contains duplicate package {name}")
            continue
        actual[key] = (name, version, license_name)

    for key, (expected_name, version, license_name) in sorted(expected.items()):
        row = actual.get(key)
        if row is None:
            findings.append(
                f"{label} direct runtime dependency {expected_name} is missing"
            )
            continue
        row_name, row_version, row_license = row
        if row_name != expected_name:
            findings.append(
                f"{label} notice package name {row_name} does not exactly match "
                f"locked package name {expected_name}"
            )
        if row_version != version:
            findings.append(
                f"{label} notice {row_name} version is {row_version}; "
                f"locked version is {version}"
            )
        if license_name is not None and row_license != license_name:
            findings.append(
                f"{label} notice {row_name} license is {row_license}; "
                f"package metadata license is {license_name}"
            )

    for key, (name, _, _) in sorted(actual.items()):
        if key not in expected:
            findings.append(
                f"{label} notice package {name} is not a direct runtime dependency"
            )
    return findings


def node_runtime_notice_findings(
    *,
    notice_text: str,
    node_lock_path: Path,
) -> list[str]:
    dependencies, dependency_findings = direct_node_runtime_dependencies(
        node_lock_path
    )
    rows, table_findings = notice_table_rows(
        notice_text,
        heading="Web application",
        label="Web",
    )
    return [
        *dependency_findings,
        *table_findings,
        *compare_notice_rows(
            label="Web",
            expected=dependencies,
            rows=rows,
            canonicalize=False,
        ),
    ]


def python_runtime_notice_findings(
    *,
    notice_text: str,
    python_requirements_path: Path,
    python_lock_path: Path,
    distributions: Iterable[metadata.Distribution] | None = None,
) -> list[str]:
    dependencies, dependency_findings = direct_python_runtime_dependencies(
        requirements_path=python_requirements_path,
        lock_path=python_lock_path,
        distributions=distributions,
    )
    rows, table_findings = notice_table_rows(
        notice_text,
        heading="Python API",
        label="Python",
    )
    return [
        *dependency_findings,
        *table_findings,
        *compare_notice_rows(
            label="Python",
            expected=dependencies,
            rows=rows,
            canonicalize=True,
        ),
    ]


def direct_runtime_notice_findings(
    *,
    notice_path: Path,
    node_lock_path: Path,
    python_requirements_path: Path,
    python_lock_path: Path,
    distributions: Iterable[metadata.Distribution] | None = None,
) -> list[str]:
    """Return drift between direct runtime dependencies and their notice tables."""

    notice_text = notice_path.read_text(encoding="utf-8")
    return [
        *node_runtime_notice_findings(
            notice_text=notice_text,
            node_lock_path=node_lock_path,
        ),
        *python_runtime_notice_findings(
            notice_text=notice_text,
            python_requirements_path=python_requirements_path,
            python_lock_path=python_lock_path,
            distributions=distributions,
        ),
    ]


def print_counts(label: str, counts: Counter[str]) -> None:
    summary = ", ".join(f"{name}={count}" for name, count in sorted(counts.items()))
    print(f"{label}: {summary}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--node-lock",
        type=Path,
        default=Path("apps/web/package-lock.json"),
    )
    parser.add_argument(
        "--skip-python",
        action="store_true",
        help="Only validate the Node lockfile.",
    )
    parser.add_argument(
        "--python-lock",
        type=Path,
        default=Path("apps/api/requirements-dev.lock"),
        help="Lockfile whose full installed dependency set is license-checked.",
    )
    parser.add_argument(
        "--python-runtime-lock",
        type=Path,
        default=Path("apps/api/requirements.lock"),
    )
    parser.add_argument(
        "--python-requirements",
        type=Path,
        default=Path("apps/api/requirements.txt"),
    )
    parser.add_argument(
        "--notice",
        type=Path,
        default=Path("THIRD_PARTY_NOTICES.md"),
    )
    args = parser.parse_args()

    rejected: list[str] = []
    node_counts, node_rejected = node_licenses(args.node_lock)
    print_counts("Node licenses", node_counts)
    rejected.extend(node_rejected)

    if not args.skip_python:
        python_counts, python_rejected = python_licenses(args.python_lock)
        print_counts("Python licenses", python_counts)
        rejected.extend(python_rejected)

        notice_findings = direct_runtime_notice_findings(
            notice_path=args.notice,
            node_lock_path=args.node_lock,
            python_requirements_path=args.python_requirements,
            python_lock_path=args.python_runtime_lock,
        )
        rejected.extend(
            f"third-party notice: {finding}" for finding in notice_findings
        )
    else:
        notice_findings = node_runtime_notice_findings(
            notice_text=args.notice.read_text(encoding="utf-8"),
            node_lock_path=args.node_lock,
        )
        rejected.extend(
            f"third-party notice: {finding}" for finding in notice_findings
        )

    if rejected:
        print("Dependency license or notice policy violations:", file=sys.stderr)
        for item in rejected:
            print(f"  - {item}", file=sys.stderr)
        return 1
    print("Dependency license and direct runtime notice policy passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
