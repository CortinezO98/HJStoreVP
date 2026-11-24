"""Registro público y evidencia de consentimiento."""
from datetime import datetime, timezone
import hashlib
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel, EmailStr, Field, StrictBool, field_validator
from app.db.session import get_db
from app.core.security import hash_password, create_access_token, create_refresh_token, credential_version, new_session_claims
from app.models.models import User, UserRole, DataConsent, StorefrontSettings
from app.services.auth_protection import hit_rate_limit, consent_ip_hash

router = APIRouter(prefix="/auth", tags=["Auth"])
MESSAGE = "Si el registro se completó, puedes continuar. Si ya tienes una cuenta, inicia sesión."


def policy_snapshot(db, lock=False):
    query = db.query(StorefrontSettings).filter(StorefrontSettings.id == 1)
    row = (query.with_for_update() if lock else query).populate_existing().first()
    value = (row.settings_data or {}).get("privacy_policy") if row else None
    text = value.strip() if isinstance(value, str) else ""
    return text, hashlib.sha256(text.encode("utf-8")).hexdigest() if text else None


@router.get("/registration-policy")
def registration_policy(response: Response, db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    text, version = policy_snapshot(db)
    return {"available": bool(version), "version": version, "text": text}


class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=200)
    email: EmailStr = Field(max_length=254)
    password: str = Field(min_length=12, max_length=72)
    phone: str | None = Field(default=None, max_length=20, pattern=r"^\+?[0-9][0-9 ()-]{5,19}$")
    accepts_data_policy: StrictBool
    data_policy_version: str = Field(pattern=r"^[a-f0-9]{64}$")

    @field_validator("full_name", mode="before")
    @classmethod
    def trim_name(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("password")
    @classmethod
    def password_bytes(cls, value):
        if len(value.encode("utf-8")) > 72:
            raise ValueError("La contraseña no puede superar 72 bytes")
        return value

    @field_validator("accepts_data_policy")
    @classmethod
    def consent_required(cls, value):
        if not value:
            raise ValueError("Debes aceptar el tratamiento de datos")
        return value


def limit_registration(request: Request):
    hit_rate_limit(request, "register", 5, 3600)


@router.post("/register", status_code=201, dependencies=[Depends(limit_registration)])
def register(data: RegisterRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    text, version = policy_snapshot(db, lock=True)
    if not version or version != data.data_policy_version:
        raise HTTPException(status_code=409, detail="La política de privacidad no está disponible o cambió. Vuelve a consultarla.")
    email = str(data.email).strip().lower()
    # Hash también para duplicados: reducir diferencias de tiempo observables.
    hashed = hash_password(data.password)
    if db.query(User.id).filter(User.email == email).first():
        db.rollback()
        return {"message": MESSAGE}
    user = User(email=email, full_name=data.full_name, hashed_password=hashed,
                role=UserRole.CUSTOMER, phone=data.phone, active=True)
    try:
        db.add(user)
        db.flush()
        db.add(DataConsent(user_id=user.id, policy_version=version, policy_text=text,
                           accepted_at=datetime.now(timezone.utc).replace(tzinfo=None),
                           ip_hash=consent_ip_hash(request)))
        db.commit()
    except IntegrityError:
        db.rollback()
        if db.query(User.id).filter(User.email == email).first():
            return {"message": MESSAGE}
        raise
    db.refresh(user)
    extra = {**new_session_claims(), "role": user.role.value, "ver": credential_version(user.hashed_password)}
    return {"message": MESSAGE, "access_token": create_access_token(user.id, extra=extra),
            "refresh_token": create_refresh_token(user.id, extra=extra), "token_type": "bearer",
            "user_role": user.role, "user_id": user.id, "full_name": user.full_name}
