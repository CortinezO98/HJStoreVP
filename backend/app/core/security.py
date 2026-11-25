from datetime import datetime, timedelta, timezone
import time
import hashlib
import hmac
import uuid
from typing import Optional, Union
import jwt
from jwt.exceptions import InvalidTokenError
from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher
from pwdlib.hashers.bcrypt import BcryptHasher
from pwdlib.exceptions import UnknownHashError, HashVerificationError
from app.core.config import settings

pwd_context = PasswordHash((Argon2Hasher(memory_cost=65536, time_cost=3, parallelism=4), BcryptHasher()))


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except (UnknownHashError, HashVerificationError, ValueError, TypeError):
        return False


def verify_and_update_password(plain_password: str, hashed_password: str) -> tuple[bool, str | None]:
    # bcrypt histórico trunca a 72 bytes. No fijar un sufijo ambiguo en Argon2.
    if hashed_password.startswith(("$2a$", "$2b$", "$2y$")) and len(plain_password.encode("utf-8")) > 72:
        return verify_password(plain_password, hashed_password), None
    try:
        return pwd_context.verify_and_update(plain_password, hashed_password)
    except (UnknownHashError, HashVerificationError, ValueError, TypeError):
        return False, None


def credential_version(hashed_password: str) -> str:
    """Fingerprint firmado que cambia cuando cambia la contraseña."""
    return hmac.new(
        settings.SECRET_KEY.encode("utf-8"),
        hashed_password.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def credential_version_matches(payload: dict, hashed_password: str) -> bool:
    version = payload.get("ver")
    return isinstance(version, str) and hmac.compare_digest(
        version, credential_version(hashed_password)
    )


def new_session_claims():
    return {"sid": uuid.uuid4().hex, "session_exp": int(time.time()) + max(
        settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400, settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60)}


def create_access_token(subject: Union[str, int], extra: Optional[dict] = None) -> str:
    expire = datetime.utcnow() + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {"sub": str(subject), "exp": expire, "type": "access", "jti": uuid.uuid4().hex, **(extra or {})}
    if "session_exp" in payload:
        payload["exp"] = min(int(expire.replace(tzinfo=timezone.utc).timestamp()), payload["session_exp"])
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(subject: Union[str, int], extra: Optional[dict] = None) -> str:
    expire = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {"sub": str(subject), "exp": expire, "type": "refresh", "jti": uuid.uuid4().hex, **(extra or {})}
    if "session_exp" in payload:
        payload["exp"] = min(int(expire.replace(tzinfo=timezone.utc).timestamp()), payload["session_exp"])
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM],
            options={"require": ["exp", "sub", "type"]},
        )
    except InvalidTokenError:
        return None