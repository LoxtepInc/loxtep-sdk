"""
Iceberg control for a data product (``client.build.data_products.iceberg``).

Mirrors the Node SDK ``data_products.iceberg`` namespace: rebuild, health,
status, cancel, enable, put_config, files, snapshots, set_history, trace.
"""

from __future__ import annotations

import re
from typing import Any, Mapping, Optional
from urllib.parse import quote, urlencode

from .errors import ValidationError

# A leo queue eid (``z/…``); same pattern as GET …/iceberg/trace.
_TRACE_EID_RE = re.compile(r"z/[0-9/-]{1,120}")
_TRACE_BOUNDS = {"max_hops": 10, "max_rows": 200}


def _unwrap(res: Any) -> Any:
    if isinstance(res, dict) and isinstance(res.get("data"), dict):
        return res["data"]
    return res


def _base(data_product_id: str) -> str:
    if not data_product_id:
        raise ValueError("id is required")
    return f"/dataproducts/{quote(str(data_product_id), safe='')}"


def _rebuild_body(body: Mapping[str, Any]) -> dict[str, Any]:
    if body.get("confirm") is not True:
        raise ValidationError(
            "Iceberg rebuild permanently deletes the table and requires confirm=True",
            [{"field": "confirm", "message": "must be True"}],
        )
    if not body.get("backfill_from"):
        raise ValidationError(
            "backfill_from is required (a z/ queue eid)",
            [{"field": "backfill_from", "message": "required"}],
        )
    return dict(body)


def _check_history_off(enabled: bool, confirm: bool) -> None:
    if not enabled and confirm is not True:
        raise ValidationError(
            "Turning event history off stops appends; events while off are never recorded. Pass confirm=True.",
            [{"field": "confirm", "message": "required to turn history off"}],
        )


def _history_put_body(enabled: bool) -> dict[str, Any]:
    # The PUT merges storage_indexing_preferences per key; it refuses
    # (409 iceberg_required) when the product has no Iceberg.
    return {"metadata": {"storage_indexing_preferences": {"history_enabled": enabled}}}


def _trace_path(
    data_product_id: str, eid: str, max_hops: Optional[int], max_rows: Optional[int]
) -> str:
    if not isinstance(eid, str) or not _TRACE_EID_RE.fullmatch(eid):
        raise ValidationError("eid must be a z/… queue eid", [{"field": "eid", "message": "must match z/…"}])
    params: dict[str, Any] = {"eid": eid}
    for name, value in (("max_hops", max_hops), ("max_rows", max_rows)):
        if value is None:
            continue
        limit = _TRACE_BOUNDS[name]
        if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= limit:
            raise ValidationError(
                f"{name} must be an integer from 1 to {limit}",
                [{"field": name, "message": f"1–{limit}"}],
            )
        params[name] = value
    return f"{_base(data_product_id)}/iceberg/trace?{urlencode(params)}"


