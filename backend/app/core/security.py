from datetime import datetime, timedelta
import hashlib
import hmac
from typing import Optional, Union
from jose import JWTError, jwt
from passlib.context import CryptContext
from app.core.config import settings

# Fix compatibilidad passlib 1.7.4 + bcrypt 4.x
import bcrypt as _bcrypt_module
if not hasattr(_bcrypt_module, '__about__'):
    class _FakeAbout:
        __version__ = '4.0.1'
    _bcrypt_module.__about__ = _FakeAbout()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


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


def create_access_token(subject: Union[str, int], extra: Optional[dict] = None) -> str:
    expire = datetime.utcnow() + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {"sub": str(subject), "exp": expire, "type": "access", **(extra or {})}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(subject: Union[str, int], extra: Optional[dict] = None) -> str:
    expire = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {"sub": str(subject), "exp": expire, "type": "refresh", **(extra or {})}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return None