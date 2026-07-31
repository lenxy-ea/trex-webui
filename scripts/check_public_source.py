#!/usr/bin/env python3
"""Validate an exported public source tree before it is published."""

from __future__ import annotations

import argparse
import ipaddress
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from pathlib import PurePosixPath
from typing import Any


FORBIDDEN_TOP_LEVEL = {
    ".agents",
    ".git",
    ".logs",
    ".pensieve",
    ".references",
    ".tools",
    ".venv",
    "AGENTS.md",
    "CLAUDE.md",
    "node_modules",
    "skills-lock.json",
}

FORBIDDEN_SUFFIXES = {
    ".key",
    ".pcap",
    ".pcapng",
}

FORBIDDEN_BASENAMES = {
    "runtime-state.json",
    "runtime-state-quick-validation.json",
}

IPV4_PATTERN = re.compile(rb"\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b")
MAC_PATTERN = re.compile(rb"\b(?:[0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}\b")
PCI_BDF_PATTERN = re.compile(
    rb"\b(?:[0-9a-fA-F]{4}:)?[0-9a-fA-F]{2}:[0-9a-fA-F]{2}\.[0-7]\b"
)
IPV6_PATTERN = re.compile(
    rb"(?i)(?<![0-9a-f:.])"
    rb"(?:f[cd][0-9a-f]{0,2}|fe[89ab][0-9a-f]?|[23][0-9a-f]{0,3})"
    rb"(?::[0-9a-f]{0,4}){1,7}(?![0-9a-f:.])"
)
IPV4_MAPPED_IPV6_PATTERN = re.compile(
    rb"(?i)(?<![0-9a-f:.])(?:[0-9a-f]{0,4}:){1,6}ffff:"
    rb"(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}|(?:[0-9]{1,3}\.){3}[0-9]{1,3})"
    rb"(?![0-9a-f:.])"
)
DOCUMENTATION_NETWORKS = (
    ipaddress.ip_network("192.0.2.0/24"),
    ipaddress.ip_network("198.51.100.0/24"),
    ipaddress.ip_network("203.0.113.0/24"),
)
DOCUMENTATION_IPV6_NETWORK = ipaddress.ip_network("2001:db8::/32")
POLICY_FILENAME = "public-source-policy.json"
NETWORK_KINDS = frozenset({"ipv4", "ipv6", "mac", "pci_bdf"})
SAFE_MAC_ADDRESSES = frozenset({"00:00:00:00:00:00", "ff:ff:ff:ff:ff:ff"})

SECRET_PATTERNS = {
    "private key": re.compile(
        rb"-----BEGIN (?:DSA |EC |OPENSSH |RSA )?PRIVATE KEY-----"
    ),
    "AWS access key": re.compile(rb"\bAKIA[0-9A-Z]{16}\b"),
    "GitHub token": re.compile(rb"\bgh[pousr]_[A-Za-z0-9]{20,}\b"),
    "Google API key": re.compile(rb"\bAIza[0-9A-Za-z_-]{30,}\b"),
    "OpenAI-style key": re.compile(rb"\bsk-[A-Za-z0-9_-]{20,}\b"),
    "Slack token": re.compile(rb"\bxox[baprs]-[A-Za-z0-9-]{20,}\b"),
}

TEXT_FILE_LIMIT = 4 * 1024 * 1024


@dataclass
class GeneratedScope:
    pattern: str
    allowed_values: dict[str, set[str]]
    used_values: set[tuple[str, str]] = field(default_factory=set)

    def matches(self, relative_text: str) -> bool:
        prefix, suffix = self.pattern.split("*", maxsplit=1)
        if not relative_text.startswith(prefix) or not relative_text.endswith(suffix):
            return False
        end = len(relative_text) - len(suffix) if suffix else len(relative_text)
        wildcard_value = relative_text[len(prefix) : end]
        return bool(wildcard_value) and "/" not in wildcard_value


