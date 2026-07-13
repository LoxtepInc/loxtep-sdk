"""Unit tests for the native rstreams (Leo) stream data-plane client."""

import gzip
import json

import asyncio

import pytest

from loxtep import LoxtepClient
from loxtep.data_products import DataProductWriter
from loxtep.rstreams import (
    AsyncLeoStreamReader,
    AsyncLeoStreamWriter,
    LeoStreamReader,
    LeoStreamWriter,
    StreamConfig,
    build_envelope,
    resolve_stream_config,
)
from loxtep.rstreams.writer import StreamBusUnavailableError


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


# --- reader ---

def _gz(events: list[dict]) -> bytes:
    return gzip.compress(("".join(json.dumps(e) + "\n" for e in events)).encode("utf-8"))


class FakeTable:
    def __init__(self, name, get_item_result=None, query_pages=None):
        self.name = name
        self._get = get_item_result or {}
        self._pages = list(query_pages or [])
        self.queries: list[dict] = []
        self.updates: list[dict] = []

    def get_item(self, *, Key):
        return self._get

    def query(self, **params):
        self.queries.append(params)
        return self._pages.pop(0) if self._pages else {"Items": []}

    def update_item(self, **params):
        self.updates.append(params)
        return {}


class FakeDDB:
    def __init__(self, tables: dict):
        self._tables = tables

    def Table(self, name):
        return self._tables[name]


def _readable_cfg():
    return StreamConfig(
        region="us-east-1",
        kinesis_stream="Bus-K",
        stream_table="Bus-LeoStream",
        event_table="Bus-LeoEvent",
        cron_table="Bus-LeoCron",
        s3_bucket="bus-s3",
    )


def test_reader_inline_gzip_reconstructs_eids_and_maps():
    cfg = _readable_cfg()
    item = {
        "event": "orders-q",
        "start": "z/2026/07/13/18/22/1752430000000-0000000",
        "end": "z/2026/07/13/18/22/1752430000000-0000001",
        "gzip": _gz([
            {"event": "orders-q", "payload": {"n": 1}, "correlation_id": "c1"},
            {"event": "orders-q", "payload": {"n": 2}},
        ]),
    }
    ddb = FakeDDB({
        "Bus-LeoEvent": FakeTable("Bus-LeoEvent", get_item_result={"Item": {"v": 2, "max_eid": "z/9"}}),
        "Bus-LeoCron": FakeTable("Bus-LeoCron", get_item_result={}),
        "Bus-LeoStream": FakeTable("Bus-LeoStream", query_pages=[{"Items": [item]}, {"Items": []}]),
    })
    reader = LeoStreamReader(cfg, "bot", "orders-q", start="z/2026/07/13", dynamodb_resource=ddb)
    events = list(reader)
    assert [e["payload"] for e in events] == [{"n": 1}, {"n": 2}]
    assert events[0]["event_id"].endswith("-0000000")
    assert events[1]["event_id"].endswith("-0000001")
    assert events[0]["correlation_id"] == "c1"
    # query used event/end BETWEEN start/maxkey
    q = ddb._tables["Bus-LeoStream"].queries[0]
    assert q["ExpressionAttributeValues"][":event"] == "orders-q"
    assert q["ExpressionAttributeValues"][":maxkey"] == "z/9"


