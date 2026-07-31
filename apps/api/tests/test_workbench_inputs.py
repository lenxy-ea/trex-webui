import base64

from app.trex.result import TrexCallResult
from app.trex.workbench_inputs import (
    clean_dhcp_hostname,
    clean_dhcp_parameter_request_list,
    clean_dns_query_name,
    clean_optional_profile_text,
    clean_payload_pattern,
    normalize_advanced_vm,
    normalize_workbench_advanced_fields,
    packet_binary_from_base64,
)
from app.trex.workbench_values import (
    PROFILE_ADVANCED_VM_MAX_BYTES,
    PROFILE_DEFAULT_DHCP_HOSTNAME,
    PROFILE_DEFAULT_DHCP_PARAMETER_REQUEST_LIST,
    PROFILE_DEFAULT_DNS_QUERY_NAME,
)


def test_packet_binary_from_base64_accepts_absent_and_empty_values() -> None:
    assert packet_binary_from_base64(None) is None
    assert packet_binary_from_base64("") is None


def test_packet_binary_from_base64_decodes_valid_packet_bytes() -> None:
    encoded = base64.b64encode(b"\x00\x01\x02").decode("ascii")

    assert packet_binary_from_base64(encoded) == b"\x00\x01\x02"


def test_packet_binary_from_base64_rejects_non_text_and_invalid_base64() -> None:
    non_text = packet_binary_from_base64(123)
    invalid = packet_binary_from_base64("not base64")

    assert isinstance(non_text, TrexCallResult)
    assert non_text.blocker == "profile_packet_binary_invalid"
    assert isinstance(invalid, TrexCallResult)
    assert invalid.blocker == "profile_packet_binary_invalid"


def test_packet_binary_from_base64_rejects_packets_above_wire_limit() -> None:
    encoded = base64.b64encode(b"x" * 9213).decode("ascii")

    result = packet_binary_from_base64(encoded)

    assert isinstance(result, TrexCallResult)
    assert result.blocker == "profile_packet_binary_too_large"


def test_clean_optional_profile_text_validates_text_bounds() -> None:
    assert clean_optional_profile_text(None, 3, "field", "field_invalid") is None
    assert clean_optional_profile_text("", 3, "field", "field_invalid") is None
    assert clean_optional_profile_text("abc", 3, "field", "field_invalid") == "abc"

    invalid_type = clean_optional_profile_text(123, 3, "field", "field_invalid")
    invalid_nul = clean_optional_profile_text("a\x00", 3, "field", "field_invalid")
    invalid_size = clean_optional_profile_text("abcd", 3, "field", "field_invalid")

    assert isinstance(invalid_type, TrexCallResult)
    assert invalid_type.error == "field must be text"
    assert isinstance(invalid_nul, TrexCallResult)
    assert invalid_nul.error == "field must not contain NUL"
    assert isinstance(invalid_size, TrexCallResult)
    assert invalid_size.error == "field is too large"


def test_normalize_advanced_vm_accepts_json_serializable_objects() -> None:
    assert normalize_advanced_vm({"instructions": [{"type": "fix_checksum"}]}) == {
        "instructions": [{"type": "fix_checksum"}]
    }


def test_normalize_advanced_vm_rejects_invalid_values() -> None:
    non_object = normalize_advanced_vm(["not", "object"])
    non_finite = normalize_advanced_vm({"value": float("nan")})
    too_large = normalize_advanced_vm({"payload": "x" * PROFILE_ADVANCED_VM_MAX_BYTES})

    assert isinstance(non_object, TrexCallResult)
    assert non_object.blocker == "profile_advanced_vm_invalid"
    assert isinstance(non_finite, TrexCallResult)
    assert non_finite.blocker == "profile_advanced_vm_invalid"
    assert isinstance(too_large, TrexCallResult)
    assert too_large.blocker == "profile_advanced_vm_too_large"


def test_normalize_workbench_advanced_fields_requires_packet_in_advanced_mode() -> None:
    result = normalize_workbench_advanced_fields({"advanced_mode": True}, None)

    assert isinstance(result, TrexCallResult)
    assert result.blocker == "profile_advanced_packet_missing"


def test_normalize_workbench_advanced_fields_returns_clean_fields() -> None:
    result = normalize_workbench_advanced_fields(
        {
            "advanced_mode": True,
            "packet_model": "Ether()/IP()",
            "packet_meta_base64": "bWV0YQ==",
            "advanced_vm": {"instructions": []},
        },
        b"\x00" * 64,
    )

    assert result == {
        "advanced_mode": True,
        "packet_model": "Ether()/IP()",
        "packet_meta_base64": "bWV0YQ==",
        "advanced_vm": {"instructions": []},
    }


def test_clean_payload_pattern_normalizes_hex_text() -> None:
    assert clean_payload_pattern(None) == "00"
    assert clean_payload_pattern("") == "00"
    assert clean_payload_pattern("aa bb\ncc") == "AABBCC"


def test_clean_payload_pattern_rejects_invalid_values() -> None:
    non_text = clean_payload_pattern(123)
    odd_hex = clean_payload_pattern("abc")
    bad_hex = clean_payload_pattern("zz")

    assert isinstance(non_text, TrexCallResult)
    assert non_text.blocker == "profile_payload_pattern_invalid"
    assert isinstance(odd_hex, TrexCallResult)
    assert odd_hex.error == "payload pattern must contain whole hex bytes"
    assert isinstance(bad_hex, TrexCallResult)
    assert bad_hex.error == "payload pattern must contain whole hex bytes"


