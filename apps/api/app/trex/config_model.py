from __future__ import annotations

import re
from ipaddress import IPv4Address
from typing import Any, Optional, Union

import yaml
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class TrexConfigError(ValueError):
    pass


class StrictTrexConfigModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


def mac_to_ints(value: Optional[Union[str, list[int]]]) -> Optional[list[int]]:
    if value is None:
        return None
    if isinstance(value, list):
        if len(value) != 6 or any(not isinstance(part, int) or part < 0 or part > 255 for part in value):
            raise TrexConfigError("MAC integer list must contain exactly six bytes")
        return value

    parts = value.split(":")
    if len(parts) != 6:
        raise TrexConfigError("MAC address must have six colon-separated bytes")
    try:
        return [int(part, 16) for part in parts]
    except ValueError as exc:
        raise TrexConfigError("MAC address contains a non-hex byte") from exc


class PortInfo(StrictTrexConfigModel):
    ip: Optional[IPv4Address] = None
    default_gw: Optional[IPv4Address] = None
    src_mac: Optional[Union[str, list[int]]] = None
    dest_mac: Optional[Union[str, list[int]]] = None

    def to_trex_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {}
        if self.ip is not None:
            payload["ip"] = str(self.ip)
        if self.default_gw is not None:
            payload["default_gw"] = str(self.default_gw)
        if self.dest_mac is not None:
            payload["dest_mac"] = mac_to_ints(self.dest_mac)
        if self.src_mac is not None:
            payload["src_mac"] = mac_to_ints(self.src_mac)
        return payload


class DualIf(StrictTrexConfigModel):
    socket: int = Field(ge=0)
    threads: list[int] = Field(default_factory=list)

    @field_validator("threads")
    @classmethod
    def threads_are_unique(cls, value: list[int]) -> list[int]:
        if len(value) != len(set(value)):
            raise ValueError("dual_if threads must be unique per socket entry")
        if any(thread < 0 for thread in value):
            raise ValueError("dual_if threads must be non-negative")
        return value


class PlatformConfig(StrictTrexConfigModel):
    master_thread_id: int = Field(ge=0)
    latency_thread_id: int = Field(ge=0)
    dual_if: list[DualIf] = Field(default_factory=list)

    @model_validator(mode="after")
    def threads_must_not_conflict(self) -> "PlatformConfig":
        if self.master_thread_id == self.latency_thread_id:
            raise ValueError("master_thread_id and latency_thread_id must differ")

        worker_threads: set[int] = set()
        for entry in self.dual_if:
            for thread in entry.threads:
                if thread == self.master_thread_id:
                    raise ValueError("master_thread_id must not also be a dual_if worker thread")
                if thread == self.latency_thread_id:
                    raise ValueError("latency_thread_id must not also be a dual_if worker thread")
                if thread in worker_threads:
                    raise ValueError("dual_if worker threads must be unique across platform entries")
                worker_threads.add(thread)
        return self

    def to_trex_dict(self) -> dict[str, Any]:
        return {
            "master_thread_id": self.master_thread_id,
            "latency_thread_id": self.latency_thread_id,
            "dual_if": [entry.model_dump() for entry in self.dual_if],
        }


_PCI_INTERFACE_PATTERN = re.compile(
    r"^(?:(?P<domain>[0-9a-fA-F]{4}):)?"
    r"(?P<bus>[0-9a-fA-F]{2}):(?P<device>[0-9a-fA-F]{2})\.(?P<function>[0-7])$"
)


def _interface_identity(interface: str) -> str:
    match = _PCI_INTERFACE_PATTERN.fullmatch(interface)
    if match is None:
        return interface
    domain = match.group("domain") or "0000"
    return (
        f"{domain.lower()}:{match.group('bus').lower()}:"
        f"{match.group('device').lower()}.{match.group('function')}"
    )


class TrexConfig(StrictTrexConfigModel):
    port_limit: int = Field(ge=1)
    version: int = 2
    interfaces: list[str]
    port_bandwidth_gb: Optional[int] = Field(default=None, ge=1)
    port_info: list[PortInfo] = Field(default_factory=list)
    c: Optional[int] = Field(default=None, ge=1)
    enable_zmq_pub: Optional[bool] = None
    zmq_pub_port: Optional[int] = Field(default=None, ge=1, le=65535)
    telnet_port: Optional[int] = Field(default=None, ge=1, le=65535)
    platform: Optional[PlatformConfig] = None

    @field_validator("interfaces")
    @classmethod
    def interfaces_must_be_unique(cls, value: list[str]) -> list[str]:
        identities: set[str] = set()
        for interface in value:
            if not interface or interface != interface.strip():
                raise ValueError("interfaces must contain non-empty identifiers without surrounding whitespace")
            identity = _interface_identity(interface)
            if identity in identities:
                raise ValueError("interfaces must be unique")
            identities.add(identity)
        return value

    @model_validator(mode="after")
    def validate_shape(self) -> "TrexConfig":
        if len(self.interfaces) < self.port_limit:
            raise ValueError("interfaces length must be at least port_limit")
        if self.port_info and len(self.port_info) < self.port_limit:
            raise ValueError("port_info length must be empty or at least port_limit")
        return self

    def to_trex_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "port_limit": self.port_limit,
            "version": self.version,
            "interfaces": self.interfaces,
        }
        if self.port_bandwidth_gb is not None:
            payload["port_bandwidth_gb"] = self.port_bandwidth_gb
        if self.c is not None:
            payload["c"] = self.c
        if self.enable_zmq_pub is not None:
            payload["enable_zmq_pub"] = self.enable_zmq_pub
        if self.zmq_pub_port is not None:
            payload["zmq_pub_port"] = self.zmq_pub_port
        if self.telnet_port is not None:
            payload["telnet_port"] = self.telnet_port
        if self.platform is not None:
            payload["platform"] = self.platform.to_trex_dict()
        if self.port_info:
            payload["port_info"] = [port.to_trex_dict() for port in self.port_info]
        return payload

    def to_yaml(self) -> str:
        return yaml.safe_dump([self.to_trex_dict()], sort_keys=False, default_flow_style=False)
