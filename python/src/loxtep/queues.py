"""
Queues API. get_queue_metadata, get_reader_checkpoint, open_reader, open_writer.
No get_leo_sdk in public API.
"""

from typing import Any, AsyncIterator, Iterator, Optional

from .http_client import AsyncLoxtepHttpClient, LoxtepHttpClient


def _query_string(params: dict[str, Any]) -> str:
    parts = [f"{k}={v}" for k, v in params.items() if v is not None]
    return "?" + "&".join(parts) if parts else ""


class QueuesApi:
    """Sync queues surface."""

    def __init__(self, http: LoxtepHttpClient) -> None:
        self._http = http

    def get_queue_metadata(self, queue_name: str) -> dict[str, Any]:
        res = self._http.get("/observe/queues")
        data = res.get("data", res) if isinstance(res, dict) else res
        queues = data.get("queues", []) if isinstance(data, dict) else (res if isinstance(res, list) else [])
        for q in queues:
            if q.get("queue_name") == queue_name or q.get("name") == queue_name:
                return q
        return {"queue_name": queue_name, "checkpoints": [], "readers": [], "writers": [], "stats": {}}

    def get_reader_checkpoint(self, queue_name: str, bot_id: str) -> dict[str, Any]:
        qs = _query_string({"queue_name": queue_name, "bot_id": bot_id})
        return self._http.get(f"/observe/queues/checkpoint{qs}")

    def open_reader(
        self,
        bot_id: str,
        queue_name: str,
        *,
        start: Optional[str] = None,
        batch_size: int = 100,
    ) -> "QueueReaderHandle":
        return QueueReaderHandle(
            http=self._http,
            queue_name=queue_name,
            start=start,
            batch_size=batch_size,
        )

    def open_writer(self, bot_id: str, queue_name: str) -> "QueueWriterHandle":
        return QueueWriterHandle(bot_id=bot_id, queue_name=queue_name, http=self._http)


class QueueReaderHandle:
    """Sync reader: read() yields events."""

    def __init__(
        self,
        http: LoxtepHttpClient,
        queue_name: str,
        *,
        start: Optional[str] = None,
        batch_size: int = 100,
    ) -> None:
        self._http = http
        self._queue_name = queue_name
        self._start = start
        self._batch_size = batch_size

    def read(self) -> Iterator[dict[str, Any]]:
        path = f"/observe/trace/{self._queue_name}/events"
        start = self._start
        while True:
            qs = _query_string({"start": start, "limit": self._batch_size})
            res = self._http.get(f"{path}{qs}")
            data = res.get("data", res) if isinstance(res, dict) else res
            events = data.get("events", []) if isinstance(data, dict) else res.get("events", []) if isinstance(res, dict) else []
            for event in events:
                yield event
            if len(events) < self._batch_size:
                break
            if not events:
                break
            last = events[-1]
            start = last.get("event_id") or last.get("id")
            if not start:
                break


class QueueWriterHandle:
    """Sync writer: write(event), close()."""

    def __init__(self, bot_id: str, queue_name: str, http: LoxtepHttpClient) -> None:
        self._bot_id = bot_id
        self._queue_name = queue_name
        self._http = http

    def write(self, event: dict[str, Any]) -> None:
        self._http.post(f"/observe/trace/{self._queue_name}/events", event)

    def close(self) -> None:
        pass


class AsyncQueuesApi:
    """Async queues surface."""

    def __init__(self, http: AsyncLoxtepHttpClient) -> None:
        self._http = http

    async def get_queue_metadata(self, queue_name: str) -> dict[str, Any]:
        res = await self._http.get("/observe/queues")
        data = res.get("data", res) if isinstance(res, dict) else res
        queues = data.get("queues", []) if isinstance(data, dict) else (res if isinstance(res, list) else [])
        for q in queues:
            if q.get("queue_name") == queue_name or q.get("name") == queue_name:
                return q
        return {"queue_name": queue_name, "checkpoints": [], "readers": [], "writers": [], "stats": {}}

    async def get_reader_checkpoint(self, queue_name: str, bot_id: str) -> dict[str, Any]:
        qs = _query_string({"queue_name": queue_name, "bot_id": bot_id})
        return await self._http.get(f"/observe/queues/checkpoint{qs}")

    def open_reader(
        self,
        bot_id: str,
        queue_name: str,
        *,
        start: Optional[str] = None,
        batch_size: int = 100,
    ) -> "AsyncQueueReaderHandle":
        return AsyncQueueReaderHandle(
            http=self._http,
            queue_name=queue_name,
            start=start,
            batch_size=batch_size,
        )

    def open_writer(self, bot_id: str, queue_name: str) -> "AsyncQueueWriterHandle":
        return AsyncQueueWriterHandle(bot_id=bot_id, queue_name=queue_name, http=self._http)


class AsyncQueueReaderHandle:
    """Async reader: read() async iterates events."""

    def __init__(
        self,
        http: AsyncLoxtepHttpClient,
        queue_name: str,
        *,
        start: Optional[str] = None,
        batch_size: int = 100,
    ) -> None:
        self._http = http
        self._queue_name = queue_name
        self._start = start
        self._batch_size = batch_size

    async def read(self) -> AsyncIterator[dict[str, Any]]:
        path = f"/observe/trace/{self._queue_name}/events"
        start = self._start
        while True:
            qs = _query_string({"start": start, "limit": self._batch_size})
            res = await self._http.get(f"{path}{qs}")
            data = res.get("data", res) if isinstance(res, dict) else res
            events = data.get("events", []) if isinstance(data, dict) else res.get("events", []) if isinstance(res, dict) else []
            for event in events:
                yield event
            if len(events) < self._batch_size:
                break
            if not events:
                break
            last = events[-1]
            start = last.get("event_id") or last.get("id")
            if not start:
                break


class AsyncQueueWriterHandle:
    """Async writer."""

    def __init__(self, bot_id: str, queue_name: str, http: AsyncLoxtepHttpClient) -> None:
        self._bot_id = bot_id
        self._queue_name = queue_name
        self._http = http

    async def write(self, event: dict[str, Any]) -> None:
        await self._http.post(f"/observe/trace/{self._queue_name}/events", event)

    async def close(self) -> None:
        pass
