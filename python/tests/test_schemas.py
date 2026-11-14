"""Data-product schema client surface."""

from unittest.mock import AsyncMock, patch

import pytest

from loxtep import AsyncLoxtepClient, LoxtepClient


SCHEMA = {
    "version": "1.0",
    "fields": [
        {"name": "customer_id", "type": "string", "required": True, "nullable": False},
        {"name": "middle_name", "type": "string", "required": False, "nullable": True},
    ],
}


def test_schema_get_preserves_nullable_independently_from_required():
    client = LoxtepClient(api_url="https://api.example.com")
    with patch.object(client._http, "get", return_value={"data": SCHEMA}) as mock_get:
        schema = client.define.schemas.get("dp-1")

    assert schema["fields"] == SCHEMA["fields"]
    mock_get.assert_called_once_with("/dataproducts/dp-1/schema")
    client.close()


@pytest.mark.asyncio
async def test_async_schema_get_preserves_nullable_independently_from_required():
    client = AsyncLoxtepClient(api_url="https://api.example.com")
    with patch.object(client._http, "get", new=AsyncMock(return_value={"data": SCHEMA})) as mock_get:
        schema = await client.define.schemas.get("dp-1")

    assert schema["fields"] == SCHEMA["fields"]
    mock_get.assert_awaited_once_with("/dataproducts/dp-1/schema")
    await client.aclose()
