#!/usr/bin/env python3
"""Strict, deterministic release-provenance contract for TRex WebUI."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


RELEASE_MANIFEST_SCHEMA = "trex-webui-release/v3"
RELEASE_PROVENANCE_SCHEMA = "trex-webui-release-provenance/v1"
RELEASE_WORKFLOW_PATH = ".github/workflows/release.yml"
LOCAL_PROVENANCE_KEYS = {
    "kind",
    "publishable",
    "schema",
    "source_dirty",
    "source_sha",
}
GITHUB_PROVENANCE_KEYS = {
    "kind",
    "publishable",
    "release_ref",
    "release_tag",
    "repository",
    "schema",
    "signer_workflow",
    "signer_workflow_ref",
    "signer_workflow_sha",
    "source_dirty",
    "source_sha",
}
SHA_RE = re.compile(r"[0-9a-f]{40}(?:[0-9a-f]{24})?\Z")
REPOSITORY_RE = re.compile(
    r"[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,98}[A-Za-z0-9])?"
    r"/"
    r"[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,98}[A-Za-z0-9])?\Z"
)
TAG_RE = re.compile(r"v[0-9A-Za-z](?:[0-9A-Za-z._-]{0,126}[0-9A-Za-z])?\Z")
SEMVER_RE = re.compile(
    r"(?:0|[1-9][0-9]*)\."
    r"(?:0|[1-9][0-9]*)\."
    r"(?:0|[1-9][0-9]*)"
    r"(?:-(?:0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)"
    r"(?:\.(?:0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*)?"
    r"(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?\Z"
)


class ReleaseContractError(ValueError):
    """Raised when release provenance is incomplete or internally inconsistent."""


def canonical_json_bytes(value: object) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


def strict_json_loads(content: bytes) -> object:
    def reject_duplicate_keys(
        pairs: list[tuple[str, object]],
    ) -> dict[str, object]:
        result: dict[str, object] = {}
        for key, value in pairs:
            if key in result:
                raise ReleaseContractError(
                    f"release contract contains duplicate JSON key: {key}"
                )
            result[key] = value
        return result

    def reject_constant(value: str) -> object:
        raise ReleaseContractError(
            f"release contract contains non-finite JSON value: {value}"
        )

    try:
        return json.loads(
            content.decode("utf-8"),
            object_pairs_hook=reject_duplicate_keys,
            parse_constant=reject_constant,
        )
    except UnicodeDecodeError as exc:
        raise ReleaseContractError("release contract is not valid UTF-8") from exc
    except json.JSONDecodeError as exc:
        raise ReleaseContractError(
            f"release contract is not valid JSON: {exc}"
        ) from exc


def require_sha(value: object, label: str) -> str:
    if not isinstance(value, str) or not SHA_RE.fullmatch(value):
        raise ReleaseContractError(f"{label} must be a full lowercase Git object ID")
    return value


def require_repository(value: object) -> str:
    if not isinstance(value, str) or not REPOSITORY_RE.fullmatch(value):
        raise ReleaseContractError("release repository must use the owner/repository form")
    owner, name = value.split("/", 1)
    if owner in {".", ".."} or name in {".", ".."} or name.endswith(".git"):
        raise ReleaseContractError("release repository is not canonical")
    return value


def release_tag(release_ref: object) -> str:
    if not isinstance(release_ref, str) or not release_ref.startswith("refs/tags/"):
        raise ReleaseContractError("release_ref must be an exact refs/tags/* ref")
    tag = release_ref.removeprefix("refs/tags/")
    if not TAG_RE.fullmatch(tag):
        raise ReleaseContractError("release_ref contains an unsafe or non-canonical tag")
    return tag


def expected_tag_for_version(version: object) -> str:
    if not isinstance(version, str) or not SEMVER_RE.fullmatch(version):
        raise ReleaseContractError("publishable release version must be canonical SemVer")
    expected = f"v{version}"
    if not TAG_RE.fullmatch(expected):
        raise ReleaseContractError("release version cannot be represented by a safe tag")
    return expected


def build_release_provenance(
    *,
    version: str,
    source_sha: str,
    source_dirty: bool,
    repository: str | None = None,
    release_ref: str | None = None,
    signer_workflow_ref: str | None = None,
    signer_workflow_sha: str | None = None,
    require_publishable: bool = False,
) -> dict[str, object]:
    """Build deterministic local or exact-tag GitHub Actions provenance."""

    source_sha = require_sha(source_sha, "release source SHA")
    if not isinstance(source_dirty, bool):
        raise ReleaseContractError("release source dirty state must be a boolean")
    release_values = (
        repository,
        release_ref,
        signer_workflow_ref,
        signer_workflow_sha,
    )
    supplied = [value is not None and value != "" for value in release_values]
    if not any(supplied):
        if require_publishable:
            raise ReleaseContractError(
                "publishable release provenance requires GitHub repository, tag, and signer workflow context"
            )
        return {
            "schema": RELEASE_PROVENANCE_SCHEMA,
            "kind": "local-build",
            "publishable": False,
            "source_sha": source_sha,
            "source_dirty": source_dirty,
        }
    if not all(supplied):
        raise ReleaseContractError(
            "GitHub release provenance is partial; repository, release_ref, "
            "signer_workflow_ref, and signer_workflow_sha are all required"
        )
    if source_dirty:
        raise ReleaseContractError("publishable release provenance requires a clean source")

    repository = require_repository(repository)
    tag = release_tag(release_ref)
    expected_tag = expected_tag_for_version(version)
    if tag != expected_tag:
        raise ReleaseContractError(
            f"release tag {tag!r} does not exactly match package version {version!r}"
        )
    if not isinstance(signer_workflow_ref, str):
        raise ReleaseContractError("signer workflow ref is invalid")
    expected_workflow = f"{repository}/{RELEASE_WORKFLOW_PATH}"
    expected_workflow_ref = f"{expected_workflow}@{release_ref}"
    if signer_workflow_ref != expected_workflow_ref:
        raise ReleaseContractError(
            "signer workflow ref must exactly match the release repository, "
            "release workflow path, and release tag ref"
        )
    signer_workflow_sha = require_sha(
        signer_workflow_sha,
        "signer workflow SHA",
    )
    if signer_workflow_sha != source_sha:
        raise ReleaseContractError(
            "signer workflow SHA must exactly match the release source SHA"
        )
    return {
        "schema": RELEASE_PROVENANCE_SCHEMA,
        "kind": "github-actions",
        "publishable": True,
        "repository": repository,
        "release_ref": release_ref,
        "release_tag": tag,
        "source_sha": source_sha,
        "source_dirty": False,
        "signer_workflow": expected_workflow,
        "signer_workflow_ref": signer_workflow_ref,
        "signer_workflow_sha": signer_workflow_sha,
    }


def validate_release_provenance(
    provenance: object,
    *,
    version: str,
    publishable: bool = False,
) -> dict[str, object]:
    if not isinstance(provenance, dict):
        raise ReleaseContractError("release manifest is missing release_provenance")
    if provenance.get("schema") != RELEASE_PROVENANCE_SCHEMA:
        raise ReleaseContractError("release provenance schema is missing or unsupported")
    kind = provenance.get("kind")
    if kind == "local-build":
        if set(provenance) != LOCAL_PROVENANCE_KEYS:
            raise ReleaseContractError("local release provenance shape is invalid")
        source_sha = require_sha(provenance.get("source_sha"), "release source SHA")
        source_dirty = provenance.get("source_dirty")
        if not isinstance(source_dirty, bool):
            raise ReleaseContractError("release source dirty state must be a boolean")
        if provenance.get("publishable") is not False:
            raise ReleaseContractError("local release provenance must not be publishable")
        if publishable:
            raise ReleaseContractError(
                "release artifact is a local build and is not publishable"
            )
        return {
            "schema": RELEASE_PROVENANCE_SCHEMA,
            "kind": "local-build",
            "publishable": False,
            "source_sha": source_sha,
            "source_dirty": source_dirty,
        }
    if kind != "github-actions":
        raise ReleaseContractError("release provenance kind is missing or unsupported")
    if set(provenance) != GITHUB_PROVENANCE_KEYS:
        raise ReleaseContractError("GitHub release provenance shape is invalid")
    if provenance.get("publishable") is not True:
        raise ReleaseContractError("GitHub release provenance must be publishable")
    rebuilt = build_release_provenance(
        version=version,
        source_sha=require_sha(provenance.get("source_sha"), "release source SHA"),
        source_dirty=provenance.get("source_dirty"),
        repository=provenance.get("repository"),
        release_ref=provenance.get("release_ref"),
        signer_workflow_ref=provenance.get("signer_workflow_ref"),
        signer_workflow_sha=provenance.get("signer_workflow_sha"),
        require_publishable=True,
    )
    if rebuilt != provenance:
        raise ReleaseContractError("GitHub release provenance is not canonical")
    return rebuilt


def validate_manifest_release_contract(
    manifest: object,
    *,
    publishable: bool = False,
    expected_repository: str | None = None,
    expected_release_ref: str | None = None,
    expected_signer_workflow: str | None = None,
    expected_source_sha: str | None = None,
) -> dict[str, object]:
    if not isinstance(manifest, dict):
        raise ReleaseContractError("release manifest root must be a JSON object")
    if manifest.get("schema") != RELEASE_MANIFEST_SCHEMA:
        raise ReleaseContractError("release manifest schema is missing or unsupported")
    provenance = validate_release_provenance(
        manifest.get("release_provenance"),
        version=manifest.get("version"),
        publishable=publishable,
    )
    source_sha = provenance["source_sha"]
    source_dirty = provenance["source_dirty"]
    if manifest.get("git_commit") != source_sha:
        raise ReleaseContractError(
            "release provenance source SHA does not match manifest git_commit"
        )
    if manifest.get("git_dirty") is not source_dirty:
        raise ReleaseContractError(
            "release provenance dirty state does not match manifest git_dirty"
        )

    aliases = {
        "release_repository": provenance.get("repository"),
        "release_ref": provenance.get("release_ref"),
        "signer_workflow": provenance.get("signer_workflow"),
    }
    for key, expected in aliases.items():
        if manifest.get(key) != expected:
            raise ReleaseContractError(
                f"release manifest {key} does not match canonical provenance"
            )

    expectations = (
        ("repository", expected_repository, provenance.get("repository")),
        ("release ref", expected_release_ref, provenance.get("release_ref")),
        (
            "signer workflow",
            expected_signer_workflow,
            provenance.get("signer_workflow"),
        ),
        ("source SHA", expected_source_sha, source_sha),
    )
    for label, expected, observed in expectations:
        if expected is not None and expected != observed:
            raise ReleaseContractError(
                f"release {label} mismatch: expected {expected!r}, observed {observed!r}"
            )
    return provenance


def attestation_policy(provenance: object) -> dict[str, str]:
    validated = validate_release_provenance(
        provenance,
        version=(
            provenance.get("release_tag", "").removeprefix("v")
            if isinstance(provenance, dict)
            else ""
        ),
        publishable=True,
    )
    return {
        "repository": str(validated["repository"]),
        "signer_workflow": str(validated["signer_workflow"]),
        "source_ref": str(validated["release_ref"]),
        "source_digest": str(validated["source_sha"]),
        "signer_digest": str(validated["signer_workflow_sha"]),
    }


def read_json_file(path: Path) -> object:
    try:
        return strict_json_loads(path.read_bytes())
    except OSError as exc:
        raise ReleaseContractError(f"cannot read release manifest {path}: {exc}") from exc


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Build or validate the TRex WebUI release provenance contract"
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    build = subparsers.add_parser("build-provenance")
    build.add_argument("--version", required=True)
    build.add_argument("--source-sha", required=True)
    build.add_argument("--source-dirty", choices=("true", "false"), required=True)
    build.add_argument("--repository")
    build.add_argument("--release-ref")
    build.add_argument("--signer-workflow-ref")
    build.add_argument("--signer-workflow-sha")
    build.add_argument("--require-publishable", action="store_true")

    validate = subparsers.add_parser("validate-manifest")
    validate.add_argument("manifest")
    validate.add_argument("--publishable", action="store_true")
    validate.add_argument("--expected-repository")
    validate.add_argument("--expected-release-ref")
    validate.add_argument("--expected-signer-workflow")
    validate.add_argument("--expected-source-sha")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.command == "build-provenance":
            payload = build_release_provenance(
                version=args.version,
                source_sha=args.source_sha,
                source_dirty=args.source_dirty == "true",
                repository=args.repository,
                release_ref=args.release_ref,
                signer_workflow_ref=args.signer_workflow_ref,
                signer_workflow_sha=args.signer_workflow_sha,
                require_publishable=args.require_publishable,
            )
        else:
            manifest = read_json_file(Path(args.manifest))
            payload = validate_manifest_release_contract(
                manifest,
                publishable=args.publishable,
                expected_repository=args.expected_repository,
                expected_release_ref=args.expected_release_ref,
                expected_signer_workflow=args.expected_signer_workflow,
                expected_source_sha=args.expected_source_sha,
            )
        print(
            json.dumps(
                payload,
                ensure_ascii=False,
                indent=2,
                sort_keys=True,
            )
        )
        return 0
    except (OSError, ReleaseContractError) as exc:
        print(f"release contract error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
