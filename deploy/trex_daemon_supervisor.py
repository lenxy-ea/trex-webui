#!/usr/bin/env python3
# Managed by TRex WebUI deploy/install.sh.
"""Run the upstream TRex daemon with bounded process-lifecycle fixes.

TRex v3.08 leaves the launched ``t-rex-64`` Popen unreaped when a stop
request is handled, and its SIGTERM path calls ``BaseServer.shutdown`` from
the serving thread.  The former leaves a zombie and pinned hugepages; the
latter deadlocks service shutdown.  This launcher applies narrow,
fail-closed compatibility patches before executing the unmodified upstream
daemon entry point in the same foreground process.
"""

from __future__ import annotations

import functools
import importlib
import os
from pathlib import Path
import runpy
import signal
import stat
import subprocess
import sys
import tempfile
import uuid
from types import ModuleType
from typing import Any, Callable, Sequence


MANAGED_MARKER = "trex-webui-daemon-supervisor-v1"
REAP_GRACE_SECONDS = 5.0
KILL_REAP_SECONDS = 5.0


class SupervisorError(RuntimeError):
    """The upstream daemon cannot be supervised safely."""


def assert_root_controlled_tree(
    tree: Path,
    label: str,
    *,
    expected_uid: int = 0,
    ancestor_root: Path = Path("/"),
) -> None:
    """Reject code that a less-privileged account can replace before import.

    ``ancestor_root`` and ``expected_uid`` are injectable only for isolated
    unit tests. Production callers intentionally use the root-owned filesystem
    hierarchy as the trust boundary.
    """

    if not tree.is_absolute() or not ancestor_root.is_absolute():
        raise SupervisorError(f"{label} and its trust boundary must be absolute paths")
    tree_parts = tree.parts
    boundary_parts = ancestor_root.parts
    if tree_parts[: len(boundary_parts)] != boundary_parts:
        raise SupervisorError(f"{label} escaped its trust boundary: {tree}")

    def inspect(
        path: Path,
        *,
        allow_link: bool = False,
    ) -> os.stat_result:
        try:
            metadata = path.lstat()
        except OSError as exc:
            raise SupervisorError(f"cannot inspect {label} path {path}: {exc}") from exc
        if metadata.st_uid != expected_uid:
            raise SupervisorError(f"{label} path is not owned by root: {path}")
        if stat.S_ISLNK(metadata.st_mode):
            if allow_link:
                return metadata
            raise SupervisorError(f"{label} has a symbolic-link path component: {path}")
        if stat.S_IMODE(metadata.st_mode) & 0o022:
            raise SupervisorError(f"{label} path is writable by group or other: {path}")
        return metadata

    for index in range(len(boundary_parts), len(tree_parts) + 1):
        path = Path(*tree_parts[:index])
        metadata = inspect(path)
        if not stat.S_ISDIR(metadata.st_mode):
            raise SupervisorError(f"{label} path component is not a directory: {path}")

    def walk_error(exc: OSError) -> None:
        raise SupervisorError(f"cannot walk {label}: {exc}") from exc

    for directory, directory_names, file_names in os.walk(
        tree,
        topdown=True,
        followlinks=False,
        onerror=walk_error,
    ):
        directory_path = Path(directory)
        for name in [*directory_names, *file_names]:
            path = directory_path / name
            metadata = inspect(path, allow_link=True)
            if stat.S_ISLNK(metadata.st_mode):
                target = Path(os.path.realpath(path))
                existing = target
                while not os.path.lexists(existing):
                    parent = existing.parent
                    if parent == existing:
                        raise SupervisorError(
                            f"{label} symbolic link has no inspectable target parent: {path}"
                        )
                    existing = parent
                existing_parts = existing.parts
                if existing_parts[: len(boundary_parts)] != boundary_parts:
                    raise SupervisorError(
                        f"{label} symbolic link escaped its trust boundary: {path}"
                    )
                for index in range(len(boundary_parts), len(existing_parts) + 1):
                    component = Path(*existing_parts[:index])
                    target_metadata = inspect(component)
                    if index < len(existing_parts) and not stat.S_ISDIR(
                        target_metadata.st_mode
                    ):
                        raise SupervisorError(
                            f"{label} symbolic-link target has a non-directory "
                            f"path component: {component}"
                        )
                if target.exists() and not stat.S_ISREG(target_metadata.st_mode):
                    raise SupervisorError(
                        f"{label} symbolic link must point to a regular file: {path}"
                    )
                continue
            if not (
                stat.S_ISDIR(metadata.st_mode) or stat.S_ISREG(metadata.st_mode)
            ):
                raise SupervisorError(f"{label} contains a special file: {path}")


