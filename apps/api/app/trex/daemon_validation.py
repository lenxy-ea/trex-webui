from __future__ import annotations

import json
import math
import posixpath
import re
from pathlib import Path

DAEMON_FILE_CONTENT_MAX_BYTES = 1_048_576
DAEMON_FILE_PATH_MAX_CHARS = 4096
DAEMON_LOG_MAX_BYTES = 1_048_576
DAEMON_CONFIG_MAX_BYTES = 1_048_576
DAEMON_CONFIG_AUDIT_MAX_BYTES = 1_048_576
DAEMON_CONFIG_AUDIT_MAX_RECORDS = 200
DAEMON_CONFIG_DIFF_MAX_CHARS = 131_072
DAEMON_CONFIG_VERSION_MAX_FILES = 200
DAEMON_CONFIG_VERSION_NAME_MAX_CHARS = 160
DAEMON_CONFIG_VERSION_NOTE_MAX_CHARS = 240
DAEMON_CONFIG_VERSION_SOURCE_MAX_CHARS = 32
DAEMON_VERSION_MAX_BYTES = 65_536
DAEMON_JSON_RESULT_MAX_BYTES = 4_194_304
DAEMON_COMMAND_TIMEOUT_MAX_SECONDS = 600
DAEMON_RPC_TIMEOUT_MAX_SECONDS = 600
DAEMON_RPC_RESPONSE_MAX_BYTES = 8_388_608
DAEMON_RESERVATION_USER_MAX_CHARS = 128
DAEMON_METADATA_FIELD_TYPES = {"BOOLEAN", "ENUM", "FLOAT", "IP", "LIST", "MAC", "NUMBER", "OBJECT", "STRING"}
INVALID_GENERATED_CONFIG_PREFIX = "### errors in config"
TREX_DAEMON_STATUS_STATES = {1, 2, 3}
PCI_SLOT_RE = re.compile(r"^(?:[0-9A-Fa-f]{4}:)?[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}\.[0-7]$")
DAEMON_CONFIG_VERSION_RE = re.compile(
    r"^[0-9]{8}T[0-9]{12}Z-[A-Za-z0-9_.-]{1,32}-[0-9a-f]{12}\.yaml$"
)


def valid_byte_limit(value: object, upper_bound: int) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and 1 <= value <= upper_bound


