"""
HTTP client for Loxtep API. Sync and async; JWT in x-jwt-token; SigV4 when STS present.
"""

import json
from typing import Any, Callable, Mapping, Optional

import httpx

from .errors import parse_http_error
from .gateway_url import build_platform_request_url
from .signer import sign_request

MAX_RETRIES = 2
INITIAL_BACKOFF = 1.0


def _is_retryable(status_code: int) -> bool:
    return status_code >= 500 or status_code == 429


def _jwt_headers(get_token: Optional[Callable[..., Any]]) -> dict[str, str]:
    headers: dict[str, str] = {"Content-Type": "application/json", "Accept": "application/json"}
    if get_token:
        token = get_token()
        if isinstance(token, str) and token:
            headers["x-jwt-token"] = token
    return headers


def signed_request_parts(
    *,
    method: str,
    url: str,
    body: Optional[dict[str, Any]],
    get_token: Optional[Callable[..., Any]],
    credentials: Optional[Mapping[str, str]],
    region: str,
) -> tuple[dict[str, str], Optional[bytes]]:
    headers = _jwt_headers(get_token)
    content: Optional[bytes] = None
    body_str: Optional[str] = None
    if body is not None:
        body_str = json.dumps(body)
        content = body_str.encode("utf-8")
    if credentials:
        headers = sign_request(
            method=method,
            url=url,
            headers=headers,
            body=body_str,
            credentials=credentials,
            region=region,
        )
    return headers, content


class RateLimitInfo:
    """Rate limit info from response headers."""

    def __init__(
        self,
        limit: int = 0,
        remaining: int = 0,
        reset_at: str = "",
        retry_after_seconds: Optional[int] = None,
    ) -> None:
        self.limit = limit
        self.remaining = remaining
        self.reset_at = reset_at
        self.retry_after_seconds = retry_after_seconds