def parse_launcher_args(argv: Sequence[str]) -> tuple[Path, Path, list[str]]:
    if (
        len(argv) < 6
        or argv[0] != "--daemon-bin"
        or argv[2] != "--generation-file"
        or argv[4] != "--"
    ):
        raise SupervisorError(
            "usage: trex_daemon_supervisor.py --daemon-bin ABSOLUTE_PATH "
            "--generation-file ABSOLUTE_PATH -- [daemon options] start-live"
        )
    daemon_path = Path(argv[1])
    generation_path = Path(argv[3])
    daemon_args = list(argv[5:])
    if not daemon_path.is_absolute():
        raise SupervisorError("--daemon-bin must be an absolute path")
    try:
        metadata = daemon_path.lstat()
    except OSError as exc:
        raise SupervisorError(f"cannot inspect daemon executable {daemon_path}: {exc}") from exc
    if stat.S_ISLNK(metadata.st_mode) or not stat.S_ISREG(metadata.st_mode):
        raise SupervisorError("--daemon-bin must be a non-symlink regular file")
    if not os.access(daemon_path, os.X_OK):
        raise SupervisorError(f"daemon executable is not executable: {daemon_path}")
    assert_root_controlled_tree(
        daemon_path.parent,
        "TRex daemon scripts tree",
    )
    if not generation_path.is_absolute():
        raise SupervisorError("--generation-file must be an absolute path")
    if not daemon_args or daemon_args[-1] != "start-live" or daemon_args.count("start-live") != 1:
        raise SupervisorError("the supervised daemon must use exactly one final start-live action")

    host_values: list[str] = []
    for index, value in enumerate(daemon_args):
        if value == "--trex-host":
            if index + 1 >= len(daemon_args):
                raise SupervisorError("--trex-host requires a value")
            host_values.append(daemon_args[index + 1])
        elif value.startswith("--trex-host="):
            host_values.append(value.split("=", 1)[1])
    if host_values != ["127.0.0.1"]:
        raise SupervisorError("the supervised daemon must bind exactly to --trex-host 127.0.0.1")
    if os.geteuid() != 0:
        raise SupervisorError("the supervised TRex daemon must run as root")
    return daemon_path, generation_path, daemon_args


