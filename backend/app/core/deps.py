from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.core.security import decode_token, credential_version_matches
from app.models.models import User, UserRole, UserMFASettings

bearer_scheme = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    token = credentials.credentials
    payload = decode_token(token)

    if not payload or payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user_id = int(payload.get("sub", ""))
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = db.query(User).filter(User.id == user_id, User.active == True).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario no encontrado o inactivo",
        )
    if not credential_version_matches(payload, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesión revocada; inicia sesión nuevamente",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if user.role in (UserRole.SUPER_ADMIN, UserRole.ADMIN):
        mfa = db.query(UserMFASettings).filter_by(user_id=user.id, enabled=True).first()
        if mfa and payload.get("mfa_v") != mfa.version:
            raise HTTPException(status_code=401, detail="Se requiere una nueva sesión con segundo factor")
    return user


def require_roles(*roles: UserRole):
    """Factory que retorna un dependency que verifica el rol."""
    def dependency(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"No tienes permisos para esta acción. Roles requeridos: {[r.value for r in roles]}",
            )
        return current_user
    return dependency


# Shortcuts
require_admin = require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
require_super_admin = require_roles(UserRole.SUPER_ADMIN)
require_seller = require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SELLER)


optional_bearer_scheme = HTTPBearer(auto_error=False)


def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(optional_bearer_scheme),
    db: Session = Depends(get_db),
) -> User | None:
    """Public access remains available; invalid credentials gain no privileges."""
    if credentials is None:
        return None
    payload = decode_token(credentials.credentials)
    if not payload or payload.get("type") != "access":
        return None
    try:
        user_id = int(payload.get("sub", ""))
    except (TypeError, ValueError):
        return None
    user = db.query(User).filter(
        User.id == user_id, User.active.is_(True)
    ).first()
    if not user or not credential_version_matches(payload, user.hashed_password):
        return None
    if user.role in (UserRole.SUPER_ADMIN, UserRole.ADMIN):
        mfa = db.query(UserMFASettings).filter_by(user_id=user.id, enabled=True).first()
        if mfa and payload.get("mfa_v") != mfa.version:
            return None
    return user


def is_catalog_admin(user: User | None) -> bool:
    return user is not None and user.role in (UserRole.SUPER_ADMIN, UserRole.ADMIN)
