from fastapi import APIRouter, Depends, HTTPException, Request, status
from datetime import datetime, timedelta, timezone
import hmac
from jose import jwt
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.services.auth_protection import (check_login_limit, note_login_failure, clear_login_failures, consume_refresh_token, consume_mfa_challenge)
from app.core.security import verify_password, create_access_token, create_refresh_token, decode_token, credential_version, credential_version_matches
from app.core.deps import get_current_user
from app.models.models import User, UserRole, UserMFASettings
from app.core.config import settings
from app.core.security import hash_password
from app.services.mfa import (new_secret, encrypt_secret, decrypt_secret,
    match_totp_step, provisioning_uri, generate_recovery_codes, recovery_hash)
from app.schemas.schemas import LoginRequest, TokenResponse, RefreshRequest, UserOut

router = APIRouter(prefix="/auth", tags=["Auth"])


class ProfileUpdate(BaseModel):
    full_name: str = Field(min_length=2, max_length=200)
    phone: str | None = Field(default=None, max_length=50)


class ProfileEmailChange(BaseModel):
    email: EmailStr
    current_password: str
    mfa_code: str | None = Field(default=None, max_length=20)


class ProfilePasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=12, max_length=72)
    mfa_code: str | None = Field(default=None, max_length=20)


class MFAStart(BaseModel):
    current_password: str


class MFACode(BaseModel):
    code: str = Field(min_length=6, max_length=20)


class MFASensitiveAction(BaseModel):
    current_password: str
    code: str = Field(min_length=6, max_length=20)


class MFARotateCodes(MFASensitiveAction):
    pass


class MFAChallenge(BaseModel):
    challenge_token: str
    code: str = Field(min_length=6, max_length=20)


def _mfa_record(db: Session, user_id: int, lock: bool = False):
    q = db.query(UserMFASettings).filter_by(user_id=user_id)
    return (q.with_for_update() if lock else q).first()


def _token_bundle(user: User, mfa: UserMFASettings | None = None):
    extra = {"ver": credential_version(user.hashed_password)}
    if mfa and mfa.version:
        extra["sec_v"] = mfa.version
    if mfa and mfa.enabled:
        extra["mfa_v"] = mfa.version
    return TokenResponse(
        access_token=create_access_token(user.id, extra={**extra, "role": user.role.value}),
        refresh_token=create_refresh_token(user.id, extra=extra),
        user_role=user.role, user_id=user.id, full_name=user.full_name,
    )


def _mfa_challenge(user: User):
    token = jwt.encode({
        "sub": str(user.id), "type": "mfa_pending",
        "ver": credential_version(user.hashed_password),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
    }, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return {"mfa_required": True, "challenge_token": token}


def _require_mfa_admin(user: User):
    if user.role not in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
        raise HTTPException(status_code=403, detail="2FA disponible para personal administrativo")


def _require_recent_factor(db: Session, user: User, request: Request, password: str,
                           code: str | None = None, *, mfa_required: bool = False):
    check_login_limit(request, user.email)
    if not verify_password(password, user.hashed_password):
        note_login_failure(request, user.email)
        raise HTTPException(status_code=403, detail="Credenciales de confirmación incorrectas")
    record = _mfa_record(db, user.id, lock=True) if user.role in (UserRole.ADMIN, UserRole.SUPER_ADMIN) else None
    if record and record.enabled and (mfa_required or code is not None):
        if not code or not _verify_mfa_code(record, code):
            note_login_failure(request, user.email)
            raise HTTPException(status_code=403, detail="Código de segundo factor incorrecto")
    elif record and record.enabled and mfa_required:
        note_login_failure(request, user.email)
        raise HTTPException(status_code=403, detail="Se requiere un código 2FA")
    # Las acciones sensibles de usuarios con 2FA siempre lo requieren.
    if record and record.enabled and not code:
        raise HTTPException(status_code=403, detail="Se requiere un código 2FA")
    return record


def _verify_mfa_code(record: UserMFASettings, code: str):
    if record.secret_ciphertext:
        step = match_totp_step(decrypt_secret(record.secret_ciphertext), code)
        if step is not None:
            if record.last_totp_step is not None and step <= record.last_totp_step:
                return False
            record.last_totp_step = step
            return True
    hashed = recovery_hash(code)
    for index, known in enumerate(record.recovery_hashes or []):
        if hmac.compare_digest(known, hashed):
            remaining = list(record.recovery_hashes)
            remaining.pop(index)
            record.recovery_hashes = remaining
            return True
    return False


@router.post("/login")
def login(data: LoginRequest, request: Request, db: Session = Depends(get_db)):
    check_login_limit(request, data.email)
    user = db.query(User).filter(User.email == data.email, User.active == True).first()

    if not user or not verify_password(data.password, user.hashed_password):
        note_login_failure(request, data.email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Correo o contraseña incorrectos",
        )

    mfa = _mfa_record(db, user.id)
    if mfa and mfa.enabled:
        return _mfa_challenge(user)
    clear_login_failures(data.email)
    return _token_bundle(user)


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
    mfa = _mfa_record(db, user.id)
    if mfa and mfa.version and payload.get("sec_v") != mfa.version:
        raise HTTPException(status_code=401, detail="Sesión revocada; inicia sesión nuevamente")
    if mfa and mfa.enabled and payload.get("mfa_v") != mfa.version:
        raise HTTPException(status_code=401, detail="Segundo factor obligatorio; inicia sesión nuevamente")
    consume_refresh_token(data.refresh_token, expires_at)
    return _token_bundle(user, mfa)


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=UserOut)
def update_my_profile(data: ProfileUpdate, db: Session = Depends(get_db),
                      current_user: User = Depends(get_current_user)):
    cleaned_name = data.full_name.strip()
    if len(cleaned_name) < 2:
        raise HTTPException(status_code=422, detail="El nombre debe tener al menos dos caracteres")
    current_user.full_name = cleaned_name
    current_user.phone = (data.phone.strip() or None) if data.phone is not None else None
    db.commit()
    db.refresh(current_user)
    return current_user


