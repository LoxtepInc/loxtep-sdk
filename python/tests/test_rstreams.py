"""Unit tests for the native rstreams (Leo) stream data-plane client."""

import gzip
import json

from loxtep import LoxtepClient
from loxtep.data_products import DataProductWriter
from loxtep.rstreams import LeoStreamWriter, StreamConfig, build_envelope, resolve_stream_config


class FakeKinesis:
    """Captures put_records calls; optionally fails N times first."""

    def __init__(self, fail_times: int = 0):
        self.calls: list[dict] = []
        self._fail_times = fail_times

    def put_records(self, *, Records, StreamName):
        self.calls.append({"Records": list(Records), "StreamName": StreamName})
        if self._fail_times > 0:
            self._fail_times -= 1
            return {"FailedRecordCount": len(Records), "Records": [{"ErrorCode": "X"} for _ in Records]}
        return {"FailedRecordCount": 0, "Records": [{"SequenceNumber": "1"} for _ in Records]}


def _decode_records(call) -> list[dict]:
    events: list[dict] = []
    for rec in call["Records"]:
        body = gzip.decompress(rec["Data"]).decode("utf-8")
        for line in body.splitlines():
            if line:
                events.append(json.loads(line))
    return events


# --- config ---

def test_resolve_stream_config_from_partial_pascalcase():
    cfg = resolve_stream_config(
        {"Region": "us-east-1", "LeoKinesisStream": "MyBus-Kinesis", "LeoStream": "S", "LeoEvent": "E", "LeoCron": "C"}
    )
    assert cfg.region == "us-east-1"
    assert cfg.kinesis_stream == "MyBus-Kinesis"
    assert cfg.is_writable is True
    assert cfg.is_readable is True


def test_resolve_stream_config_snake_case_and_env(monkeypatch):
    monkeypatch.setenv("LEO_KINESIS_STREAM", "EnvBus-Kinesis")
    monkeypatch.setenv("AWS_REGION", "us-west-2")
    cfg = resolve_stream_config({"region": "eu-west-1"})
    assert cfg.region == "eu-west-1"  # partial wins over env
    assert cfg.kinesis_stream == "EnvBus-Kinesis"  # env fallback
    assert cfg.is_writable is True


def test_not_writable_without_kinesis():
    assert resolve_stream_config({"Region": "us-east-1"}).is_writable is False
    assert resolve_stream_config(None).is_writable in (False, True)  # depends on env, must not raise


# --- envelope ---

def test_build_envelope_shape():
    env = build_envelope({"x": 1}, bot_id="bot", queue="q", event_source_timestamp=123)
    assert env["id"] == "bot"
    assert env["event"] == "q"
    assert env["payload"] == {"x": 1}
    assert env["event_source_timestamp"] == 123
    assert isinstance(env["timestamp"], int)


# --- writer ---

def test_writer_gzips_ndjson_and_puts_on_close():
    cfg = StreamConfig(region="us-east-1", kinesis_stream="Bus-Kinesis")
    fake = FakeKinesis()
    w = LeoStreamWriter(cfg, "bot", "orders", kinesis_client=fake)
    w.write({"id": 1})
    w.write({"id": 2})
    assert fake.calls == []  # buffered, not yet flushed
    w.close()
    assert len(fake.calls) == 1
    assert fake.calls[0]["StreamName"] == "Bus-Kinesis"
    assert fake.calls[0]["Records"][0]["PartitionKey"] == "0"
    events = _decode_records(fake.calls[0])
    assert [e["payload"] for e in events] == [{"id": 1}, {"id": 2}]
    assert all(e["id"] == "bot" and e["event"] == "orders" for e in events)


def test_writer_flushes_on_batch_size():
    cfg = StreamConfig(region="us-east-1", kinesis_stream="Bus-Kinesis")
    fake = FakeKinesis()
    w = LeoStreamWriter(cfg, "bot", "q", max_batch_records=2, kinesis_client=fake)
    w.write({"n": 1})
    w.write({"n": 2})  # hits max_batch_records → flush
    assert len(fake.calls) == 1
    w.write({"n": 3})
    w.close()
    assert len(fake.calls) == 2


def test_writer_retries_failed_records():
    cfg = StreamConfig(region="us-east-1", kinesis_stream="Bus-Kinesis")
    fake = FakeKinesis(fail_times=2)
    w = LeoStreamWriter(cfg, "bot", "q", kinesis_client=fake)
    w.write({"n": 1})
    w.close()
    assert len(fake.calls) == 3  # 2 failures + 1 success


def test_writer_requires_writable_config():
    import pytest

    from loxtep.rstreams.writer import StreamBusUnavailableError

    with pytest.raises(StreamBusUnavailableError):
        LeoStreamWriter(StreamConfig(region="us-east-1"), "bot", "q", kinesis_client=FakeKinesis())


# --- client wiring: bus when configured, HTTP otherwise ---

def test_get_writer_uses_http_when_no_stream_config():
    client = LoxtepClient(api_url="https://api.example.com")
    from unittest.mock import patch

    with patch.object(client.data_products, "_resolve_id", return_value="dp_1"):
        writer = client.data_products.get_writer("orders")
    assert isinstance(writer, DataProductWriter)
    client.close()


def test_get_writer_uses_bus_when_stream_config_present():
    client = LoxtepClient(
        api_url="https://api.example.com",
        streams={"Region": "us-east-1", "LeoKinesisStream": "Bus-Kinesis"},
    )
    from unittest.mock import patch

    fake = FakeKinesis()
    with patch.object(client.data_products, "_resolve_id", return_value="dp_1"), patch.object(
        LeoStreamWriter, "_make_client", return_value=fake
    ):
        writer = client.data_products.get_writer("orders", queue_name="orders-q")
    assert isinstance(writer, LeoStreamWriter)
    writer.write({"hello": "world"})
    writer.close()
    assert fake.calls[0]["StreamName"] == "Bus-Kinesis"
    client.close()