class IcebergApi:
    """Sync Iceberg control (MCP: get_iceberg_health, enable/rebuild_iceberg_table, set_iceberg_history, trace_iceberg_event)."""

    def __init__(self, http: Any) -> None:
        self._http = http

    def rebuild(self, data_product_id: str, body: Mapping[str, Any]) -> dict[str, Any]:
        """Permanent delete + recreate + backfill. ``body`` needs ``confirm=True`` and ``backfill_from``."""
        return _unwrap(self._http.post(f"{_base(data_product_id)}/iceberg/rebuild", _rebuild_body(body)))

    def health(self, data_product_id: str) -> dict[str, Any]:
        """Catalog health; ``history`` holds the event history table status."""
        return _unwrap(self._http.get(f"{_base(data_product_id)}/iceberg/health"))

    def status(self, data_product_id: str) -> dict[str, Any]:
        return _unwrap(self._http.get(f"{_base(data_product_id)}/iceberg"))

    def cancel(self, data_product_id: str) -> dict[str, Any]:
        return _unwrap(self._http.post(f"{_base(data_product_id)}/iceberg/rebuild/cancel", {}))

    def enable(self, data_product_id: str, body: Mapping[str, Any]) -> dict[str, Any]:
        return _unwrap(self._http.post(f"{_base(data_product_id)}/iceberg", dict(body)))

    def put_config(self, data_product_id: str, body: Mapping[str, Any]) -> dict[str, Any]:
        return _unwrap(self._http.put(f"{_base(data_product_id)}/iceberg/config", dict(body)))

    def files(self, data_product_id: str) -> dict[str, Any]:
        return _unwrap(self._http.get(f"{_base(data_product_id)}/iceberg/files"))

    def snapshots(self, data_product_id: str) -> dict[str, Any]:
        return _unwrap(self._http.get(f"{_base(data_product_id)}/iceberg/snapshots"))

    def set_history(
        self, data_product_id: str, enabled: bool, *, confirm: bool = False
    ) -> dict[str, Any]:
        """Turn the ``<name>.history`` table on or off. Off requires ``confirm=True``."""
        _check_history_off(enabled, confirm)
        self._http.put(_base(data_product_id), _history_put_body(enabled))
        return {"data_product_id": data_product_id, "history_enabled": enabled}

    def trace(
        self,
        data_product_id: str,
        eid: str,
        *,
        max_hops: Optional[int] = None,
        max_rows: Optional[int] = None,
    ) -> dict[str, Any]:
        """Walk one event upstream over history tables. Returns ``steps`` and ``stops``."""
        return _unwrap(self._http.get(_trace_path(data_product_id, eid, max_hops, max_rows)))


class AsyncIcebergApi:
    """Async Iceberg control; same methods as :class:`IcebergApi`."""

    def __init__(self, http: Any) -> None:
        self._http = http

    async def rebuild(self, data_product_id: str, body: Mapping[str, Any]) -> dict[str, Any]:
        return _unwrap(
            await self._http.post(f"{_base(data_product_id)}/iceberg/rebuild", _rebuild_body(body))
        )

    async def health(self, data_product_id: str) -> dict[str, Any]:
        return _unwrap(await self._http.get(f"{_base(data_product_id)}/iceberg/health"))

    async def status(self, data_product_id: str) -> dict[str, Any]:
        return _unwrap(await self._http.get(f"{_base(data_product_id)}/iceberg"))

    async def cancel(self, data_product_id: str) -> dict[str, Any]:
        return _unwrap(await self._http.post(f"{_base(data_product_id)}/iceberg/rebuild/cancel", {}))

    async def enable(self, data_product_id: str, body: Mapping[str, Any]) -> dict[str, Any]:
        return _unwrap(await self._http.post(f"{_base(data_product_id)}/iceberg", dict(body)))

    async def put_config(self, data_product_id: str, body: Mapping[str, Any]) -> dict[str, Any]:
        return _unwrap(await self._http.put(f"{_base(data_product_id)}/iceberg/config", dict(body)))

    async def files(self, data_product_id: str) -> dict[str, Any]:
        return _unwrap(await self._http.get(f"{_base(data_product_id)}/iceberg/files"))

    async def snapshots(self, data_product_id: str) -> dict[str, Any]:
        return _unwrap(await self._http.get(f"{_base(data_product_id)}/iceberg/snapshots"))

    async def set_history(
        self, data_product_id: str, enabled: bool, *, confirm: bool = False
    ) -> dict[str, Any]:
        _check_history_off(enabled, confirm)
        await self._http.put(_base(data_product_id), _history_put_body(enabled))
        return {"data_product_id": data_product_id, "history_enabled": enabled}

    async def trace(
        self,
        data_product_id: str,
        eid: str,
        *,
        max_hops: Optional[int] = None,
        max_rows: Optional[int] = None,
    ) -> dict[str, Any]:
        return _unwrap(await self._http.get(_trace_path(data_product_id, eid, max_hops, max_rows)))
