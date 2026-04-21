"""
Endpoint de registro de clientes para la tienda pública.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.core.security import hash_password, create_access_token, create_refresh_token
from app.models.models import User, UserRole
from app.schemas.schemas import TokenResponse
from pydantic import BaseModel, EmailStr

router = APIRouter(prefix="/auth", tags=["Auth"])


class RegisterRequest(BaseModel):
    full_name: str
    email: EmailStr
    password: str
    phone: str | None = None


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(data: RegisterRequest, db: Session = Depends(get_db)):
    """Registro de nuevo cliente desde la tienda pública."""

    # Validar contraseña
    if len(data.password) < 8:
        raise HTTPException(
            status_code=400,
            detail="La contraseña debe tener al menos 8 caracteres"
        )

    # Verificar email único
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(
            status_code=400,
            detail="Este correo ya está registrado. ¿Quieres iniciar sesión?"
        )

    # Crear usuario cliente
    user = User(
        email=data.email,
        full_name=data.full_name,
        hashed_password=hash_password(data.password),
        role=UserRole.CUSTOMER,
        phone=data.phone,
        active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Retornar tokens directamente (login automático tras registro)
    return TokenResponse(
        access_token=create_access_token(user.id, extra={"role": user.role}),
        refresh_token=create_refresh_token(user.id),
        user_role=user.role,
        user_id=user.id,
        full_name=user.full_name,
    )
