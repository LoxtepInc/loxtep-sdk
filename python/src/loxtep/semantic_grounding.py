"""Server-grounded queries and advisory preflight; identities come from HTTP auth."""
from typing import Any


class SemanticGroundingApi:
    def __init__(self, http: Any) -> None:
        self._http = http

    def query(self, *, question: str, data_product_ids: list[str] | None = None) -> dict[str, Any]:
        body: dict[str, Any] = {"question": question}
        if data_product_ids is not None:
            body["data_product_ids"] = data_product_ids
        return self._http.post("/ai/context/query", body)["data"]

    def check_readiness(self, *, data_product_ids: list[str], metric_names: list[str] | None = None, relationship_roles: list[str] | None = None) -> dict[str, Any]:
        return self._http.post("/ai/context/readiness", {"data_product_ids": data_product_ids, "metric_names": metric_names or [], "relationship_roles": relationship_roles or []})["data"]

    def check_answerability(self, *, question: str, data_product_ids: list[str], relationship_roles: list[str] | None = None) -> dict[str, Any]:
        return self._http.post("/ai/context/answerability", {"question": question, "data_product_ids": data_product_ids, "relationship_roles": relationship_roles or []})["data"]


class AsyncSemanticGroundingApi:
    def __init__(self, http: Any) -> None:
        self._http = http

    async def query(self, *, question: str, data_product_ids: list[str] | None = None) -> dict[str, Any]:
        body: dict[str, Any] = {"question": question}
        if data_product_ids is not None:
            body["data_product_ids"] = data_product_ids
        return (await self._http.post("/ai/context/query", body))["data"]

    async def check_readiness(self, *, data_product_ids: list[str], metric_names: list[str] | None = None, relationship_roles: list[str] | None = None) -> dict[str, Any]:
        return (await self._http.post("/ai/context/readiness", {"data_product_ids": data_product_ids, "metric_names": metric_names or [], "relationship_roles": relationship_roles or []}))["data"]

    async def check_answerability(self, *, question: str, data_product_ids: list[str], relationship_roles: list[str] | None = None) -> dict[str, Any]:
        return (await self._http.post("/ai/context/answerability", {"question": question, "data_product_ids": data_product_ids, "relationship_roles": relationship_roles or []}))["data"]
