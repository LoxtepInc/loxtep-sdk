"""
Data products API. get, get_lexicon, list, create, search, query, list_tables,
get_queue_info, get_reader_checkpoint, readiness, promote, get_usage_map,
stream, replay, get_writer, get_reader, invalidate_cache.

Writer/reader use the HTTP data path (consistent with stream/replay); the
Node.js SDK uses the rstreams stream bus for the same surface.
"""

from __future__ import annotations

import re
from typing import Any, AsyncIterator, Iterator, Optional

from .http_client import AsyncLoxtepHttpClient, LoxtepHttpClient
from .models import DataProductKind, UsageMap, UsageMapEdge, UsageMapNode

_UUID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)


def _query_string(params: dict[str, Any]) -> str:
    parts = [f"{k}={v}" for k, v in params.items() if v is not None]
    return "?" + "&".join(parts) if parts else ""


def _unwrap(res: Any) -> Any:
    return res.get("data", res) if isinstance(res, dict) else res


def _derive_lexicon(asset: dict[str, Any]) -> dict[str, Any]:
    metadata = asset.get("metadata") if isinstance(asset.get("metadata"), dict) else {}
    glossary_terms = (
        asset.get("glossary_terms")
        or (metadata.get("business_glossary") if isinstance(metadata, dict) else None)
        or {}
    )
    field_glossary_map = metadata.get("field_glossary_map") if isinstance(metadata, dict) else None
    out: dict[str, Any] = {"glossary_terms": glossary_terms}
    if field_glossary_map is not None:
        out["field_glossary_map"] = field_glossary_map
    return out


class DataProductWriter:
    """Sync writer bound to a data product (HTTP data path)."""

    def __init__(self, data_product_id: str, http: LoxtepHttpClient) -> None:
        self._id = data_product_id
        self._http = http

    def write(self, event: dict[str, Any]) -> None:
        self._http.post(f"/dataproducts/{self._id}/events", event)

    def close(self) -> None:
        pass


class AsyncDataProductWriter:
    """Async writer bound to a data product (HTTP data path)."""

    def __init__(self, data_product_id: str, http: AsyncLoxtepHttpClient) -> None:
        self._id = data_product_id
        self._http = http

    async def write(self, event: dict[str, Any]) -> None:
        await self._http.post(f"/dataproducts/{self._id}/events", event)

    async def close(self) -> None:
        pass