class LoxtepHttpClient:
    """Sync HTTP client: GET/POST/PUT/DELETE with JWT and retry."""

    def __init__(
        self,
        base_url: str,
        get_token: Optional[Callable[[], str]] = None,
        *,
        timeout: float = 30.0,
        use_platform_path_resolution: bool = True,
        credentials: Optional[Mapping[str, str]] = None,
        region: Optional[str] = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._get_token = get_token
        self._timeout = timeout
        self._use_platform_path_resolution = use_platform_path_resolution
        self._credentials = dict(credentials) if credentials else None
        self._region = region or "us-east-1"
        self._last_rate_limit: Optional[RateLimitInfo] = None
        self._client = httpx.Client(timeout=timeout)

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "LoxtepHttpClient":
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()

    def _headers(self) -> dict[str, str]:
        return _jwt_headers(self._get_token)

    def _signed_request(
        self, method: str, url: str, body: Optional[dict[str, Any]]
    ) -> tuple[dict[str, str], Optional[bytes]]:
        return signed_request_parts(
            method=method,
            url=url,
            body=body,
            get_token=self._get_token,
            credentials=self._credentials,
            region=self._region,
        )

    def _capture_rate_limit(self, response: httpx.Response) -> None:
        limit_h = response.headers.get("x-ratelimit-limit")
        remaining_h = response.headers.get("x-ratelimit-remaining")
        reset_h = response.headers.get("x-ratelimit-reset")
        retry_h = response.headers.get("retry-after")
        if limit_h is not None or remaining_h is not None or reset_h is not None:
            limit = int(limit_h) if limit_h and limit_h.isdigit() else 0
            remaining = int(remaining_h) if remaining_h and remaining_h.isdigit() else 0
            reset_at = reset_h or ""
            retry_seconds = int(retry_h) if retry_h and retry_h.isdigit() else None
            self._last_rate_limit = RateLimitInfo(
                limit=limit,
                remaining=remaining,
                reset_at=reset_at,
                retry_after_seconds=retry_seconds,
            )

    def _build_url(self, path: str) -> str:
        if path.startswith("http"):
            return path
        if self._use_platform_path_resolution:
            return build_platform_request_url(self._base_url, path)
        return f"{self._base_url}{path}" if path.startswith("/") else f"{self._base_url}/{path}"

    def _request(
        self,
        method: str,
        path: str,
        body: Optional[dict[str, Any]] = None,
        retry_count: int = 0,
    ) -> Any:
        url = self._build_url(path)
        headers, content = self._signed_request(method, url, body)
        resp = self._client.request(
            method,
            url,
            headers=headers,
            content=content,
        )
        request_id = resp.headers.get("x-request-id")
        try:
            parsed = resp.json() if resp.content else {}
        except Exception:
            parsed = {"message": resp.text or resp.reason_phrase or "Unknown error"}

        if resp.status_code >= 400:
            if _is_retryable(resp.status_code) and retry_count < MAX_RETRIES:
                import time
                time.sleep(INITIAL_BACKOFF * (2**retry_count))
                return self._request(method, path, body, retry_count + 1)
            raise parse_http_error(resp.status_code, parsed, request_id)

        self._capture_rate_limit(resp)
        return parsed

    def get(self, path: str) -> Any:
        return self._request("GET", path)

    def post(self, path: str, body: Optional[dict[str, Any]] = None) -> Any:
        return self._request("POST", path, body)

    def put(self, path: str, body: Optional[dict[str, Any]] = None) -> Any:
        return self._request("PUT", path, body)

    def delete(self, path: str) -> Any:
        return self._request("DELETE", path)

    def get_last_rate_limit(self) -> Optional[RateLimitInfo]:
        return self._last_rate_limit


class AsyncLoxtepHttpClient:
    """Async HTTP client: same interface as sync, async methods."""

    def __init__(
        self,
        base_url: str,
        get_token: Optional[Callable[[], Any]] = None,
        *,
        timeout: float = 30.0,
        use_platform_path_resolution: bool = True,
        credentials: Optional[Mapping[str, str]] = None,
        region: Optional[str] = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._get_token = get_token
        self._timeout = timeout
        self._use_platform_path_resolution = use_platform_path_resolution
        self._credentials = dict(credentials) if credentials else None
        self._region = region or "us-east-1"
        self._last_rate_limit: Optional[RateLimitInfo] = None
        self._client = httpx.AsyncClient(timeout=timeout)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def __aenter__(self) -> "AsyncLoxtepHttpClient":
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.aclose()

    def _headers(self) -> dict[str, str]:
        return _jwt_headers(self._get_token)

    def _signed_request(
        self, method: str, url: str, body: Optional[dict[str, Any]]
    ) -> tuple[dict[str, str], Optional[bytes]]:
        return signed_request_parts(
            method=method,
            url=url,
            body=body,
            get_token=self._get_token,
            credentials=self._credentials,
            region=self._region,
        )

    def _capture_rate_limit(self, response: httpx.Response) -> None:
        limit_h = response.headers.get("x-ratelimit-limit")
        remaining_h = response.headers.get("x-ratelimit-remaining")
        reset_h = response.headers.get("x-ratelimit-reset")
        retry_h = response.headers.get("retry-after")
        if limit_h is not None or remaining_h is not None or reset_h is not None:
            limit = int(limit_h) if limit_h and limit_h.isdigit() else 0
            remaining = int(remaining_h) if remaining_h and remaining_h.isdigit() else 0
            reset_at = reset_h or ""
            retry_seconds = int(retry_h) if retry_h and retry_h.isdigit() else None
            self._last_rate_limit = RateLimitInfo(
                limit=limit,
                remaining=remaining,
                reset_at=reset_at,
                retry_after_seconds=retry_seconds,
            )

    def _build_url(self, path: str) -> str:
        if path.startswith("http"):
            return path
        if self._use_platform_path_resolution:
            return build_platform_request_url(self._base_url, path)
        return f"{self._base_url}{path}" if path.startswith("/") else f"{self._base_url}/{path}"

    async def _request(
        self,
        method: str,
        path: str,
        body: Optional[dict[str, Any]] = None,
        retry_count: int = 0,
    ) -> Any:
        url = self._build_url(path)
        headers, content = self._signed_request(method, url, body)
        resp = await self._client.request(
            method,
            url,
            headers=headers,
            content=content,
        )
        request_id = resp.headers.get("x-request-id")
        try:
            parsed = resp.json() if resp.content else {}
        except Exception:
            parsed = {"message": resp.text or resp.reason_phrase or "Unknown error"}

        if resp.status_code >= 400:
            if _is_retryable(resp.status_code) and retry_count < MAX_RETRIES:
                import asyncio
                await asyncio.sleep(INITIAL_BACKOFF * (2**retry_count))
                return await self._request(method, path, body, retry_count + 1)
            raise parse_http_error(resp.status_code, parsed, request_id)

        self._capture_rate_limit(resp)
        return parsed

    async def get(self, path: str) -> Any:
        return await self._request("GET", path)

    async def post(self, path: str, body: Optional[dict[str, Any]] = None) -> Any:
        return await self._request("POST", path, body)

    async def put(self, path: str, body: Optional[dict[str, Any]] = None) -> Any:
        return await self._request("PUT", path, body)

    async def delete(self, path: str) -> Any:
        return await self._request("DELETE", path)

    def get_last_rate_limit(self) -> Optional[RateLimitInfo]:
        return self._last_rate_limit
