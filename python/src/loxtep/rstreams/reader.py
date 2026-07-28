"""
Leo stream reader (native Loxtep implementation).

Consumes events from the Loxtep stream bus by range-querying the LeoStream
DynamoDB table, materializing inline-gzip or S3-backed NDJSON payloads, and
reconstructing per-event ids — matching the Node.js SDK / leo-sdk read path
(the modern ``leoEvent.v >= 2`` path).

Supports optional LeoCron checkpoint persistence (`auto_checkpoint=` /
`.checkpoint()`) and an async facade (`AsyncLoxtepStreamReader`).

Documented follow-ups (perf / historical edges): snapshot/archive queue
transitions, and S3 byte-range/offset fast-read (whole objects are read, which
is correct but less efficient for partial reads).
"""

from __future__ import annotations

import asyncio
import datetime
import gzip
import json
from typing import Any, AsyncIterator, Iterator, Optional

from .config import StreamConfig
from .writer import StreamBusUnavailableError

_EID_PAD = 7


def _now_ms() -> int:
    return int(datetime.datetime.now(datetime.timezone.utc).timestamp() * 1000)


def _default_start() -> str:
    now = datetime.datetime.now(datetime.timezone.utc)
    return "z/" + now.strftime("%Y/%m/%d")


def _reconstruct_eid(item_start: str, index: int) -> str:
    """Per-event eid = ``<prefix>-<zero-padded-7 (idOffset + index)>``."""
    prefix, _, offset = str(item_start).partition("-")
    try:
        id_offset = int(offset)
    except ValueError:
        id_offset = 0
    return f"{prefix}-{(id_offset + index):0{_EID_PAD}d}"


def _map_event(raw: dict[str, Any], eid: str) -> dict[str, Any]:
    return {
        "event_id": eid,
        "event_type": raw.get("event"),
        "payload": raw.get("payload", raw),
        "correlation_id": raw.get("correlation_id"),
    }