class DataProductsApi:
    """Sync data_products surface."""

    def __init__(
        self,
        http: LoxtepHttpClient,
        get_queue_metadata: Optional[Any] = None,
        get_reader_checkpoint: Optional[Any] = None,
        stream_config: Optional[Any] = None,
    ) -> None:
        self._http = http
        self._get_queue_metadata = get_queue_metadata
        self._get_reader_checkpoint = get_reader_checkpoint
        self._stream_config = stream_config
        self._resolve_cache: dict[str, str] = {}

    def _resolve_queue_name(self, dp_id: str) -> Optional[str]:
        asset = self.get(dp_id)
        storage = asset.get("storage") if isinstance(asset, dict) else None
        if isinstance(storage, dict):
            q = storage.get("rstreams_queue")
            if isinstance(q, str) and q:
                return q
        return None

    def get(self, id: str, *, include_schema: bool = False, include_quality: bool = False) -> dict[str, Any]:
        qs = _query_string({"include_schema": include_schema, "include_quality": include_quality})
        res = self._http.get(f"/dataproducts/{id}{qs}")
        return _unwrap(res)

    def get_lexicon(self, id: str) -> dict[str, Any]:
        """Derive the data product lexicon (glossary terms + field map) from the asset."""
        asset = self.get(id)
        return _derive_lexicon(asset if isinstance(asset, dict) else {})

    def list(
        self,
        *,
        page: int = 1,
        page_size: int = 100,
        domain_id: Optional[str] = None,
        status: Optional[str] = None,
        kind: Optional[DataProductKind] = None,
        sort_by: str = "created_at",
        sort_order: str = "desc",
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"page": page, "page_size": page_size, "sort_by": sort_by, "sort_order": sort_order}
        if domain_id is not None:
            params["domain_id"] = domain_id
        if status is not None:
            params["status"] = status
        if kind is not None:
            params["kind"] = kind
        qs = _query_string(params)
        res = self._http.get(f"/dataproducts{qs}")
        return _unwrap(res)

    def create(
        self,
        *,
        name: str,
        kind: DataProductKind,
        description: str = "",
        domain: str = "",
        **kwargs: Any,
    ) -> dict[str, Any]:
        """Create a new data product. `kind` is required ('source' or 'consumer')."""
        body: dict[str, Any] = {"name": name, "kind": kind, "description": description, "domain": domain, **kwargs}
        res = self._http.post("/dataproducts", body)
        return _unwrap(res)

    def readiness(self, data_product_id: str) -> dict[str, Any]:
        """Promotion readiness (prerequisites, progress, promotable)."""
        res = self._http.get(f"/graph/promotions/{data_product_id}/readiness")
        return _unwrap(res)

    def promote(self, data_product_id: str, target_tier: str) -> dict[str, Any]:
        """Execute medallion tier promotion. target_tier: 'silver' | 'gold'."""
        res = self._http.post(
            f"/graph/promotions/{data_product_id}/promote", {"target_tier": target_tier}
        )
        return _unwrap(res)

    def invalidate_cache(self, id_or_name: Optional[str] = None) -> None:
        """Clear the name→id resolution cache (all, or one entry)."""
        if id_or_name is None:
            self._resolve_cache.clear()
        else:
            self._resolve_cache.pop(id_or_name.lower(), None)

    def get_usage_map(self) -> tuple[list[UsageMapNode], list[UsageMapEdge]]:
        res = self._http.get("/dataproducts/usage-map")
        data = _unwrap(res)
        if not isinstance(data, dict):
            return ([], [])
        usage_map = UsageMap.model_validate(data)
        return (usage_map.nodes, usage_map.edges)

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
            return self._get_queue_metadata(id) if callable(self._get_queue_metadata) else {}
        res = self._http.get(f"/dataproducts/{id}/queue")
        return res.get("data", res)

    def get_reader_checkpoint(self, id: str, bot_id: str) -> dict[str, Any]:
        if self._get_reader_checkpoint:
            return self._get_reader_checkpoint(id, bot_id) if callable(self._get_reader_checkpoint) else {}
        res = self._http.get(f"/dataproducts/{id}/queue/checkpoint?bot_id={bot_id}")
        return res.get("data", res)

    def _resolve_id(self, id_or_name: str) -> str:
        """Resolve a data product name or UUID to its id (HTTP, cached)."""
        key = id_or_name.lower()
        cached = self._resolve_cache.get(key)
        if cached:
            return cached
        if _UUID_RE.match(id_or_name):
            self._resolve_cache[key] = id_or_name
            return id_or_name
        res = self._http.get(f"/dataproducts?search={id_or_name}")
        data = _unwrap(res)
        items = data.get("items", []) if isinstance(data, dict) else []
        matches = [dp for dp in items if dp.get("name") == id_or_name]
        if not matches:
            from .errors import NotFoundError

            raise NotFoundError(
                f"Data product '{id_or_name}' not found", resource_type="data_product", resource_id=id_or_name
            )
        resolved = matches[0].get("data_product_id") or matches[0].get("id")
        self._resolve_cache[key] = resolved
        return resolved

    def get_writer(
        self, id_or_name: str, *, bot_id: Optional[str] = None, queue_name: Optional[str] = None
    ) -> Any:
        """Return a writer bound to the data product (resolves name→id).

        When the client is configured with stream-bus config (`streams=` or
        LEO_* env), returns a `LeoStreamWriter` that produces to Kinesis (the
        performant path, matching the Node.js SDK). Otherwise returns an
        HTTP-based writer.
        """
        dp_id = self._resolve_id(id_or_name)
        cfg = self._stream_config
        if cfg is not None and getattr(cfg, "is_writable", False):
            from .rstreams import LeoStreamWriter

            queue = queue_name or self._resolve_queue_name(dp_id)
            if not queue:
                raise ValueError(
                    f"Cannot resolve a stream queue for '{id_or_name}'. Pass queue_name=, "
                    "or ensure the data product is deployed (storage.rstreams_queue)."
                )
            return LeoStreamWriter(cfg, bot_id or f"sdk-writer-{id_or_name}", queue)
        return DataProductWriter(dp_id, self._http)

    def get_reader(
        self,
        id_or_name: str,
        *,
        bot_id: Optional[str] = None,
        queue_name: Optional[str] = None,
        start: Optional[str] = None,
        batch_size: int = 100,
    ) -> Iterator[dict[str, Any]]:
        """Return an iterator of events for the data product (resolves name→id).

        When the client has readable stream-bus config, consumes from the bus
        (DynamoDB/S3); otherwise falls back to the HTTP stream endpoint.
        """
        dp_id = self._resolve_id(id_or_name)
        cfg = self._stream_config
        if cfg is not None and getattr(cfg, "is_readable", False):
            from .rstreams import LeoStreamReader

            queue = queue_name or self._resolve_queue_name(dp_id)
            if not queue:
                raise ValueError(
                    f"Cannot resolve a stream queue for '{id_or_name}'. Pass queue_name=, "
                    "or ensure the data product is deployed (storage.rstreams_queue)."
                )
            return iter(
                LeoStreamReader(
                    cfg,
                    bot_id or f"sdk-reader-{id_or_name}",
                    queue,
                    start=start,
                    batch_size=batch_size,
                )
            )
        return self.stream(dp_id, start=start, batch_size=batch_size)

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
        stream_config: Optional[Any] = None,
    ) -> None:
        self._http = http
        self._get_queue_metadata = get_queue_metadata
        self._get_reader_checkpoint = get_reader_checkpoint
        self._stream_config = stream_config
        self._resolve_cache: dict[str, str] = {}

    async def _resolve_queue_name(self, dp_id: str) -> Optional[str]:
        asset = await self.get(dp_id)
        storage = asset.get("storage") if isinstance(asset, dict) else None
        if isinstance(storage, dict):
            q = storage.get("rstreams_queue")
            if isinstance(q, str) and q:
                return q
        return None

    async def get(self, id: str, *, include_schema: bool = False, include_quality: bool = False) -> dict[str, Any]:
        qs = _query_string({"include_schema": include_schema, "include_quality": include_quality})
        res = await self._http.get(f"/dataproducts/{id}{qs}")
        return _unwrap(res)

    async def get_lexicon(self, id: str) -> dict[str, Any]:
        asset = await self.get(id)
        return _derive_lexicon(asset if isinstance(asset, dict) else {})

    async def list(
        self,
        *,
        page: int = 1,
        page_size: int = 100,
        domain_id: Optional[str] = None,
        status: Optional[str] = None,
        kind: Optional[DataProductKind] = None,
        sort_by: str = "created_at",
        sort_order: str = "desc",
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"page": page, "page_size": page_size, "sort_by": sort_by, "sort_order": sort_order}
        if domain_id is not None:
            params["domain_id"] = domain_id
        if status is not None:
            params["status"] = status
        if kind is not None:
            params["kind"] = kind
        qs = _query_string(params)
        res = await self._http.get(f"/dataproducts{qs}")
        return _unwrap(res)

    async def create(
        self,
        *,
        name: str,
        kind: DataProductKind,
        description: str = "",
        domain: str = "",
        **kwargs: Any,
    ) -> dict[str, Any]:
        """Create a new data product. `kind` is required ('source' or 'consumer')."""
        body: dict[str, Any] = {"name": name, "kind": kind, "description": description, "domain": domain, **kwargs}
        res = await self._http.post("/dataproducts", body)
        return _unwrap(res)

    async def readiness(self, data_product_id: str) -> dict[str, Any]:
        res = await self._http.get(f"/graph/promotions/{data_product_id}/readiness")
        return _unwrap(res)

    async def promote(self, data_product_id: str, target_tier: str) -> dict[str, Any]:
        res = await self._http.post(
            f"/graph/promotions/{data_product_id}/promote", {"target_tier": target_tier}
        )
        return _unwrap(res)

    def invalidate_cache(self, id_or_name: Optional[str] = None) -> None:
        if id_or_name is None:
            self._resolve_cache.clear()
        else:
            self._resolve_cache.pop(id_or_name.lower(), None)

    async def get_usage_map(self) -> tuple[list[UsageMapNode], list[UsageMapEdge]]:
        res = await self._http.get("/dataproducts/usage-map")
        data = _unwrap(res)
        if not isinstance(data, dict):
            return ([], [])
        usage_map = UsageMap.model_validate(data)
        return (usage_map.nodes, usage_map.edges)

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

    async def _resolve_id(self, id_or_name: str) -> str:
        key = id_or_name.lower()
        cached = self._resolve_cache.get(key)
        if cached:
            return cached
        if _UUID_RE.match(id_or_name):
            self._resolve_cache[key] = id_or_name
            return id_or_name
        res = await self._http.get(f"/dataproducts?search={id_or_name}")
        data = _unwrap(res)
        items = data.get("items", []) if isinstance(data, dict) else []
        matches = [dp for dp in items if dp.get("name") == id_or_name]
        if not matches:
            from .errors import NotFoundError

            raise NotFoundError(
                f"Data product '{id_or_name}' not found", resource_type="data_product", resource_id=id_or_name
            )
        resolved = matches[0].get("data_product_id") or matches[0].get("id")
        self._resolve_cache[key] = resolved
        return resolved

    async def get_writer(
        self, id_or_name: str, *, bot_id: Optional[str] = None, queue_name: Optional[str] = None
    ) -> Any:
        """Async writer. Uses the native Kinesis bus when stream config is
        present, else the HTTP data path."""
        dp_id = await self._resolve_id(id_or_name)
        cfg = self._stream_config
        if cfg is not None and getattr(cfg, "is_writable", False):
            from .rstreams import AsyncLeoStreamWriter

            queue = queue_name or await self._resolve_queue_name(dp_id)
            if not queue:
                raise ValueError(
                    f"Cannot resolve a stream queue for '{id_or_name}'. Pass queue_name=, "
                    "or ensure the data product is deployed (storage.rstreams_queue)."
                )
            return AsyncLeoStreamWriter(cfg, bot_id or f"sdk-writer-{id_or_name}", queue)
        return AsyncDataProductWriter(dp_id, self._http)

    async def get_reader(
        self,
        id_or_name: str,
        *,
        bot_id: Optional[str] = None,
        queue_name: Optional[str] = None,
        start: Optional[str] = None,
        batch_size: int = 100,
    ) -> AsyncIterator[dict[str, Any]]:
        """Async reader. Consumes from the bus when readable stream config is
        present, else the HTTP stream endpoint."""
        dp_id = await self._resolve_id(id_or_name)
        cfg = self._stream_config
        if cfg is not None and getattr(cfg, "is_readable", False):
            from .rstreams import AsyncLeoStreamReader

            queue = queue_name or await self._resolve_queue_name(dp_id)
            if not queue:
                raise ValueError(
                    f"Cannot resolve a stream queue for '{id_or_name}'. Pass queue_name=, "
                    "or ensure the data product is deployed (storage.rstreams_queue)."
                )
            return AsyncLeoStreamReader(
                cfg, bot_id or f"sdk-reader-{id_or_name}", queue, start=start, batch_size=batch_size
            )
        return self.stream(dp_id, start=start, batch_size=batch_size)

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
