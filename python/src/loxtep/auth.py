"""
Programmatic auth for the Python SDK.

Mint / refresh `sdk_python` sessions (`SDKSESSPY#`). Do not share CLI (`CLISESS#`),
web SPA, Node SDK (`SDKSESSNODE#`), or MCP session families.
"""

from __future__ import annotations

import json
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any, Optional
from urllib.parse import parse_qs, quote, urlparse

import httpx

DEFAULT_CLIENT_CHANNEL = "sdk_python"


class LoginMfaRequiredError(Exception):
    """Raised when login returns 403 and a TOTP code is required."""


def _auth_url(api_url: str, path: str, auth_path_prefix: str = "app") -> str:
    base = api_url.rstrip("/")
    prefix = auth_path_prefix.strip("/")
    if prefix:
        return f"{base}/{prefix}{path}"
    return f"{base}{path}"


def _unwrap_tokens(payload: dict[str, Any]) -> dict[str, Any]:
    data = payload.get("data")
    if payload.get("success") and isinstance(data, dict):
        return data
    return payload


def _is_mfa_required(status: int, body: dict[str, Any]) -> bool:
    if status != 403:
        return False
    if body.get("mfaRequired") is True:
        return True
    err = body.get("error")
    if isinstance(err, dict):
        details = err.get("details") or {}
        context = err.get("context") or {}
        if details.get("mfaRequired") is True or context.get("mfaRequired") is True:
            return True
        message = err.get("message")
        if isinstance(message, str) and "mfa" in message.lower():
            return True
    if isinstance(err, str) and "mfa" in err.lower():
        return True
    return False


def login(
    api_url: str,
    email: str,
    password: str,
    *,
    organization_id: Optional[str] = None,
    mfa_code: Optional[str] = None,
    client_channel: str = DEFAULT_CLIENT_CHANNEL,
    auth_path_prefix: str = "app",
    timeout: float = 30.0,
) -> dict[str, Any]:
    """
    Email/password login. Defaults to ``client_channel=sdk_python``.

    Returns dict with access_token, refresh_token, expires_in, expires_at,
    and optional aws_credentials.
    """
    url = _auth_url(api_url, "/auth/login", auth_path_prefix)
    body: dict[str, Any] = {
        "email": email,
        "password": password,
        "client_channel": client_channel,
    }
    if organization_id:
        body["organization_id"] = organization_id
    if mfa_code:
        body["mfa_code"] = mfa_code

    with httpx.Client(timeout=timeout) as client:
        res = client.post(url, json=body)
        data = res.json() if res.content else {}
        if not res.is_success:
            if _is_mfa_required(res.status_code, data if isinstance(data, dict) else {}):
                raise LoginMfaRequiredError("MFA code required")
            err = data.get("error") if isinstance(data, dict) else None
            if isinstance(err, dict) and err.get("message"):
                raise RuntimeError(str(err["message"]))
            if isinstance(err, str) and err:
                raise RuntimeError(err)
            raise RuntimeError(res.reason_phrase or f"Login failed ({res.status_code})")
        tokens = _unwrap_tokens(data if isinstance(data, dict) else {})
        if not tokens.get("access_token"):
            raise RuntimeError("Invalid login response")
        return tokens


def refresh(
    api_url: str,
    refresh_token: str,
    *,
    auth_path_prefix: str = "app",
    timeout: float = 30.0,
) -> dict[str, Any]:
    """Refresh an SDK Python session. Returns new access/refresh tokens."""
    url = _auth_url(api_url, "/auth/refresh", auth_path_prefix)
    with httpx.Client(timeout=timeout) as client:
        res = client.post(url, json={"refresh_token": refresh_token})
        data = res.json() if res.content else {}
        if not res.is_success:
            err = data.get("error") if isinstance(data, dict) else None
            if isinstance(err, dict) and err.get("message"):
                raise RuntimeError(str(err["message"]))
            if isinstance(err, str) and err:
                raise RuntimeError(err)
            raise RuntimeError(res.reason_phrase or f"Refresh failed ({res.status_code})")
        tokens = _unwrap_tokens(data if isinstance(data, dict) else {})
        if not tokens.get("access_token"):
            raise RuntimeError("Invalid refresh response")
        if not tokens.get("refresh_token"):
            tokens["refresh_token"] = refresh_token
        return tokens


def browser_login(
    app_url: str,
    *,
    timeout_seconds: float = 300.0,
    no_open: bool = False,
    runtime: str = "python",
) -> dict[str, Any]:
    """
    Browser handoff via ``/auth/sdk?runtime=python`` (SDKSESSPY#).

    Starts a localhost callback server, opens the browser, returns tokens.
    """
    result: dict[str, Any] = {}
    error: list[BaseException] = []
    done = threading.Event()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format: str, *args: Any) -> None:  # noqa: A003
            return

        def do_GET(self) -> None:  # noqa: N802
            parsed = urlparse(self.path)
            if parsed.path != "/callback":
                self.send_response(200)
                self.send_header("Content-Type", "text/plain")
                self.end_headers()
                self.wfile.write(b"Loxtep Python SDK login callback server")
                return

            qs = parse_qs(parsed.query)
            access_token = (qs.get("access_token") or [None])[0]
            if not access_token:
                body = b"<html><body><h2>Login failed</h2></body></html>"
                self.send_response(400)
                self.send_header("Content-Type", "text/html")
                self.end_headers()
                self.wfile.write(body)
                error.append(RuntimeError("No access token received"))
                done.set()
                return

            payload: dict[str, Any] = {
                "access_token": access_token,
                "refresh_token": (qs.get("refresh_token") or [None])[0],
                "expires_at": (qs.get("expires_at") or [None])[0],
                "api_base_url": (qs.get("api_base_url") or [None])[0],
            }
            aws_raw = (qs.get("aws_credentials") or [None])[0]
            if aws_raw:
                try:
                    payload["aws_credentials"] = json.loads(aws_raw)
                except json.JSONDecodeError:
                    pass
            result.update({k: v for k, v in payload.items() if v is not None})

            ok = (
                b"<html><body><h2>Login successful!</h2>"
                b"<p>You can close this window.</p></body></html>"
            )
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(ok)
            done.set()

    server = HTTPServer(("127.0.0.1", 0), Handler)
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    callback_url = f"http://127.0.0.1:{port}/callback"
    login_url = (
        f"{app_url.rstrip('/')}/auth/sdk"
        f"?callback_url={quote(callback_url, safe='')}"
        f"&runtime={quote(runtime, safe='')}"
    )

    try:
        if no_open:
            print(f"\nOpen this URL in your browser to log in:\n\n  {login_url}\n")
        else:
            print(f"\nOpening browser for Loxtep login...\n  {login_url}\n")
            webbrowser.open(login_url)
        print("Waiting for login to complete...")
        if not done.wait(timeout_seconds):
            raise TimeoutError(f"Login timed out after {timeout_seconds} seconds. Try again.")
        if error:
            raise error[0]
        if not result.get("access_token"):
            raise RuntimeError("Login failed: no access token")
        return result
    finally:
        server.shutdown()
        server.server_close()
