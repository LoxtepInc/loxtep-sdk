"""Session API — org/user context (MCP: loxtep_session)."""

from __future__ import annotations

from typing import Any

from .http_client import LoxtepHttpClient


class SessionApi:
    def __init__(self, http: LoxtepHttpClient) -> None:
        self._http = http

    def get_current_user(self) -> dict[str, Any]:
        return self._http.get("/organizations/users/me")

    def get_current_organization(self) -> dict[str, Any]:
        user = self.get_current_user()
        org_id = user.get("organization_id")
        if not org_id:
            raise ValueError("organization_id not available on current user")
        res = self._http.get(f"/organizations/organizations/{org_id}")
        if isinstance(res, dict) and "data" in res and res["data"]:
            return res["data"]
        return res

    def logout(self) -> dict[str, bool]:
        return {"success": True}
