"""TOTP y códigos de recuperación: secretos cifrados, códigos con hash y sin logging."""
import base64
import hashlib
import hmac
import secrets
import time
from urllib.parse import quote
from cryptography.fernet import Fernet, MultiFernet, InvalidToken
from app.core.config import settings

def _legacy_cipher():
    key = base64.urlsafe_b64encode(hashlib.sha256(
        ("hjstore-mfa-v1:" + settings.SECRET_KEY).encode()
    ).digest())
    return Fernet(key)

def _configured_ciphers():
    return [Fernet(key.strip().encode('ascii')) for key in settings.MFA_ENCRYPTION_KEYS.split(',') if key.strip()]


def _cipher():
    return MultiFernet([*_configured_ciphers(), _legacy_cipher()])


def rotate_ciphertext(ciphertext: str) -> str:
    """Conserva la fecha Fernet y evita reescribir tokens ya cifrados con la primaria."""
    configured = _configured_ciphers()
    if not configured:
        raise ValueError('Configura MFA_ENCRYPTION_KEYS antes de rotar')
    token = ciphertext.encode()
    try:
        configured[0].decrypt(token)
        return ciphertext
    except InvalidToken:
        return _cipher().rotate(token).decode()


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
    key = settings.MFA_RECOVERY_PEPPER or settings.SECRET_KEY
    prefix = 'mfa-recovery-v2:' if settings.MFA_RECOVERY_PEPPER else 'mfa-recovery:'
    digest = hmac.new(key.encode(), (prefix + normalized).encode(), hashlib.sha256).hexdigest()
    return 'v2:' + digest if settings.MFA_RECOVERY_PEPPER else digest


def recovery_candidates(code: str) -> tuple[str, ...]:
    normalized = code.strip().replace('-', '').upper()
    legacy = hmac.new(settings.SECRET_KEY.encode(), ('mfa-recovery:' + normalized).encode(), hashlib.sha256).hexdigest()
    return (recovery_hash(code), legacy) if settings.MFA_RECOVERY_PEPPER else (legacy,)

def generate_recovery_codes() -> tuple[list[str], list[str]]:
    codes = [secrets.token_hex(5).upper() for _ in range(10)]
    return codes, [recovery_hash(code) for code in codes]

def provisioning_uri(secret: str, email: str) -> str:
    return ("otpauth://totp/" + quote("HJStoreVP:" + email, safe="") +
            "?secret=" + quote(secret) + "&issuer=HJStoreVP&algorithm=SHA1&digits=6&period=30")
