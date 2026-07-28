"""
Port of nodejs/src/errors/parse-http.test.ts — keep test cases in sync.
"""

from loxtep.errors import (
    AuthenticationError,
    AuthorizationError,
    LoxtepError,
    NotFoundError,
    RateLimitError,
    ValidationError,
    parse_http_error,
)


def test_maps_401_to_authentication_error():
    err = parse_http_error(401, {"message": "Invalid token"})
    assert isinstance(err, AuthenticationError)
    assert err.message == "Invalid token"
    assert err.status_code == 401


def test_maps_403_to_authorization_error():
    err = parse_http_error(403, {"message": "Forbidden"})
    assert isinstance(err, AuthorizationError)
    assert err.status_code == 403


def test_maps_404_to_not_found_error_with_resource_type_and_id():
    err = parse_http_error(
        404,
        {"message": "Not found", "resource_type": "data_product", "resource_id": "asset-123"},
    )
    assert isinstance(err, NotFoundError)
    assert err.resource_type == "data_product"
    assert err.resource_id == "asset-123"


def test_reads_message_from_loxtep_platform_error_envelope():
    err = parse_http_error(
        404,
        {
            "success": False,
            "error": {
                "message": "Unable to resolve stream configuration for this instance",
                "details": {"instance_id": "abc", "hint": "Instance may not be fully provisioned"},
            },
        },
    )
    assert isinstance(err, NotFoundError)
    assert err.message == "Unable to resolve stream configuration for this instance"
    assert err.details.get("instance_id") == "abc"


def test_maps_429_to_rate_limit_error_with_full_fields():
    body = {
        "message": "Too many requests",
        "retry_after_seconds": 30,
        "limit": 100,
        "remaining": 0,
        "reset_at": "2026-01-29T12:00:00Z",
    }
    err = parse_http_error(429, body)
    assert isinstance(err, RateLimitError)
    assert err.retry_after_seconds == 30
    assert err.limit == 100
    assert err.remaining == 0
    assert err.reset_at == "2026-01-29T12:00:00Z"


def test_maps_429_with_minimal_body_to_defaults():
    err = parse_http_error(429, {})
    assert isinstance(err, RateLimitError)
    assert err.retry_after_seconds == 60
    assert err.limit == 0
    assert err.remaining == 0
    assert isinstance(err.reset_at, str)


def test_maps_400_with_field_errors_to_validation_error():
    err = parse_http_error(
        400,
        {"message": "Validation failed", "field_errors": [{"field": "name", "message": "Required"}]},
    )
    assert isinstance(err, ValidationError)
    assert err.field_errors == [{"field": "name", "message": "Required"}]


def test_prefers_string_details_over_generic_validation_error_title():
    err = parse_http_error(
        400,
        {
            "success": False,
            "error": {
                "message": "Validation Error",
                "details": (
                    "SDK connector requires metadata.instance_id when the "
                    "organization has multiple instances."
                ),
            },
        },
    )
    assert isinstance(err, ValidationError)
    assert "metadata.instance_id" in err.message
    assert "metadata.instance_id" in err.details.get("message", "")


def test_reads_field_errors_nested_under_error_envelope():
    err = parse_http_error(
        400,
        {
            "success": False,
            "error": {
                "message": "Validation Error",
                "field_errors": [
                    {"field": "metadata.instance_id", "message": "Required for multi-instance orgs"}
                ],
            },
        },
    )
    assert isinstance(err, ValidationError)
    assert err.field_errors == [
        {"field": "metadata.instance_id", "message": "Required for multi-instance orgs"}
    ]


def test_reads_field_errors_from_top_level_errors_key_with_path_fallback():
    err = parse_http_error(
        400,
        {
            "message": "Validation failed",
            "errors": [{"path": "workflow_type", "message": "must be ingestion, enrichment, or delivery"}],
        },
    )
    assert isinstance(err, ValidationError)
    assert err.field_errors == [
        {"field": "workflow_type", "message": "must be ingestion, enrichment, or delivery"}
    ]


def test_maps_unknown_status_to_loxtep_error():
    err = parse_http_error(503, {"message": "Service unavailable"})
    assert isinstance(err, LoxtepError)
    assert err.status_code == 503
