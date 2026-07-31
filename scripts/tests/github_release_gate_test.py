from __future__ import annotations

import base64
import hashlib
import importlib.util
import json
import os
import stat
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest


PROJECT_ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location(
    "trex_webui_github_release_gate_test",
    PROJECT_ROOT / "scripts" / "github_release_gate.py",
)
assert spec is not None
assert spec.loader is not None
gate = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = gate
spec.loader.exec_module(gate)


REPOSITORY = "lenxy-ea/trex-webui"
TAG = "v0.1.0-rc.2"
SOURCE_SHA = "1" * 40
STANDARD = "standard-e2e-fixture.json"
SIX_PORT = "six-port-e2e-fixture.json"


FAKE_GH = r'''#!/usr/bin/env python3
import base64
import hashlib
import json
import os
import sys
import urllib.parse
from pathlib import Path

state_path = Path(os.environ["FAKE_GH_STATE"])
log_path = Path(os.environ["FAKE_GH_LOG"])
state = json.loads(state_path.read_text(encoding="utf-8"))

if "RELEASE_ADMIN_TOKEN" in os.environ:
    die_message = "admin token leaked as its original environment variable"
    print(die_message, file=sys.stderr)
    raise SystemExit(92)

def save():
    state_path.write_text(json.dumps(state, sort_keys=True) + "\n", encoding="utf-8")

def log(payload):
    with log_path.open("a", encoding="utf-8") as target:
        target.write(json.dumps(payload, sort_keys=True) + "\n")

def die(message, status=1):
    print(message, file=sys.stderr)
    raise SystemExit(status)

def release_asset(asset):
    return {key: asset.get(key) for key in ("id", "name", "size", "digest", "state")}

def release():
    return {
        "id": state["release_id"],
        "tag_name": state["tag"],
        "target_commitish": state["target_sha"],
        "draft": state["draft"],
        "prerelease": state["prerelease"],
        "immutable": state["immutable"],
        "upload_url": (
            f"https://uploads.github.com/repos/{state['repository']}"
            f"/releases/{state['release_id']}/assets{{?name,label}}"
        ),
        "assets": [release_asset(asset) for asset in state["assets"]],
    }

def flag_value(name, default=None):
    try:
        return sys.argv[sys.argv.index(name) + 1]
    except ValueError:
        return default

if sys.argv[1:3] == ["attestation", "verify"]:
    if os.environ.get("GH_TOKEN") != "contents-token":
        die("attestation did not use the contents token", 93)
    log({"kind": "attestation", "argv": sys.argv[1:]})
    raise SystemExit(0)

if sys.argv[1:3] == ["release", "verify"]:
    if os.environ.get("GH_TOKEN") != "contents-token":
        die("release verification did not use the contents token", 94)
    log({"kind": "release-verify", "argv": sys.argv[1:]})
    raise SystemExit(0)

if len(sys.argv) < 3 or sys.argv[1] != "api":
    die("unsupported fake gh invocation", 90)

endpoint = sys.argv[2]
method = flag_value("--method", "GET")
accept = ""
for index, value in enumerate(sys.argv):
    if value == "-H" and index + 1 < len(sys.argv) and sys.argv[index + 1].startswith("Accept:"):
        accept = sys.argv[index + 1]
repository = state["repository"]
release_prefix = f"repos/{repository}/releases/"
asset_prefix = f"repos/{repository}/releases/assets/"

if endpoint == f"repos/{repository}/immutable-releases":
    if os.environ.get("GH_TOKEN") != "admin-read-token":
        die("immutable setting read did not use the admin token", 95)
elif os.environ.get("GH_TOKEN") != "contents-token":
    die("release operation did not use the contents token", 96)

if method == "GET" and endpoint == f"repos/{repository}/immutable-releases":
    if state.get("immutable_forbidden"):
        die("HTTP 403 Administration(read) required", 43)
    print(json.dumps({"enabled": state["immutable_enabled"], "enforced_by_owner": False}))
    raise SystemExit(0)

if method == "GET" and endpoint == f"repos/{repository}/commits/{state['tag']}":
    print(json.dumps({"sha": state["tag_sha"]}))
    raise SystemExit(0)

if method == "GET" and endpoint == f"repos/{repository}/releases/tags/{state['tag']}":
    print(json.dumps(release()))
    raise SystemExit(0)

if endpoint.startswith(asset_prefix):
    asset_id = int(endpoint.removeprefix(asset_prefix))
    asset = next((item for item in state["assets"] if item["id"] == asset_id), None)
    if asset is None:
        die("asset not found", 44)
    if method == "GET" and "application/octet-stream" in accept:
        log({"kind": "download", "asset_id": asset_id, "name": asset["name"]})
        sys.stdout.buffer.write(base64.b64decode(asset["content"]))
        raise SystemExit(0)
    if method == "GET":
        print(json.dumps(release_asset(asset)))
        raise SystemExit(0)
    if method == "DELETE":
        if state["immutable"]:
            die("immutable release", 45)
        state["assets"] = [item for item in state["assets"] if item["id"] != asset_id]
        state["mutations"].append({"method": "DELETE", "asset_id": asset_id})
        save()
        raise SystemExit(0)

if endpoint.startswith(release_prefix) and not endpoint.startswith(asset_prefix):
    suffix = endpoint.removeprefix(release_prefix)
    if not suffix.isdigit() or int(suffix) != state["release_id"]:
        die("release not found", 44)
    if method == "GET":
        print(json.dumps(release()))
        raise SystemExit(0)
    if method == "PATCH":
        payload = json.load(sys.stdin)
        if payload != {"draft": False, "prerelease": True}:
            die("invalid patch", 46)
        state["draft"] = False
        state["prerelease"] = True
        state["immutable"] = True
        state["mutations"].append({"method": "PATCH", "release_id": state["release_id"]})
        save()
        if state.get("fail_after_patch"):
            die("simulated runner failure after successful PATCH", 73)
        print(json.dumps(release()))
        raise SystemExit(0)

parsed = urllib.parse.urlsplit(endpoint)
expected_upload_path = f"/repos/{repository}/releases/{state['release_id']}/assets"
if method == "POST" and parsed.scheme == "https" and parsed.netloc == "uploads.github.com":
    if parsed.path != expected_upload_path or state["immutable"]:
        die("upload URL is not the mutable exact release", 47)
    name = urllib.parse.parse_qs(parsed.query).get("name", [None])[0]
    if not name or any(asset["name"] == name for asset in state["assets"]):
        die("duplicate upload", 48)
    source_path = flag_value("--input")
    if source_path in (None, "-"):
        die("upload did not use a file input", 49)
    content = Path(source_path).read_bytes()
    asset = {
        "id": state["next_asset_id"],
        "name": name,
        "size": len(content),
        "digest": "sha256:" + hashlib.sha256(content).hexdigest(),
        "state": "uploaded",
        "content": base64.b64encode(content).decode("ascii"),
    }
    state["next_asset_id"] += 1
    state["assets"].append(asset)
    state["mutations"].append({"method": "POST", "name": name})
    save()
    print(json.dumps(release_asset(asset)))
    raise SystemExit(0)

die(f"unsupported fake API operation: {method} {endpoint}", 91)
'''


