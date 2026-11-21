"""JWT migration regression checks: legacy HS256, expiry and claim integrity.

No production services or databases are needed. The legacy JWT fixture is
assembled with stdlib HMAC to avoid depending on the retired python-jose.
"""
import base64
import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone

import jwt

from app.core.config import settings
from app.core.security import create_access_token, create_refresh_token, decode_token


def _b64(data):
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _legacy_hs256(payload):
    header = _b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    body = _b64(json.dumps(payload, separators=(",", ":")).encode())
    signing_input = f"{header}.{body}".encode()
    signature = hmac.new(settings.SECRET_KEY.encode(), signing_input, hashlib.sha256).digest()
    return f"{header}.{body}.{_b64(signature)}"


def test_legacy_jose_hs256_token_remains_valid():
    """Old jose tokens use ordinary JWT signing; existing sessions survive."""
    exp = int((datetime.now(timezone.utc) + timedelta(minutes=10)).timestamp())
    token = _legacy_hs256({"sub": "42", "type": "access", "exp": exp, "ver": "legacy"})
    assert decode_token(token)["sub"] == "42"
    assert decode_token(token)["ver"] == "legacy"


def test_access_and_refresh_tokens_keep_contract():
    access = create_access_token(7, extra={"ver": "test", "role": "super_admin"})
    refresh = create_refresh_token(7, extra={"ver": "test"})
    access_data = decode_token(access)
    refresh_data = decode_token(refresh)
    assert access_data["type"] == "access"
    assert refresh_data["type"] == "refresh"
    assert access_data["sub"] == "7"
    assert refresh_data["sub"] == "7"
    assert refresh_data["jti"]
    assert jwt.get_unverified_header(access)["alg"] == "HS256"


def test_expired_or_missing_exp_claim_rejected():
    now = datetime.now(timezone.utc)
    assert decode_token(_legacy_hs256({
        "sub": "9", "type": "access", "exp": int((now - timedelta(seconds=5)).timestamp())
    })) is None
    for payload in (
        {"sub": "9", "type": "access"},
        {"sub": "9", "exp": int((now + timedelta(minutes=2)).timestamp())},
        {"type": "access", "exp": int((now + timedelta(minutes=2)).timestamp())},
    ):
        assert decode_token(_legacy_hs256(payload)) is None


def test_none_algorithm_and_modified_signature_rejected():
    token = create_access_token(9)
    header, payload, signature = token.split(".")
    changed_sig = ("A" if signature[0] != "A" else "B") + signature[1:]
    changed = f"{header}.{payload}.{changed_sig}"
    assert decode_token(changed) is None

    header = _b64(b'{"alg":"none","typ":"JWT"}')
    payload = _b64(json.dumps({
        "sub": "9", "type": "access",
        "exp": int((datetime.now(timezone.utc) + timedelta(minutes=5)).timestamp()),
    }).encode())
    assert decode_token(f"{header}.{payload}.") is None


def test_unsupported_algorithm_and_malformed_token_rejected():
    assert decode_token("malformed.jwt.token") is None
    exp = int((datetime.now(timezone.utc) + timedelta(minutes=5)).timestamp())
    token = jwt.encode({"sub": "9", "type": "access", "exp": exp},
                       settings.SECRET_KEY, algorithm="HS384")
    assert decode_token(token) is None
