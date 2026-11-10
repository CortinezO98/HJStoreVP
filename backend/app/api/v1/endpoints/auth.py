from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.services.auth_protection import (check_login_limit, note_login_failure, clear_login_failures, consume_refresh_token)
from app.core.security import verify_password, create_access_token, create_refresh_token, decode_token, credential_version, credential_version_matches
from app.core.deps import get_current_user
from app.models.models import User
from app.schemas.schemas import LoginRequest, TokenResponse, RefreshRequest, UserOut

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, request: Request, db: Session = Depends(get_db)):
    check_login_limit(request, data.email)
    user = db.query(User).filter(User.email == data.email, User.active == True).first()

    if not user or not verify_password(data.password, user.hashed_password):
        note_login_failure(request, data.email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Correo o contraseña incorrectos",
        )

    clear_login_failures(data.email)
    return TokenResponse(
        access_token=create_access_token(user.id, extra={"role": user.role, "ver": credential_version(user.hashed_password)}),
        refresh_token=create_refresh_token(user.id, extra={"ver": credential_version(user.hashed_password)}),
        user_role=user.role,
        user_id=user.id,
        full_name=user.full_name,
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh_token(data: RefreshRequest, db: Session = Depends(get_db)):
    payload = decode_token(data.refresh_token)

    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token inválido")

    try:
        user_id = int(payload.get("sub", ""))
    except (TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token inválido")
    user = db.query(User).filter(User.id == user_id, User.active == True).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no encontrado")

    if not credential_version_matches(payload, user.hashed_password):
        raise HTTPException(status_code=401, detail="La sesión fue revocada; inicia sesión nuevamente")

    try:
        expires_at = int(payload.get("exp", ""))
    except (TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token inválido")
    consume_refresh_token(data.refresh_token, expires_at)
    return TokenResponse(
        access_token=create_access_token(user.id, extra={"role": user.role, "ver": credential_version(user.hashed_password)}),
        refresh_token=create_refresh_token(user.id, extra={"ver": credential_version(user.hashed_password)}),
        user_role=user.role,
        user_id=user.id,
        full_name=user.full_name,
    )


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user
