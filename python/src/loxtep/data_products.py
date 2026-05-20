"""
Data products API. get, list, search, query, list_tables, stream, replay.
"""

from typing import Any, AsyncIterator, Iterator, Optional

from .http_client import AsyncLoxtepHttpClient, LoxtepHttpClient


def _query_string(params: dict[str, Any]) -> str:
    parts = [f"{k}={v}" for k, v in params.items() if v is not None]
    return "?" + "&".join(parts) if parts else ""


class DataProductsApi:
    """Sync data_products surface."""

    def __init__(
        self,
        http: LoxtepHttpClient,
        get_queue_metadata: Optional[Any] = None,
        get_reader_checkpoint: Optional[Any] = None,
    ) -> None:
        self._http = http
        self._get_queue_metadata = get_queue_metadata
        self._get_reader_checkpoint = get_reader_checkpoint

    def get(self, id: str, *, include_schema: bool = False, include_quality: bool = False) -> dict[str, Any]:
        qs = _query_string({"include_schema": include_schema, "include_quality": include_quality})
        res = self._http.get(f"/dataproducts/{id}{qs}")
        return res.get("data", res) if isinstance(res, dict) else res

    def list(
        self,
        *,
        page: int = 1,
        page_size: int = 100,
        domain_id: Optional[str] = None,
        status: Optional[str] = None,
        sort_by: str = "created_at",
        sort_order: str = "desc",
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"page": page, "page_size": page_size, "sort_by": sort_by, "sort_order": sort_order}
        if domain_id is not None:
            params["domain_id"] = domain_id
        if status is not None:
            params["status"] = status
        qs = _query_string(params)
        res = self._http.get(f"/dataproducts{qs}")
        return res.get("data", res) if isinstance(res, dict) else res

    def search(
        self,
        query: str,
        *,
        type: str = "data_product",
        limit: int = 20,
        offset: int = 0,
    ) -> dict[str, Any]:
        qs = _query_string({"q": query, "type": type, "limit": limit, "offset": offset})
        return self._http.get(f"/search{qs}")

    def query(self, id: str, sql: str) -> dict[str, Any]:
        res = self._http.post("/dataproducts/query", {"data_product_id": id, "sql": sql})
        return res.get("data", {"items": [], "metadata": {"data_product_id": id}})

    def list_tables(self, id: str) -> dict[str, Any]:
        res = self._http.get(f"/dataproducts/{id}/tables")
        return res.get("data", {"items": []})

    def get_queue_info(self, id: str) -> dict[str, Any]:
        if self._get_queue_metadata:
            # Resolve by data product id -> queue name; SDK may call backend to resolve
            return self._get_queue_metadata(id) if callable(self._get_queue_metadata) else {}
        res = self._http.get(f"/dataproducts/{id}/queue")
        return res.get("data", res)

    def get_reader_checkpoint(self, id: str, bot_id: str) -> dict[str, Any]:
        if self._get_reader_checkpoint:
            return self._get_reader_checkpoint(id, bot_id) if callable(self._get_reader_checkpoint) else {}
        res = self._http.get(f"/dataproducts/{id}/queue/checkpoint?bot_id={bot_id}")
        return res.get("data", res)

    def stream(
        self,
        id: str,
        *,
        start: Optional[str] = None,
        batch_size: int = 100,
    ) -> Iterator[dict[str, Any]]:
        """Sync generator over stream events. Polling-based for sync."""
        params: dict[str, Any] = {"batch_size": batch_size}
        if start is not None:
            params["start"] = start
        qs = _query_string(params)
        next_url = f"/dataproducts/{id}/stream{qs}"
        while next_url:
            res = self._http.get(next_url)
            items = res.get("items", []) if isinstance(res, dict) else []
            for item in items:
                yield item
            next_url = res.get("next", "") if isinstance(res, dict) else ""

    def replay(
        self,
        id: str,
        *,
        start: Optional[str] = None,
        batch_size: int = 100,
    ) -> Iterator[dict[str, Any]]:
        """Sync generator over replay events."""
        params: dict[str, Any] = {"batch_size": batch_size}
        if start is not None:
            params["start"] = start
        qs = _query_string(params)
        next_url = f"/dataproducts/{id}/replay{qs}"
        while next_url:
            res = self._http.get(next_url)
            items = res.get("items", []) if isinstance(res, dict) else []
            for item in items:
                yield item
            next_url = res.get("next", "") if isinstance(res, dict) else ""


