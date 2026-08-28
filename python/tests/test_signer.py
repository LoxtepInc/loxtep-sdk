"""SigV4 signer must send a single Accept that matches the signed canonical header."""

import httpx

from loxtep.http_client import signed_request_parts
from loxtep.signer import sign_request


def _sts():
    return {
        "access_key_id": "ASIAEXAMPLEKEY",
        "secret_access_key": "test-secret",
        "session_token": "test-session-token",
    }


def test_sign_request_collapses_duplicate_accept_from_http_client():
    """http_client sets Accept; signer also sets accept. Gateway saw both as
    application/json,application/json and rejected the signature."""
    signed = sign_request(
        method="GET",
        url="https://apidev.loxtep.io/organizations/users/me",
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        body=None,
        credentials=_sts(),
        region="us-east-1",
    )
    accept_keys = [key for key in signed if key.lower() == "accept"]
    assert accept_keys == ["accept"]
    assert signed["accept"] == "application/json"

    wire = httpx.Headers(signed)
    assert wire.get("accept") == "application/json"
    assert "," not in (wire.get("accept") or "")


def test_signed_request_parts_accept_matches_what_is_signed():
    headers, _content = signed_request_parts(
        method="GET",
        url="https://apidev.loxtep.io/organizations/users/me",
        body=None,
        get_token=lambda: "tok-local",
        credentials=_sts(),
        region="us-east-1",
    )
    accept_keys = [key for key in headers if key.lower() == "accept"]
    assert len(accept_keys) == 1
    assert headers[accept_keys[0]] == "application/json"

    wire = httpx.Headers(headers)
    assert wire.get("accept") == "application/json"
    assert wire.get("accept") != "application/json,application/json"
    assert headers["authorization"].startswith("AWS4-HMAC-SHA256 ")