@dataclass
class PublicSourcePolicy:
    allowed_by_path: dict[str, dict[str, set[str]]] = field(default_factory=dict)
    generated_scopes: list[GeneratedScope] = field(default_factory=list)
    used_path_values: set[tuple[str, str, str]] = field(default_factory=set)

    def authorize(self, relative: Path, kind: str, value: str) -> bool:
        relative_text = relative.as_posix()
        allowed_values = self.allowed_by_path.get(relative_text, {}).get(kind, set())
        if value in allowed_values:
            self.used_path_values.add((relative_text, kind, value))
            return True
        for scope in self.generated_scopes:
            if (
                value in scope.allowed_values.get(kind, set())
                and scope.matches(relative_text)
            ):
                scope.used_values.add((kind, value))
                return True
        return False

    def stale_findings(self, root: Path, *, complete_tree: bool) -> list[str]:
        findings: list[str] = []
        for relative_text, values_by_kind in sorted(self.allowed_by_path.items()):
            path = root.joinpath(*PurePosixPath(relative_text).parts)
            if not complete_tree and not path.exists():
                continue
            for kind, values in sorted(values_by_kind.items()):
                for value in sorted(values):
                    if (relative_text, kind, value) not in self.used_path_values:
                        findings.append(
                            f"{POLICY_FILENAME}: unused exact {kind} value "
                            f"{value!r} for {relative_text!r}"
                        )
        for scope in self.generated_scopes:
            matched = any(
                path.is_file()
                and not path.is_symlink()
                and scope.matches(path.relative_to(root).as_posix())
                for path in iter_paths(root)
            )
            if not matched:
                continue
            for kind, values in sorted(scope.allowed_values.items()):
                for value in sorted(values):
                    if (kind, value) not in scope.used_values:
                        findings.append(
                            f"{POLICY_FILENAME}: unused generated exact {kind} "
                            f"value {value!r} for {scope.pattern!r}"
                        )
        return findings


def iter_paths(root: Path):
    for path in sorted(root.rglob("*")):
        yield path


def is_safe_ipv4(value: str) -> bool:
    try:
        address = ipaddress.ip_address(value)
    except ValueError:
        return True
    return bool(
        address.is_loopback
        or address.is_unspecified
        or address == ipaddress.ip_address("255.255.255.255")
        or any(address in network for network in DOCUMENTATION_NETWORKS)
    )


def is_safe_ipv6(value: str) -> bool:
    try:
        address = ipaddress.ip_address(value)
    except ValueError:
        return True
    if address.version == 6 and address.ipv4_mapped is not None:
        return is_safe_ipv4(str(address.ipv4_mapped))
    return bool(
        address.version != 6
        or address.is_loopback
        or address.is_unspecified
        or address.is_multicast
        or address in DOCUMENTATION_IPV6_NETWORK
    )


def _validate_exact_value(kind: str, raw_value: Any) -> tuple[str | None, str | None]:
    if not isinstance(raw_value, str) or not raw_value:
        return None, f"{kind} exact values must be non-empty strings"
    value = raw_value.casefold()
    if value != raw_value:
        return None, f"{kind} exact value must be lowercase: {raw_value!r}"
    if kind == "ipv4":
        try:
            address = ipaddress.ip_address(value)
        except ValueError:
            return None, f"invalid exact IPv4 value: {value!r}"
        if address.version != 4:
            return None, f"exact IPv4 value is not IPv4: {value!r}"
        if is_safe_ipv4(value):
            return None, (
                f"intrinsically safe IPv4 value must not be authorized: {value!r}"
            )
    elif kind == "ipv6":
        try:
            address = ipaddress.ip_address(value)
        except ValueError:
            return None, f"invalid exact IPv6 value: {value!r}"
        if address.version != 6:
            return None, f"exact IPv6 value is not IPv6: {value!r}"
        if str(address) != value:
            return None, f"exact IPv6 value must use canonical compressed form: {value!r}"
        if is_safe_ipv6(value):
            return None, (
                f"intrinsically safe IPv6 value must not be authorized: {value!r}"
            )
    elif kind == "mac":
        if MAC_PATTERN.fullmatch(value.encode("ascii", errors="ignore")) is None:
            return None, f"invalid exact MAC value: {value!r}"
        if value in SAFE_MAC_ADDRESSES:
            return None, (
                f"intrinsically safe MAC value must not be authorized: {value!r}"
            )
    elif kind == "pci_bdf":
        if PCI_BDF_PATTERN.fullmatch(value.encode("ascii", errors="ignore")) is None:
            return None, f"invalid exact PCI BDF value: {value!r}"
    return value, None


