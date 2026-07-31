#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
import uuid
from unittest import mock


PROJECT_ROOT = Path(__file__).resolve().parents[2]
SUPERVISOR_PATH = PROJECT_ROOT / "deploy" / "trex_daemon_supervisor.py"
SPEC = importlib.util.spec_from_file_location("trex_webui_daemon_supervisor", SUPERVISOR_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"cannot load {SUPERVISOR_PATH}")
SUPERVISOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SUPERVISOR)


class DaemonSupervisorTest(unittest.TestCase):
    def setUp(self) -> None:
        self.original_grace = SUPERVISOR.REAP_GRACE_SECONDS
        self.original_kill = SUPERVISOR.KILL_REAP_SECONDS
        SUPERVISOR.REAP_GRACE_SECONDS = 0.15
        SUPERVISOR.KILL_REAP_SECONDS = 0.5

    def tearDown(self) -> None:
        SUPERVISOR.REAP_GRACE_SECONDS = self.original_grace
        SUPERVISOR.KILL_REAP_SECONDS = self.original_kill

    def test_join_reaps_an_exited_child(self) -> None:
        class Session:
            def __init__(self, process: subprocess.Popen[bytes]) -> None:
                self.session = process

            def join(self, timeout: float | None = 5, with_tb: bool = False) -> str:
                return "joined"

        SUPERVISOR.install_session_reaper(Session)
        process = subprocess.Popen(
            [sys.executable, "-c", "import os; os._exit(0)"],
            start_new_session=True,
        )
        pid = process.pid
        time.sleep(0.05)
        self.assertEqual(Session(process).join(), "joined")
        self.assertIsNotNone(process.returncode)
        self.assertFalse(Path(f"/proc/{pid}").exists())

    def test_join_kills_only_the_child_owned_process_group(self) -> None:
        class Session:
            def __init__(self, process: subprocess.Popen[bytes]) -> None:
                self.session = process

            def join(self, timeout: float | None = 5, with_tb: bool = False) -> None:
                return None

        SUPERVISOR.install_session_reaper(Session)
        process = subprocess.Popen(
            [sys.executable, "-c", "import time; time.sleep(60)"],
            start_new_session=True,
        )
        pid = process.pid
        Session(process).join()
        self.assertEqual(process.returncode, -9)
        self.assertFalse(Path(f"/proc/{pid}").exists())

    def test_reaper_refuses_a_foreign_process_group(self) -> None:
        process = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(60)"])
        try:
            with self.assertRaisesRegex(
                SUPERVISOR.SupervisorError,
                "refusing to signal unexpected TRex process group",
            ):
                SUPERVISOR._reap_process(process)
            self.assertIsNone(process.poll())
        finally:
            process.terminate()
            process.wait(timeout=2)

    def test_sigterm_handler_closes_without_same_thread_shutdown(self) -> None:
        class RpcServer:
            def __init__(self) -> None:
                self.closed = False
                self.shutdown_called = False

            def server_close(self) -> None:
                self.closed = True

            def shutdown(self) -> None:
                self.shutdown_called = True

        class TrexServer:
            def __init__(self) -> None:
                self.server = RpcServer()

            def stop_handler(self, *_args: object, **_kwargs: object) -> None:
                raise SystemExit(0)

        SUPERVISOR.install_signal_shutdown_fix(TrexServer)
        instance = TrexServer()
        with self.assertRaises(SystemExit):
            instance.stop_handler()
        self.assertTrue(instance.server.closed)
        instance.server.shutdown()
        self.assertFalse(instance.server.shutdown_called)

    def test_fake_upstream_reuses_patched_modules_through_runpy(self) -> None:
        with tempfile.TemporaryDirectory(prefix="trex-supervisor-test.") as temporary:
            root = Path(temporary)
            server_root = root / "automation" / "trex_control_plane" / "server"
            server_root.mkdir(parents=True)
            (root / "external_libs").mkdir()
            (server_root / "outer_packages.py").write_text("", encoding="utf-8")
            (server_root / "trex_launch_thread.py").write_text(
                "class AsynchronousTRexSession:\n"
                "    def join(self, timeout=5, with_tb=False):\n"
                "        return None\n",
                encoding="utf-8",
            )
            (server_root / "trex_server.py").write_text(
                "from trex_launch_thread import AsynchronousTRexSession\n"
                "class CTRexServer:\n"
                "    def stop_handler(self, *args, **kwargs):\n"
                "        raise SystemExit(0)\n",
                encoding="utf-8",
            )
            output = root / "result.json"
            daemon = root / "trex_daemon_server"
            daemon.write_text(
                "import json, os\n"
                "from pathlib import Path\n"
                "import trex_launch_thread, trex_server\n"
                "payload = {\n"
                "  'same_class': trex_server.AsynchronousTRexSession is "
                "trex_launch_thread.AsynchronousTRexSession,\n"
                "  'join_marker': getattr(trex_launch_thread.AsynchronousTRexSession.join, "
                "'_trex_webui_supervisor', None),\n"
                "  'stop_marker': getattr(trex_server.CTRexServer.stop_handler, "
                "'_trex_webui_supervisor', None),\n"
                "}\n"
                "Path(os.environ['TREX_SUPERVISOR_TEST_OUTPUT']).write_text("
                "json.dumps(payload), encoding='utf-8')\n",
                encoding="utf-8",
            )
            daemon.chmod(0o755)
            generation_path = root / "daemon-generation"
            with (
                mock.patch.object(os, "geteuid", return_value=0),
                mock.patch.object(SUPERVISOR, "assert_root_controlled_tree"),
                mock.patch.dict(os.environ, {"TREX_SUPERVISOR_TEST_OUTPUT": str(output)}),
            ):
                result = SUPERVISOR.main(
                    [
                        "--daemon-bin",
                        str(daemon),
                        "--generation-file",
                        str(generation_path),
                        "--",
                        "--trex-host",
                        "127.0.0.1",
                        "start-live",
                    ]
                )
            self.assertEqual(result, 0)
            payload = json.loads(output.read_text(encoding="utf-8"))
            self.assertTrue(payload["same_class"])
            self.assertEqual(payload["join_marker"], SUPERVISOR.MANAGED_MARKER)
            self.assertEqual(payload["stop_marker"], SUPERVISOR.MANAGED_MARKER)
            generation = generation_path.read_text(encoding="ascii").strip()
            self.assertEqual(str(uuid.UUID(generation)), generation)
            self.assertEqual(generation_path.stat().st_mode & 0o777, 0o644)
            self.assertEqual(generation_path.stat().st_uid, 0)

    def test_root_controlled_tree_accepts_owned_read_only_code(self) -> None:
        with tempfile.TemporaryDirectory(prefix="trex-supervisor-trust.") as temporary:
            root = Path(temporary)
            code = root / "server" / "module.py"
            code.parent.mkdir()
            code.write_text("SAFE = True\n", encoding="utf-8")
            code.chmod(0o644)

            SUPERVISOR.assert_root_controlled_tree(
                root,
                "test tree",
                expected_uid=os.getuid(),
                ancestor_root=root,
            )

    def test_root_controlled_tree_rejects_group_writable_code(self) -> None:
        with tempfile.TemporaryDirectory(prefix="trex-supervisor-trust.") as temporary:
            root = Path(temporary)
            code = root / "module.py"
            code.write_text("UNSAFE = True\n", encoding="utf-8")
            code.chmod(0o664)

            with self.assertRaisesRegex(
                SUPERVISOR.SupervisorError,
                "writable by group or other",
            ):
                SUPERVISOR.assert_root_controlled_tree(
                    root,
                    "test tree",
                    expected_uid=os.getuid(),
                    ancestor_root=root,
                )

    def test_root_controlled_tree_rejects_an_untrusted_owner(self) -> None:
        with tempfile.TemporaryDirectory(prefix="trex-supervisor-trust.") as temporary:
            root = Path(temporary)
            (root / "module.py").write_text("UNSAFE = True\n", encoding="utf-8")

            with self.assertRaisesRegex(
                SUPERVISOR.SupervisorError,
                "not owned by root",
            ):
                SUPERVISOR.assert_root_controlled_tree(
                    root,
                    "test tree",
                    expected_uid=os.getuid() + 1,
                    ancestor_root=root,
                )

    def test_root_controlled_tree_rejects_a_linked_directory(self) -> None:
        with tempfile.TemporaryDirectory(prefix="trex-supervisor-trust.") as temporary:
            root = Path(temporary)
            target = root / "target"
            target.mkdir()
            (root / "linked").symlink_to(target, target_is_directory=True)

            with self.assertRaisesRegex(
                SUPERVISOR.SupervisorError,
                "must point to a regular file",
            ):
                SUPERVISOR.assert_root_controlled_tree(
                    root,
                    "test tree",
                    expected_uid=os.getuid(),
                    ancestor_root=root,
                )

    def test_generation_changes_atomically_for_each_supervisor_start(self) -> None:
        with tempfile.TemporaryDirectory(prefix="trex-supervisor-generation.") as temporary:
            generation_path = Path(temporary) / "daemon-generation"

            first = SUPERVISOR.publish_daemon_generation(generation_path)
            second = SUPERVISOR.publish_daemon_generation(generation_path)

            self.assertNotEqual(first, second)
            self.assertEqual(
                generation_path.read_text(encoding="ascii"),
                f"{second}\n",
            )
            self.assertEqual(
                list(generation_path.parent.glob(".daemon-generation.*")),
                [],
            )

    def test_generation_publish_rejects_symlink_target(self) -> None:
        with tempfile.TemporaryDirectory(prefix="trex-supervisor-generation.") as temporary:
            root = Path(temporary)
            target = root / "target"
            target.write_text("untouched\n", encoding="ascii")
            generation_path = root / "daemon-generation"
            generation_path.symlink_to(target)

            with self.assertRaisesRegex(
                SUPERVISOR.SupervisorError,
                "non-symlink regular file",
            ):
                SUPERVISOR.publish_daemon_generation(generation_path)

            self.assertEqual(target.read_text(encoding="ascii"), "untouched\n")

    def test_generation_publish_rejects_writable_parent(self) -> None:
        with tempfile.TemporaryDirectory(prefix="trex-supervisor-generation.") as temporary:
            root = Path(temporary)
            root.chmod(0o777)
            try:
                with self.assertRaisesRegex(
                    SUPERVISOR.SupervisorError,
                    "must not be writable by group or other",
                ):
                    SUPERVISOR.publish_daemon_generation(root / "daemon-generation")
            finally:
                root.chmod(0o700)


if __name__ == "__main__":
    unittest.main()
