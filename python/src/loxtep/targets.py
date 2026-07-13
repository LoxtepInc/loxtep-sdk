"""
Targets API — delivery sink bindings for data products.

A target defines how a data product makes its data available to external
systems via webhooks, API endpoints, exports, database syncs, BI connections,
or event streams. Backend endpoint: /dataproducts/{id}/consumptions.

list, get, create, update, delete.
"""

from typing import Any, Optional

from .http_client import AsyncLoxtepHttpClient, LoxtepHttpClient
from .models import Target, TargetType


def _base_path(data_product_id: str) -> str:
    return f"/dataproducts/{data_product_id}/consumptions"


def _query_string(params: dict[str, Any]) -> str:
    parts = [f"{k}={v}" for k, v in params.items() if v is not None]
    return "?" + "&".join(parts) if parts else ""


def _parse_target(data: dict[str, Any]) -> Target:
    """Parse a raw API response dict into a Target model."""
    return Target.model_validate(data)


def _parse_target_list(data: Any) -> list[Target]:
    """Parse API list response into a list of Target models."""
    if isinstance(data, list):
        return [_parse_target(item) for item in data]
    if isinstance(data, dict):
        items = data.get("items", data.get("data", []))
        if isinstance(items, list):
            return [_parse_target(item) for item in items]
    return []


class TargetsApi:
    """Sync delivery interfaces surface.

    Provides CRUD operations for delivery interfaces on data products.
    Endpoint: /dataproducts/{data_product_id}/consumptions
    """

    def __init__(self, http: LoxtepHttpClient) -> None:
        self._http = http

    def list(
        self,
        data_product_id: str,
        *,
        page: int = 1,
        page_size: int = 20,
        status: Optional[str] = None,
        is_active: Optional[bool] = None,
    ) -> list[Target]:
        """List delivery interfaces for a data product.

        Args:
            data_product_id: The data product ID.
            page: Page number (default 1).
            page_size: Items per page (default 20).
            status: Optional status filter.
            is_active: Optional active state filter.

        Returns:
            List of Target instances.
        """
        params: dict[str, Any] = {"page": page, "page_size": page_size}
        if status is not None:
            params["status"] = status
        if is_active is not None:
            params["is_active"] = str(is_active).lower()
        qs = _query_string(params)
        res = self._http.get(f"{_base_path(data_product_id)}{qs}")
        data = res.get("data", res) if isinstance(res, dict) else res
        return _parse_target_list(data)

    def get(self, data_product_id: str, target_id: str) -> Target:
        """Get a single delivery interface by ID.

        Args:
            data_product_id: The data product ID.
            target_id: The delivery interface (consumption) ID.

        Returns:
            A Target instance.
        """
        res = self._http.get(f"{_base_path(data_product_id)}/{target_id}")
        data = res.get("data", res) if isinstance(res, dict) else res
        return _parse_target(data)

    def create(
        self,
        data_product_id: str,
        target_type: TargetType = "webhook",
        **kwargs: Any,
    ) -> Target:
        """Create a new delivery interface.

        Args:
            data_product_id: The data product ID.
            target_type: The type of delivery interface (default "webhook").
            **kwargs: Additional fields (endpoint_url, method, headers, filters, etc.)

        Returns:
            The created Target instance.
        """
        body: dict[str, Any] = {"delivery_type": target_type, **kwargs}
        res = self._http.post(_base_path(data_product_id), body)
        data = res.get("data", res) if isinstance(res, dict) else res
        return _parse_target(data)

    def update(
        self,
        data_product_id: str,
        target_id: str,
        **kwargs: Any,
    ) -> Target:
        """Update an existing delivery interface.

        Args:
            data_product_id: The data product ID.
            target_id: The delivery interface (consumption) ID.
            **kwargs: Fields to update.

        Returns:
            The updated Target instance.
        """
        res = self._http.put(f"{_base_path(data_product_id)}/{target_id}", kwargs)
        data = res.get("data", res) if isinstance(res, dict) else res
        return _parse_target(data)

    def delete(self, data_product_id: str, target_id: str) -> None:
        """Delete a delivery interface.

        Args:
            data_product_id: The data product ID.
            target_id: The delivery interface (consumption) ID.
        """
        self._http.delete(f"{_base_path(data_product_id)}/{target_id}")


class AsyncTargetsApi:
    """Async delivery interfaces surface.

    Provides async CRUD operations for delivery interfaces on data products.
    Endpoint: /dataproducts/{data_product_id}/consumptions
    """

    def __init__(self, http: AsyncLoxtepHttpClient) -> None:
        self._http = http

    async def list(
        self,
        data_product_id: str,
        *,
        page: int = 1,
        page_size: int = 20,
        status: Optional[str] = None,
        is_active: Optional[bool] = None,
    ) -> list[Target]:
        """List delivery interfaces for a data product.

        Args:
            data_product_id: The data product ID.
            page: Page number (default 1).
            page_size: Items per page (default 20).
            status: Optional status filter.
            is_active: Optional active state filter.

        Returns:
            List of Target instances.
        """
        params: dict[str, Any] = {"page": page, "page_size": page_size}
        if status is not None:
            params["status"] = status
        if is_active is not None:
            params["is_active"] = str(is_active).lower()
        qs = _query_string(params)
        res = await self._http.get(f"{_base_path(data_product_id)}{qs}")
        data = res.get("data", res) if isinstance(res, dict) else res
        return _parse_target_list(data)

    async def get(self, data_product_id: str, target_id: str) -> Target:
        """Get a single delivery interface by ID.

        Args:
            data_product_id: The data product ID.
            target_id: The delivery interface (consumption) ID.

        Returns:
            A Target instance.
        """
        res = await self._http.get(f"{_base_path(data_product_id)}/{target_id}")
        data = res.get("data", res) if isinstance(res, dict) else res
        return _parse_target(data)

    async def create(
        self,
        data_product_id: str,
        target_type: TargetType = "webhook",
        **kwargs: Any,
    ) -> Target:
        """Create a new delivery interface.

        Args:
            data_product_id: The data product ID.
            target_type: The type of delivery interface (default "webhook").
            **kwargs: Additional fields (endpoint_url, method, headers, filters, etc.)

        Returns:
            The created Target instance.
        """
        body: dict[str, Any] = {"delivery_type": target_type, **kwargs}
        res = await self._http.post(_base_path(data_product_id), body)
        data = res.get("data", res) if isinstance(res, dict) else res
        return _parse_target(data)

    async def update(
        self,
        data_product_id: str,
        target_id: str,
        **kwargs: Any,
    ) -> Target:
        """Update an existing delivery interface.

        Args:
            data_product_id: The data product ID.
            target_id: The delivery interface (consumption) ID.
            **kwargs: Fields to update.

        Returns:
            The updated Target instance.
        """
        res = await self._http.put(f"{_base_path(data_product_id)}/{target_id}", kwargs)
        data = res.get("data", res) if isinstance(res, dict) else res
        return _parse_target(data)

    async def delete(self, data_product_id: str, target_id: str) -> None:
        """Delete a delivery interface.

        Args:
            data_product_id: The data product ID.
            target_id: The delivery interface (consumption) ID.
        """
        await self._http.delete(f"{_base_path(data_product_id)}/{target_id}")