def base64_payload_exceeds_limit(encoded: str, decoded_limit: int) -> bool:
    max_encoded_length = ((decoded_limit + 2) // 3) * 4
    return len(encoded.strip()) > max_encoded_length


def json_payload_exceeds_limit(value: object, byte_limit: int) -> bool:
    encoded = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return len(encoded) > byte_limit


def reject_non_finite_json_constant(value: str) -> object:
    raise ValueError(f"daemon JSON contains non-finite number: {value}")


def load_strict_daemon_json(value: str) -> object:
    return json.loads(value, parse_constant=reject_non_finite_json_constant)


def daemon_path_too_long(path: str) -> bool:
    return len(path) > DAEMON_FILE_PATH_MAX_CHARS


def text_has_edge_whitespace(value: str) -> bool:
    return value != value.strip()


def text_has_nul(value: str) -> bool:
    return "\x00" in value


def is_invalid_generated_config_preview(value: str) -> bool:
    stripped = value.lstrip()
    if stripped == "":
        return False
    return stripped.splitlines()[0].startswith(INVALID_GENERATED_CONFIG_PREFIX)


def daemon_path_has_nul(path: str) -> bool:
    return text_has_nul(path)


def is_daemon_files_path_result(value: object) -> bool:
    return (
        isinstance(value, str)
        and value != ""
        and value == value.strip()
        and not daemon_path_has_nul(value)
        and posixpath.isabs(value)
        and not daemon_path_too_long(value)
    )


def is_daemon_file_list_entry(value: object) -> bool:
    return (
        isinstance(value, str)
        and value.strip() != ""
        and value == value.strip()
        and value not in {".", ".."}
        and "/" not in value
        and not daemon_path_has_nul(value)
        and not daemon_path_too_long(value)
    )


def daemon_rpc_error_message(error: object) -> str | None:
    if error is None:
        return None
    if isinstance(error, dict):
        for key in ("message", "faultString", "detail"):
            value = error.get(key)
            if isinstance(value, str) and value.strip() != "":
                return value
        return json.dumps(error, default=str, ensure_ascii=False, sort_keys=True)
    return str(error)


def is_clean_daemon_text(value: object) -> bool:
    return (
        isinstance(value, str)
        and value.strip() != ""
        and value == value.strip()
        and not text_has_nul(value)
    )


def is_clean_absolute_local_path(path: Path) -> bool:
    value = str(path)
    return value.strip() != "" and value == value.strip() and not text_has_nul(value) and path.is_absolute()


def is_valid_tcp_port(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and 1 <= value <= 65535


def local_path_exists(path: Path) -> bool:
    try:
        return path.exists()
    except (OSError, ValueError):
        return False


def clean_daemon_config_version_name(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    if (
        value.strip() == ""
        or value != value.strip()
        or text_has_nul(value)
        or "/" in value
        or value in {".", ".."}
        or len(value) > DAEMON_CONFIG_VERSION_NAME_MAX_CHARS
        or not DAEMON_CONFIG_VERSION_RE.fullmatch(value)
    ):
        return None
    return value


def clean_daemon_config_version_source(value: object) -> str | None:
    if value is None:
        return "manual"
    if not isinstance(value, str):
        return None
    if (
        value.strip() == ""
        or value != value.strip()
        or text_has_nul(value)
        or len(value) > DAEMON_CONFIG_VERSION_SOURCE_MAX_CHARS
    ):
        return None
    slug = re.sub(r"[^A-Za-z0-9_.-]", "_", value)
    slug = slug.strip("._-")
    if slug == "":
        return None
    return slug[:DAEMON_CONFIG_VERSION_SOURCE_MAX_CHARS]


def clean_daemon_config_version_note(value: object) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        return None
    if text_has_nul(value) or len(value) > DAEMON_CONFIG_VERSION_NOTE_MAX_CHARS:
        return None
    return value


def is_daemon_config_audit_record(value: object) -> bool:
    if not isinstance(value, dict):
        return False
    action = value.get("action")
    created_at = value.get("created_at")
    config_path = value.get("config_path")
    if not is_clean_daemon_text(action) or not is_clean_daemon_text(created_at) or not is_clean_daemon_text(config_path):
        return False
    host = value.get("host")
    if not is_clean_daemon_text(host):
        return False
    daemon_port = value.get("daemon_port")
    if not isinstance(daemon_port, int) or isinstance(daemon_port, bool) or not 1 <= daemon_port <= 65535:
        return False
    if action == "restore":
        restored_name = value.get("restored_name")
        if clean_daemon_config_version_name(restored_name) is None:
            return False
        restored_sha256 = value.get("restored_sha256")
        if (
            not isinstance(restored_sha256, str)
            or not re.fullmatch(r"[0-9a-f]{64}", restored_sha256)
        ):
            return False
        before_name = value.get("before_name")
        return before_name is None or clean_daemon_config_version_name(before_name) is not None
    if action == "start":
        version_name = value.get("version_name")
        if clean_daemon_config_version_name(version_name) is None:
            return False
        version_sha256 = value.get("version_sha256")
        if (
            not isinstance(version_sha256, str)
            or not re.fullmatch(r"[0-9a-f]{64}", version_sha256)
        ):
            return False
        recovered_from_timeout = value.get("recovered_from_timeout", False)
        if not isinstance(recovered_from_timeout, bool):
            return False
        sequence = value.get("sequence")
        if recovered_from_timeout:
            if sequence is not None:
                return False
            reconciliation = value.get("reconciliation")
            if not isinstance(reconciliation, dict) or reconciliation.get("running") is not True:
                return False
            status = reconciliation.get("status")
            if not is_trex_running_status(status) or status.get("state") != 3:
                return False
            matched_command = reconciliation.get("matched_command")
            if not is_clean_daemon_text(matched_command):
                return False
            expected_sha256 = reconciliation.get("expected_config_sha256")
            observed_sha256 = reconciliation.get("observed_config_sha256")
            if (
                not isinstance(expected_sha256, str)
                or not isinstance(observed_sha256, str)
                or not re.fullmatch(r"[0-9a-f]{64}", expected_sha256)
                or expected_sha256 != observed_sha256
                or expected_sha256 != version_sha256
            ):
                return False
        elif not isinstance(sequence, int) or isinstance(sequence, bool) or sequence < 1:
            return False
        config_filename = value.get("config_filename")
        if config_filename is not None and not is_clean_daemon_text(config_filename):
            return False
        files_path = value.get("files_path")
        if files_path is not None and not is_daemon_files_path_result(files_path):
            return False
        user = value.get("user")
        return user is None or is_clean_daemon_text(user)
    return False


def is_trex_pid_string(value: object) -> bool:
    return is_clean_daemon_text(value) and value.isascii() and value.isdecimal() and value.strip("0") != ""


def is_trex_command_pair_list(value: object) -> bool:
    return isinstance(value, list) and all(
        isinstance(entry, (list, tuple))
        and len(entry) == 2
        and is_trex_pid_string(entry[0])
        and is_clean_daemon_text(entry[1])
        for entry in value
    )


def is_trex_running_status(value: object) -> bool:
    if not isinstance(value, dict):
        return False
    state = value.get("state")
    if not isinstance(state, int) or isinstance(state, bool) or state not in TREX_DAEMON_STATUS_STATES:
        return False
    return isinstance(value.get("verbose"), str)


def is_json_scalar(value: object) -> bool:
    if value is None or isinstance(value, (str, int, bool)):
        return True
    if isinstance(value, float):
        return math.isfinite(value)
    return False


def is_daemon_enum_value(value: object) -> bool:
    if isinstance(value, str):
        return is_clean_daemon_text(value)
    if isinstance(value, bool):
        return True
    if isinstance(value, int):
        return True
    if isinstance(value, float):
        return math.isfinite(value)
    return False


def is_daemon_metadata_field(value: object, require_id: bool = True) -> bool:
    if not isinstance(value, dict):
        return False

    field_id = value.get("id")
    if require_id and not is_clean_daemon_text(field_id):
        return False
    if not require_id and field_id is not None and not is_clean_daemon_text(field_id):
        return False

    field_name = value.get("name")
    if not is_clean_daemon_text(field_name):
        return False

    field_type = value.get("type")
    if not is_clean_daemon_text(field_type) or field_type not in DAEMON_METADATA_FIELD_TYPES:
        return False

    description = value.get("description")
    if "description" in value and description is not None and not isinstance(description, str):
        return False

    default = value.get("default")
    if "default" in value and not is_json_scalar(default):
        return False

    mandatory = value.get("mandatory")
    if "mandatory" in value and not isinstance(mandatory, bool):
        return False

    mandatory_if_not_set = value.get("mandatory_if_not_set")
    if (
        "mandatory_if_not_set" in value
        and mandatory_if_not_set is not None
        and not is_clean_daemon_text(mandatory_if_not_set)
    ):
        return False

    attributes = value.get("attributes")
    if field_type == "OBJECT" and attributes is None:
        return False
    if attributes is not None and not is_daemon_metadata_field_list(attributes):
        return False

    item = value.get("item")
    if field_type == "LIST" and item is None:
        return False
    if item is not None and not is_daemon_metadata_field(item, require_id=False):
        return False

    values = value.get("values")
    if field_type == "ENUM":
        if not isinstance(values, list) or len(values) == 0:
            return False
        if not all(is_daemon_enum_value(entry) for entry in values):
            return False

    return True


def is_daemon_metadata_field_list(value: object) -> bool:
    return isinstance(value, list) and all(is_daemon_metadata_field(entry) for entry in value)


def is_pci_slot_string(value: object) -> bool:
    return (
        isinstance(value, str)
        and value == value.strip()
        and not text_has_nul(value)
        and bool(PCI_SLOT_RE.fullmatch(value))
    )


def is_daemon_devices_info(value: object) -> bool:
    return isinstance(value, dict) and all(
        is_pci_slot_string(slot) and isinstance(device, dict)
        for slot, device in value.items()
    )