def publish_daemon_generation(path: Path) -> str:
    parent = path.parent
    try:
        parent_metadata = parent.lstat()
    except OSError as exc:
        raise SupervisorError(
            f"cannot inspect daemon generation directory {parent}: {exc}"
        ) from exc
    if stat.S_ISLNK(parent_metadata.st_mode) or not stat.S_ISDIR(
        parent_metadata.st_mode
    ):
        raise SupervisorError(
            "daemon generation directory must be a non-symlink directory"
        )
    if parent_metadata.st_uid != 0:
        raise SupervisorError("daemon generation directory must be owned by root")
    if stat.S_IMODE(parent_metadata.st_mode) & 0o022:
        raise SupervisorError(
            "daemon generation directory must not be writable by group or other"
        )
    try:
        existing = path.lstat()
    except FileNotFoundError:
        existing = None
    except OSError as exc:
        raise SupervisorError(
            f"cannot inspect daemon generation file {path}: {exc}"
        ) from exc
    if existing is not None and (
        stat.S_ISLNK(existing.st_mode) or not stat.S_ISREG(existing.st_mode)
    ):
        raise SupervisorError(
            "daemon generation target must be a non-symlink regular file"
        )

    generation = str(uuid.uuid4())
    descriptor = -1
    temporary_path: str | None = None
    try:
        descriptor, temporary_path = tempfile.mkstemp(
            prefix=f".{path.name}.",
            dir=parent,
        )
        os.fchmod(descriptor, 0o644)
        with os.fdopen(descriptor, "w", encoding="ascii", closefd=True) as handle:
            descriptor = -1
            handle.write(f"{generation}\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_path, path)
        temporary_path = None
        directory_descriptor = os.open(parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory_descriptor)
        finally:
            os.close(directory_descriptor)
    except OSError as exc:
        raise SupervisorError(f"cannot publish daemon generation: {exc}") from exc
    finally:
        if descriptor >= 0:
            os.close(descriptor)
        if temporary_path is not None:
            try:
                os.unlink(temporary_path)
            except FileNotFoundError:
                pass

    try:
        published = path.lstat()
    except OSError as exc:
        raise SupervisorError(f"cannot verify daemon generation file: {exc}") from exc
    if (
        published.st_uid != 0
        or stat.S_IMODE(published.st_mode) != 0o644
        or stat.S_ISLNK(published.st_mode)
        or not stat.S_ISREG(published.st_mode)
    ):
        raise SupervisorError(
            "daemon generation file must be a root-owned 0644 regular file"
        )
    return generation


def _reap_process(process: subprocess.Popen[Any]) -> None:
    try:
        process.wait(timeout=REAP_GRACE_SECONDS)
        return
    except subprocess.TimeoutExpired:
        pass

    pid = process.pid
    try:
        process_group = os.getpgid(pid)
    except ProcessLookupError:
        process.wait(timeout=KILL_REAP_SECONDS)
        return
    if process_group != pid:
        raise SupervisorError(
            f"refusing to signal unexpected TRex process group {process_group} for child {pid}"
        )
    os.killpg(process_group, signal.SIGKILL)
    try:
        process.wait(timeout=KILL_REAP_SECONDS)
    except subprocess.TimeoutExpired as exc:
        raise SupervisorError(f"TRex child {pid} could not be reaped after SIGKILL") from exc


def install_session_reaper(session_class: type[Any]) -> None:
    original_join = getattr(session_class, "join", None)
    if not callable(original_join):
        raise SupervisorError("upstream AsynchronousTRexSession.join is unavailable")
    if getattr(original_join, "_trex_webui_supervisor", None) == MANAGED_MARKER:
        return

    @functools.wraps(original_join)
    def reaping_join(
        self: Any,
        timeout: float | None = 5,
        with_tb: bool = False,
    ) -> Any:
        result: Any = None
        try:
            result = original_join(self, timeout=timeout, with_tb=with_tb)
        finally:
            process = getattr(self, "session", None)
            if process is not None:
                if not isinstance(process, subprocess.Popen):
                    raise SupervisorError("upstream TRex session is not a subprocess.Popen")
                _reap_process(process)
        return result

    setattr(reaping_join, "_trex_webui_supervisor", MANAGED_MARKER)
    session_class.join = reaping_join


def install_signal_shutdown_fix(server_class: type[Any]) -> None:
    original_handler = getattr(server_class, "stop_handler", None)
    if not callable(original_handler):
        raise SupervisorError("upstream CTRexServer.stop_handler is unavailable")
    if getattr(original_handler, "_trex_webui_supervisor", None) == MANAGED_MARKER:
        return

    @functools.wraps(original_handler)
    def closing_stop_handler(self: Any, *args: Any, **kwargs: Any) -> Any:
        try:
            return original_handler(self, *args, **kwargs)
        except SystemExit:
            server = getattr(self, "server", None)
            if server is not None:
                close = getattr(server, "server_close", None)
                if not callable(close):
                    raise SupervisorError("upstream JSON-RPC server cannot close its listener")
                close()
                # CTRexServer.start() unconditionally calls shutdown() while
                # unwinding in the serving thread. BaseServer.shutdown() waits
                # for that same thread forever, so the already-closed instance
                # must make that final call a no-op.
                server.shutdown = lambda: None
            raise

    setattr(closing_stop_handler, "_trex_webui_supervisor", MANAGED_MARKER)
    server_class.stop_handler = closing_stop_handler


def load_and_patch_upstream(daemon_path: Path) -> None:
    # Validate again immediately before importing. Once this succeeds, every
    # directory and file in the tree is root-owned and non-writable by less
    # privileged accounts, so an unprivileged process cannot win a later race.
    assert_root_controlled_tree(
        daemon_path.parent,
        "TRex daemon scripts tree",
    )
    server_path = daemon_path.parent / "automation" / "trex_control_plane" / "server"
    external_libraries_path = daemon_path.parent / "external_libs"
    try:
        server_metadata = server_path.lstat()
        external_libraries_metadata = external_libraries_path.lstat()
    except OSError as exc:
        raise SupervisorError(
            f"cannot inspect upstream import roots below {daemon_path.parent}: {exc}"
        ) from exc
    if stat.S_ISLNK(server_metadata.st_mode) or not stat.S_ISDIR(
        server_metadata.st_mode
    ):
        raise SupervisorError(f"upstream server module path is not a directory: {server_path}")
    if stat.S_ISLNK(external_libraries_metadata.st_mode) or not stat.S_ISDIR(
        external_libraries_metadata.st_mode
    ):
        raise SupervisorError(
            f"upstream external library path is not a directory: {external_libraries_path}"
        )

    # Upstream outer_packages honors TREX_EXT_LIBS. Pin it to the validated
    # installation tree and put the server tree first so inherited process
    # environment cannot redirect these privileged imports.
    os.environ["TREX_EXT_LIBS"] = str(external_libraries_path)
    server_path_text = str(server_path)
    sys.path[:] = [entry for entry in sys.path if entry != server_path_text]
    sys.path.insert(0, server_path_text)

    upstream_names = ("outer_packages", "trex_launch_thread", "trex_server")
    unexpected_loaded = [name for name in upstream_names if name in sys.modules]
    if unexpected_loaded:
        raise SupervisorError(
            "upstream modules were loaded before trust-root pinning: "
            + ", ".join(unexpected_loaded)
        )
    outer_module: ModuleType = importlib.import_module("outer_packages")
    launch_module: ModuleType = importlib.import_module("trex_launch_thread")
    server_module: ModuleType = importlib.import_module("trex_server")
    for module in (outer_module, launch_module, server_module):
        module_file = getattr(module, "__file__", None)
        if not isinstance(module_file, str):
            raise SupervisorError(f"upstream module has no source authority: {module.__name__}")
        module_path = Path(module_file).resolve()
        try:
            module_path.relative_to(server_path)
        except ValueError as exc:
            raise SupervisorError(
                f"upstream module escaped the validated server tree: "
                f"{module.__name__}={module_path}"
            ) from exc
    session_class = getattr(launch_module, "AsynchronousTRexSession", None)
    server_class = getattr(server_module, "CTRexServer", None)
    if not isinstance(session_class, type) or not isinstance(server_class, type):
        raise SupervisorError("upstream TRex lifecycle classes are unavailable")
    if getattr(server_module, "AsynchronousTRexSession", None) is not session_class:
        raise SupervisorError("upstream trex_server uses an unexpected session class")
    install_session_reaper(session_class)
    install_signal_shutdown_fix(server_class)


def main(argv: Sequence[str] | None = None) -> int:
    try:
        daemon_path, generation_path, daemon_args = parse_launcher_args(
            list(sys.argv[1:] if argv is None else argv)
        )
        publish_daemon_generation(generation_path)
        sys.argv = [str(daemon_path), *daemon_args]
        load_and_patch_upstream(daemon_path)
        runpy.run_path(str(daemon_path), run_name="__main__")
    except SupervisorError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