def test_reader_reads_s3_backed_item():
    cfg = _readable_cfg()
    item = {"event": "q", "start": "p-0000005", "end": "p-0000005", "s3": {"bucket": "bus-s3", "key": "bus/q/x.gz"}}

    class Body:
        def __init__(self, b): self._b = b
        def read(self): return self._b

    class FakeS3:
        def __init__(self, blob):
            self._blob = blob
            self.calls = []

        def get_object(self, *, Bucket, Key):
            self.calls.append((Bucket, Key))
            return {"Body": Body(self._blob)}

    s3 = FakeS3(_gz([{"event": "q", "payload": {"z": 9}}]))
    ddb = FakeDDB({
        "Bus-LeoEvent": FakeTable("Bus-LeoEvent", get_item_result={"Item": {"v": 2, "max_eid": "zzz"}}),
        "Bus-LeoCron": FakeTable("Bus-LeoCron", get_item_result={}),
        "Bus-LeoStream": FakeTable("Bus-LeoStream", query_pages=[{"Items": [item]}, {"Items": []}]),
    })
    reader = LeoStreamReader(cfg, "bot", "q", start="a", dynamodb_resource=ddb, s3_client=s3)
    events = list(reader)
    assert events[0]["payload"] == {"z": 9}
    assert events[0]["event_id"] == "p-0000005"
    assert s3.calls == [("bus-s3", "bus/q/x.gz")]


def test_reader_uses_checkpoint_from_cron_when_no_start():
    cfg = _readable_cfg()
    cron = {"Item": {"checkpoints": {"read": {"queue:orders-q": {"checkpoint": "z/checkpoint-eid"}}}}}
    stream_tbl = FakeTable("Bus-LeoStream", query_pages=[{"Items": []}])
    ddb = FakeDDB({
        "Bus-LeoEvent": FakeTable("Bus-LeoEvent", get_item_result={"Item": {"v": 2, "max_eid": "zzz"}}),
        "Bus-LeoCron": FakeTable("Bus-LeoCron", get_item_result=cron),
        "Bus-LeoStream": stream_tbl,
    })
    list(LeoStreamReader(cfg, "bot", "orders-q", dynamodb_resource=ddb))
    assert stream_tbl.queries[0]["ExpressionAttributeValues"][":start"] == "z/checkpoint-eid "


def test_reader_requires_readable_config():
    import pytest

    from loxtep.rstreams.writer import StreamBusUnavailableError

    with pytest.raises(StreamBusUnavailableError):
        LeoStreamReader(StreamConfig(region="us-east-1", kinesis_stream="k"), "b", "q", dynamodb_resource=FakeDDB({}))


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


# --- checkpoint persistence ---

def test_reader_auto_checkpoint_persists_to_cron():
    cfg = _readable_cfg()
    item = {
        "event": "orders-q",
        "start": "z/2026/07/13/18/22/1752430000000-0000000",
        "end": "z/2026/07/13/18/22/1752430000000-0000000",
        "gzip": _gz([{"event": "orders-q", "payload": {"n": 1}}]),
    }
    cron = FakeTable("Bus-LeoCron", get_item_result={})
    ddb = FakeDDB({
        "Bus-LeoEvent": FakeTable("Bus-LeoEvent", get_item_result={"Item": {"v": 2, "max_eid": "zzz"}}),
        "Bus-LeoCron": cron,
        "Bus-LeoStream": FakeTable("Bus-LeoStream", query_pages=[{"Items": [item]}, {"Items": []}]),
    })
    reader = LeoStreamReader(
        cfg, "sdk-reader-orders_reader", "orders-q", start="a", auto_checkpoint=True, dynamodb_resource=ddb
    )
    list(reader)
    assert cron.updates, "expected a checkpoint write to LeoCron"
    written = cron.updates[-1]["ExpressionAttributeValues"][":cp"]
    cp = written["read"]["queue:orders-q"]["checkpoint"]
    assert cp.endswith("-0000000")
    # bot id had its _reader suffix stripped for the cron key
    assert cron.updates[-1]["Key"] == {"id": "sdk-reader-orders"}


def test_manual_checkpoint():
    cfg = _readable_cfg()
    cron = FakeTable("Bus-LeoCron", get_item_result={"Item": {"checkpoints": {"read": {"queue:other": {"checkpoint": "x"}}}}})
    ddb = FakeDDB({"Bus-LeoCron": cron, "Bus-LeoEvent": FakeTable("e"), "Bus-LeoStream": FakeTable("s")})
    reader = LeoStreamReader(cfg, "bot", "orders-q", dynamodb_resource=ddb)
    reader.checkpoint("z/my-eid")
    cp = cron.updates[-1]["ExpressionAttributeValues"][":cp"]
    assert cp["read"]["queue:orders-q"]["checkpoint"] == "z/my-eid"
    assert cp["read"]["queue:other"]["checkpoint"] == "x"  # preserved other queues


