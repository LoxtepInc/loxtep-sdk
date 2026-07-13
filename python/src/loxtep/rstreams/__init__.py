"""
Native Loxtep RStreams (Leo) stream data-plane client.

This package is the Python home for the stream bus integration that the Node.js
SDK gets from `leo-sdk`. It is written natively for Loxtep (no external Leo
dependency) and is intended to grow into a full port of the data plane:

- ``config``  — resolve the Leo bus resource names (Kinesis/DynamoDB/S3 tables).
- ``writer``  — Kinesis producer (implemented).
- ``reader``  — DynamoDB/S3 consumer + checkpointing (planned; not yet built).

Requires the optional ``boto3`` dependency: ``pip install loxtep[streams]``.
"""

from .config import StreamConfig, resolve_stream_config
from .writer import LeoStreamWriter, build_envelope

__all__ = [
    "StreamConfig",
    "resolve_stream_config",
    "LeoStreamWriter",
    "build_envelope",
]