def _validate_exact_values(
    raw_values: Any,
    *,
    prefix: str,
) -> tuple[dict[str, set[str]], list[str]]:
    findings: list[str] = []
    values_by_kind: dict[str, set[str]] = {}
    if (
        not isinstance(raw_values, dict)
        or not raw_values
        or not set(raw_values).issubset(NETWORK_KINDS)
    ):
        return {}, [
            f"{prefix} values must be a non-empty object using only "
            f"{sorted(NETWORK_KINDS)!r}"
        ]

    for kind in sorted(raw_values):
        raw_kind_values = raw_values[kind]
        if not isinstance(raw_kind_values, list) or not raw_kind_values:
            findings.append(f"{prefix} {kind} values must be a non-empty list")
            continue
        exact_values: set[str] = set()
        for raw_value in raw_kind_values:
            value, error = _validate_exact_value(kind, raw_value)
            if error is not None:
                findings.append(f"{prefix}: {error}")
                continue
            assert value is not None
            if value in exact_values:
                findings.append(f"{prefix}: duplicate exact {kind} value {value!r}")
                continue
            exact_values.add(value)
        if exact_values:
            values_by_kind[kind] = exact_values
    return values_by_kind, findings


def _validate_scope_path(
    root: Path,
    raw_path: Any,
    *,
    allow_missing: bool,
) -> tuple[str | None, str | None]:
    if not isinstance(raw_path, str) or not raw_path:
        return None, "scope paths must be non-empty strings"
    if "\\" in raw_path:
        return None, f"scope path must use POSIX separators: {raw_path!r}"
    pure_path = PurePosixPath(raw_path)
    if (
        pure_path.is_absolute()
        or "." in pure_path.parts
        or ".." in pure_path.parts
        or pure_path.as_posix() != raw_path
    ):
        return None, f"scope path must be an exact normalized relative path: {raw_path!r}"
    if pure_path.parts and pure_path.parts[0] in FORBIDDEN_TOP_LEVEL:
        return None, f"scope path targets internal-only content: {raw_path!r}"
    path = root.joinpath(*pure_path.parts)
    if path.exists() and (not path.is_file() or path.is_symlink()):
        return None, f"scope path must name an existing regular file: {raw_path!r}"
    if not path.exists() and not allow_missing:
        return None, f"scope path must name an existing regular file: {raw_path!r}"
    if raw_path == POLICY_FILENAME:
        return None, "the policy file cannot authorize its own identifiers"
    return raw_path, None


def _validate_generated_pattern(
    raw_pattern: Any,
) -> tuple[str | None, str | None]:
    if not isinstance(raw_pattern, str) or not raw_pattern:
        return None, "generated scope pattern must be a non-empty string"
    if (
        "\\" in raw_pattern
        or raw_pattern.count("*") != 1
        or any(character in raw_pattern for character in "?[]")
    ):
        return None, (
            "generated scope pattern must contain one filename '*' and no other glob"
        )
    pure_pattern = PurePosixPath(raw_pattern)
    if (
        pure_pattern.is_absolute()
        or "." in pure_pattern.parts
        or ".." in pure_pattern.parts
        or pure_pattern.as_posix() != raw_pattern
        or "*" in pure_pattern.parent.as_posix()
    ):
        return None, (
            f"generated scope pattern must be a normalized relative filename glob: "
            f"{raw_pattern!r}"
        )
    if pure_pattern.parts and pure_pattern.parts[0] in FORBIDDEN_TOP_LEVEL:
        return None, (
            f"generated scope pattern targets internal-only content: {raw_pattern!r}"
        )
    return raw_pattern, None


def _contains_network_identifier(value: str) -> bool:
    payload = value.encode("utf-8")
    return bool(
        IPV4_PATTERN.search(payload)
        or IPV6_PATTERN.search(payload)
        or MAC_PATTERN.search(payload)
        or PCI_BDF_PATTERN.search(payload)
    )