@router.put("/me/email", response_model=UserOut)
def change_my_email(data: ProfileEmailChange, request: Request,
                    db: Session = Depends(get_db),
                    current_user: User = Depends(get_current_user)):
    _require_recent_factor(db, current_user, request, data.current_password, data.mfa_code)
    if db.query(User).filter(User.email == data.email, User.id != current_user.id).first():
        raise HTTPException(status_code=409, detail="Correo no disponible")
    previous_email = current_user.email
    current_user.email = data.email
    db.commit()
    clear_login_failures(previous_email)
    return current_user


@router.put("/me/password", status_code=204)
def change_my_password(data: ProfilePasswordChange, request: Request,
                       db: Session = Depends(get_db),
                       current_user: User = Depends(get_current_user)):
    _require_recent_factor(db, current_user, request, data.current_password, data.mfa_code)
    if verify_password(data.new_password, current_user.hashed_password):
        raise HTTPException(status_code=422, detail="La nueva contraseña debe ser diferente")
    current_user.hashed_password = hash_password(data.new_password)
    db.commit()
    clear_login_failures(current_user.email)


@router.get("/me/mfa")
def my_mfa_status(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _require_mfa_admin(current_user)
    record = _mfa_record(db, current_user.id)
    return {"enabled": bool(record and record.enabled),
            "recovery_codes_remaining": len(record.recovery_hashes or []) if record and record.enabled else 0}


@router.post("/me/mfa/setup")
def setup_mfa(data: MFAStart, request: Request, db: Session = Depends(get_db),
              current_user: User = Depends(get_current_user)):
    _require_mfa_admin(current_user)
    check_login_limit(request, current_user.email)
    if not verify_password(data.current_password, current_user.hashed_password):
        note_login_failure(request, current_user.email)
        raise HTTPException(status_code=403, detail="Contraseña actual incorrecta")
    record = _mfa_record(db, current_user.id, lock=True)
    if record and record.enabled:
        raise HTTPException(status_code=409, detail="2FA ya está activo")
    if record is None:
        record = UserMFASettings(user_id=current_user.id, enabled=False, recovery_hashes=[],
                                 version=0, updated_at=datetime.utcnow())
        db.add(record)
    secret = new_secret()
    record.pending_secret_ciphertext = encrypt_secret(secret)
    record.updated_at = datetime.utcnow()
    db.commit()
    clear_login_failures(current_user.email)
    return {"secret": secret, "provisioning_uri": provisioning_uri(secret, current_user.email)}


@router.post("/me/mfa/confirm")
def confirm_mfa(data: MFACode, request: Request, db: Session = Depends(get_db),
                current_user: User = Depends(get_current_user)):
    _require_mfa_admin(current_user)
    check_login_limit(request, current_user.email)
    record = _mfa_record(db, current_user.id, lock=True)
    if not record or not record.pending_secret_ciphertext or record.enabled:
        raise HTTPException(status_code=409, detail="No hay enrolamiento pendiente")
    secret = decrypt_secret(record.pending_secret_ciphertext)
    step = match_totp_step(secret, data.code)
    if step is None:
        note_login_failure(request, current_user.email)
        raise HTTPException(status_code=400, detail="Código incorrecto")
    plain, hashed = generate_recovery_codes()
    record.secret_ciphertext = record.pending_secret_ciphertext
    record.pending_secret_ciphertext = None
    record.enabled = True
    record.version += 1
    record.last_totp_step = step
    record.recovery_hashes = hashed
    record.updated_at = datetime.utcnow()
    db.commit()
    clear_login_failures(current_user.email)
    return {"enabled": True, "recovery_codes": plain,
            "message": "Guarda estos códigos ahora. No volverán a mostrarse."}


@router.post("/mfa/verify", response_model=TokenResponse)
def verify_mfa_challenge(data: MFAChallenge, request: Request, db: Session = Depends(get_db)):
    payload = decode_token(data.challenge_token)
    if not payload or payload.get("type") != "mfa_pending":
        raise HTTPException(status_code=401, detail="Desafío 2FA inválido o vencido")
    try:
        user_id = int(payload["sub"])
    except (ValueError, KeyError, TypeError):
        raise HTTPException(status_code=401, detail="Desafío inválido")
    user = db.query(User).filter(User.id == user_id, User.active.is_(True),
                                 User.deleted.is_(False)).first()
    if not user or not credential_version_matches(payload, user.hashed_password):
        raise HTTPException(status_code=401, detail="Desafío inválido o revocado")
    record = _mfa_record(db, user.id, lock=True)
    if not record or not record.enabled:
        raise HTTPException(status_code=401, detail="Segundo factor no disponible")
    check_login_limit(request, user.email)
    if not _verify_mfa_code(record, data.code):
        note_login_failure(request, user.email)
        raise HTTPException(status_code=401, detail="Código de seguridad incorrecto")
    record.updated_at = datetime.utcnow()
    consume_mfa_challenge(data.challenge_token, int(payload["exp"]))
    db.commit()
    clear_login_failures(user.email)
    return _token_bundle(user, record)


@router.post("/me/sessions/revoke", status_code=204)
def revoke_my_sessions(data: MFASensitiveAction, request: Request,
                       db: Session = Depends(get_db),
                       current_user: User = Depends(get_current_user)):
    """Invalidar todos los access/refresh tokens anteriores, incluido el actual."""
    record = _require_recent_factor(db, current_user, request, data.current_password, data.code)
    if record is None:
        record = UserMFASettings(user_id=current_user.id, enabled=False,
                                 recovery_hashes=[], version=0, updated_at=datetime.utcnow())
        db.add(record)
    record.version += 1
    record.updated_at = datetime.utcnow()
    db.commit()
    clear_login_failures(current_user.email)


@router.post("/me/mfa/recovery/rotate")
def rotate_mfa_recovery_codes(data: MFARotateCodes, request: Request,
                              db: Session = Depends(get_db),
                              current_user: User = Depends(get_current_user)):
    _require_mfa_admin(current_user)
    record = _require_recent_factor(db, current_user, request, data.current_password,
                                    data.code, mfa_required=True)
    if not record or not record.enabled:
        raise HTTPException(status_code=409, detail="El segundo factor no está activo")
    plain, hashed = generate_recovery_codes()
    record.recovery_hashes = hashed
    record.updated_at = datetime.utcnow()
    db.commit()
    clear_login_failures(current_user.email)
    return {"recovery_codes": plain, "message": "Sustituye los códigos anteriores; no se mostrarán de nuevo"}


@router.post("/me/mfa/disable", status_code=204)
def disable_mfa(data: MFASensitiveAction, request: Request,
                db: Session = Depends(get_db),
                current_user: User = Depends(get_current_user)):
    _require_mfa_admin(current_user)
    record = _require_recent_factor(db, current_user, request, data.current_password,
                                    data.code, mfa_required=True)
    if not record or not record.enabled:
        raise HTTPException(status_code=409, detail="El segundo factor no está activo")
    record.enabled = False
    record.secret_ciphertext = None
    record.pending_secret_ciphertext = None
    record.recovery_hashes = []
    record.last_totp_step = None
    record.version += 1
    record.updated_at = datetime.utcnow()
    db.commit()
    clear_login_failures(current_user.email)