# --- oversized event: S3 offload ---

def test_writer_rejects_oversized_single_event_without_s3():
    cfg = StreamConfig(region="us-east-1", kinesis_stream="Bus-K")  # no s3_bucket
    w = LeoStreamWriter(cfg, "bot", "q", kinesis_client=FakeKinesis())
    with pytest.raises(StreamBusUnavailableError):
        w.write({"blob": "x" * (700 * 1024)})


def test_writer_offloads_oversized_event_to_s3_and_emits_pointer():
    cfg = StreamConfig(region="us-east-1", kinesis_stream="Bus-K", s3_bucket="bus-s3")
    kinesis = FakeKinesis()

    class FakeS3:
        def __init__(self): self.puts = []
        def put_object(self, *, Bucket, Key, Body): self.puts.append({"Bucket": Bucket, "Key": Key, "Body": Body})

    s3 = FakeS3()
    w = LeoStreamWriter(cfg, "bot", "orders-q", kinesis_client=kinesis, s3_client=s3)
    big = {"blob": "x" * (700 * 1024)}
    w.write(big)
    w.close()

    # uploaded gzipped NDJSON to S3 under bus/<queue>/<bot>/z/...
    assert len(s3.puts) == 1
    assert s3.puts[0]["Bucket"] == "bus-s3"
    assert s3.puts[0]["Key"].startswith("bus/orders-q/bot/z/") and s3.puts[0]["Key"].endswith(".gz")
    uploaded = json.loads(gzip.decompress(s3.puts[0]["Body"]).decode().splitlines()[0])
    assert uploaded["payload"] == big and uploaded["event"] == "orders-q"

    # Kinesis got the S3-pointer record (not the inline payload)
    assert len(kinesis.calls) == 1
    pointer = _decode_records(kinesis.calls[0])[0]
    assert pointer["s3"] == {"bucket": "bus-s3", "key": s3.puts[0]["Key"]}
    assert pointer["records"] == 1 and pointer["event"] == "orders-q"
    assert "payload" not in pointer  # pointer is a chunk descriptor, not an event
    assert pointer["offsets"][0]["gzipSize"] == len(s3.puts[0]["Body"])


# --- async facades ---

def test_async_writer_produces_via_thread():
    cfg = StreamConfig(region="us-east-1", kinesis_stream="Bus-K")
    fake = FakeKinesis()

    async def run():
        w = AsyncLeoStreamWriter(cfg, "bot", "q", kinesis_client=fake)
        await w.write({"a": 1})
        await w.close()

    asyncio.run(run())
    assert len(fake.calls) == 1
    assert _decode_records(fake.calls[0])[0]["payload"] == {"a": 1}


def test_async_reader_iterates_via_thread():
    cfg = _readable_cfg()
    item = {"event": "q", "start": "p-0000000", "end": "p-0000000", "gzip": _gz([{"event": "q", "payload": {"v": 7}}])}
    ddb = FakeDDB({
        "Bus-LeoEvent": FakeTable("e", get_item_result={"Item": {"v": 2, "max_eid": "zzz"}}),
        "Bus-LeoCron": FakeTable("c", get_item_result={}),
        "Bus-LeoStream": FakeTable("s", query_pages=[{"Items": [item]}, {"Items": []}]),
    })

    async def run():
        out = []
        async for e in AsyncLeoStreamReader(cfg, "bot", "q", start="a", dynamodb_resource=ddb):
            out.append(e)
        return out

    events = asyncio.run(run())
    assert events[0]["payload"] == {"v": 7}
