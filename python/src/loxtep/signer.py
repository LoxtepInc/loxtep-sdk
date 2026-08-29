"""
AWS SigV4 signing for API Gateway (execute-api).

Same contract as nodejs/src/http/signer.ts: JWT stays in x-jwt-token;
STS from credentials.json aws_credentials signs the request.
"""

from __future__ import annotations

import hashlib
import hmac
from datetime import datetime, timezone
from typing import Mapping, Optional
from urllib.parse import quote, urlparse, parse_qsl

SERVICE = "execute-api"


def _trim(value: Optional[str]) -> Optional[str]:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def parse_aws_credentials(raw: object) -> Optional[dict[str, str]]:
    """Map credentials.json ``aws_credentials`` (snake_case) to signer keys."""
    if not isinstance(raw, dict):
        return None
    access_key_id = _trim(raw.get("access_key_id") if isinstance(raw.get("access_key_id"), str) else None)
    secret_access_key = _trim(
        raw.get("secret_access_key") if isinstance(raw.get("secret_access_key"), str) else None
    )
    if not access_key_id or not secret_access_key:
        return None
    out = {
        "access_key_id": access_key_id,
        "secret_access_key": secret_access_key,
    }
    session_token = _trim(raw.get("session_token") if isinstance(raw.get("session_token"), str) else None)
    if session_token:
        out["session_token"] = session_token
    return out


def _canonical_query(parsed) -> str:
    pairs = parse_qsl(parsed.query, keep_blank_values=True)
    encoded = [
        (quote(k, safe="-_.~"), quote(v, safe="-_.~"))
        for k, v in pairs
    ]
    encoded.sort()
    return "&".join(f"{k}={v}" for k, v in encoded)


def _lower_headers(headers: Mapping[str, str]) -> dict[str, str]:
    """Case-fold header names so Accept/accept cannot both exist on the wire."""
    lowered: dict[str, str] = {}
    for key, value in headers.items():
        if value is None:
            continue
        lowered[key.lower()] = value.strip() if isinstance(value, str) else value
    return lowered


def _canonical_headers(headers: Mapping[str, str]) -> tuple[str, str]:
    lowered = _lower_headers(headers)
    names = sorted(lowered)
    canonical = "".join(f"{name}:{lowered[name]}\n" for name in names)
    signed = ";".join(names)
    return canonical, signed


def _sign(key: bytes, msg: str) -> bytes:
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()


def sign_request(
    *,
    method: str,
    url: str,
    headers: Mapping[str, str],
    body: Optional[str],
    credentials: Mapping[str, str],
    region: str,
) -> dict[str, str]:
    """Return request headers including Authorization and x-amz-* (execute-api)."""
    parsed = urlparse(url)
    amz_date = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    datestamp = amz_date[:8]
    payload = body if body is not None else ""
    payload_hash = hashlib.sha256(payload.encode("utf-8")).hexdigest()

    incoming = _lower_headers(headers)
    signed_headers: dict[str, str] = {
        "host": parsed.hostname or "",
        "accept": "application/json",
        **incoming,
        "x-amz-date": amz_date,
        "x-amz-content-sha256": payload_hash,
    }
    if body is not None:
        signed_headers.setdefault("content-type", "application/json")
    session_token = credentials.get("session_token")
    if session_token:
        signed_headers["x-amz-security-token"] = session_token

    canonical_headers, signed_names = _canonical_headers(signed_headers)
    canonical_request = "\n".join(
        [
            method.upper(),
            parsed.path or "/",
            _canonical_query(parsed),
            canonical_headers,
            signed_names,
            payload_hash,
        ]
    )
    credential_scope = f"{datestamp}/{region}/{SERVICE}/aws4_request"
    string_to_sign = "\n".join(
        [
            "AWS4-HMAC-SHA256",
            amz_date,
            credential_scope,
            hashlib.sha256(canonical_request.encode("utf-8")).hexdigest(),
        ]
    )
    signing_key = _sign(("AWS4" + credentials["secret_access_key"]).encode("utf-8"), datestamp)
    signing_key = _sign(signing_key, region)
    signing_key = _sign(signing_key, SERVICE)
    signing_key = _sign(signing_key, "aws4_request")
    signature = hmac.new(signing_key, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()
    access_key = credentials["access_key_id"]
    signed_headers["authorization"] = (
        f"AWS4-HMAC-SHA256 Credential={access_key}/{credential_scope}, "
        f"SignedHeaders={signed_names}, Signature={signature}"
    )
    return signed_headers
