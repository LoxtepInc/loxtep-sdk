"""
Delivery Interfaces API.

Manages delivery interfaces (formerly called "consumptions") for data products.
Delivery interfaces define how a data product makes its data available to
external systems via webhooks, API endpoints, exports, database syncs, BI
connections, or event streams.

list, get, create, update, delete.
"""

from typing import Any, Optional

from .http_client import AsyncLoxtepHttpClient, LoxtepHttpClient
from .models import DeliveryInterface, DeliveryType


def _base_path(data_product_id: str) -> str:
    return f"/dataproducts/{data_product_id}/consumptions"


def _query_string(params: dict[str, Any]) -> str:
    parts = [f"{k}={v}" for k, v in params.items() if v is not None]
    return "?" + "&".join(parts) if parts else ""


def _parse_delivery_interface(data: dict[str, Any]) -> DeliveryInterface:
    """Parse a raw API response dict into a DeliveryInterface model."""
    return DeliveryInterface.model_validate(data)


def _parse_delivery_list(data: Any) -> list[DeliveryInterface]:
    """Parse API list response into a list of DeliveryInterface models."""
    if isinstance(data, list):
        return [_parse_delivery_interface(item) for item in data]
    if isinstance(data, dict):
        items = data.get("items", data.get("data", []))
        if isinstance(items, list):
            return [_parse_delivery_interface(item) for item in items]
    return []


class DeliveryApi:
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
    ) -> list[DeliveryInterface]:
        """List delivery interfaces for a data product.

        Args:
            data_product_id: The data product ID.
            page: Page number (default 1).
            page_size: Items per page (default 20).
            status: Optional status filter.
            is_active: Optional active state filter.

        Returns:
            List of DeliveryInterface instances.
        """
        params: dict[str, Any] = {"page": page, "page_size": page_size}
        if status is not None:
            params["status"] = status
        if is_active is not None:
            params["is_active"] = str(is_active).lower()
        qs = _query_string(params)
        res = self._http.get(f"{_base_path(data_product_id)}{qs}")
        data = res.get("data", res) if isinstance(res, dict) else res
        return _parse_delivery_list(data)

    def get(self, data_product_id: str, delivery_id: str) -> DeliveryInterface:
        """Get a single delivery interface by ID.

        Args:
            data_product_id: The data product ID.
            delivery_id: The delivery interface (consumption) ID.

        Returns:
            A DeliveryInterface instance.
        """
        res = self._http.get(f"{_base_path(data_product_id)}/{delivery_id}")
        data = res.get("data", res) if isinstance(res, dict) else res
        return _parse_delivery_interface(data)

    def create(
        self,
        data_product_id: str,
        delivery_type: DeliveryType = "webhook",
        **kwargs: Any,
    ) -> DeliveryInterface:
        """Create a new delivery interface.

        Args:
            data_product_id: The data product ID.
            delivery_type: The type of delivery interface (default "webhook").
            **kwargs: Additional fields (endpoint_url, method, headers, filters, etc.)

        Returns:
            The created DeliveryInterface instance.
        """
        body: dict[str, Any] = {"delivery_type": delivery_type, **kwargs}
        res = self._http.post(_base_path(data_product_id), body)
        data = res.get("data", res) if isinstance(res, dict) else res
        return _parse_delivery_interface(data)

    def update(
        self,
        data_product_id: str,
        delivery_id: str,
        **kwargs: Any,
    ) -> DeliveryInterface:
        """Update an existing delivery interface.

        Args:
            data_product_id: The data product ID.
            delivery_id: The delivery interface (consumption) ID.
            **kwargs: Fields to update.

        Returns:
            The updated DeliveryInterface instance.
        """
        res = self._http.put(f"{_base_path(data_product_id)}/{delivery_id}", kwargs)
        data = res.get("data", res) if isinstance(res, dict) else res
        return _parse_delivery_interface(data)

    def delete(self, data_product_id: str, delivery_id: str) -> None:
        """Delete a delivery interface.

        Args:
            data_product_id: The data product ID.
            delivery_id: The delivery interface (consumption) ID.
        """
        self._http.delete(f"{_base_path(data_product_id)}/{delivery_id}")


class AsyncDeliveryApi:
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
    ) -> list[DeliveryInterface]:
        """List delivery interfaces for a data product.

        Args:
            data_product_id: The data product ID.
            page: Page number (default 1).
            page_size: Items per page (default 20).
            status: Optional status filter.
            is_active: Optional active state filter.

        Returns:
            List of DeliveryInterface instances.
        """
        params: dict[str, Any] = {"page": page, "page_size": page_size}
        if status is not None:
            params["status"] = status
        if is_active is not None:
            params["is_active"] = str(is_active).lower()
        qs = _query_string(params)
        res = await self._http.get(f"{_base_path(data_product_id)}{qs}")
        data = res.get("data", res) if isinstance(res, dict) else res
        return _parse_delivery_list(data)

    async def get(self, data_product_id: str, delivery_id: str) -> DeliveryInterface:
        """Get a single delivery interface by ID.

        Args:
            data_product_id: The data product ID.
            delivery_id: The delivery interface (consumption) ID.

        Returns:
            A DeliveryInterface instance.
        """
        res = await self._http.get(f"{_base_path(data_product_id)}/{delivery_id}")
        data = res.get("data", res) if isinstance(res, dict) else res
        return _parse_delivery_interface(data)

    async def create(
        self,
        data_product_id: str,
        delivery_type: DeliveryType = "webhook",
        **kwargs: Any,
    ) -> DeliveryInterface:
        """Create a new delivery interface.

        Args:
            data_product_id: The data product ID.
            delivery_type: The type of delivery interface (default "webhook").
            **kwargs: Additional fields (endpoint_url, method, headers, filters, etc.)

        Returns:
            The created DeliveryInterface instance.
        """
        body: dict[str, Any] = {"delivery_type": delivery_type, **kwargs}
        res = await self._http.post(_base_path(data_product_id), body)
        data = res.get("data", res) if isinstance(res, dict) else res
        return _parse_delivery_interface(data)

    async def update(
        self,
        data_product_id: str,
        delivery_id: str,
        **kwargs: Any,
    ) -> DeliveryInterface:
        """Update an existing delivery interface.

        Args:
            data_product_id: The data product ID.
            delivery_id: The delivery interface (consumption) ID.
            **kwargs: Fields to update.

        Returns:
            The updated DeliveryInterface instance.
        """
        res = await self._http.put(f"{_base_path(data_product_id)}/{delivery_id}", kwargs)
        data = res.get("data", res) if isinstance(res, dict) else res
        return _parse_delivery_interface(data)

    async def delete(self, data_product_id: str, delivery_id: str) -> None:
        """Delete a delivery interface.

        Args:
            data_product_id: The data product ID.
            delivery_id: The delivery interface (consumption) ID.
        """
        await self._http.delete(f"{_base_path(data_product_id)}/{delivery_id}")