def test_clean_dns_query_name_normalizes_valid_names() -> None:
    assert clean_dns_query_name(None, PROFILE_DEFAULT_DNS_QUERY_NAME) == PROFILE_DEFAULT_DNS_QUERY_NAME
    assert clean_dns_query_name("Example.COM.", PROFILE_DEFAULT_DNS_QUERY_NAME) == "example.com"
    assert clean_dns_query_name("_svc.example-1", PROFILE_DEFAULT_DNS_QUERY_NAME) == "_svc.example-1"


def test_clean_dns_query_name_rejects_invalid_names() -> None:
    non_text = clean_dns_query_name(123, PROFILE_DEFAULT_DNS_QUERY_NAME)
    spaced = clean_dns_query_name(" example.com", PROFILE_DEFAULT_DNS_QUERY_NAME)
    empty_label = clean_dns_query_name("example..com", PROFILE_DEFAULT_DNS_QUERY_NAME)
    non_ascii = clean_dns_query_name("ex\u00e4mple.com", PROFILE_DEFAULT_DNS_QUERY_NAME)

    assert isinstance(non_text, TrexCallResult)
    assert non_text.error == "DNS query name must be text"
    assert isinstance(spaced, TrexCallResult)
    assert spaced.error == "DNS query name is invalid"
    assert isinstance(empty_label, TrexCallResult)
    assert empty_label.error == "DNS query name labels are invalid"
    assert isinstance(non_ascii, TrexCallResult)
    assert non_ascii.error == "DNS query name labels are invalid"


def test_clean_dhcp_hostname_normalizes_valid_text() -> None:
    assert clean_dhcp_hostname(None, PROFILE_DEFAULT_DHCP_HOSTNAME) == PROFILE_DEFAULT_DHCP_HOSTNAME
    assert clean_dhcp_hostname("", PROFILE_DEFAULT_DHCP_HOSTNAME) == ""
    assert clean_dhcp_hostname("trex-host_1", PROFILE_DEFAULT_DHCP_HOSTNAME) == "trex-host_1"


def test_clean_dhcp_hostname_rejects_invalid_text() -> None:
    non_text = clean_dhcp_hostname(123, PROFILE_DEFAULT_DHCP_HOSTNAME)
    spaced = clean_dhcp_hostname(" trex", PROFILE_DEFAULT_DHCP_HOSTNAME)
    non_ascii = clean_dhcp_hostname("tr\u00eax", PROFILE_DEFAULT_DHCP_HOSTNAME)
    bad_chars = clean_dhcp_hostname("trex!", PROFILE_DEFAULT_DHCP_HOSTNAME)

    assert isinstance(non_text, TrexCallResult)
    assert non_text.error == "DHCP hostname must be text"
    assert isinstance(spaced, TrexCallResult)
    assert spaced.error == "DHCP hostname is invalid"
    assert isinstance(non_ascii, TrexCallResult)
    assert non_ascii.error == "DHCP hostname must be ASCII"
    assert isinstance(bad_chars, TrexCallResult)
    assert bad_chars.error == "DHCP hostname is invalid"


def test_clean_dhcp_parameter_request_list_normalizes_options() -> None:
    assert (
        clean_dhcp_parameter_request_list(None, PROFILE_DEFAULT_DHCP_PARAMETER_REQUEST_LIST)
        == PROFILE_DEFAULT_DHCP_PARAMETER_REQUEST_LIST
    )
    assert clean_dhcp_parameter_request_list("", PROFILE_DEFAULT_DHCP_PARAMETER_REQUEST_LIST) == ""
    assert clean_dhcp_parameter_request_list("1, 3 6", PROFILE_DEFAULT_DHCP_PARAMETER_REQUEST_LIST) == "1,3,6"
    assert clean_dhcp_parameter_request_list([1, "3", " 6 "], PROFILE_DEFAULT_DHCP_PARAMETER_REQUEST_LIST) == "1,3,6"


def test_clean_dhcp_parameter_request_list_rejects_invalid_options() -> None:
    non_text = clean_dhcp_parameter_request_list(123, PROFILE_DEFAULT_DHCP_PARAMETER_REQUEST_LIST)
    bad_token = clean_dhcp_parameter_request_list("1,abc", PROFILE_DEFAULT_DHCP_PARAMETER_REQUEST_LIST)
    out_of_range = clean_dhcp_parameter_request_list("256", PROFILE_DEFAULT_DHCP_PARAMETER_REQUEST_LIST)
    too_many = clean_dhcp_parameter_request_list(list(range(256)), PROFILE_DEFAULT_DHCP_PARAMETER_REQUEST_LIST)

    assert isinstance(non_text, TrexCallResult)
    assert non_text.error == "DHCP parameter request list must be text"
    assert isinstance(bad_token, TrexCallResult)
    assert bad_token.error == "DHCP parameter request list must contain option numbers"
    assert isinstance(out_of_range, TrexCallResult)
    assert out_of_range.error == "DHCP parameter request list options must be between 0 and 255"
    assert isinstance(too_many, TrexCallResult)
    assert too_many.error == "DHCP parameter request list exceeds 255 options"