def load_policy(
    root: Path,
    *,
    partial_tree: bool,
) -> tuple[PublicSourcePolicy, list[str]]:
    policy = PublicSourcePolicy()
    policy_path = root / POLICY_FILENAME
    if not policy_path.exists():
        return policy, []
    if not policy_path.is_file() or policy_path.is_symlink():
        return policy, [f"{POLICY_FILENAME}: must be a regular file"]
    if policy_path.stat().st_size > TEXT_FILE_LIMIT:
        return policy, [f"{POLICY_FILENAME}: exceeds the policy size limit"]
    try:
        payload = json.loads(policy_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        return policy, [f"{POLICY_FILENAME}: invalid JSON: {exc}"]
    if not isinstance(payload, dict):
        return policy, [f"{POLICY_FILENAME}: top-level value must be an object"]

    findings: list[str] = []
    expected_top_level = {"version", "scopes", "generated_scopes"}
    if set(payload) != expected_top_level:
        findings.append(
            f"{POLICY_FILENAME}: keys must be exactly "
            f"{sorted(expected_top_level)!r}"
        )
    if payload.get("version") != 2:
        findings.append(f"{POLICY_FILENAME}: version must be 2")

    raw_scopes = payload.get("scopes")
    if not isinstance(raw_scopes, list):
        findings.append(f"{POLICY_FILENAME}: scopes must be a list")
    else:
        for index, raw_scope in enumerate(raw_scopes):
            prefix = f"{POLICY_FILENAME}: scope {index}"
            if not isinstance(raw_scope, dict):
                findings.append(f"{prefix} must be an object")
                continue
            if set(raw_scope) != {"bindings", "reason"}:
                findings.append(
                    f"{prefix} keys must be exactly ['bindings', 'reason']"
                )
                continue
            raw_reason = raw_scope["reason"]
            if not isinstance(raw_reason, str) or len(raw_reason.strip()) < 20:
                findings.append(f"{prefix} requires a specific reason")
            elif _contains_network_identifier(raw_reason):
                findings.append(f"{prefix} reason must not contain network identifiers")
            raw_bindings = raw_scope["bindings"]
            if not isinstance(raw_bindings, dict) or not raw_bindings:
                findings.append(f"{prefix} bindings must be a non-empty object")
                continue
            for raw_path, raw_values in raw_bindings.items():
                binding_prefix = f"{prefix} binding {raw_path!r}"
                relative_text, error = _validate_scope_path(
                    root,
                    raw_path,
                    allow_missing=partial_tree,
                )
                if error is not None:
                    findings.append(f"{prefix}: {error}")
                    continue
                assert relative_text is not None
                values_by_kind, value_findings = _validate_exact_values(
                    raw_values,
                    prefix=binding_prefix,
                )
                findings.extend(value_findings)
                if relative_text in policy.allowed_by_path:
                    findings.append(
                        f"{prefix}: duplicate exact-value scope for "
                        f"{relative_text!r}"
                    )
                    continue
                policy.allowed_by_path[relative_text] = {
                    kind: set(values)
                    for kind, values in values_by_kind.items()
                }

    raw_generated_scopes = payload.get("generated_scopes")
    if not isinstance(raw_generated_scopes, list):
        findings.append(f"{POLICY_FILENAME}: generated_scopes must be a list")
    else:
        seen_generated: set[str] = set()
        for index, raw_scope in enumerate(raw_generated_scopes):
            prefix = f"{POLICY_FILENAME}: generated scope {index}"
            if not isinstance(raw_scope, dict):
                findings.append(f"{prefix} must be an object")
                continue
            if set(raw_scope) != {"pattern", "values", "reason"}:
                findings.append(
                    f"{prefix} keys must be exactly ['pattern', 'reason', 'values']"
                )
                continue
            pattern, error = _validate_generated_pattern(raw_scope["pattern"])
            if error is not None:
                findings.append(f"{prefix}: {error}")
                continue
            assert pattern is not None
            raw_reason = raw_scope["reason"]
            if not isinstance(raw_reason, str) or len(raw_reason.strip()) < 20:
                findings.append(f"{prefix} requires a specific reason")
            elif _contains_network_identifier(raw_reason):
                findings.append(f"{prefix} reason must not contain network identifiers")
            values_by_kind, value_findings = _validate_exact_values(
                raw_scope["values"],
                prefix=prefix,
            )
            findings.extend(value_findings)
            if pattern in seen_generated:
                findings.append(
                    f"{prefix}: duplicate generated exact-value scope for "
                    f"{pattern!r}"
                )
                continue
            seen_generated.add(pattern)
            policy.generated_scopes.append(
                GeneratedScope(
                    pattern=pattern,
                    allowed_values={
                        kind: set(values)
                        for kind, values in values_by_kind.items()
                    },
                )
            )
    return policy, findings


def validate_path(root: Path, path: Path) -> list[str]:
    relative = path.relative_to(root)
    findings: list[str] = []
    if path.is_symlink():
        findings.append(f"{relative}: symbolic links are not allowed")
    if any(component in FORBIDDEN_TOP_LEVEL for component in relative.parts):
        findings.append(f"{relative}: internal-only path")
    casefolded_name = path.name.casefold()
    runtime_state_artifact = casefolded_name in FORBIDDEN_BASENAMES or any(
        casefolded_name.startswith(f".{basename}.")
        for basename in FORBIDDEN_BASENAMES
    )
    if path.suffix.casefold() in FORBIDDEN_SUFFIXES or runtime_state_artifact:
        findings.append(f"{relative}: runtime or credential artifact")
    name = path.name
    if (name == ".env" or name.startswith(".env.")) and name != ".env.example":
        findings.append(f"{relative}: environment file")
    return findings


def validate_content(
    root: Path,
    path: Path,
    policy: PublicSourcePolicy,
) -> list[str]:
    relative = path.relative_to(root)
    if path.is_symlink() or not path.is_file():
        return []
    if path.stat().st_size > TEXT_FILE_LIMIT:
        return [
            f"{relative}: exceeds the {TEXT_FILE_LIMIT}-byte content scan limit"
        ]
    payload = path.read_bytes()
    findings: list[str] = []
    if relative.as_posix() != POLICY_FILENAME:
        for value in sorted(
            {match.group(0).decode("ascii") for match in IPV4_PATTERN.finditer(payload)}
        ):
            try:
                address = ipaddress.ip_address(value)
            except ValueError:
                continue
            if address.version != 4 or is_safe_ipv4(value):
                continue
            if not policy.authorize(relative, "ipv4", value):
                findings.append(
                    f"{relative}: IPv4 address {value!r} is outside the exact "
                    "source-scope values"
                )
        ipv6_matches = {
            match.group(0).decode("ascii").casefold()
            for pattern in (IPV6_PATTERN, IPV4_MAPPED_IPV6_PATTERN)
            for match in pattern.finditer(payload)
        }
        for raw_value in sorted(ipv6_matches):
            try:
                address = ipaddress.ip_address(raw_value)
            except ValueError:
                continue
            if address.version != 6:
                continue
            value = str(address)
            if is_safe_ipv6(value):
                continue
            if not policy.authorize(relative, "ipv6", value):
                findings.append(
                    f"{relative}: IPv6 address {value!r} is outside the exact "
                    "source-scope values"
                )
        for value in sorted(
            {
                match.group(0).decode("ascii").casefold()
                for match in MAC_PATTERN.finditer(payload)
            }
        ):
            if value in SAFE_MAC_ADDRESSES:
                continue
            if not policy.authorize(relative, "mac", value):
                findings.append(
                    f"{relative}: MAC address {value!r} is outside the exact "
                    "source-scope values"
                )
        for value in sorted(
            {
                match.group(0).decode("ascii").casefold()
                for match in PCI_BDF_PATTERN.finditer(payload)
            }
        ):
            if not policy.authorize(relative, "pci_bdf", value):
                findings.append(
                    f"{relative}: PCI BDF {value!r} is outside the exact "
                    "source-scope values"
                )
    for label, pattern in SECRET_PATTERNS.items():
        if pattern.search(payload):
            findings.append(f"{relative}: contains possible {label}")
    return findings


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--partial-tree",
        action="store_true",
        help=(
            "allow exact source scopes to be absent in a packaged source subset; "
            "identifier values and generated scopes remain enforced"
        ),
    )
    parser.add_argument("root", type=Path)
    args = parser.parse_args()
    root = args.root.resolve()
    if not root.is_dir():
        parser.error(f"not a directory: {root}")

    policy, findings = load_policy(root, partial_tree=args.partial_tree)
    for path in iter_paths(root):
        findings.extend(validate_path(root, path))
        findings.extend(validate_content(root, path, policy))
    findings.extend(policy.stale_findings(root, complete_tree=not args.partial_tree))

    if findings:
        print("Public source validation failed:", file=sys.stderr)
        for finding in findings:
            print(f"  - {finding}", file=sys.stderr)
        return 1
    print(f"Public source validation passed: {root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
