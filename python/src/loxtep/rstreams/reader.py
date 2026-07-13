"""
Leo stream reader (native Loxtep implementation).

Consumes events from the Loxtep stream bus by range-querying the LeoStream
DynamoDB table, materializing inline-gzip or S3-backed NDJSON payloads, and
reconstructing per-event ids — matching the Node.js SDK / leo-sdk read path
(the modern ``leoEvent.v >= 2`` path).

Scope of this first cut (documented follow-ups):
- No snapshot/archive queue transitions (modern live queues only).
- Reads whole S3 objects (no byte-range/offset fast-read optimization).
- Cursor advances in-memory; LeoCron checkpoint *persistence* is not written
  yet (reads the stored checkpoint as the start position, like the Node SDK).
"""

from __future__ import annotations

import datetime
import gzip
import json
from typing import Any, Iterator, Optional

from .config import StreamConfig
from .writer import StreamBusUnavailableError

_EID_PAD = 7


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


class LeoStreamReader:
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
        self._ddb = dynamodb_resource if dynamodb_resource is not None else self._make_ddb()
        self._s3 = s3_client  # lazily created only if an S3-backed item is hit

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
                        yield _map_event(raw, _reconstruct_eid(item.get("start", ""), i))
                        count += 1
                        if self._limit is not None and count >= self._limit:
                            return
                last_evaluated = resp.get("LastEvaluatedKey") if isinstance(resp, dict) else None
                if not last_evaluated:
                    break
            if not got_any or not last_end:
                return
            start = last_end + " "
