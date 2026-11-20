"""TOTP y códigos de recuperación: secretos cifrados, códigos con hash y sin logging."""
import base64
import hashlib
import hmac
import secrets
import time
from urllib.parse import quote
from cryptography.fernet import Fernet
from app.core.config import settings

def _cipher():
    key = base64.urlsafe_b64encode(hashlib.sha256(
        ("hjstore-mfa-v1:" + settings.SECRET_KEY).encode()
    ).digest())
    return Fernet(key)

def encrypt_secret(secret: str) -> str:
    return _cipher().encrypt(secret.encode()).decode()

def decrypt_secret(secret: str) -> str:
    return _cipher().decrypt(secret.encode()).decode()

def new_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")

def totp_code(secret: str, counter: int) -> str:
    raw = base64.b32decode(secret + "=" * (-len(secret) % 8), casefold=True)
    digest = hmac.new(raw, counter.to_bytes(8, "big"), hashlib.sha1).digest()
    offset = digest[-1] & 15
    value = int.from_bytes(digest[offset:offset + 4], "big") & 0x7fffffff
    return f"{value % 1000000:06d}"

def match_totp_step(secret: str, code: str, now: int | None = None) -> int | None:
    if not isinstance(code, str) or len(code) != 6 or not code.isascii() or not code.isdigit():
        return None
    step = int((now if now is not None else time.time()) // 30)
    for candidate in (step - 1, step, step + 1):
        if candidate >= 0 and hmac.compare_digest(totp_code(secret, candidate), code):
            return candidate
    return None

def recovery_hash(code: str) -> str:
    normalized = code.strip().replace("-", "").upper()
    return hmac.new(settings.SECRET_KEY.encode(), ("mfa-recovery:" + normalized).encode(), hashlib.sha256).hexdigest()

def generate_recovery_codes() -> tuple[list[str], list[str]]:
    codes = [secrets.token_hex(5).upper() for _ in range(10)]
    return codes, [recovery_hash(code) for code in codes]

def provisioning_uri(secret: str, email: str) -> str:
    return ("otpauth://totp/" + quote("HJStoreVP:" + email, safe="") +
            "?secret=" + quote(secret) + "&issuer=HJStoreVP&algorithm=SHA1&digits=6&period=30")