class LoxtepStreamReader:
    """Iterable reader over a queue on the stream bus.

    Iterate it directly (``for event in reader``) to yield mapped events
    (``{event_id, event_type, payload, correlation_id}``).
    """

    def __init__(
        self,
        config: StreamConfig,
        bot_id: str,
        queue: str,
        *,
        start: Optional[str] = None,
        batch_size: int = 50,
        limit: Optional[int] = None,
        auto_checkpoint: bool = False,
        dynamodb_resource: Any = None,
        s3_client: Any = None,
    ) -> None:
        if not config.is_readable:
            raise StreamBusUnavailableError(
                "Stream config is not readable (need region + stream_table + event_table + cron_table)."
            )
        self._config = config
        self._bot_id = bot_id
        self._queue = queue
        self._explicit_start = start
        self._batch_size = batch_size
        self._limit = limit
        self._auto_checkpoint = auto_checkpoint
        self._ddb = dynamodb_resource if dynamodb_resource is not None else self._make_ddb()
        self._s3 = s3_client  # lazily created only if an S3-backed item is hit
        #: eid of the last event yielded (advances as you iterate).
        self.last_eid: Optional[str] = None
        self._records_since_checkpoint = 0

    # --- boto3 factories (overridable for tests) ---
    def _make_ddb(self) -> Any:
        try:
            import boto3  # noqa: PLC0415
        except ImportError as exc:  # pragma: no cover - env dependent
            raise StreamBusUnavailableError(
                "boto3 is required for stream-bus reads. Install with: pip install loxtep[streams]"
            ) from exc
        return boto3.resource("dynamodb", region_name=self._config.region)

    def _make_s3(self) -> Any:
        if self._s3 is not None:
            return self._s3
        try:
            import boto3  # noqa: PLC0415
        except ImportError as exc:  # pragma: no cover - env dependent
            raise StreamBusUnavailableError("boto3 is required for S3-backed reads.") from exc
        self._s3 = boto3.client("s3", region_name=self._config.region)
        return self._s3

    # --- bootstrap ---
    def _bootstrap(self) -> tuple[str, str]:
        """Return (start_cursor, max_eid). Reads LeoEvent + LeoCron."""
        event_tbl = self._ddb.Table(self._config.event_table)
        cron_tbl = self._ddb.Table(self._config.cron_table)
        leo_event = (event_tbl.get_item(Key={"event": self._queue}).get("Item")) or {}
        leo_cron = (cron_tbl.get_item(Key={"id": self._bot_id}).get("Item")) or {}

        max_eid = leo_event.get("max_eid") or _default_start()

        if self._explicit_start is not None:
            start = self._explicit_start
        else:
            queue_ref = f"queue:{self._queue}"
            read_cp = (((leo_cron.get("checkpoints") or {}).get("read") or {}).get(queue_ref) or {})
            start = read_cp.get("checkpoint") or _default_start()
        return start + " ", max_eid

    def _checkpoint_bot(self) -> str:
        return self._bot_id[: -len("_reader")] if self._bot_id.endswith("_reader") else self._bot_id

    def checkpoint(self, eid: Optional[str] = None) -> None:
        """Persist the read checkpoint to LeoCron.

        Merges into ``checkpoints.read["queue:<name>"]`` and writes the map.
        Best-effort single-consumer semantics (no optimistic-lock contention
        handling — a documented follow-up).
        """
        eid = eid or self.last_eid
        if not eid:
            return
        bot = self._checkpoint_bot()
        cron_tbl = self._ddb.Table(self._config.cron_table)
        item = (cron_tbl.get_item(Key={"id": bot}).get("Item")) or {}
        checkpoints = dict(item.get("checkpoints") or {})
        read = dict(checkpoints.get("read") or {})
        now = _now_ms()
        read[f"queue:{self._queue}"] = {
            "checkpoint": eid,
            "records": self._records_since_checkpoint,
            "ended_timestamp": now,
            "source_timestamp": now,
        }
        checkpoints["read"] = read
        cron_tbl.update_item(
            Key={"id": bot},
            UpdateExpression="SET #cp = :cp",
            ExpressionAttributeNames={"#cp": "checkpoints"},
            ExpressionAttributeValues={":cp": checkpoints},
        )
        self._records_since_checkpoint = 0

    # --- item materialization ---
    def _item_lines(self, item: dict[str, Any]) -> list[dict[str, Any]]:
        raw_blob: Optional[bytes] = None
        if item.get("gzip") is not None:
            blob = item["gzip"]
            raw_blob = blob.value if hasattr(blob, "value") else bytes(blob)
        elif item.get("s3") is not None:
            s3 = item["s3"]
            obj = self._make_s3().get_object(Bucket=s3["bucket"], Key=s3["key"])
            raw_blob = obj["Body"].read()
        if raw_blob is None:
            return []
        text = gzip.decompress(raw_blob).decode("utf-8")
        return [json.loads(line) for line in text.splitlines() if line]

    # --- iteration ---
    def __iter__(self) -> Iterator[dict[str, Any]]:
        start, max_eid = self._bootstrap()
        stream_tbl = self._ddb.Table(self._config.stream_table)
        count = 0
        while max_eid > start and (self._limit is None or count < self._limit):
            last_evaluated: Optional[dict[str, Any]] = None
            got_any = False
            last_end: Optional[str] = None
            while True:
                params: dict[str, Any] = {
                    "KeyConditionExpression": "#event = :event and #end between :start and :maxkey",
                    "ExpressionAttributeNames": {"#event": "event", "#end": "end"},
                    "ExpressionAttributeValues": {":event": self._queue, ":start": start, ":maxkey": max_eid},
                    "Limit": self._batch_size,
                }
                if last_evaluated:
                    params["ExclusiveStartKey"] = last_evaluated
                resp = stream_tbl.query(**params)
                items = resp.get("Items", []) if isinstance(resp, dict) else []
                for item in items:
                    got_any = True
                    last_end = item.get("end")
                    for i, raw in enumerate(self._item_lines(item)):
                        eid = _reconstruct_eid(item.get("start", ""), i)
                        self.last_eid = eid
                        self._records_since_checkpoint += 1
                        yield _map_event(raw, eid)
                        count += 1
                        if self._limit is not None and count >= self._limit:
                            if self._auto_checkpoint:
                                self.checkpoint()
                            return
                last_evaluated = resp.get("LastEvaluatedKey") if isinstance(resp, dict) else None
                if not last_evaluated:
                    break
            if not got_any or not last_end:
                if self._auto_checkpoint and self.last_eid:
                    self.checkpoint()
                return
            if self._auto_checkpoint:
                self.checkpoint()
            start = last_end + " "


class AsyncLoxtepStreamReader:
    """Async facade over `LoxtepStreamReader`; runs the sync boto3 iteration in a
    thread (boto3 is synchronous). Async-iterate it (``async for``)."""

    def __init__(self, config: StreamConfig, bot_id: str, queue: str, **kwargs: Any) -> None:
        self._reader = LoxtepStreamReader(config, bot_id, queue, **kwargs)

    async def __aiter__(self) -> AsyncIterator[dict[str, Any]]:
        it = iter(self._reader)
        sentinel = object()
        while True:
            item = await asyncio.to_thread(next, it, sentinel)
            if item is sentinel:
                break
            yield item

    async def checkpoint(self, eid: Optional[str] = None) -> None:
        await asyncio.to_thread(self._reader.checkpoint, eid)

    @property
    def last_eid(self) -> Optional[str]:
        return self._reader.last_eid
