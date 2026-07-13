"""
Leo Kinesis producer (native Loxtep implementation).

Writes business objects to the Loxtep stream bus by putting gzipped,
newline-delimited JSON (NDJSON) chunks of Leo envelopes onto the Kinesis
stream (`LeoKinesisStream`). The bus processor lambda assigns real event ids
and persists them to the event store — matching the Node.js SDK's write path.

This is the first piece of the native RStreams port; the reader (DynamoDB/S3
consumer + checkpointing) is planned.
"""

from __future__ import annotations

import asyncio
import gzip
import json
import time
from typing import Any, Optional

from .config import StreamConfig

# Kinesis hard limit is 1 MB per record. A single event larger than this must be
# offloaded to S3 (a documented follow-up); we raise rather than silently fail.
_MAX_SINGLE_EVENT_BYTES = 1024 * 1024


def _now_ms() -> int:
    return int(time.time() * 1000)


def build_envelope(
    business_object: Any,
    *,
    bot_id: str,
    queue: str,
    event_source_timestamp: Optional[int] = None,
) -> dict[str, Any]:
    """Build a Leo envelope for a business object.

    `id` is the SOURCE-BOT identity (the writer), `event` is the target queue,
    and the business object is always the `payload`.
    """
    now = _now_ms()
    return {
        "id": bot_id,
        "event": queue,
        "payload": business_object,
        "event_source_timestamp": event_source_timestamp if event_source_timestamp is not None else now,
        "timestamp": now,
    }


class StreamBusUnavailableError(RuntimeError):
    """Raised when the stream bus cannot be used (missing boto3 or config)."""


class LeoStreamWriter:
    """Buffered Kinesis writer. `write(obj)` buffers; `close()` flushes.

    Batching mirrors the Node SDK defaults: flush when the buffer reaches
    `max_batch_records`, or the estimated uncompressed size exceeds
    `max_batch_bytes`, or on `close()`. Each flush emits ONE Kinesis record: a
    gzip of the NDJSON-concatenated envelopes, PartitionKey ``"0"``.
    """

    def __init__(
        self,
        config: StreamConfig,
        bot_id: str,
        queue: str,
        *,
        max_batch_records: int = 100,
        max_batch_bytes: int = 200 * 1024,
        max_attempts: int = 10,
        kinesis_client: Any = None,
    ) -> None:
        if not config.is_writable:
            raise StreamBusUnavailableError(
                "Stream config is not writable (need region + kinesis_stream). "
                "Pass `streams` to the client or set LEO_* env vars."
            )
        self._config = config
        self._bot_id = bot_id
        self._queue = queue
        self._max_batch_records = max_batch_records
        self._max_batch_bytes = max_batch_bytes
        self._max_attempts = max_attempts
        self._buffer: list[dict[str, Any]] = []
        self._buffered_bytes = 0
        self._closed = False
        self._client = kinesis_client if kinesis_client is not None else self._make_client()

    def _make_client(self) -> Any:
        try:
            import boto3  # noqa: PLC0415
        except ImportError as exc:  # pragma: no cover - env dependent
            raise StreamBusUnavailableError(
                "boto3 is required for stream-bus writes. Install with: pip install loxtep[streams]"
            ) from exc
        return boto3.client("kinesis", region_name=self._config.region)

    def write(self, business_object: Any, *, event_source_timestamp: Optional[int] = None) -> None:
        if self._closed:
            raise StreamBusUnavailableError("Cannot write to a closed writer.")
        env = build_envelope(
            business_object,
            bot_id=self._bot_id,
            queue=self._queue,
            event_source_timestamp=event_source_timestamp,
        )
        line = json.dumps(env)
        if len(line.encode("utf-8")) > _MAX_SINGLE_EVENT_BYTES:
            raise StreamBusUnavailableError(
                "Single event exceeds the 1 MB Kinesis record limit. Large-payload "
                "S3 offload is not yet implemented in the Python SDK."
            )
        self._buffer.append(env)
        self._buffered_bytes += len(line) + 1
        if len(self._buffer) >= self._max_batch_records or self._buffered_bytes >= self._max_batch_bytes:
            self._flush()

    def close(self) -> None:
        if self._closed:
            return
        self._flush()
        self._closed = True

    # --- context manager sugar ---
    def __enter__(self) -> "LeoStreamWriter":
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()

    def _flush(self) -> None:
        if not self._buffer:
            return
        body = "".join(json.dumps(e) + "\n" for e in self._buffer)
        data = gzip.compress(body.encode("utf-8"))
        record = {"Data": data, "PartitionKey": "0"}
        self._put_with_retry([record])
        self._buffer.clear()
        self._buffered_bytes = 0

    def _put_with_retry(self, records: list[dict[str, Any]]) -> None:
        pending = records
        for attempt in range(self._max_attempts):
            if attempt:
                time.sleep(attempt * 0.1)
            resp = self._client.put_records(Records=pending, StreamName=self._config.kinesis_stream)
            failed = resp.get("FailedRecordCount", 0) if isinstance(resp, dict) else 0
            if not failed:
                return
            # Retry only the records that failed.
            result_records = resp.get("Records", []) if isinstance(resp, dict) else []
            retry: list[dict[str, Any]] = []
            for rec, res in zip(pending, result_records):
                if isinstance(res, dict) and res.get("ErrorCode"):
                    retry.append(rec)
            pending = retry or pending
        raise StreamBusUnavailableError(
            f"Failed to put {len(pending)} record(s) to {self._config.kinesis_stream} after {self._max_attempts} attempts"
        )


class AsyncLeoStreamWriter:
    """Async facade over `LeoStreamWriter`; runs the sync boto3 calls in a
    thread (boto3 is synchronous). Same batching/retry semantics."""

    def __init__(self, config: StreamConfig, bot_id: str, queue: str, **kwargs: Any) -> None:
        self._writer = LeoStreamWriter(config, bot_id, queue, **kwargs)

    async def write(self, business_object: Any, *, event_source_timestamp: Optional[int] = None) -> None:
        # Buffering is in-memory/cheap; the flush (network) may run here.
        await asyncio.to_thread(
            self._writer.write, business_object, event_source_timestamp=event_source_timestamp
        )

    async def close(self) -> None:
        await asyncio.to_thread(self._writer.close)

    async def __aenter__(self) -> "AsyncLeoStreamWriter":
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()
