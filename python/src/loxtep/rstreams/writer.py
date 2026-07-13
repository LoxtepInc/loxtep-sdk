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
import datetime
import gzip
import json
import time
import uuid
from typing import Any, Optional

from .config import StreamConfig

# Events whose JSON exceeds 600 KiB are offloaded to S3 (matches leo-sdk's
# `twoHundredK * 3`); the Kinesis record then carries an S3-pointer instead of
# the inline payload.
_S3_OFFLOAD_THRESHOLD = 1024 * 200 * 3


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
        s3_client: Any = None,
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
        self._s3_file_count = 0
        self._client = kinesis_client if kinesis_client is not None else self._make_client()
        self._s3 = s3_client  # lazily created only if a large payload is offloaded

    def _make_client(self) -> Any:
        try:
            import boto3  # noqa: PLC0415
        except ImportError as exc:  # pragma: no cover - env dependent
            raise StreamBusUnavailableError(
                "boto3 is required for stream-bus writes. Install with: pip install loxtep[streams]"
            ) from exc
        return boto3.client("kinesis", region_name=self._config.region)

    def _make_s3(self) -> Any:
        if self._s3 is not None:
            return self._s3
        try:
            import boto3  # noqa: PLC0415
        except ImportError as exc:  # pragma: no cover - env dependent
            raise StreamBusUnavailableError("boto3 is required for large-payload S3 offload.") from exc
        self._s3 = boto3.client("s3", region_name=self._config.region)
        return self._s3

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
        if len(line.encode("utf-8")) > _S3_OFFLOAD_THRESHOLD:
            self._offload_event(env)
            return
        self._buffer.append(env)
        self._buffered_bytes += len(line) + 1
        if len(self._buffer) >= self._max_batch_records or self._buffered_bytes >= self._max_batch_bytes:
            self._flush()

    def _s3_key(self) -> str:
        self._s3_file_count += 1
        now = datetime.datetime.now(datetime.timezone.utc)
        ms = int(now.timestamp() * 1000)
        return (
            f"bus/{self._queue}/{self._bot_id}/z/"
            f"{now.strftime('%Y/%m/%d/%H/%M/')}{ms}-{self._s3_file_count:08d}-{uuid.uuid4()}.gz"
        )

    def _offload_event(self, env: dict[str, Any]) -> None:
        """Upload an oversized event to S3 as gzipped NDJSON and emit an
        S3-pointer record on Kinesis (matches leo-sdk's >600 KiB offload)."""
        if not self._config.s3_bucket:
            raise StreamBusUnavailableError(
                "Event exceeds 600 KiB but no S3 bucket is configured for offload "
                "(set LeoS3 / LEO_S3_BUCKET in stream config)."
            )
        # Any buffered inline events must be flushed first to preserve ordering.
        self._flush()
        line = json.dumps(env) + "\n"
        line_bytes = line.encode("utf-8")
        gz = gzip.compress(line_bytes)
        key = self._s3_key()
        self._make_s3().put_object(Bucket=self._config.s3_bucket, Key=key, Body=gz)
        pointer = {
            "event": self._queue,
            "start": 0,
            "end": 0,
            "s3": {"bucket": self._config.s3_bucket, "key": key},
            "offsets": [
                {
                    "event": self._queue,
                    "start": 0,
                    "end": 0,
                    "records": 1,
                    "size": len(line_bytes),
                    "gzipSize": len(gz),
                    "offset": 0,
                    "gzipOffset": 0,
                }
            ],
            "gzipSize": len(gz),
            "size": len(line_bytes),
            "records": 1,
            "stats": {},
            "correlations": [],
        }
        data = gzip.compress((json.dumps(pointer) + "\n").encode("utf-8"))
        self._put_with_retry([{"Data": data, "PartitionKey": "0"}])

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