class AsyncDataProductsApi:
    """Async data_products surface."""

    def __init__(
        self,
        http: AsyncLoxtepHttpClient,
        get_queue_metadata: Optional[Any] = None,
        get_reader_checkpoint: Optional[Any] = None,
    ) -> None:
        self._http = http
        self._get_queue_metadata = get_queue_metadata
        self._get_reader_checkpoint = get_reader_checkpoint

    async def get(self, id: str, *, include_schema: bool = False, include_quality: bool = False) -> dict[str, Any]:
        qs = _query_string({"include_schema": include_schema, "include_quality": include_quality})
        res = await self._http.get(f"/dataproducts/{id}{qs}")
        return res.get("data", res) if isinstance(res, dict) else res

    async def list(
        self,
        *,
        page: int = 1,
        page_size: int = 100,
        domain_id: Optional[str] = None,
        status: Optional[str] = None,
        sort_by: str = "created_at",
        sort_order: str = "desc",
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"page": page, "page_size": page_size, "sort_by": sort_by, "sort_order": sort_order}
        if domain_id is not None:
            params["domain_id"] = domain_id
        if status is not None:
            params["status"] = status
        qs = _query_string(params)
        res = await self._http.get(f"/dataproducts{qs}")
        return res.get("data", res) if isinstance(res, dict) else res

    async def search(
        self,
        query: str,
        *,
        type: str = "data_product",
        limit: int = 20,
        offset: int = 0,
    ) -> dict[str, Any]:
        qs = _query_string({"q": query, "type": type, "limit": limit, "offset": offset})
        return await self._http.get(f"/search{qs}")

    async def query(self, id: str, sql: str) -> dict[str, Any]:
        res = await self._http.post("/dataproducts/query", {"data_product_id": id, "sql": sql})
        return res.get("data", {"items": [], "metadata": {"data_product_id": id}})

    async def list_tables(self, id: str) -> dict[str, Any]:
        res = await self._http.get(f"/dataproducts/{id}/tables")
        return res.get("data", {"items": []})

    async def get_queue_info(self, id: str) -> dict[str, Any]:
        if self._get_queue_metadata and callable(self._get_queue_metadata):
            asset = await self.get(id)
            storage = asset.get("storage") if isinstance(asset.get("storage"), dict) else {}
            queue_name = storage.get("rstreams_queue", "") if isinstance(storage, dict) else ""
            if not queue_name:
                return {}
            out = self._get_queue_metadata(queue_name)
            return await out if hasattr(out, "__await__") else out
        res = await self._http.get(f"/dataproducts/{id}/queue")
        return res.get("data", res)

    async def get_reader_checkpoint(self, id: str, bot_id: str) -> dict[str, Any]:
        if self._get_reader_checkpoint and callable(self._get_reader_checkpoint):
            asset = await self.get(id)
            storage = asset.get("storage") if isinstance(asset.get("storage"), dict) else {}
            queue_name = storage.get("rstreams_queue", "") if isinstance(storage, dict) else ""
            if not queue_name:
                return {}
            out = self._get_reader_checkpoint(queue_name, bot_id)
            return await out if hasattr(out, "__await__") else out
        res = await self._http.get(f"/dataproducts/{id}/queue/checkpoint?bot_id={bot_id}")
        return res.get("data", res)

    async def stream(
        self,
        id: str,
        *,
        start: Optional[str] = None,
        batch_size: int = 100,
    ) -> AsyncIterator[dict[str, Any]]:
        params: dict[str, Any] = {"batch_size": batch_size}
        if start is not None:
            params["start"] = start
        qs = _query_string(params)
        next_url = f"/dataproducts/{id}/stream{qs}"
        while next_url:
            res = await self._http.get(next_url)
            items = res.get("items", []) if isinstance(res, dict) else []
            for item in items:
                yield item
            next_url = res.get("next", "") if isinstance(res, dict) else ""

    async def replay(
        self,
        id: str,
        *,
        start: Optional[str] = None,
        batch_size: int = 100,
    ) -> AsyncIterator[dict[str, Any]]:
        params: dict[str, Any] = {"batch_size": batch_size}
        if start is not None:
            params["start"] = start
        qs = _query_string(params)
        next_url = f"/dataproducts/{id}/replay{qs}"
        while next_url:
            res = await self._http.get(next_url)
            items = res.get("items", []) if isinstance(res, dict) else []
            for item in items:
                yield item
            next_url = res.get("next", "") if isinstance(res, dict) else ""
