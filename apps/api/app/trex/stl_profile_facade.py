from __future__ import annotations

from typing import Optional

from app.trex.profile_files import DEFAULT_PROFILE_PREVIEW_BYTES
from app.trex.profile_operations import (
    delete_profile as _delete_profile,
    duplicate_profile as _duplicate_profile,
    export_profile_json as _export_profile_json,
    list_profiles as _list_profiles,
    profile_preview as _profile_preview,
    resolve_profile_path as _resolve_profile_path,
)
from app.trex.result import TrexCallResult


class StlProfileFacadeMixin:
    def resolve_profile_path(self, profile_path: str) -> TrexCallResult:
        return _resolve_profile_path(self.env, profile_path)

    def list_profiles(self) -> TrexCallResult:
        return _list_profiles(self.env)

    def profile_preview(
        self,
        profile_path: str,
        max_bytes: int = DEFAULT_PROFILE_PREVIEW_BYTES,
    ) -> TrexCallResult:
        return _profile_preview(self.env, profile_path, max_bytes=max_bytes)

    def duplicate_profile(self, profile_path: str, target_name: Optional[str] = None) -> TrexCallResult:
        return _duplicate_profile(self.env, profile_path, target_name=target_name)

    def delete_profile(self, profile_path: str) -> TrexCallResult:
        return _delete_profile(self.env, profile_path)

    def export_profile_json(self, profile_path: str) -> TrexCallResult:
        return _export_profile_json(profile_path, self.load_workbench_profile)
