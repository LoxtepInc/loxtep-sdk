"""
Loxtep SDK error hierarchy. Maps HTTP status to typed exceptions.
All attributes snake_case per API conventions.
"""

from typing import Any, Optional


class LoxtepError(Exception):
    """Base exception for all Loxtep SDK errors."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "UNKNOWN_ERROR",
        status_code: Optional[int] = None,
        details: Optional[dict[str, Any]] = None,
        request_id: Optional[str] = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = details or {}
        self.request_id = request_id

    @property
    def is_retryable(self) -> bool:
        return self.code == "RATE_LIMIT_EXCEEDED"


class AuthenticationError(LoxtepError):
    """401 Unauthorized."""

    def __init__(self, message: str, details: Optional[dict[str, Any]] = None) -> None:
        super().__init__(message, code="UNAUTHORIZED", status_code=401, details=details)


class AuthorizationError(LoxtepError):
    """403 Forbidden."""

    def __init__(self, message: str, details: Optional[dict[str, Any]] = None) -> None:
        super().__init__(message, code="FORBIDDEN", status_code=403, details=details)


class NotFoundError(LoxtepError):
    """404 Not Found."""

    def __init__(
        self,
        message: str,
        resource_type: str = "resource",
        resource_id: str = "",
        *,
        details: Optional[dict[str, Any]] = None,
        request_id: Optional[str] = None,
    ) -> None:
        super().__init__(
            message,
            code="NOT_FOUND",
            status_code=404,
            details={**(details or {}), "resource_type": resource_type, "resource_id": resource_id},
            request_id=request_id,
        )
        self.resource_type = resource_type
        self.resource_id = resource_id


class ConflictError(LoxtepError):
    """409 Conflict."""

    def __init__(
        self,
        message: str,
        *,
        details: Optional[dict[str, Any]] = None,
        request_id: Optional[str] = None,
    ) -> None:
        super().__init__(message, code="CONFLICT", status_code=409, details=details, request_id=request_id)


class ValidationError(LoxtepError):
    """400 Bad Request with field errors."""

    def __init__(
        self,
        message: str,
        field_errors: Optional[list[dict[str, str]]] = None,
        *,
        details: Optional[dict[str, Any]] = None,
        request_id: Optional[str] = None,
    ) -> None:
        super().__init__(message, code="VALIDATION_ERROR", status_code=400, details=details, request_id=request_id)
        self.field_errors = field_errors or []


class RateLimitError(LoxtepError):
    """429 Too Many Requests."""

    def __init__(
        self,
        message: str,
        *,
        retry_after_seconds: int = 60,
        limit: int = 0,
        remaining: int = 0,
        reset_at: Optional[str] = None,
        details: Optional[dict[str, Any]] = None,
        request_id: Optional[str] = None,
    ) -> None:
        super().__init__(message, code="RATE_LIMIT_EXCEEDED", status_code=429, details=details, request_id=request_id)
        self.retry_after_seconds = retry_after_seconds
        self.limit = limit
        self.remaining = remaining
        self.reset_at = reset_at or ""


def parse_http_error(
    status_code: int,
    body: Any,
    request_id: Optional[str] = None,
) -> LoxtepError:
    """Map HTTP status and body to the appropriate Loxtep error."""
    safe = body if isinstance(body, dict) else {}
    message = safe.get("message") if isinstance(safe.get("message"), str) else f"HTTP {status_code}"
    details = safe.get("details") if isinstance(safe.get("details"), dict) else None
    req_id = safe.get("request_id") if isinstance(safe.get("request_id"), str) else request_id

    if status_code == 401:
        return AuthenticationError(message, details)
    if status_code == 403:
        return AuthorizationError(message, details)
    if status_code == 404:
        resource_type = safe.get("resource_type") if isinstance(safe.get("resource_type"), str) else "resource"
        resource_id = safe.get("resource_id") if isinstance(safe.get("resource_id"), str) else ""
        return NotFoundError(message, resource_type, resource_id, details=details, request_id=req_id)
    if status_code == 409:
        return ConflictError(message, details=details, request_id=req_id)
    if status_code == 429:
        rl = body if isinstance(body, dict) else {}
        retry = rl.get("retry_after_seconds") if isinstance(rl.get("retry_after_seconds"), (int, float)) else 60
        limit = rl.get("limit") if isinstance(rl.get("limit"), (int, float)) else 0
        remaining = rl.get("remaining") if isinstance(rl.get("remaining"), (int, float)) else 0
        reset_at = rl.get("reset_at") if isinstance(rl.get("reset_at"), str) else None
        return RateLimitError(
            message,
            retry_after_seconds=int(retry),
            limit=int(limit),
            remaining=int(remaining),
            reset_at=reset_at,
            details=details,
            request_id=req_id,
        )
    if status_code == 400:
        raw = safe.get("field_errors")
        field_errors = (
            [e for e in raw if isinstance(e, dict) and "field" in e and "message" in e]
            if isinstance(raw, list)
            else []
        )
        return ValidationError(message, field_errors, details=details, request_id=req_id)

    code = safe.get("code") if isinstance(safe.get("code"), str) else "UNKNOWN_ERROR"
    return LoxtepError(message, code=code, status_code=status_code, details=details, request_id=req_id)
