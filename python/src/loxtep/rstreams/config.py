"""
Resolve Loxtep stream bus (Leo) configuration from explicit options and
environment variables. Mirrors the Node.js SDK's `rstreams/configuration.ts`.

The eight Leo resources:

| Field             | Env fallback                          | Used by |
|-------------------|---------------------------------------|---------|
| region            | AWS_REGION / LEO_REGION               | write, read |
| kinesis_stream    | LEO_KINESIS_STREAM                    | write |
| firehose_stream   | FIREHOSE_STREAM / LEO_FIREHOSE_STREAM | write (batch mode) |
| s3_bucket         | LEO_S3_BUCKET                         | write (>600KB), read |
| stream_table      | LEO_STREAM_TABLE                      | read |
| event_table       | LEO_EVENT_TABLE                       | read |
| cron_table        | LEO_CRON_TABLE                        | read (checkpoints) |
| settings_table    | LEO_SETTINGS_TABLE                    | (reserved) |
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Mapping, Optional

# Accept both snake_case (Python) and the Leo PascalCase keys used by the
# platform stream-config endpoints / Node SDK, so a raw stream-config dict from
# `instances.get_stream_config` can be passed straight through.
_ALIASES = {
    "region": ("region", "Region"),
    "kinesis_stream": ("kinesis_stream", "LeoKinesisStream"),
    "firehose_stream": ("firehose_stream", "LeoFirehoseStream"),
    "s3_bucket": ("s3_bucket", "LeoS3"),
    "stream_table": ("stream_table", "LeoStream"),
    "event_table": ("event_table", "LeoEvent"),
    "cron_table": ("cron_table", "LeoCron"),
    "settings_table": ("settings_table", "LeoSettings"),
}


def _env(*keys: str) -> Optional[str]:
    for k in keys:
        v = os.environ.get(k)
        if v is not None and str(v).strip() != "":
            return str(v).strip()
    return None


def _pick(partial: Optional[Mapping[str, Any]], field: str) -> Optional[str]:
    if not partial:
        return None
    for key in _ALIASES[field]:
        v = partial.get(key)
        if v is not None and str(v).strip() != "":
            return str(v).strip()
    return None


@dataclass(frozen=True)
class StreamConfig:
    """Resolved Leo bus resource names."""

    region: Optional[str] = None
    kinesis_stream: Optional[str] = None
    firehose_stream: Optional[str] = None
    s3_bucket: Optional[str] = None
    stream_table: Optional[str] = None
    event_table: Optional[str] = None
    cron_table: Optional[str] = None
    settings_table: Optional[str] = None

    @property
    def is_writable(self) -> bool:
        """Minimum needed to produce to the bus (Kinesis write path)."""
        return bool(self.region and self.kinesis_stream)

    @property
    def is_readable(self) -> bool:
        """Minimum needed to consume from the bus (planned reader)."""
        return bool(self.region and self.stream_table and self.event_table and self.cron_table)


def resolve_stream_config(partial: Optional[Mapping[str, Any]] = None) -> StreamConfig:
    """Merge a partial config (snake_case or Leo PascalCase keys) with env vars.

    Returns a `StreamConfig`; check `.is_writable`/`.is_readable` before use.
    """
    return StreamConfig(
        region=_pick(partial, "region") or _env("AWS_REGION", "LEO_REGION"),
        kinesis_stream=_pick(partial, "kinesis_stream") or _env("LEO_KINESIS_STREAM"),
        firehose_stream=_pick(partial, "firehose_stream") or _env("FIREHOSE_STREAM", "LEO_FIREHOSE_STREAM"),
        s3_bucket=_pick(partial, "s3_bucket") or _env("LEO_S3_BUCKET"),
        stream_table=_pick(partial, "stream_table") or _env("LEO_STREAM_TABLE"),
        event_table=_pick(partial, "event_table") or _env("LEO_EVENT_TABLE"),
        cron_table=_pick(partial, "cron_table") or _env("LEO_CRON_TABLE"),
        settings_table=_pick(partial, "settings_table") or _env("LEO_SETTINGS_TABLE"),
    )
