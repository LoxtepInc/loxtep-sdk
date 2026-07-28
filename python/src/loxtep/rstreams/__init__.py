"""
Native Loxtep stream data-plane client.

This package is the Python home for the stream bus integration that the Node.js
SDK gets from `leo-sdk` (internally, the platform's event-sourcing bus is built on
the rStreams/leo-sdk architecture — see the resource names in `StreamConfig` — but
that's an implementation detail of the bus, not something customer-facing SDK types
should be branded with). Written natively for Loxtep (no external Leo dependency)
and intended to grow into a full port of the data plane:

- ``config``  — resolve the bus resource names (Kinesis/DynamoDB/S3 tables).
- ``writer``  — Kinesis producer (implemented).
- ``reader``  — DynamoDB/S3 consumer (implemented; checkpoint *persistence* and
  snapshot/archive + S3 byte-range fast-read are follow-ups).

Requires the optional ``boto3`` dependency: ``pip install loxtep[streams]``.
"""

from .config import StreamConfig, resolve_stream_config
from .writer import AsyncLoxtepStreamWriter, LoxtepStreamWriter, build_envelope
from .reader import AsyncLoxtepStreamReader, LoxtepStreamReader

__all__ = [
    "StreamConfig",
    "resolve_stream_config",
    "LoxtepStreamWriter",
    "AsyncLoxtepStreamWriter",
    "build_envelope",
    "LoxtepStreamReader",
    "AsyncLoxtepStreamReader",
]
