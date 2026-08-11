"""Tests for Python SDK auth channel isolation."""

from unittest.mock import MagicMock, patch

import pytest

from loxtep.auth import LoginMfaRequiredError, login, refresh


def test_login_defaults_to_sdk_python_channel() -> None:
    mock_response = MagicMock()
    mock_response.is_success = True
    mock_response.content = b"{}"
    mock_response.json.return_value = {
        "success": True,
        "data": {
            "access_token": "at",
            "refresh_token": "rt",
            "expires_in": 3600,
            "expires_at": "2026-01-01T00:00:00Z",
        },
    }

    with patch("loxtep.auth.httpx.Client") as client_cls:
        client = client_cls.return_value.__enter__.return_value
        client.post.return_value = mock_response
        tokens = login("https://api.example.com", "u@e.com", "pass")

    assert tokens["access_token"] == "at"
    client.post.assert_called_once()
    url, kwargs = client.post.call_args[0][0], client.post.call_args[1]
    assert url == "https://api.example.com/app/auth/login"
    assert kwargs["json"]["client_channel"] == "sdk_python"


def test_login_mfa_required() -> None:
    mock_response = MagicMock()
    mock_response.is_success = False
    mock_response.status_code = 403
    mock_response.content = b"{}"
    mock_response.json.return_value = {
        "error": {"message": "MFA required", "details": {"mfaRequired": True}}
    }

    with patch("loxtep.auth.httpx.Client") as client_cls:
        client = client_cls.return_value.__enter__.return_value
        client.post.return_value = mock_response
        with pytest.raises(LoginMfaRequiredError):
            login("https://api.example.com", "u@e.com", "pass")


def test_refresh_posts_refresh_token() -> None:
    mock_response = MagicMock()
    mock_response.is_success = True
    mock_response.content = b"{}"
    mock_response.json.return_value = {
        "access_token": "new-at",
        "refresh_token": "new-rt",
        "expires_in": 3600,
        "expires_at": "2026-01-01T00:00:00Z",
    }

    with patch("loxtep.auth.httpx.Client") as client_cls:
        client = client_cls.return_value.__enter__.return_value
        client.post.return_value = mock_response
        tokens = refresh("https://api.example.com", "old-rt")

    assert tokens["access_token"] == "new-at"
    assert tokens["refresh_token"] == "new-rt"
    kwargs = client.post.call_args[1]
    assert kwargs["json"] == {"refresh_token": "old-rt"}
