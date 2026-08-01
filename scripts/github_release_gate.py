#!/usr/bin/env python3
"""Fail-closed, exact-release-ID GitHub prerelease publication gate."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import stat
import subprocess
import sys
import tempfile
import time
import urllib.parse
from dataclasses import dataclass
from pathlib import Path
from typing import NoReturn


API_VERSION = "2026-03-10"
JSON_ACCEPT = "application/vnd.github+json"
OCTET_ACCEPT = "application/octet-stream"
ADMIN_TOKEN_ENV = "RELEASE_ADMIN_TOKEN"
RELEASE_LIST_PAGE_SIZE = 100
MAX_RELEASE_LIST_PAGES = 100
READ_RETRY_ATTEMPTS = 3
RELEASE_WORKFLOW_PATH = ".github/workflows/release.yml"
PROJECT_ROOT = Path(__file__).resolve().parents[1]
SAFE_NAME_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,191}\Z")
REPOSITORY_RE = re.compile(
    r"[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,98}[A-Za-z0-9])?"
    r"/"
    r"[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,98}[A-Za-z0-9])?\Z"
)
TAG_RE = re.compile(r"v[0-9A-Za-z](?:[0-9A-Za-z._-]{0,126}[0-9A-Za-z])?\Z")
SHA_RE = re.compile(r"[0-9a-f]{40}\Z")
DIGEST_RE = re.compile(r"sha256:[0-9a-f]{64}\Z")
IDENTITY_KEYS = {
    "repository",
    "release_id",
    "tag",
    "target_sha",
    "source_sha",
    "starter_reports",
}
STARTER_KEYS = {"id", "name", "size", "digest"}
REQUIRED_ROLES = {
    "archive",
    "checksum",
    "release-evidence",
    "sbom-web",
    "sbom-python",
    "standard-report",
    "six-port-report",
    "verified-upgrade",
    "archive-safety",
    "release-contract",
    "release-metadata",
}


class ReleaseGateError(ValueError):
    """Raised when the fixed release publication contract is not satisfied."""


@dataclass(frozen=True)
class Asset:
    id: int
    name: str
    size: int
    digest: str | None
    state: str


@dataclass(frozen=True)
class ExpectedAsset:
    name: str
    size: int
    digest: str


@dataclass(frozen=True)
class Identity:
    repository: str
    release_id: int
    tag: str
    target_sha: str
    source_sha: str
    starter_reports: tuple[ExpectedAsset, ExpectedAsset]
    starter_ids: tuple[int, int]

    def document(self) -> dict[str, object]:
        return {
            "repository": self.repository,
            "release_id": self.release_id,
            "tag": self.tag,
            "target_sha": self.target_sha,
            "source_sha": self.source_sha,
            "starter_reports": [
                {
                    "id": asset_id,
                    "name": report.name,
                    "size": report.size,
                    "digest": report.digest,
                }
                for asset_id, report in zip(
                    self.starter_ids, self.starter_reports, strict=True
                )
            ],
        }


@dataclass(frozen=True)
class LocalInventory:
    assets: dict[str, ExpectedAsset]
    roles: dict[str, str]
    metadata_name: str


def fail(message: str) -> NoReturn:
    raise ReleaseGateError(message)


def strict_json(content: bytes, label: str) -> object:
    def pairs(items: list[tuple[str, object]]) -> dict[str, object]:
        result: dict[str, object] = {}
        for key, value in items:
            if key in result:
                fail(f"{label} contains duplicate JSON key {key!r}")
            result[key] = value
        return result

    def constant(value: str) -> object:
        fail(f"{label} contains non-finite JSON value {value!r}")

    try:
        return json.loads(
            content.decode("utf-8"),
            object_pairs_hook=pairs,
            parse_constant=constant,
        )
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ReleaseGateError(f"{label} is not strict UTF-8 JSON: {exc}") from exc


def require_regular_file(path: Path, label: str) -> os.stat_result:
    try:
        metadata = path.lstat()
    except OSError as exc:
        raise ReleaseGateError(f"cannot inspect {label} {path}: {exc}") from exc
    if not stat.S_ISREG(metadata.st_mode) or path.is_symlink():
        fail(f"{label} must be a regular non-symlink file: {path}")
    return metadata


def require_real_directory(path: Path, label: str) -> None:
    try:
        metadata = path.lstat()
    except OSError as exc:
        raise ReleaseGateError(f"cannot inspect {label} {path}: {exc}") from exc
    if not stat.S_ISDIR(metadata.st_mode) or path.is_symlink():
        fail(f"{label} must be a real directory: {path}")


def create_empty_directory(path: Path, label: str) -> None:
    if path.exists() or path.is_symlink():
        require_real_directory(path, label)
        try:
            if any(path.iterdir()):
                fail(f"{label} must be empty: {path}")
        except OSError as exc:
            raise ReleaseGateError(f"cannot inspect {label} {path}: {exc}") from exc
        return
    try:
        path.mkdir(parents=True, mode=0o755)
    except OSError as exc:
        raise ReleaseGateError(f"cannot create {label} {path}: {exc}") from exc
    require_real_directory(path, label)


def hash_file(path: Path, label: str, *, expected_name: str | None = None) -> ExpectedAsset:
    metadata = require_regular_file(path, label)
    name = path.name if expected_name is None else expected_name
    if not SAFE_NAME_RE.fullmatch(name):
        fail(f"{label} has an unsafe basename: {name!r}")
    digest = hashlib.sha256()
    size = 0
    try:
        with path.open("rb") as source:
            while chunk := source.read(1024 * 1024):
                digest.update(chunk)
                size += len(chunk)
    except OSError as exc:
        raise ReleaseGateError(f"cannot hash {label} {path}: {exc}") from exc
    if size != metadata.st_size:
        fail(f"{label} changed while it was hashed: {path}")
    if size < 1:
        fail(f"{label} must not be empty: {path}")
    return ExpectedAsset(name, size, f"sha256:{digest.hexdigest()}")


def version_and_release_name(tag: str) -> tuple[str, str]:
    if not isinstance(tag, str) or not TAG_RE.fullmatch(tag):
        fail("release tag is unsafe or non-canonical")
    version = tag.removeprefix("v")
    return version, f"trex-webui-{version}"


def expected_asset_names(tag: str, starter_names: tuple[str, str]) -> tuple[str, ...]:
    _version, release_name = version_and_release_name(tag)
    generated = (
        f"{release_name}.tar.gz",
        f"{release_name}.tar.gz.sha256",
        f"{release_name}.evidence.json",
        "SBOM.web.cdx.json",
        "SBOM.python.cdx.json",
        f"{release_name}.verified-upgrade.sh",
        f"{release_name}.archive-safety.py",
        f"{release_name}.release-contract.py",
        f"{release_name}.release-metadata.py",
        f"{release_name}.release.json",
    )
    names = (*starter_names, *generated)
    if len(set(names)) != 12 or any(not SAFE_NAME_RE.fullmatch(name) for name in names):
        fail("the two report names and ten generated names must be 12 safe basenames")
    return names


class GitHub:
    def __init__(self, executable: str = "gh") -> None:
        self.executable = executable

    def _run(
        self,
        arguments: list[str],
        *,
        input_bytes: bytes | None = None,
        output_file=None,
        label: str,
        administration: bool = False,
        attempts: int = 1,
    ) -> bytes:
        command = [self.executable, *arguments]
        environment = os.environ.copy()
        admin_token = environment.pop(ADMIN_TOKEN_ENV, None)
        if administration:
            if not admin_token:
                fail(
                    f"{ADMIN_TOKEN_ENV} is required for the immutable-releases "
                    "Administration(read) preflight"
                )
            environment["GH_TOKEN"] = admin_token
        for attempt in range(1, attempts + 1):
            try:
                completed = subprocess.run(
                    command,
                    input=input_bytes,
                    stdout=output_file if output_file is not None else subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    env=environment,
                    check=False,
                )
            except OSError as exc:
                raise ReleaseGateError(f"cannot run {label}: {exc}") from exc
            if completed.returncode == 0:
                if output_file is not None:
                    return b""
                return completed.stdout
            if attempt < attempts:
                time.sleep(0.25 * (2 ** (attempt - 1)))
                continue
            stderr = completed.stderr.decode("utf-8", errors="replace").strip()
            fail(f"{label} failed with status {completed.returncode}: {stderr}")
        raise AssertionError("unreachable subprocess retry state")

    @staticmethod
    def _headers(accept: str) -> list[str]:
        return [
            "-H",
            f"Accept: {accept}",
            "-H",
            f"X-GitHub-Api-Version: {API_VERSION}",
        ]

    def api_json(
        self,
        method: str,
        endpoint: str,
        *,
        body: bytes | None = None,
        label: str,
        administration: bool = False,
    ) -> object:
        arguments = ["api", endpoint, "--method", method, *self._headers(JSON_ACCEPT)]
        if body is not None:
            arguments.extend(["--input", "-"])
        output = self._run(
            arguments,
            input_bytes=body,
            label=label,
            administration=administration,
            attempts=READ_RETRY_ATTEMPTS if method == "GET" else 1,
        )
        return strict_json(output, label)

    def api_no_content(self, method: str, endpoint: str, *, label: str) -> None:
        self._run(
            [
                "api",
                endpoint,
                "--method",
                method,
                *self._headers(JSON_ACCEPT),
                "--silent",
            ],
            label=label,
        )

    def download(self, endpoint: str, target, *, label: str) -> None:
        self._run(
            ["api", endpoint, "--method", "GET", *self._headers(OCTET_ACCEPT)],
            output_file=target,
            label=label,
        )

    def upload(self, upload_url: str, path: Path, *, label: str) -> object:
        output = self._run(
            [
                "api",
                upload_url,
                "--method",
                "POST",
                *self._headers(JSON_ACCEPT),
                "-H",
                "Content-Type: application/octet-stream",
                "--input",
                str(path),
            ],
            label=label,
        )
        return strict_json(output, label)

    def attest(self, path: Path, identity: Identity) -> None:
        signer = f"{identity.repository}/{RELEASE_WORKFLOW_PATH}"
        self._run(
            [
                "attestation",
                "verify",
                str(path),
                "--repo",
                identity.repository,
                "--signer-workflow",
                signer,
                "--source-ref",
                f"refs/tags/{identity.tag}",
                "--source-digest",
                identity.source_sha,
                "--signer-digest",
                identity.source_sha,
                "--deny-self-hosted-runners",
            ],
            label=f"attestation verification for {path.name}",
        )

    def verify_immutable_release(self, identity: Identity) -> None:
        self._run(
            [
                "release",
                "verify",
                identity.tag,
                "--repo",
                identity.repository,
            ],
            label="immutable GitHub release attestation verification",
        )


def release_endpoint(identity: Identity) -> str:
    return f"repos/{identity.repository}/releases/{identity.release_id}"


def resolve_release_by_exact_tag(
    github: GitHub,
    *,
    repository: str,
    tag: str,
) -> object:
    """Resolve drafts and published releases without trusting a mutable tag URL.

    GitHub's ``releases/tags/{tag}`` endpoint does not expose draft releases,
    even to an authenticated repository administrator.  The release workflow
    necessarily starts from a draft, so enumerate the authenticated release
    listing, require one exact tag match, and let the caller immediately pin
    that result to its immutable numeric release ID.

    Duplicate IDs across pages fail closed because they indicate that the
    offset-based listing changed while it was being traversed.  A full final
    page also fails closed rather than claiming uniqueness beyond the bounded
    traversal.
    """

    seen_ids: set[int] = set()
    matched: object | None = None
    for page in range(1, MAX_RELEASE_LIST_PAGES + 1):
        releases = github.api_json(
            "GET",
            (
                f"repos/{repository}/releases"
                f"?per_page={RELEASE_LIST_PAGE_SIZE}&page={page}"
            ),
            label=f"initial release listing page {page}",
        )
        if not isinstance(releases, list):
            fail(f"initial release listing page {page} is not an array")
        for index, release in enumerate(releases):
            label = f"initial release listing page {page} item {index}"
            if not isinstance(release, dict):
                fail(f"{label} is not an object")
            release_id = release.get("id")
            release_tag = release.get("tag_name")
            if (
                isinstance(release_id, bool)
                or not isinstance(release_id, int)
                or release_id < 1
            ):
                fail(f"{label} has an invalid release ID")
            if not isinstance(release_tag, str):
                fail(f"{label} has an invalid tag name")
            if release_id in seen_ids:
                fail("release listing changed during pagination")
            seen_ids.add(release_id)
            if release_tag == tag:
                if matched is not None:
                    fail("release listing contains multiple releases for the exact tag")
                matched = release
        if len(releases) < RELEASE_LIST_PAGE_SIZE:
            break
    else:
        fail("release listing exceeded the bounded exact-tag search")
    if matched is None:
        fail("release listing contains no release for the exact tag")
    return matched


def parse_asset(value: object, label: str) -> Asset:
    if not isinstance(value, dict):
        fail(f"{label} is not an object")
    asset_id = value.get("id")
    name = value.get("name")
    size = value.get("size")
    digest = value.get("digest")
    state = value.get("state")
    if isinstance(asset_id, bool) or not isinstance(asset_id, int) or asset_id < 1:
        fail(f"{label} has an invalid asset ID")
    if not isinstance(name, str) or not SAFE_NAME_RE.fullmatch(name):
        fail(f"{label} has an unsafe or non-canonical name")
    if isinstance(size, bool) or not isinstance(size, int) or size < 0:
        fail(f"{label} has an invalid size")
    if state not in {"uploaded", "starter"}:
        fail(f"{label} has unsupported state {state!r}")
    if state == "uploaded":
        if size < 1 or not isinstance(digest, str) or not DIGEST_RE.fullmatch(digest):
            fail(f"{label} has incomplete uploaded size/digest metadata")
    elif digest is not None and (
        not isinstance(digest, str) or not DIGEST_RE.fullmatch(digest)
    ):
        fail(f"{label} has invalid starter digest metadata")
    return Asset(asset_id, name, size, digest, state)


def parse_assets(release: dict[str, object], allowed_names: set[str]) -> dict[str, Asset]:
    raw_assets = release.get("assets")
    if not isinstance(raw_assets, list):
        fail("release response has no complete asset list")
    if len(raw_assets) > 12:
        fail("release contains more than the exact 12 permitted assets")
    assets: dict[str, Asset] = {}
    ids: set[int] = set()
    for index, value in enumerate(raw_assets):
        asset = parse_asset(value, f"release asset {index}")
        if asset.name not in allowed_names:
            fail(f"release contains unexpected asset {asset.name!r}")
        if asset.name in assets or asset.id in ids:
            fail("release contains duplicate asset names or IDs")
        assets[asset.name] = asset
        ids.add(asset.id)
    return assets


def release_state(release: dict[str, object]) -> str:
    draft = release.get("draft")
    prerelease = release.get("prerelease")
    immutable = release.get("immutable")
    if draft is True and prerelease is True and immutable is False:
        return "draft"
    if draft is False and prerelease is True and immutable is True:
        return "published"
    fail(
        "release must be either a mutable draft prerelease or an immutable "
        "published prerelease"
    )


def validate_release_base(
    release: object,
    identity: Identity,
    *,
    states: set[str],
) -> tuple[str, dict[str, Asset]]:
    if not isinstance(release, dict):
        fail("exact-ID release response is not an object")
    if release.get("id") != identity.release_id:
        fail("exact-ID release response changed release ID")
    if release.get("tag_name") != identity.tag:
        fail("exact-ID release tag changed")
    if release.get("target_commitish") != identity.target_sha:
        fail("exact-ID release target changed or is not pinned to a full source SHA")
    state = release_state(release)
    if state not in states:
        fail(f"release state {state!r} is not allowed for this operation")
    allowed = set(expected_asset_names(identity.tag, starter_names(identity)))
    assets = parse_assets(release, allowed)
    for expected_id, expected in zip(
        identity.starter_ids, identity.starter_reports, strict=True
    ):
        observed = assets.get(expected.name)
        if observed is None:
            fail(f"operator report asset disappeared: {expected.name}")
        if (
            observed.id != expected_id
            or observed.state != "uploaded"
            or observed.size != expected.size
            or observed.digest != expected.digest
        ):
            fail(f"operator report asset identity changed: {expected.name}")
    return state, assets


def normalized_assets(assets: dict[str, Asset]) -> tuple[tuple[object, ...], ...]:
    return tuple(
        sorted(
            (asset.id, asset.name, asset.size, asset.digest, asset.state)
            for asset in assets.values()
        )
    )


def anchor(
    github: GitHub,
    identity: Identity,
    *,
    states: set[str],
) -> tuple[dict[str, object], str, dict[str, Asset]]:
    endpoint = release_endpoint(identity)
    first = github.api_json("GET", endpoint, label="exact-ID release precheck")
    first_state, first_assets = validate_release_base(first, identity, states=states)
    encoded_tag = urllib.parse.quote(identity.tag, safe="")
    commit = github.api_json(
        "GET",
        f"repos/{identity.repository}/commits/{encoded_tag}",
        label="exact tag commit resolution",
    )
    if not isinstance(commit, dict) or commit.get("sha") != identity.source_sha:
        fail("release tag no longer resolves to the fixed source SHA")
    second = github.api_json("GET", endpoint, label="exact-ID release postcheck")
    second_state, second_assets = validate_release_base(second, identity, states=states)
    if first_state != second_state or normalized_assets(first_assets) != normalized_assets(
        second_assets
    ):
        fail("exact-ID release changed during identity recheck")
    assert isinstance(second, dict)
    return second, second_state, second_assets


def check_immutable_setting(github: GitHub, repository: str) -> None:
    setting = github.api_json(
        "GET",
        f"repos/{repository}/immutable-releases",
        label="repository immutable-releases setting",
        administration=True,
    )
    if not isinstance(setting, dict) or setting.get("enabled") is not True:
        fail("repository immutable releases must be enabled before release assembly")


def recheck_immutable_setting(github: GitHub, identity: Identity, states: set[str]) -> None:
    anchor(github, identity, states=states)
    check_immutable_setting(github, identity.repository)
    anchor(github, identity, states=states)


def starter_names(identity: Identity) -> tuple[str, str]:
    return identity.starter_reports[0].name, identity.starter_reports[1].name


def read_identity(path: Path) -> Identity:
    metadata = require_regular_file(path, "release identity")
    if metadata.st_size < 1 or metadata.st_size > 1024 * 1024:
        fail("release identity is empty or too large")
    try:
        document = strict_json(path.read_bytes(), "release identity")
    except OSError as exc:
        raise ReleaseGateError(f"cannot read release identity {path}: {exc}") from exc
    if not isinstance(document, dict) or set(document) != IDENTITY_KEYS:
        fail("release identity shape is invalid")
    repository = document.get("repository")
    release_id = document.get("release_id")
    tag = document.get("tag")
    target_sha = document.get("target_sha")
    source_sha = document.get("source_sha")
    if not isinstance(repository, str) or not REPOSITORY_RE.fullmatch(repository):
        fail("release identity repository is invalid")
    if isinstance(release_id, bool) or not isinstance(release_id, int) or release_id < 1:
        fail("release identity release ID is invalid")
    if not isinstance(tag, str) or not TAG_RE.fullmatch(tag):
        fail("release identity tag is invalid")
    if not isinstance(target_sha, str) or not SHA_RE.fullmatch(target_sha):
        fail("release identity target SHA is invalid")
    if not isinstance(source_sha, str) or not SHA_RE.fullmatch(source_sha):
        fail("release identity source SHA is invalid")
    if target_sha != source_sha:
        fail("release target SHA and source SHA must be identical")
    raw_starters = document.get("starter_reports")
    if not isinstance(raw_starters, list) or len(raw_starters) != 2:
        fail("release identity must contain exactly two starter reports")
    reports: list[ExpectedAsset] = []
    ids: list[int] = []
    for index, value in enumerate(raw_starters):
        if not isinstance(value, dict) or set(value) != STARTER_KEYS:
            fail(f"starter report {index} identity shape is invalid")
        asset = parse_asset({**value, "state": "uploaded"}, f"starter report {index}")
        assert asset.digest is not None
        reports.append(ExpectedAsset(asset.name, asset.size, asset.digest))
        ids.append(asset.id)
    if reports[0].name == reports[1].name or ids[0] == ids[1]:
        fail("starter report names and IDs must be distinct")
    expected_asset_names(tag, (reports[0].name, reports[1].name))
    return Identity(
        repository,
        release_id,
        tag,
        target_sha,
        source_sha,
        (reports[0], reports[1]),
        (ids[0], ids[1]),
    )


def write_identity(path: Path, identity: Identity) -> None:
    if path.exists() or path.is_symlink():
        fail(f"refusing to replace release identity: {path}")
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        require_real_directory(path.parent, "release identity directory")
        content = (
            json.dumps(identity.document(), indent=2, sort_keys=True).encode("utf-8")
            + b"\n"
        )
        with tempfile.NamedTemporaryFile(
            mode="wb", prefix=f".{path.name}.", dir=path.parent, delete=False
        ) as target:
            temporary = Path(target.name)
            target.write(content)
            target.flush()
            os.fsync(target.fileno())
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
    except OSError as exc:
        if "temporary" in locals():
            temporary.unlink(missing_ok=True)
        raise ReleaseGateError(f"cannot persist release identity {path}: {exc}") from exc


def validate_initial_release(
    release: object,
    *,
    repository: str,
    tag: str,
    source_sha: str,
    starter_report_names: tuple[str, str],
) -> tuple[Identity, str]:
    if not isinstance(release, dict):
        fail("tag release response is not an object")
    release_id = release.get("id")
    if isinstance(release_id, bool) or not isinstance(release_id, int) or release_id < 1:
        fail("tag release response has an invalid release ID")
    if release.get("tag_name") != tag:
        fail("tag release response does not match the exact tag")
    if release.get("target_commitish") != source_sha:
        fail("release target_commitish must be the exact full source SHA")
    state = release_state(release)
    allowed = set(expected_asset_names(tag, starter_report_names))
    assets = parse_assets(release, allowed)
    starter_assets: list[Asset] = []
    for name in starter_report_names:
        asset = assets.get(name)
        if asset is None or asset.state != "uploaded" or asset.digest is None:
            fail(f"operator starter report is absent or incomplete: {name}")
        starter_assets.append(asset)
    identity = Identity(
        repository,
        release_id,
        tag,
        source_sha,
        source_sha,
        (
            ExpectedAsset(
                starter_assets[0].name,
                starter_assets[0].size,
                starter_assets[0].digest,
            ),
            ExpectedAsset(
                starter_assets[1].name,
                starter_assets[1].size,
                starter_assets[1].digest,
            ),
        ),
        (starter_assets[0].id, starter_assets[1].id),
    )
    return identity, state


def parse_metadata_inventory(directory: Path, identity: Identity) -> LocalInventory:
    _version, release_name = version_and_release_name(identity.tag)
    metadata_name = f"{release_name}.release.json"
    metadata_path = directory / metadata_name
    metadata = require_regular_file(metadata_path, "release metadata")
    if metadata.st_size < 1 or metadata.st_size > 64 * 1024 * 1024:
        fail("release metadata is empty or too large")
    try:
        document = strict_json(metadata_path.read_bytes(), "release metadata")
    except OSError as exc:
        raise ReleaseGateError(f"cannot read release metadata {metadata_path}: {exc}") from exc
    if not isinstance(document, dict) or set(document) != {
        "schema",
        "release",
        "artifacts",
    }:
        fail("release metadata root shape is invalid")
    release = document.get("release")
    if not isinstance(release, dict):
        fail("release metadata has no release identity")
    expected_release = {
        "repository": identity.repository,
        "release_ref": f"refs/tags/{identity.tag}",
        "release_tag": identity.tag,
        "source_sha": identity.source_sha,
        "signer_workflow": f"{identity.repository}/{RELEASE_WORKFLOW_PATH}",
        "signer_workflow_sha": identity.source_sha,
    }
    for key, expected in expected_release.items():
        if release.get(key) != expected:
            fail(f"release metadata {key} does not match the fixed identity")
    raw_artifacts = document.get("artifacts")
    if not isinstance(raw_artifacts, list) or len(raw_artifacts) != 11:
        fail("release metadata must describe exactly 11 non-metadata assets")
    roles: dict[str, str] = {}
    described: dict[str, ExpectedAsset] = {}
    for index, value in enumerate(raw_artifacts):
        if not isinstance(value, dict) or set(value) != {
            "role",
            "name",
            "sha256",
            "size",
        }:
            fail(f"release metadata artifact {index} shape is invalid")
        role = value.get("role")
        name = value.get("name")
        digest = value.get("sha256")
        size = value.get("size")
        if not isinstance(role, str) or role not in REQUIRED_ROLES or role in roles:
            fail("release metadata contains an unknown or duplicate role")
        if not isinstance(name, str) or not SAFE_NAME_RE.fullmatch(name) or name in described:
            fail("release metadata contains an unsafe or duplicate basename")
        if not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest):
            fail("release metadata contains an invalid digest")
        if isinstance(size, bool) or not isinstance(size, int) or size < 1:
            fail("release metadata contains an invalid size")
        roles[role] = name
        described[name] = ExpectedAsset(name, size, f"sha256:{digest}")
    if set(roles) != REQUIRED_ROLES:
        fail("release metadata artifact role set is incomplete")
    if roles["standard-report"] != identity.starter_reports[0].name:
        fail("release metadata Standard report does not match the persisted starter")
    if roles["six-port-report"] != identity.starter_reports[1].name:
        fail("release metadata six-port report does not match the persisted starter")
    expected_names = set(expected_asset_names(identity.tag, starter_names(identity)))
    if set(described) | {metadata_name} != expected_names:
        fail("release metadata names do not match the exact 12-asset release contract")
    observed: dict[str, ExpectedAsset] = {}
    for name in sorted(expected_names):
        observed[name] = hash_file(directory / name, f"local release asset {name}")
    for name, expected in described.items():
        if observed[name] != expected:
            fail(f"local release asset does not match metadata: {name}")
    for starter in identity.starter_reports:
        if observed[starter.name] != starter:
            fail(f"local operator report changed after identity persistence: {starter.name}")
    return LocalInventory(observed, roles, metadata_name)


def run_local(command: list[str], label: str) -> None:
    environment = os.environ.copy()
    environment.pop(ADMIN_TOKEN_ENV, None)
    environment.pop("GH_TOKEN", None)
    environment.pop("GITHUB_TOKEN", None)
    try:
        completed = subprocess.run(
            command,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            env=environment,
            check=False,
        )
    except OSError as exc:
        raise ReleaseGateError(f"cannot run {label}: {exc}") from exc
    if completed.returncode != 0:
        stderr = completed.stderr.decode("utf-8", errors="replace").strip()
        fail(f"{label} failed with status {completed.returncode}: {stderr}")


def validate_local_contracts(
    directory: Path, identity: Identity, inventory: LocalInventory
) -> None:
    roles = inventory.roles
    policy = [
        "--expected-repository",
        identity.repository,
        "--expected-release-ref",
        f"refs/tags/{identity.tag}",
        "--expected-signer-workflow",
        f"{identity.repository}/{RELEASE_WORKFLOW_PATH}",
    ]
    run_local(
        [
            sys.executable,
            str(PROJECT_ROOT / "scripts" / "release_metadata.py"),
            "verify",
            "--metadata",
            str(directory / inventory.metadata_name),
            "--artifact-dir",
            str(directory),
            *policy,
            "--expected-source-sha",
            identity.source_sha,
        ],
        "release metadata contract verification",
    )
    run_local(
        [
            sys.executable,
            str(PROJECT_ROOT / "scripts" / "release_evidence.py"),
            "verify",
            "--archive",
            str(directory / roles["archive"]),
            "--checksum",
            str(directory / roles["checksum"]),
            "--standard-report",
            str(directory / roles["standard-report"]),
            "--six-port-report",
            str(directory / roles["six-port-report"]),
            "--evidence",
            str(directory / roles["release-evidence"]),
            *policy,
        ],
        "release evidence contract verification",
    )
    run_local(
        [
            sys.executable,
            str(PROJECT_ROOT / "deploy" / "archive_safety.py"),
            str(directory / roles["archive"]),
        ],
        "release archive contract verification",
    )


def require_exact_assets(
    assets: dict[str, Asset], expected: dict[str, ExpectedAsset]
) -> None:
    if set(assets) != set(expected) or len(assets) != 12:
        fail("release does not contain exactly the required 12 assets")
    for name, local in expected.items():
        remote = assets[name]
        if (
            remote.state != "uploaded"
            or remote.size != local.size
            or remote.digest != local.digest
        ):
            fail(f"release asset does not exactly match local bytes: {name}")


def asset_metadata(
    github: GitHub,
    identity: Identity,
    asset: Asset,
    *,
    states: set[str],
) -> Asset:
    _release, _state, before = anchor(github, identity, states=states)
    current = before.get(asset.name)
    if current is None or current.id != asset.id:
        fail(f"asset ID changed before metadata read: {asset.name}")
    document = github.api_json(
        "GET",
        f"repos/{identity.repository}/releases/assets/{asset.id}",
        label=f"asset-ID metadata read for {asset.name}",
    )
    observed = parse_asset(document, f"asset-ID metadata for {asset.name}")
    _release, _state, after = anchor(github, identity, states=states)
    current_after = after.get(asset.name)
    if current_after is None or current_after != observed or observed.id != asset.id:
        fail(f"asset metadata or exact release changed during read: {asset.name}")
    return observed


def download_asset(
    github: GitHub,
    identity: Identity,
    asset: Asset,
    destination: Path,
    *,
    states: set[str],
) -> ExpectedAsset:
    before_metadata = asset_metadata(github, identity, asset, states=states)
    if before_metadata.state != "uploaded" or before_metadata.digest is None:
        fail(f"cannot download incomplete asset {asset.name}")
    if destination.exists() or destination.is_symlink():
        fail(f"refusing to replace downloaded asset: {destination}")
    require_real_directory(destination.parent, "asset download directory")
    _release, _state, assets_before = anchor(github, identity, states=states)
    current = assets_before.get(asset.name)
    if current != before_metadata:
        fail(f"asset changed before asset-ID download: {asset.name}")
    temporary: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w+b", prefix=f".{asset.name}.", dir=destination.parent, delete=False
        ) as target:
            temporary = Path(target.name)
            github.download(
                f"repos/{identity.repository}/releases/assets/{asset.id}",
                target,
                label=f"asset-ID download for {asset.name}",
            )
            target.flush()
            os.fsync(target.fileno())
        _release, _state, assets_after = anchor(github, identity, states=states)
        if assets_after.get(asset.name) != before_metadata:
            fail(f"asset changed during asset-ID download: {asset.name}")
        after_metadata = asset_metadata(github, identity, asset, states=states)
        if after_metadata != before_metadata:
            fail(f"asset metadata changed during download: {asset.name}")
        observed = hash_file(
            temporary,
            f"downloaded asset {asset.name}",
            expected_name=asset.name,
        )
        expected = ExpectedAsset(asset.name, asset.size, asset.digest)
        if observed != expected:
            fail(f"asset-ID download size/digest mismatch: {asset.name}")
        os.chmod(temporary, 0o600)
        os.replace(temporary, destination)
        temporary = None
        return observed
    except OSError as exc:
        raise ReleaseGateError(f"cannot persist downloaded asset {asset.name}: {exc}") from exc
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def download_and_validate_all(
    github: GitHub,
    identity: Identity,
    *,
    states: set[str],
    destination: Path | None = None,
    expected: dict[str, ExpectedAsset] | None = None,
) -> LocalInventory:
    _release, state, assets = anchor(github, identity, states=states)
    if len(assets) != 12 or set(assets) != set(
        expected_asset_names(identity.tag, starter_names(identity))
    ):
        fail("release must contain exactly the fixed 12 asset names before validation")
    if any(asset.state != "uploaded" for asset in assets.values()):
        fail("all 12 assets must be fully uploaded before validation")
    if expected is not None:
        require_exact_assets(assets, expected)

    temporary_context = None
    if destination is None:
        temporary_context = tempfile.TemporaryDirectory(
            prefix="trex-webui-release-verify."
        )
        destination = Path(temporary_context.name)
    else:
        create_empty_directory(destination, "release validation directory")
    try:
        for name in sorted(assets):
            download_asset(
                github,
                identity,
                assets[name],
                destination / name,
                states={state},
            )
        inventory = parse_metadata_inventory(destination, identity)
        require_exact_assets(assets, inventory.assets)
        if expected is not None and inventory.assets != expected:
            fail("downloaded release assets differ from the fixed local artifact set")
        validate_local_contracts(destination, identity, inventory)
        for name in sorted(inventory.assets):
            anchor(github, identity, states={state})
            github.attest(destination / name, identity)
            anchor(github, identity, states={state})
        _release, final_state, final_assets = anchor(
            github, identity, states={state}
        )
        if final_state != state:
            fail("release state changed during final validation")
        require_exact_assets(final_assets, inventory.assets)
        return inventory
    finally:
        if temporary_context is not None:
            temporary_context.cleanup()


def initial_identity(
    github: GitHub,
    *,
    repository: str,
    tag: str,
    source_sha: str,
    report_names: tuple[str, str],
) -> tuple[Identity, str]:
    check_immutable_setting(github, repository)
    encoded_tag = urllib.parse.quote(tag, safe="")
    release = resolve_release_by_exact_tag(
        github,
        repository=repository,
        tag=tag,
    )
    identity, state = validate_initial_release(
        release,
        repository=repository,
        tag=tag,
        source_sha=source_sha,
        starter_report_names=report_names,
    )
    exact = github.api_json(
        "GET", release_endpoint(identity), label="initial exact-ID release resolution"
    )
    validate_release_base(exact, identity, states={state})
    commit = github.api_json(
        "GET",
        f"repos/{repository}/commits/{encoded_tag}",
        label="initial exact tag commit resolution",
    )
    if not isinstance(commit, dict) or commit.get("sha") != source_sha:
        fail("initial release tag does not resolve to the exact source SHA")
    exact_after = github.api_json(
        "GET", release_endpoint(identity), label="initial exact-ID release postcheck"
    )
    _state, first_assets = validate_release_base(exact, identity, states={state})
    _state, after_assets = validate_release_base(
        exact_after, identity, states={state}
    )
    if normalized_assets(first_assets) != normalized_assets(after_assets):
        fail("release assets changed during initial identity resolution")
    return identity, state


def write_outputs(path: Path | None, *, published: bool, release_id: int) -> None:
    if path is None:
        return
    try:
        with path.open("a", encoding="utf-8") as output:
            output.write(f"published={'true' if published else 'false'}\n")
            output.write(f"release_id={release_id}\n")
    except OSError as exc:
        raise ReleaseGateError(f"cannot write GitHub workflow outputs {path}: {exc}") from exc


def command_prepare(args: argparse.Namespace, github: GitHub) -> None:
    repository = args.repository
    tag = args.tag
    source_sha = args.source_sha
    report_names = (args.standard_report_asset, args.six_port_report_asset)
    if not REPOSITORY_RE.fullmatch(repository):
        fail("repository must use safe owner/repository form")
    version_and_release_name(tag)
    if not SHA_RE.fullmatch(source_sha):
        fail("source SHA must be a full lowercase 40-character commit ID")
    expected_asset_names(tag, report_names)
    identity_path = Path(args.identity)
    if identity_path.exists() or identity_path.is_symlink():
        identity = read_identity(identity_path)
        if (
            identity.repository != repository
            or identity.tag != tag
            or identity.source_sha != source_sha
            or starter_names(identity) != report_names
        ):
            fail("existing persisted identity does not match prepare arguments")
        _release, state, _assets = anchor(
            github, identity, states={"draft", "published"}
        )
        recheck_immutable_setting(github, identity, {state})
    else:
        identity, state = initial_identity(
            github,
            repository=repository,
            tag=tag,
            source_sha=source_sha,
            report_names=report_names,
        )
        write_identity(identity_path, identity)
        anchor(github, identity, states={state})
        recheck_immutable_setting(github, identity, {state})

    if state == "published":
        download_and_validate_all(
            github,
            identity,
            states={"published"},
            destination=Path(args.artifact_dir),
        )
    else:
        starter_dir = Path(args.starter_dir)
        create_empty_directory(starter_dir, "operator starter report directory")
        _release, _state, assets = anchor(github, identity, states={"draft"})
        for expected in identity.starter_reports:
            asset = assets[expected.name]
            observed = download_asset(
                github,
                identity,
                asset,
                starter_dir / asset.name,
                states={"draft"},
            )
            if observed != expected:
                fail(f"downloaded operator report changed: {asset.name}")
    write_outputs(
        Path(args.github_output) if args.github_output else None,
        published=state == "published",
        release_id=identity.release_id,
    )


def upload_url(release: dict[str, object], identity: Identity, name: str) -> str:
    raw = release.get("upload_url")
    if not isinstance(raw, str) or not raw.endswith("{?name,label}"):
        fail("exact-ID release response has no canonical upload URL template")
    base = raw.removesuffix("{?name,label}")
    parsed = urllib.parse.urlsplit(base)
    expected_path = (
        f"/repos/{identity.repository}/releases/{identity.release_id}/assets"
    )
    if (
        parsed.scheme != "https"
        or parsed.hostname != "uploads.github.com"
        or parsed.username is not None
        or parsed.password is not None
        or parsed.port is not None
        or parsed.path != expected_path
        or parsed.query
        or parsed.fragment
    ):
        fail("release upload URL is not bound to the exact repository and release ID")
    return f"{base}?{urllib.parse.urlencode({'name': name})}"


def validate_uploaded_response(
    value: object, expected: ExpectedAsset, *, label: str
) -> Asset:
    asset = parse_asset(value, label)
    if (
        asset.name != expected.name
        or asset.state != "uploaded"
        or asset.size != expected.size
        or asset.digest != expected.digest
    ):
        fail(f"{label} does not match the uploaded local bytes")
    return asset


def command_upload(args: argparse.Namespace, github: GitHub) -> None:
    identity = read_identity(Path(args.identity))
    directory = Path(args.artifact_dir)
    require_real_directory(directory, "release artifact directory")
    inventory = parse_metadata_inventory(directory, identity)
    validate_local_contracts(directory, identity, inventory)
    release, state, assets = anchor(
        github, identity, states={"draft", "published"}
    )
    if state == "published":
        download_and_validate_all(
            github,
            identity,
            states={"published"},
            expected=inventory.assets,
        )
        return
    recheck_immutable_setting(github, identity, {"draft"})

    actions: list[tuple[str, ExpectedAsset, Asset | None]] = []
    for name in sorted(inventory.assets):
        expected = inventory.assets[name]
        current = assets.get(name)
        if current is None:
            actions.append(("absent", expected, None))
        elif current.state == "starter":
            actions.append(("starter", expected, current))
        elif current.size == expected.size and current.digest == expected.digest:
            actions.append(("uploaded-exact", expected, current))
        else:
            fail(f"same-name uploaded asset does not match local bytes: {name}")

    for classification, expected, observed in actions:
        if classification == "uploaded-exact":
            continue
        if classification == "starter":
            assert observed is not None
            _release, _state, current_assets = anchor(
                github, identity, states={"draft"}
            )
            current = current_assets.get(expected.name)
            if current != observed or current.state != "starter":
                fail(f"starter asset changed before exact-ID cleanup: {expected.name}")
            github.api_no_content(
                "DELETE",
                f"repos/{identity.repository}/releases/assets/{current.id}",
                label=f"exact asset-ID starter cleanup for {expected.name}",
            )
            release, _state, current_assets = anchor(
                github, identity, states={"draft"}
            )
            if expected.name in current_assets:
                fail(f"starter asset still exists after exact-ID cleanup: {expected.name}")
        else:
            release, _state, current_assets = anchor(
                github, identity, states={"draft"}
            )
            if expected.name in current_assets:
                fail(f"absent asset appeared before upload: {expected.name}")

        response = github.upload(
            upload_url(release, identity, expected.name),
            directory / expected.name,
            label=f"exact release-ID upload for {expected.name}",
        )
        uploaded = validate_uploaded_response(
            response, expected, label=f"upload response for {expected.name}"
        )
        _release, _state, current_assets = anchor(
            github, identity, states={"draft"}
        )
        if current_assets.get(expected.name) != uploaded:
            fail(f"exact release asset does not match upload response: {expected.name}")

    _release, _state, final_assets = anchor(github, identity, states={"draft"})
    require_exact_assets(final_assets, inventory.assets)


def command_verify(args: argparse.Namespace, github: GitHub) -> None:
    identity = read_identity(Path(args.identity))
    directory = Path(args.artifact_dir)
    require_real_directory(directory, "release artifact directory")
    inventory = parse_metadata_inventory(directory, identity)
    validate_local_contracts(directory, identity, inventory)
    _release, state, _assets = anchor(
        github, identity, states={"draft", "published"}
    )
    download_and_validate_all(
        github, identity, states={state}, expected=inventory.assets
    )


def patch_publish(
    github: GitHub,
    identity: Identity,
    expected: dict[str, ExpectedAsset],
) -> None:
    _release, _state, assets = anchor(github, identity, states={"draft"})
    require_exact_assets(assets, expected)
    body = json.dumps(
        {"draft": False, "prerelease": True},
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    response = github.api_json(
        "PATCH",
        release_endpoint(identity),
        body=body,
        label="exact release-ID prerelease publication",
    )
    validate_release_base(response, identity, states={"published"})
    # A failure after PATCH is intentionally recoverable: the next invocation
    # sees an immutable published prerelease and performs validation only.
    anchor(github, identity, states={"published"})


def command_publish(args: argparse.Namespace, github: GitHub) -> None:
    identity = read_identity(Path(args.identity))
    directory = Path(args.artifact_dir)
    require_real_directory(directory, "release artifact directory")
    inventory = parse_metadata_inventory(directory, identity)
    validate_local_contracts(directory, identity, inventory)
    _release, state, _assets = anchor(
        github, identity, states={"draft", "published"}
    )
    recheck_immutable_setting(github, identity, {state})
    download_and_validate_all(
        github, identity, states={state}, expected=inventory.assets
    )
    if state == "draft":
        patch_publish(github, identity, inventory.assets)
    _release, final_state, final_assets = anchor(
        github, identity, states={"published"}
    )
    if final_state != "published":
        fail("release publication did not produce an immutable prerelease")
    require_exact_assets(final_assets, inventory.assets)
    anchor(github, identity, states={"published"})
    github.verify_immutable_release(identity)
    anchor(github, identity, states={"published"})


def common_identity_argument(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--identity", required=True)


def common_artifact_arguments(parser: argparse.ArgumentParser) -> None:
    common_identity_argument(parser)
    parser.add_argument("--artifact-dir", required=True)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Publish one exact-ID, exact-source, immutable GitHub prerelease"
    )
    parser.add_argument(
        "--gh-executable",
        default=os.environ.get("TREX_RELEASE_GH", "gh"),
        help=argparse.SUPPRESS,
    )
    subparsers = parser.add_subparsers(dest="command", required=True)
    prepare = subparsers.add_parser("prepare")
    prepare.add_argument("--repository", required=True)
    prepare.add_argument("--tag", required=True)
    prepare.add_argument("--source-sha", required=True)
    prepare.add_argument("--standard-report-asset", required=True)
    prepare.add_argument("--six-port-report-asset", required=True)
    common_identity_argument(prepare)
    prepare.add_argument("--starter-dir", required=True)
    prepare.add_argument("--artifact-dir", required=True)
    prepare.add_argument("--github-output")
    for command in ("upload", "verify", "publish"):
        common_artifact_arguments(subparsers.add_parser(command))
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    github = GitHub(args.gh_executable)
    try:
        if args.command == "prepare":
            command_prepare(args, github)
        elif args.command == "upload":
            command_upload(args, github)
        elif args.command == "verify":
            command_verify(args, github)
        else:
            command_publish(args, github)
        return 0
    except ReleaseGateError as exc:
        print(f"GitHub release gate error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