def digest(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def make_local_release(tmp_path: Path) -> tuple[Path, gate.Identity, gate.LocalInventory]:
    directory = tmp_path / "release"
    directory.mkdir()
    release_name = "trex-webui-0.1.0-rc.2"
    role_names = {
        "archive": f"{release_name}.tar.gz",
        "checksum": f"{release_name}.tar.gz.sha256",
        "release-evidence": f"{release_name}.evidence.json",
        "sbom-web": "SBOM.web.cdx.json",
        "sbom-python": "SBOM.python.cdx.json",
        "standard-report": STANDARD,
        "six-port-report": SIX_PORT,
        "verified-upgrade": f"{release_name}.verified-upgrade.sh",
        "archive-safety": f"{release_name}.archive-safety.py",
        "release-contract": f"{release_name}.release-contract.py",
        "release-metadata": f"{release_name}.release-metadata.py",
    }
    for role, name in role_names.items():
        (directory / name).write_bytes(f"{role} fixed bytes\n".encode())
    standard = gate.hash_file(directory / STANDARD, "fixture Standard report")
    six_port = gate.hash_file(directory / SIX_PORT, "fixture six-port report")
    identity = gate.Identity(
        REPOSITORY,
        101,
        TAG,
        SOURCE_SHA,
        SOURCE_SHA,
        (standard, six_port),
        (201, 202),
    )
    artifacts = []
    for role, name in sorted(role_names.items()):
        path = directory / name
        artifacts.append(
            {
                "role": role,
                "name": name,
                "sha256": digest(path.read_bytes()),
                "size": path.stat().st_size,
            }
        )
    metadata = {
        "schema": "trex-webui-release-metadata/v1",
        "release": {
            "version": "0.1.0-rc.2",
            "repository": REPOSITORY,
            "release_ref": f"refs/tags/{TAG}",
            "release_tag": TAG,
            "source_sha": SOURCE_SHA,
            "signer_workflow": f"{REPOSITORY}/.github/workflows/release.yml",
            "signer_workflow_sha": SOURCE_SHA,
        },
        "artifacts": artifacts,
    }
    write_json(directory / f"{release_name}.release.json", metadata)
    inventory = gate.parse_metadata_inventory(directory, identity)
    return directory, identity, inventory


def remote_asset(
    expected: gate.ExpectedAsset,
    asset_id: int,
    content: bytes,
    *,
    state: str = "uploaded",
    metadata_digest: str | None = None,
) -> dict[str, object]:
    return {
        "id": asset_id,
        "name": expected.name,
        "size": len(content) if state == "uploaded" else 0,
        "digest": (
            metadata_digest
            if metadata_digest is not None
            else expected.digest if state == "uploaded" else None
        ),
        "state": state,
        "content": base64.b64encode(content if state == "uploaded" else b"").decode(
            "ascii"
        ),
    }


def base_state(
    directory: Path,
    identity: gate.Identity,
    inventory: gate.LocalInventory,
    names: set[str],
) -> dict[str, object]:
    assets = []
    next_id = 300
    for name in sorted(names):
        if name == STANDARD:
            asset_id = 201
        elif name == SIX_PORT:
            asset_id = 202
        else:
            asset_id = next_id
            next_id += 1
        assets.append(
            remote_asset(inventory.assets[name], asset_id, (directory / name).read_bytes())
        )
    return {
        "repository": REPOSITORY,
        "release_id": identity.release_id,
        "tag": TAG,
        "target_sha": SOURCE_SHA,
        "tag_sha": SOURCE_SHA,
        "draft": True,
        "prerelease": True,
        "immutable": False,
        "immutable_enabled": True,
        "assets": assets,
        "next_asset_id": 500,
        "mutations": [],
        "fail_after_patch": False,
        "immutable_forbidden": False,
    }


def fake_environment(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, state: dict[str, object]
) -> tuple[gate.GitHub, Path, Path]:
    fake = tmp_path / "gh"
    fake.write_text(FAKE_GH, encoding="utf-8")
    fake.chmod(fake.stat().st_mode | stat.S_IXUSR)
    state_path = tmp_path / "fake-gh-state.json"
    log_path = tmp_path / "fake-gh.log"
    write_json(state_path, state)
    log_path.write_text("", encoding="utf-8")
    monkeypatch.setenv("FAKE_GH_STATE", str(state_path))
    monkeypatch.setenv("FAKE_GH_LOG", str(log_path))
    monkeypatch.setenv("GH_TOKEN", "contents-token")
    monkeypatch.setenv(gate.ADMIN_TOKEN_ENV, "admin-read-token")
    return gate.GitHub(str(fake)), state_path, log_path


def load_state(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_identity(path: Path, identity: gate.Identity) -> None:
    write_json(path, identity.document())


def command_args(identity_path: Path, directory: Path) -> SimpleNamespace:
    return SimpleNamespace(identity=str(identity_path), artifact_dir=str(directory))


@pytest.fixture(autouse=True)
def skip_expensive_local_contracts(monkeypatch: pytest.MonkeyPatch) -> None:
    # These contracts have dedicated suites.  This suite isolates the GitHub
    # state machine while still parsing and digest-binding the complete metadata.
    monkeypatch.setattr(gate, "validate_local_contracts", lambda *_args: None)


def test_prepare_persists_exact_release_id_and_downloads_starters_by_asset_id(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    directory, identity, inventory = make_local_release(tmp_path)
    state = base_state(
        directory, identity, inventory, {STANDARD, SIX_PORT}
    )
    github, state_path, _log = fake_environment(tmp_path, monkeypatch, state)
    identity_path = tmp_path / "identity.json"
    output_path = tmp_path / "output"
    output_path.write_text("", encoding="utf-8")
    args = SimpleNamespace(
        repository=REPOSITORY,
        tag=TAG,
        source_sha=SOURCE_SHA,
        standard_report_asset=STANDARD,
        six_port_report_asset=SIX_PORT,
        identity=str(identity_path),
        starter_dir=str(tmp_path / "qualification"),
        artifact_dir=str(tmp_path / "published-assets"),
        github_output=str(output_path),
    )

    gate.command_prepare(args, github)

    persisted = gate.read_identity(identity_path)
    assert persisted == identity
    assert (tmp_path / "qualification" / STANDARD).read_bytes() == (
        directory / STANDARD
    ).read_bytes()
    assert (tmp_path / "qualification" / SIX_PORT).read_bytes() == (
        directory / SIX_PORT
    ).read_bytes()
    assert output_path.read_text(encoding="utf-8") == "published=false\nrelease_id=101\n"
    assert load_state(state_path)["mutations"] == []


def test_prepare_fails_before_any_release_read_when_admin_token_is_missing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    directory, identity, inventory = make_local_release(tmp_path)
    state = base_state(directory, identity, inventory, {STANDARD, SIX_PORT})
    github, state_path, log_path = fake_environment(tmp_path, monkeypatch, state)
    monkeypatch.delenv(gate.ADMIN_TOKEN_ENV)
    args = SimpleNamespace(
        repository=REPOSITORY,
        tag=TAG,
        source_sha=SOURCE_SHA,
        standard_report_asset=STANDARD,
        six_port_report_asset=SIX_PORT,
        identity=str(tmp_path / "identity.json"),
        starter_dir=str(tmp_path / "qualification"),
        artifact_dir=str(tmp_path / "published-assets"),
        github_output=None,
    )

    with pytest.raises(gate.ReleaseGateError, match=r"Administration\(read\)"):
        gate.command_prepare(args, github)

    assert load_state(state_path)["mutations"] == []
    assert log_path.read_text(encoding="utf-8") == ""


@pytest.mark.parametrize("failure", ["disabled", "forbidden"])
def test_prepare_fails_closed_when_immutable_preflight_is_not_proven(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, failure: str
) -> None:
    directory, identity, inventory = make_local_release(tmp_path)
    state = base_state(directory, identity, inventory, {STANDARD, SIX_PORT})
    if failure == "disabled":
        state["immutable_enabled"] = False
    else:
        state["immutable_forbidden"] = True
    github, state_path, _log = fake_environment(tmp_path, monkeypatch, state)
    identity_path = tmp_path / "identity.json"
    args = SimpleNamespace(
        repository=REPOSITORY,
        tag=TAG,
        source_sha=SOURCE_SHA,
        standard_report_asset=STANDARD,
        six_port_report_asset=SIX_PORT,
        identity=str(identity_path),
        starter_dir=str(tmp_path / "qualification"),
        artifact_dir=str(tmp_path / "published-assets"),
        github_output=None,
    )

    with pytest.raises(gate.ReleaseGateError, match="immutable|403"):
        gate.command_prepare(args, github)

    assert not identity_path.exists()
    assert load_state(state_path)["mutations"] == []


@pytest.mark.parametrize("change", ["release-id", "target", "tag"])
def test_fixed_identity_rejects_recreated_release_retarget_and_tag_move(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, change: str
) -> None:
    directory, identity, inventory = make_local_release(tmp_path)
    identity_path = tmp_path / "identity.json"
    write_identity(identity_path, identity)
    state = base_state(directory, identity, inventory, {STANDARD, SIX_PORT})
    if change == "release-id":
        state["release_id"] = 999
    elif change == "target":
        state["target_sha"] = "2" * 40
    else:
        state["tag_sha"] = "3" * 40
    github, state_path, _log = fake_environment(tmp_path, monkeypatch, state)

    with pytest.raises(gate.ReleaseGateError):
        gate.command_upload(command_args(identity_path, directory), github)

    assert load_state(state_path)["mutations"] == []


def test_partial_upload_rerun_uploads_only_missing_and_exact_rerun_is_noop(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    directory, identity, inventory = make_local_release(tmp_path)
    identity_path = tmp_path / "identity.json"
    write_identity(identity_path, identity)
    generated = sorted(set(inventory.assets) - {STANDARD, SIX_PORT})
    present = {STANDARD, SIX_PORT, *generated[:3]}
    state = base_state(directory, identity, inventory, present)
    github, state_path, _log = fake_environment(tmp_path, monkeypatch, state)

    gate.command_upload(command_args(identity_path, directory), github)
    after_first = load_state(state_path)
    posts = [item for item in after_first["mutations"] if item["method"] == "POST"]
    assert {item["name"] for item in posts} == set(generated[3:])
    assert len(after_first["assets"]) == 12

    gate.command_upload(command_args(identity_path, directory), github)
    after_second = load_state(state_path)
    assert after_second["mutations"] == after_first["mutations"]


def test_same_name_uploaded_mismatch_fails_without_clobber(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    directory, identity, inventory = make_local_release(tmp_path)
    identity_path = tmp_path / "identity.json"
    write_identity(identity_path, identity)
    generated = sorted(set(inventory.assets) - {STANDARD, SIX_PORT})
    state = base_state(directory, identity, inventory, {STANDARD, SIX_PORT})
    wrong = inventory.assets[generated[0]]
    state["assets"].append(remote_asset(wrong, 333, b"different uploaded bytes\n"))
    github, state_path, _log = fake_environment(tmp_path, monkeypatch, state)

    with pytest.raises(gate.ReleaseGateError, match="same-name uploaded asset"):
        gate.command_upload(command_args(identity_path, directory), github)

    assert load_state(state_path)["mutations"] == []


def test_starter_placeholder_is_deleted_by_asset_id_then_reuploaded(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    directory, identity, inventory = make_local_release(tmp_path)
    identity_path = tmp_path / "identity.json"
    write_identity(identity_path, identity)
    generated = sorted(set(inventory.assets) - {STANDARD, SIX_PORT})
    state = base_state(directory, identity, inventory, set(inventory.assets))
    target = generated[0]
    state["assets"] = [asset for asset in state["assets"] if asset["name"] != target]
    state["assets"].append(
        remote_asset(inventory.assets[target], 777, b"", state="starter")
    )
    github, state_path, _log = fake_environment(tmp_path, monkeypatch, state)

    gate.command_upload(command_args(identity_path, directory), github)

    mutations = load_state(state_path)["mutations"]
    assert mutations[0] == {"method": "DELETE", "asset_id": 777}
    assert mutations[1] == {"method": "POST", "name": target}


def test_patch_success_runner_failure_rerun_only_final_validates(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    directory, identity, inventory = make_local_release(tmp_path)
    identity_path = tmp_path / "identity.json"
    write_identity(identity_path, identity)
    state = base_state(directory, identity, inventory, set(inventory.assets))
    state["fail_after_patch"] = True
    github, state_path, log_path = fake_environment(tmp_path, monkeypatch, state)

    with pytest.raises(gate.ReleaseGateError, match="simulated runner failure"):
        gate.command_publish(command_args(identity_path, directory), github)
    published = load_state(state_path)
    assert published["draft"] is False
    assert published["immutable"] is True
    assert [item["method"] for item in published["mutations"]] == ["PATCH"]

    published["fail_after_patch"] = False
    write_json(state_path, published)
    gate.command_publish(command_args(identity_path, directory), github)
    final = load_state(state_path)
    assert [item["method"] for item in final["mutations"]] == ["PATCH"]
    logged = [
        json.loads(line) for line in log_path.read_text(encoding="utf-8").splitlines()
    ]
    attestation_calls = [item for item in logged if item["kind"] == "attestation"]
    assert len(attestation_calls) == 24
    for call in attestation_calls:
        argv = call["argv"]
        assert argv[0:2] == ["attestation", "verify"]
        for flag in (
            "--repo",
            "--signer-workflow",
            "--source-ref",
            "--source-digest",
            "--signer-digest",
            "--deny-self-hosted-runners",
        ):
            assert flag in argv
    release_verifications = [
        item for item in logged if item["kind"] == "release-verify"
    ]
    assert [item["argv"] for item in release_verifications] == [
        ["release", "verify", TAG, "--repo", REPOSITORY]
    ]


def test_fresh_runner_recovers_published_release_via_prepare_then_final_validation(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    directory, identity, inventory = make_local_release(tmp_path)
    state = base_state(directory, identity, inventory, set(inventory.assets))
    state["draft"] = False
    state["immutable"] = True
    github, state_path, log_path = fake_environment(tmp_path, monkeypatch, state)
    identity_path = tmp_path / "fresh-identity.json"
    starter_dir = tmp_path / "unused-starters"
    artifact_dir = tmp_path / "fresh-published-assets"
    output_path = tmp_path / "output"
    output_path.write_text("", encoding="utf-8")
    prepare = SimpleNamespace(
        repository=REPOSITORY,
        tag=TAG,
        source_sha=SOURCE_SHA,
        standard_report_asset=STANDARD,
        six_port_report_asset=SIX_PORT,
        identity=str(identity_path),
        starter_dir=str(starter_dir),
        artifact_dir=str(artifact_dir),
        github_output=str(output_path),
    )

    gate.command_prepare(prepare, github)

    assert gate.read_identity(identity_path) == identity
    assert set(path.name for path in artifact_dir.iterdir()) == set(inventory.assets)
    assert not starter_dir.exists()
    assert output_path.read_text(encoding="utf-8") == "published=true\nrelease_id=101\n"
    assert load_state(state_path)["mutations"] == []

    gate.command_publish(command_args(identity_path, artifact_dir), github)

    final = load_state(state_path)
    assert final["draft"] is False
    assert final["immutable"] is True
    assert final["mutations"] == []
    logged = [
        json.loads(line) for line in log_path.read_text(encoding="utf-8").splitlines()
    ]
    assert len([item for item in logged if item["kind"] == "download"]) == 24
    assert len([item for item in logged if item["kind"] == "attestation"]) == 24
    assert [item["argv"] for item in logged if item["kind"] == "release-verify"] == [
        ["release", "verify", TAG, "--repo", REPOSITORY]
    ]


def test_publish_patch_rechecks_all_exact_asset_identities_immediately_before_write(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    directory, identity, inventory = make_local_release(tmp_path)
    state = base_state(directory, identity, inventory, set(inventory.assets))
    target = next(asset for asset in state["assets"] if asset["name"] not in {STANDARD, SIX_PORT})
    target["digest"] = "sha256:" + "9" * 64
    github, state_path, _log = fake_environment(tmp_path, monkeypatch, state)

    with pytest.raises(gate.ReleaseGateError, match="does not exactly match"):
        gate.patch_publish(github, identity, inventory.assets)

    observed = load_state(state_path)
    assert observed["draft"] is True
    assert observed["immutable"] is False
    assert observed["mutations"] == []


def test_asset_id_download_rejects_metadata_digest_content_mismatch(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    directory, identity, inventory = make_local_release(tmp_path)
    identity_path = tmp_path / "identity.json"
    write_identity(identity_path, identity)
    state = base_state(directory, identity, inventory, set(inventory.assets))
    target = next(asset for asset in state["assets"] if asset["name"] not in {STANDARD, SIX_PORT})
    target["content"] = base64.b64encode(b"downloaded bytes do not match metadata\n").decode(
        "ascii"
    )
    github, state_path, _log = fake_environment(tmp_path, monkeypatch, state)

    with pytest.raises(gate.ReleaseGateError, match="download size/digest mismatch"):
        gate.command_verify(command_args(identity_path, directory), github)

    assert load_state(state_path)["mutations"] == []


def test_gate_uses_subprocess_argv_and_prohibits_mutable_release_cli_shortcuts() -> None:
    content = (gate.PROJECT_ROOT / "scripts" / "github_release_gate.py").read_text(
        encoding="utf-8"
    )
    assert "shell=True" not in content
    assert "shell = True" not in content
    assert "subprocess.run(" in content
    for prohibited in (
        "gh release upload",
        "gh release edit",
        "gh release create",
        "--clobber",
    ):
        assert prohibited not in content
    assert gate.API_VERSION == "2026-03-10"


def test_local_contract_subprocess_receives_no_github_tokens(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    output = tmp_path / "validator-env.json"
    monkeypatch.setenv("GH_TOKEN", "contents-token")
    monkeypatch.setenv("GITHUB_TOKEN", "actions-token")
    monkeypatch.setenv(gate.ADMIN_TOKEN_ENV, "admin-read-token")

    gate.run_local(
        [
            sys.executable,
            "-c",
            (
                "import json, os, pathlib; "
                f"pathlib.Path({str(output)!r}).write_text(json.dumps(dict(os.environ)))"
            ),
        ],
        "environment isolation probe",
    )

    environment = json.loads(output.read_text(encoding="utf-8"))
    assert "GH_TOKEN" not in environment
    assert "GITHUB_TOKEN" not in environment
    assert gate.ADMIN_TOKEN_ENV not in environment
