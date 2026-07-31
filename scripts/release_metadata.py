#!/usr/bin/env python3
"""Create and verify the attested release bootstrap metadata."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import stat
import sys
import tempfile
from pathlib import Path


RELEASE_METADATA_SCHEMA = "trex-webui-release-metadata/v1"
RELEASE_EVIDENCE_SCHEMA = "trex-webui-release-evidence/v1"
RELEASE_WORKFLOW_PATH = ".github/workflows/release.yml"
SHA256_RE = re.compile(r"[0-9a-f]{64}\Z")
GIT_SHA_RE = re.compile(r"[0-9a-f]{40}(?:[0-9a-f]{24})?\Z")
REPOSITORY_RE = re.compile(
    r"[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,98}[A-Za-z0-9])?"
    r"/"
    r"[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,98}[A-Za-z0-9])?\Z"
)
TAG_RE = re.compile(r"v[0-9A-Za-z](?:[0-9A-Za-z._-]{0,126}[0-9A-Za-z])?\Z")
SAFE_NAME_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,191}\Z")
MAX_JSON_BYTES = 64 * 1024 * 1024
RELEASE_KEYS = {
    "repository",
    "release_ref",
    "release_tag",
    "signer_workflow",
    "signer_workflow_sha",
    "source_sha",
    "version",
}
ARTIFACT_KEYS = {"name", "role", "sha256", "size"}
ROLE_ARGUMENTS = {
    "archive": "archive",
    "checksum": "checksum",
    "release-evidence": "evidence",
    "sbom-web": "sbom_web",
    "sbom-python": "sbom_python",
    "standard-report": "standard_report",
    "six-port-report": "six_port_report",
    "verified-upgrade": "verified_upgrade",
    "archive-safety": "archive_safety",
    "release-contract": "release_contract",
    "release-metadata": "release_metadata",
}
REQUIRED_ROLES = frozenset(ROLE_ARGUMENTS)


class ReleaseMetadataError(ValueError):
    """Raised when bootstrap metadata is unsafe or internally inconsistent."""


def strict_json_loads(content: bytes) -> object:
    def reject_duplicate_keys(pairs: list[tuple[str, object]]) -> dict[str, object]:
        result: dict[str, object] = {}
        for key, value in pairs:
            if key in result:
                raise ReleaseMetadataError(
                    f"release metadata contains duplicate JSON key: {key}"
                )
            result[key] = value
        return result

    def reject_constant(value: str) -> object:
        raise ReleaseMetadataError(
            f"release metadata contains non-finite JSON value: {value}"
        )

    try:
        return json.loads(
            content.decode("utf-8"),
            object_pairs_hook=reject_duplicate_keys,
            parse_constant=reject_constant,
        )
    except UnicodeDecodeError as exc:
        raise ReleaseMetadataError("release metadata is not valid UTF-8") from exc
    except json.JSONDecodeError as exc:
        raise ReleaseMetadataError(
            f"release metadata is not valid JSON: {exc}"
        ) from exc


def regular_file(path: Path, label: str) -> os.stat_result:
    try:
        metadata = path.lstat()
    except OSError as exc:
        raise ReleaseMetadataError(f"cannot inspect {label} {path}: {exc}") from exc
    if not stat.S_ISREG(metadata.st_mode) or path.is_symlink():
        raise ReleaseMetadataError(
            f"{label} must be a regular non-symlink file: {path}"
        )
    return metadata


def file_descriptor(path: Path, role: str) -> dict[str, object]:
    metadata = regular_file(path, f"{role} artifact")
    digest = hashlib.sha256()
    size = 0
    try:
        with path.open("rb") as source:
            while chunk := source.read(1024 * 1024):
                digest.update(chunk)
                size += len(chunk)
    except OSError as exc:
        raise ReleaseMetadataError(f"cannot hash {role} artifact {path}: {exc}") from exc
    if size != metadata.st_size:
        raise ReleaseMetadataError(f"{role} artifact changed while hashing: {path}")
    if not SAFE_NAME_RE.fullmatch(path.name):
        raise ReleaseMetadataError(
            f"{role} artifact basename is unsafe or non-canonical: {path.name!r}"
        )
    return {
        "role": role,
        "name": path.name,
        "sha256": digest.hexdigest(),
        "size": size,
    }


def read_json(path: Path, label: str) -> object:
    metadata = regular_file(path, label)
    if metadata.st_size < 1 or metadata.st_size > MAX_JSON_BYTES:
        raise ReleaseMetadataError(f"{label} is empty or too large: {path}")
    try:
        return strict_json_loads(path.read_bytes())
    except OSError as exc:
        raise ReleaseMetadataError(f"cannot read {label} {path}: {exc}") from exc


def require_git_sha(value: object, label: str) -> str:
    if not isinstance(value, str) or not GIT_SHA_RE.fullmatch(value):
        raise ReleaseMetadataError(f"{label} must be a full lowercase Git object ID")
    return value


def expected_policy(
    *,
    repository: str,
    release_ref: str,
    signer_workflow: str,
    source_sha: str,
) -> dict[str, str]:
    if not REPOSITORY_RE.fullmatch(repository):
        raise ReleaseMetadataError("release repository must use owner/repository form")
    if not release_ref.startswith("refs/tags/"):
        raise ReleaseMetadataError("release ref must be an exact refs/tags/* ref")
    tag = release_ref.removeprefix("refs/tags/")
    if not TAG_RE.fullmatch(tag):
        raise ReleaseMetadataError("release tag is unsafe or non-canonical")
    expected_workflow = f"{repository}/{RELEASE_WORKFLOW_PATH}"
    if signer_workflow != expected_workflow:
        raise ReleaseMetadataError(
            "signer workflow must exactly match the release repository workflow"
        )
    source_sha = require_git_sha(source_sha, "release source SHA")
    return {
        "repository": repository,
        "signer_workflow": signer_workflow,
        "source_ref": release_ref,
        "source_digest": source_sha,
        "signer_digest": source_sha,
    }


def artifact_map(metadata: dict[str, object]) -> dict[str, dict[str, object]]:
    artifacts = metadata.get("artifacts")
    if not isinstance(artifacts, list) or len(artifacts) != len(REQUIRED_ROLES):
        raise ReleaseMetadataError("release metadata artifact set is incomplete")
    result: dict[str, dict[str, object]] = {}
    names: set[str] = set()
    for item in artifacts:
        if not isinstance(item, dict) or set(item) != ARTIFACT_KEYS:
            raise ReleaseMetadataError("release metadata artifact shape is invalid")
        role = item.get("role")
        name = item.get("name")
        digest = item.get("sha256")
        size = item.get("size")
        if not isinstance(role, str) or role not in REQUIRED_ROLES or role in result:
            raise ReleaseMetadataError("release metadata has an unknown or duplicate role")
        if not isinstance(name, str) or not SAFE_NAME_RE.fullmatch(name) or name in names:
            raise ReleaseMetadataError(
                "release metadata has an unsafe or duplicate artifact basename"
            )
        if not isinstance(digest, str) or not SHA256_RE.fullmatch(digest):
            raise ReleaseMetadataError(f"release metadata digest is invalid for {role}")
        if isinstance(size, bool) or not isinstance(size, int) or size < 1:
            raise ReleaseMetadataError(f"release metadata size is invalid for {role}")
        result[role] = item
        names.add(name)
    if set(result) != REQUIRED_ROLES:
        raise ReleaseMetadataError("release metadata artifact roles are incomplete")
    return result


def validate_release_shape(
    release: object,
    *,
    expected_repository: str | None = None,
    expected_release_ref: str | None = None,
    expected_signer_workflow: str | None = None,
    expected_source_sha: str | None = None,
) -> tuple[dict[str, object], dict[str, str]]:
    if not isinstance(release, dict) or set(release) != RELEASE_KEYS:
        raise ReleaseMetadataError("release metadata identity shape is invalid")
    repository = release.get("repository")
    release_ref = release.get("release_ref")
    release_tag = release.get("release_tag")
    signer_workflow = release.get("signer_workflow")
    source_sha = release.get("source_sha")
    signer_sha = release.get("signer_workflow_sha")
    version = release.get("version")
    if not all(
        isinstance(value, str)
        for value in (
            repository,
            release_ref,
            release_tag,
            signer_workflow,
            source_sha,
            signer_sha,
            version,
        )
    ):
        raise ReleaseMetadataError("release metadata identity values must be strings")
    policy = expected_policy(
        repository=repository,
        release_ref=release_ref,
        signer_workflow=signer_workflow,
        source_sha=source_sha,
    )
    if signer_sha != source_sha:
        raise ReleaseMetadataError("signer workflow SHA must match the release source SHA")
    if release_tag != release_ref.removeprefix("refs/tags/"):
        raise ReleaseMetadataError("release tag does not match release ref")
    if release_tag != f"v{version}":
        raise ReleaseMetadataError("release tag does not match release version")
    expectations = (
        ("repository", expected_repository, repository),
        ("release ref", expected_release_ref, release_ref),
        ("signer workflow", expected_signer_workflow, signer_workflow),
        ("source SHA", expected_source_sha, source_sha),
    )
    for label, expected, observed in expectations:
        if expected is not None and expected != observed:
            raise ReleaseMetadataError(
                f"release {label} mismatch: expected {expected!r}, observed {observed!r}"
            )
    return release, policy


def require_descriptor_match(
    expected: dict[str, object], observed: object, label: str
) -> None:
    if not isinstance(observed, dict):
        raise ReleaseMetadataError(f"release evidence has no {label} descriptor")
    for key in ("file", "sha256", "size"):
        observed_key = "name" if key == "file" else key
        if observed.get(key) != expected.get(observed_key):
            raise ReleaseMetadataError(
                f"release evidence {label} {key} does not match bootstrap metadata"
            )


def validate_evidence_binding(
    evidence: object,
    *,
    release: dict[str, object],
    policy: dict[str, str],
    artifacts: dict[str, dict[str, object]],
) -> None:
    if not isinstance(evidence, dict) or evidence.get("schema") != RELEASE_EVIDENCE_SCHEMA:
        raise ReleaseMetadataError("release evidence schema is missing or unsupported")
    evidence_release = evidence.get("release")
    if not isinstance(evidence_release, dict):
        raise ReleaseMetadataError("release evidence has no release identity")
    identity_keys = (
        "repository",
        "release_ref",
        "release_tag",
        "source_sha",
        "signer_workflow",
        "signer_workflow_sha",
        "version",
    )
    for key in identity_keys:
        if evidence_release.get(key) != release.get(key):
            raise ReleaseMetadataError(
                f"release evidence {key} does not match bootstrap metadata"
            )
    if evidence.get("attestation_policy") != policy:
        raise ReleaseMetadataError(
            "release evidence attestation policy does not match bootstrap metadata"
        )
    evidence_artifacts = evidence.get("artifacts")
    if not isinstance(evidence_artifacts, dict):
        raise ReleaseMetadataError("release evidence artifact inventory is missing")
    require_descriptor_match(
        artifacts["archive"],
        evidence_artifacts.get("release_archive"),
        "archive",
    )
    require_descriptor_match(
        artifacts["checksum"],
        evidence_artifacts.get("checksum_sidecar"),
        "checksum",
    )
    sboms = evidence_artifacts.get("sboms")
    if not isinstance(sboms, list) or len(sboms) != 2:
        raise ReleaseMetadataError("release evidence SBOM inventory is incomplete")
    sbom_by_name = {
        item.get("file"): item for item in sboms if isinstance(item, dict)
    }
    for role in ("sbom-web", "sbom-python"):
        descriptor = artifacts[role]
        require_descriptor_match(
            descriptor,
            sbom_by_name.get(descriptor["name"]),
            role,
        )
    acceptance = evidence.get("acceptance")
    if not isinstance(acceptance, list) or len(acceptance) != 2:
        raise ReleaseMetadataError("release evidence acceptance inventory is incomplete")
    by_workflow = {
        item.get("workflow"): item for item in acceptance if isinstance(item, dict)
    }
    for workflow, role in (
        ("standard-e2e", "standard-report"),
        ("six-port-e2e", "six-port-report"),
    ):
        observed = by_workflow.get(workflow)
        if not isinstance(observed, dict) or observed.get("verdict") != "pass":
            raise ReleaseMetadataError(
                f"release evidence has no passing {workflow} descriptor"
            )
        require_descriptor_match(artifacts[role], observed, workflow)


def validate_metadata(
    metadata: object,
    *,
    artifact_dir: Path | None = None,
    expected_repository: str | None = None,
    expected_release_ref: str | None = None,
    expected_signer_workflow: str | None = None,
    expected_source_sha: str | None = None,
) -> dict[str, object]:
    if not isinstance(metadata, dict) or set(metadata) != {
        "schema",
        "release",
        "artifacts",
    }:
        raise ReleaseMetadataError("release metadata root shape is invalid")
    if metadata.get("schema") != RELEASE_METADATA_SCHEMA:
        raise ReleaseMetadataError("release metadata schema is missing or unsupported")
    release, policy = validate_release_shape(
        metadata.get("release"),
        expected_repository=expected_repository,
        expected_release_ref=expected_release_ref,
        expected_signer_workflow=expected_signer_workflow,
        expected_source_sha=expected_source_sha,
    )
    artifacts = artifact_map(metadata)
    if artifact_dir is not None:
        try:
            directory_metadata = artifact_dir.lstat()
        except OSError as exc:
            raise ReleaseMetadataError(
                f"cannot inspect release artifact directory {artifact_dir}: {exc}"
            ) from exc
        if not stat.S_ISDIR(directory_metadata.st_mode) or artifact_dir.is_symlink():
            raise ReleaseMetadataError(
                f"release artifact directory must be a real directory: {artifact_dir}"
            )
        for role, descriptor in artifacts.items():
            observed = file_descriptor(artifact_dir / str(descriptor["name"]), role)
            if observed != descriptor:
                raise ReleaseMetadataError(f"release artifact changed: {role}")
        checksum = artifact_dir / str(artifacts["checksum"]["name"])
        archive = artifacts["archive"]
        try:
            checksum_content = checksum.read_text(encoding="ascii")
        except (OSError, UnicodeDecodeError) as exc:
            raise ReleaseMetadataError(
                f"cannot read release checksum sidecar {checksum}: {exc}"
            ) from exc
        expected_checksum = f"{archive['sha256']}  {archive['name']}\n"
        if checksum_content != expected_checksum:
            raise ReleaseMetadataError(
                "release checksum sidecar does not match the archive metadata"
            )
        evidence_path = artifact_dir / str(artifacts["release-evidence"]["name"])
        evidence = read_json(evidence_path, "release evidence")
        validate_evidence_binding(
            evidence,
            release=release,
            policy=policy,
            artifacts=artifacts,
        )
    return metadata


def build_metadata(
    *,
    version: str,
    repository: str,
    release_ref: str,
    signer_workflow: str,
    source_sha: str,
    paths: dict[str, Path],
) -> dict[str, object]:
    release = {
        "version": version,
        "repository": repository,
        "release_ref": release_ref,
        "release_tag": release_ref.removeprefix("refs/tags/"),
        "source_sha": source_sha,
        "signer_workflow": signer_workflow,
        "signer_workflow_sha": source_sha,
    }
    descriptors = [file_descriptor(paths[role], role) for role in sorted(paths)]
    metadata: dict[str, object] = {
        "schema": RELEASE_METADATA_SCHEMA,
        "release": release,
        "artifacts": descriptors,
    }
    validate_metadata(metadata)
    evidence = read_json(paths["release-evidence"], "release evidence")
    _release, policy = validate_release_shape(release)
    validate_evidence_binding(
        evidence,
        release=release,
        policy=policy,
        artifacts=artifact_map(metadata),
    )
    return metadata


def publish_json(path: Path, payload: object) -> None:
    if path.exists() or path.is_symlink():
        raise ReleaseMetadataError(f"refusing to replace release metadata: {path}")
    parent = path.parent
    try:
        parent_metadata = parent.lstat()
    except OSError as exc:
        raise ReleaseMetadataError(
            f"cannot inspect release metadata directory {parent}: {exc}"
        ) from exc
    if not stat.S_ISDIR(parent_metadata.st_mode) or parent.is_symlink():
        raise ReleaseMetadataError(
            f"release metadata directory must be a real directory: {parent}"
        )
    content = (
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True).encode("utf-8")
        + b"\n"
    )
    temporary: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="wb",
            prefix=f".{path.name}.",
            dir=parent,
            delete=False,
        ) as target:
            temporary = Path(target.name)
            target.write(content)
            target.flush()
            os.fsync(target.fileno())
        os.chmod(temporary, 0o644)
        os.replace(temporary, path)
    except OSError as exc:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
        raise ReleaseMetadataError(f"cannot publish release metadata {path}: {exc}") from exc


def add_policy_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--expected-repository", required=True)
    parser.add_argument("--expected-release-ref", required=True)
    parser.add_argument("--expected-signer-workflow", required=True)
    parser.add_argument("--expected-source-sha", required=True)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Create or verify attested TRex WebUI release bootstrap metadata"
    )
    subparsers = parser.add_subparsers(dest="command", required=True)
    create = subparsers.add_parser("create")
    create.add_argument("--version", required=True)
    add_policy_arguments(create)
    for argument in ROLE_ARGUMENTS.values():
        create.add_argument(f"--{argument.replace('_', '-')}", required=True)
    create.add_argument("--output", required=True)

    verify = subparsers.add_parser("verify")
    verify.add_argument("--metadata", required=True)
    verify.add_argument("--artifact-dir", required=True)
    add_policy_arguments(verify)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.command == "create":
            paths = {
                role: Path(getattr(args, argument))
                for role, argument in ROLE_ARGUMENTS.items()
            }
            payload = build_metadata(
                version=args.version,
                repository=args.expected_repository,
                release_ref=args.expected_release_ref,
                signer_workflow=args.expected_signer_workflow,
                source_sha=args.expected_source_sha,
                paths=paths,
            )
            publish_json(Path(args.output), payload)
        else:
            payload = read_json(Path(args.metadata), "release metadata")
            validate_metadata(
                payload,
                artifact_dir=Path(args.artifact_dir),
                expected_repository=args.expected_repository,
                expected_release_ref=args.expected_release_ref,
                expected_signer_workflow=args.expected_signer_workflow,
                expected_source_sha=args.expected_source_sha,
            )
        print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))
        return 0
    except (OSError, ReleaseMetadataError) as exc:
        print(f"release metadata error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
