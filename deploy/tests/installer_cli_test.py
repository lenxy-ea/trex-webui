from __future__ import annotations

import importlib.machinery
import importlib.util
import json
import subprocess
import sys
from argparse import Namespace
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
INSTALLER = PROJECT_ROOT / "deploy" / "trex-webui"


def load_installer():
    loader = importlib.machinery.SourceFileLoader("trex_webui_installer", str(INSTALLER))
    spec = importlib.util.spec_from_loader(loader.name, loader)
    assert spec is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[loader.name] = module
    loader.exec_module(module)
    return module


installer = load_installer()


def test_doctor_json_has_stable_contract() -> None:
    result = subprocess.run(
        [
            str(INSTALLER),
            "doctor",
            "--mode",
            "external-daemon",
            "--format",
            "json",
        ],
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode in {0, 2}
    payload = json.loads(result.stdout)
    assert payload["schema_version"] == 1
    assert payload["command"] == "doctor"
    assert payload["operation"] == "install"
    assert payload["mode"] == "external-daemon"
    assert payload["status"] in {"ready", "blocked"}
    assert sum(payload["summary"].values()) == len(payload["checks"])
    assert {item["status"] for item in payload["checks"]} <= {
        "pass",
        "warn",
        "block",
    }


def test_management_cidr_is_canonical_and_never_opens_everywhere() -> None:
    checks = []
    installer.add_network_check(checks, "192.0.2.0/24")
    assert checks == [
        installer.Check(
            "network.management_cidr",
            "pass",
            "Management network",
            "192.0.2.0/24",
        )
    ]

    checks = []
    installer.add_network_check(checks, "0.0.0.0/0")
    assert checks[0].status == "block"

    checks = []
    installer.add_network_check(checks, "192.0.2.1/24")
    assert checks[0].status == "block"


def test_existing_management_allowlist_is_reported_as_retained(
    tmp_path: Path, monkeypatch
) -> None:
    allowlist = tmp_path / "management.conf"
    allowlist.write_text("allow 192.0.2.0/24;\n", encoding="utf-8")
    monkeypatch.setattr(installer, "MANAGEMENT_ALLOWLIST", allowlist)
    checks = []
    installer.add_network_check(checks, None)
    assert checks == [
        installer.Check(
            "network.management_cidr",
            "pass",
            "Management network",
            f"existing Nginx allowlist will be retained: {allowlist}",
        )
    ]


def test_explicit_config_rejects_untrusted_paths_and_links(tmp_path: Path) -> None:
    config = tmp_path / "trex_cfg.yaml"
    config.write_text("- version: 2\n  interfaces: []\n", encoding="utf-8")
    assert installer.plain_file_error(config, require_root_authority=False) is None
    checks = []
    installer.add_config_check(checks, config)
    assert checks[0].status == "block"

    linked = tmp_path / "linked.yaml"
    linked.symlink_to(config)
    checks = []
    installer.add_config_check(checks, linked)
    assert checks[0].status == "block"


def test_release_document_runs_downloaded_bootstrap_through_bash() -> None:
    release_doc = (PROJECT_ROOT / "docs" / "RELEASE.md").read_text(encoding="utf-8")
    assert 'bash "$release_dir/trex-webui-<version>.verified-upgrade.sh"' in release_doc


def mutation_args(tmp_path: Path, command: str = "install") -> Namespace:
    archive = tmp_path / "trex-webui.tar.gz"
    archive.write_bytes(b"fixture")
    return Namespace(
        command=command,
        archive=archive,
        checkout=False,
        sha256="a" * 64,
        mode="managed-local",
        trex_root=Path("/opt/trex-core"),
        trex_config=None,
        allow_cidr="192.0.2.0/24",
        open_firewall=True,
        allow_daemon_runtime_restart=False,
        verify_trex=False,
        dry_run=True,
        base_url="http://127.0.0.1",
        output_format="text",
    )


def test_release_install_plan_uses_transaction_engine_and_safe_defaults(
    tmp_path: Path, monkeypatch
) -> None:
    monkeypatch.setattr(installer.shutil, "which", lambda name: f"/usr/bin/{name}")
    args = mutation_args(tmp_path)
    command = installer.mutation_command(args)
    assert command[0].endswith("/deploy/upgrade.sh")
    assert command[1:3] == ["--archive", str(args.archive)]
    assert "--install-python-deps" in command
    assert "--verify" in command
    assert "--skip-build" not in command
    assert command[command.index("--allow-cidr") + 1] == "192.0.2.0/24"
    assert "--firewalld" in command


def test_release_install_plan_rejects_malformed_sha256(tmp_path: Path) -> None:
    args = mutation_args(tmp_path)
    args.sha256 = "not-a-digest"
    try:
        installer.mutation_command(args)
    except ValueError as exc:
        assert "64 hexadecimal" in str(exc)
    else:
        raise AssertionError("malformed digest was accepted")


def test_checkout_install_is_explicit_development_path(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(installer.shutil, "which", lambda name: f"/usr/bin/{name}")
    args = mutation_args(tmp_path)
    args.archive = None
    args.checkout = True
    args.sha256 = None
    command = installer.mutation_command(args)
    assert command[0].endswith("/deploy/install.sh")
    assert "--archive" not in command


def test_selected_release_verify_hides_internal_selector_arguments(monkeypatch) -> None:
    selected = Path("/opt/trex-webui/releases/" + "sha256-" + "a" * 64)
    monkeypatch.setattr(installer, "selector_target", lambda _path: selected)
    args = Namespace(
        base_url="http://127.0.0.1", external_daemon=False, trex=False
    )
    command = installer.verify_command(args)
    assert command[0] == str(selected / "deploy" / "verify.sh")
    assert command[command.index("--project-root") + 1] == str(selected)
    assert command[command.index("--service-project-root") + 1] == str(
        installer.CURRENT_SELECTOR
    )
    assert command[command.index("--web-root") + 1] == str(
        selected / "apps" / "web" / "dist"
    )


def test_low_level_upgrade_forwards_operator_inputs_to_candidate_installer() -> None:
    script = r'''
set -Eeuo pipefail
source "$1/deploy/upgrade.sh"
parse_args --trex-config /etc/trex_cfg.yaml --allow-cidr 192.0.2.0/24
install_args | tr '\0' '\n'
'''
    result = subprocess.run(
        ["bash", "-c", script, "installer-test", str(PROJECT_ROOT)],
        check=True,
        capture_output=True,
        text=True,
    )
    arguments = result.stdout.splitlines()
    assert arguments[arguments.index("--trex-config") + 1] == "/etc/trex_cfg.yaml"
    assert arguments[arguments.index("--allow-cidr") + 1] == "192.0.2.0/24"


def test_low_level_cidr_contract_rejects_open_internet() -> None:
    script = r'''
set -Eeuo pipefail
source "$1/deploy/install.sh"
MANAGEMENT_CIDR=0.0.0.0/0
validate_management_cidr
'''
    result = subprocess.run(
        ["bash", "-c", script, "installer-test", str(PROJECT_ROOT)],
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode != 0
    assert "narrow trusted subnet" in result.stderr


def test_config_import_uses_existing_atomic_rollback_contract(tmp_path: Path) -> None:
    script = r'''
set -Eeuo pipefail
source "$1/deploy/install.sh"
trap - EXIT
SERVICE_USER="$(id -un)"
SERVICE_GROUP="$(id -gn)"
SERVICE_STATE_ROOT="$2/state"
SERVICE_CONFIG_PATH="$SERVICE_STATE_ROOT/trex_cfg.yaml"
TREX_CONFIG_IMPORT="$2/import.yaml"
MANAGEMENT_CIDR=""
mkdir -p "$SERVICE_STATE_ROOT"
printf 'old\n' >"$SERVICE_CONFIG_PATH"
printf 'new\n' >"$TREX_CONFIG_IMPORT"
install_operator_inputs
[[ "$(cat "$SERVICE_CONFIG_PATH")" == new ]]
restore_config_target "$SERVICE_CONFIG_PATH" "imported TRex configuration" \
  STATE_CONFIG_IMPORT_BACKUP STATE_CONFIG_IMPORT_EXISTED STATE_CONFIG_IMPORT_PUBLISHED
[[ "$(cat "$SERVICE_CONFIG_PATH")" == old ]]
'''
    subprocess.run(
        ["bash", "-c", script, "installer-test", str(PROJECT_ROOT), str(tmp_path)],
        check=True,
        capture_output=True,
        text=True,
    )


def test_management_allowlist_uses_existing_atomic_rollback_contract(tmp_path: Path) -> None:
    script = r'''
set -Eeuo pipefail
source "$1/deploy/install.sh"
trap - EXIT
NGINX_CONFIG_OWNER="$(id -un)"
NGINX_CONFIG_GROUP="$(id -gn)"
NGINX_ACCESS_ROOT="$2/access.d"
NGINX_MANAGEMENT_ALLOWLIST_TARGET="$NGINX_ACCESS_ROOT/management.conf"
TREX_CONFIG_IMPORT=""
MANAGEMENT_CIDR="192.0.2.0/24"
mkdir -p "$NGINX_ACCESS_ROOT"
printf 'allow 198.51.100.0/24;\n' >"$NGINX_MANAGEMENT_ALLOWLIST_TARGET"
install_operator_inputs
[[ "$(cat "$NGINX_MANAGEMENT_ALLOWLIST_TARGET")" == 'allow 192.0.2.0/24;' ]]
restore_config_target "$NGINX_MANAGEMENT_ALLOWLIST_TARGET" "Nginx management allowlist" \
  NGINX_ALLOWLIST_BACKUP NGINX_ALLOWLIST_EXISTED NGINX_ALLOWLIST_PUBLISHED
[[ "$(cat "$NGINX_MANAGEMENT_ALLOWLIST_TARGET")" == 'allow 198.51.100.0/24;' ]]
'''
    subprocess.run(
        ["bash", "-c", script, "installer-test", str(PROJECT_ROOT), str(tmp_path)],
        check=True,
        capture_output=True,
        text=True,
    )


def test_new_operator_inputs_finalize_without_rollback_artifacts(tmp_path: Path) -> None:
    script = r'''
set -Eeuo pipefail
source "$1/deploy/install.sh"
trap - EXIT
SERVICE_USER="$(id -un)"
SERVICE_GROUP="$(id -gn)"
NGINX_CONFIG_OWNER="$(id -un)"
NGINX_CONFIG_GROUP="$(id -gn)"
SERVICE_STATE_ROOT="$2/state"
SERVICE_CONFIG_PATH="$SERVICE_STATE_ROOT/trex_cfg.yaml"
NGINX_ACCESS_ROOT="$2/access.d"
NGINX_MANAGEMENT_ALLOWLIST_TARGET="$NGINX_ACCESS_ROOT/management.conf"
TREX_CONFIG_IMPORT="$2/import.yaml"
MANAGEMENT_CIDR="192.0.2.0/24"
mkdir -p "$SERVICE_STATE_ROOT" "$NGINX_ACCESS_ROOT"
printf 'new\n' >"$TREX_CONFIG_IMPORT"
install_operator_inputs
finalize_configs
[[ "$(cat "$SERVICE_CONFIG_PATH")" == new ]]
[[ "$(cat "$NGINX_MANAGEMENT_ALLOWLIST_TARGET")" == 'allow 192.0.2.0/24;' ]]
[[ -z "$STATE_CONFIG_IMPORT_BACKUP" && -z "$NGINX_ALLOWLIST_BACKUP" ]]
[[ "$STATE_CONFIG_IMPORT_PUBLISHED" -eq 0 && "$NGINX_ALLOWLIST_PUBLISHED" -eq 0 ]]
! find "$SERVICE_STATE_ROOT" "$NGINX_ACCESS_ROOT" -name '*.rollback.*' -print -quit | grep -q .
'''
    subprocess.run(
        ["bash", "-c", script, "installer-test", str(PROJECT_ROOT), str(tmp_path)],
        check=True,
        capture_output=True,
        text=True,
    )


def test_structured_blocked_mutation_keeps_requested_command(monkeypatch, capsys) -> None:
    args = Namespace(
        command="upgrade",
        mode="managed-local",
        trex_root=Path("/opt/trex-core"),
        trex_config=None,
        allow_cidr=None,
        output_format="json",
    )
    blocker = installer.Check("host.os", "block", "Host operating system", "unsupported")
    monkeypatch.setattr(installer, "doctor_for_mutation", lambda *_args: [blocker])
    assert installer.run_mutation(args) == 2
    payload = json.loads(capsys.readouterr().out)
    assert payload["command"] == "upgrade"
    assert payload["status"] == "blocked"
    assert payload["preflight"]["command"] == "doctor"
    assert payload["preflight"]["summary"]["block"] == 1


def test_structured_engine_failure_has_actionable_summary(monkeypatch, capsys) -> None:
    args = Namespace(
        command="upgrade",
        mode="managed-local",
        dry_run=False,
        output_format="json",
    )
    monkeypatch.setattr(installer.os, "geteuid", lambda: 0)
    monkeypatch.setattr(
        installer.subprocess,
        "run",
        lambda *_args, **_kwargs: subprocess.CompletedProcess(
            ["engine"], 7, "preparing\n", "detail\nfinal remedy\n"
        ),
    )
    result = installer.run_operator_command(
        args,
        ["engine", "--verified"],
        preflight={"pass": 8, "warn": 1, "block": 0},
    )
    assert result == 7
    payload = json.loads(capsys.readouterr().out)
    assert payload["command"] == "upgrade"
    assert payload["status"] == "failed"
    assert payload["exit_code"] == 7
    assert payload["preflight"] == {"pass": 8, "warn": 1, "block": 0}
    assert payload["error"] == {
        "kind": "engine_failed",
        "message": "final remedy",
    }


def test_offline_managed_trex_uses_safe_restart_proof_for_capture_quiescence(
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        installer,
        "selector_target",
        lambda _selector: Path("/opt/trex-webui/releases/" + "sha256-" + "a" * 64),
    )

    def response(url: str):
        if url.endswith("/api/health"):
            return {"status": "ok"}
        if url.endswith("/api/trex/traffic/runtime"):
            return {
                "ok": True,
                "data": {"session": {"state": "stopped"}, "mutation_intent": None},
            }
        if url.endswith("/api/trex/capture/status"):
            return {"ok": False, "blocker": "trex_connect_failed"}
        if url.endswith("/api/trex/quick-validation"):
            return {"ok": True, "data": {"active": False, "recovery_required": False}}
        raise AssertionError(f"unexpected URL: {url}")

    monkeypatch.setattr(installer, "http_json", response)
    monkeypatch.setattr(installer, "managed_daemon_safe_restart", lambda: True)
    checks = []
    installer.add_runtime_quiescence_checks(checks, "upgrade", "managed-local")
    capture = next(item for item in checks if item.check_id == "runtime.capture")
    assert capture.status == "pass"
    assert "no active recorder" in capture.detail


def test_low_level_upgrade_recognizes_exact_current_archive_as_idempotent(
    tmp_path: Path,
) -> None:
    script = r'''
set -Eeuo pipefail
source "$1/deploy/upgrade.sh"
trap - EXIT
digest="$(printf 'a%.0s' {1..64})"
INSTALL_ROOT="$2/opt/trex-webui"
mkdir -p "$INSTALL_ROOT/releases/sha256-$digest"
ln -s "releases/sha256-$digest" "$INSTALL_ROOT/current"
ARCHIVE="$2/release.tar.gz"
ARCHIVE_PAYLOAD_DIGEST="$digest"
SERVICE_CONFIG_PATH="$2/trex_cfg.yaml"
TREX_CONFIG_IMPORT="$SERVICE_CONFIG_PATH"
printf 'port_limit: 6\n' >"$SERVICE_CONFIG_PATH"
NGINX_MANAGEMENT_ALLOWLIST_TARGET="$2/management.conf"
MANAGEMENT_CIDR="192.0.2.0/24"
printf 'allow 192.0.2.0/24;\n' >"$NGINX_MANAGEMENT_ALLOWLIST_TARGET"
INSTALL_NGINX=0
RUN_SELINUX=0
RUN_FIREWALLD=0
archive_is_verified_current_noop
MANAGEMENT_CIDR="198.51.100.0/24"
! archive_is_verified_current_noop
'''
    subprocess.run(
        ["bash", "-c", script, "installer-test", str(PROJECT_ROOT), str(tmp_path)],
        check=True,
        capture_output=True,
        text=True,
    )


def test_rollback_idle_overview_accepts_only_explicit_managed_daemon_idle() -> None:
    payload = {
        "environment": {
            "host": "127.0.0.1",
            "daemon_supervisor": "systemd",
            "host_valid": True,
            "scripts_dir_path_valid": True,
            "daemon_bin_path_valid": True,
            "config_path_valid": True,
            "runtime_state_path_valid": True,
            "daemon_generation_path_valid": True,
            "configuration_errors": {},
        },
        "daemon_status": {
            "ok": True,
            "running": True,
            "blocker": None,
            "error": None,
        },
        "trex_probe": {
            "ok": False,
            "blocker": "trex_connect_failed",
            "error": "native RPC is offline",
        },
        "trex_ports": {
            "ok": False,
            "blocker": "trex_connect_failed",
            "error": "native RPC is offline",
        },
    }
    command = r'''
set -Eeuo pipefail
source "$1/deploy/upgrade.sh"
trap - EXIT
validate_managed_daemon_idle_overview
'''
    accepted = subprocess.run(
        ["bash", "-c", command, "installer-test", str(PROJECT_ROOT)],
        input=json.dumps(payload),
        check=False,
        capture_output=True,
        text=True,
    )
    assert accepted.returncode == 0

    payload["daemon_status"]["running"] = False
    rejected = subprocess.run(
        ["bash", "-c", command, "installer-test", str(PROJECT_ROOT)],
        input=json.dumps(payload),
        check=False,
        capture_output=True,
        text=True,
    )
    assert rejected.returncode != 0
    assert "daemon_status is not healthy and running" in rejected.stderr


def test_rollback_runtime_accepts_only_explicit_managed_native_offline_state() -> None:
    runtime = {
        "ok": True,
        "data": {
            "session": {"state": "stopped"},
            "mutation_intent": None,
            "available_ports": [0, 1],
            "port_states": [
                {"port": 0, "state": "unknown", "ownership": "none"},
                {"port": 1, "state": "unknown", "ownership": "none"},
            ],
            "live_state_sampled": False,
            "reconciliation": "live TRex port state unavailable: native RPC is offline",
        },
        "blocker": None,
        "error": None,
    }
    capture = {
        "ok": False,
        "data": {"connected": False, "partial_client_disposed": True},
        "blocker": "trex_connect_failed",
        "error": "native RPC is offline",
    }
    quick_validation = {
        "ok": True,
        "data": {"active": False, "recovery_required": False},
    }
    command = r'''
set -Eeuo pipefail
source "$1/deploy/upgrade.sh"
trap - EXIT
validate_previous_release_runtime_evidence "$2" "$3" "$4" "$5"
'''

    def validate(mode: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [
                "bash",
                "-c",
                command,
                "installer-test",
                str(PROJECT_ROOT),
                json.dumps(runtime),
                json.dumps(capture),
                json.dumps(quick_validation),
                mode,
            ],
            check=False,
            capture_output=True,
            text=True,
        )

    accepted = validate("managed-local")
    assert accepted.returncode == 0
    assert accepted.stdout.strip() == "offline"

    strict = validate("strict")
    assert strict.returncode != 0
    assert "did not sample live state" in strict.stderr

    capture["blocker"] = "unknown"
    malformed = validate("managed-local")
    assert malformed.returncode != 0
    assert "explicit native-TRex-offline result" in malformed.stderr
