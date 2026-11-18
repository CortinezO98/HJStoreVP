"""
Endpoints de gestión de usuarios.
Solo accesible para admin y super_admin.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from secrets import token_urlsafe
from sqlalchemy.orm import Session
from typing import List, Optional
from app.db.session import get_db
from app.core.deps import require_admin
from app.core.security import hash_password
from app.models.models import User, UserRole, Location, LocationType
from pydantic import BaseModel, EmailStr, Field

router = APIRouter(prefix="/users", tags=["Usuarios"])


class UserCreateAdmin(BaseModel):
    email: EmailStr
    full_name: str
    password: str
    role: UserRole = UserRole.SELLER
    phone: Optional[str] = None
    location_id: Optional[int] = None


class UserUpdateAdmin(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[UserRole] = None
    location_id: Optional[int] = None
    active: Optional[bool] = None
    password: Optional[str] = None


class UserAdminOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: UserRole
    phone: Optional[str]
    active: bool
    location_id: Optional[int]
    location_name: Optional[str] = None
    deleted: bool = False

    model_config = {"from_attributes": True}


class PasswordResetAdmin(BaseModel):
    password: str = Field(min_length=12, max_length=72)


class UserStatusAdmin(BaseModel):
    active: bool


def _allowed_target(current_user: User, user: User) -> None:
    if user.deleted:
        raise HTTPException(status_code=404, detail="Cuenta eliminada")
    if current_user.role != UserRole.SUPER_ADMIN and user.role in (
        UserRole.ADMIN, UserRole.SUPER_ADMIN
    ):
        raise HTTPException(status_code=403, detail="Solo Super Admin administra cuentas administrativas")


def _user_or_404(db: Session, user_id: int) -> User:
    user = db.query(User).filter(User.id == user_id, User.deleted.is_(False)).first()
    if user is None:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return user


def _out(user: User, db: Session) -> UserAdminOut:
    loc = db.query(Location).filter(Location.id == user.location_id).first() if user.location_id else None
    return UserAdminOut(
        id=user.id, email=user.email, full_name=user.full_name,
        role=user.role, phone=user.phone, active=user.active,
        deleted=user.deleted, location_id=user.location_id,
        location_name=loc.name if loc else None,
    )


def _ensure_seller_location(db: Session, role: UserRole, location_id: Optional[int]):
    if role != UserRole.SELLER:
        return
    if location_id is None:
        raise HTTPException(status_code=422, detail="Asigna un punto físico al vendedor")
    loc = db.query(Location).filter(
        Location.id == location_id,
        Location.active.is_(True),
        Location.type == LocationType.PHYSICAL,
    ).first()
    if not loc:
        raise HTTPException(status_code=422, detail="El punto físico no existe o está inactivo")


@router.get("", response_model=List[UserAdminOut])
def list_users(
    role: Optional[str] = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    from app.models.models import Location
    q = db.query(User).filter(User.deleted.is_(False))
    if role:
        try:
            q = q.filter(User.role == UserRole(role))
        except ValueError:
            pass

    users = q.order_by(User.role, User.full_name).all()

    # Agregar nombre de ubicación
    result = []
    for u in users:
        loc_name = None
        if u.location_id:
            loc = db.query(Location).filter(Location.id == u.location_id).first()
            loc_name = loc.name if loc else None
        result.append(UserAdminOut(
            id=u.id,
            email=u.email,
            full_name=u.full_name,
            role=u.role,
            phone=u.phone,
            active=u.active,
            location_id=u.location_id,
            location_name=loc_name,
            deleted=u.deleted,
        ))
    return result


@router.post("", response_model=UserAdminOut, status_code=status.HTTP_201_CREATED)
def create_user(
    data: UserCreateAdmin,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    # Solo super_admin puede crear otros admins
    if data.role in [UserRole.SUPER_ADMIN, UserRole.ADMIN]:
        if current_user.role != UserRole.SUPER_ADMIN:
            raise HTTPException(
                status_code=403,
                detail="Solo el super administrador puede crear usuarios administradores"
            )

    _ensure_seller_location(db, data.role, data.location_id)

    # Verificar email único
    if db.query(User).filter(User.email == data.email, User.deleted.is_(False)).first():
        raise HTTPException(status_code=400, detail=f"El correo '{data.email}' ya está registrado")

    if len(data.password) < 8:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 8 caracteres")

    user = User(
        email=data.email,
        full_name=data.full_name,
        hashed_password=hash_password(data.password),
        role=data.role,
        phone=data.phone,
        location_id=data.location_id,
        active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    from app.models.models import Location
    loc_name = None
    if user.location_id:
        loc = db.query(Location).filter(Location.id == user.location_id).first()
        loc_name = loc.name if loc else None

    return UserAdminOut(
        id=user.id, email=user.email, full_name=user.full_name,
        role=user.role, phone=user.phone, active=user.active,
        location_id=user.location_id, location_name=loc_name,
    )


@router.put("/{user_id}", response_model=UserAdminOut)
def update_user(
    user_id: int,
    data: UserUpdateAdmin,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    user = _user_or_404(db, user_id)
    _allowed_target(current_user, user)

    target_role = data.role if data.role is not None else user.role
    target_location = data.location_id if data.location_id is not None else user.location_id
    if target_role != UserRole.SELLER:
        target_location = None
    _ensure_seller_location(db, target_role, target_location)

    # No puede editarse a sí mismo el role/active
    if user.id == current_user.id and (
        (data.role is not None and data.role != user.role)
        or (data.active is not None and data.active != user.active)
    ):
        raise HTTPException(status_code=400, detail="No puedes cambiar tu propio rol o estado")

    if data.full_name is not None:
        user.full_name = data.full_name
    if data.phone is not None:
        user.phone = data.phone
    if data.role is not None:
        user.role = data.role
    user.location_id = target_location
    if data.active is not None:
        user.active = data.active
    if data.password:
        if len(data.password) < 12:
            raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 12 caracteres")
        user.hashed_password = hash_password(data.password)

    db.commit()
    db.refresh(user)

    from app.models.models import Location
    loc_name = None
    if user.location_id:
        loc = db.query(Location).filter(Location.id == user.location_id).first()
        loc_name = loc.name if loc else None

    return UserAdminOut(
        id=user.id, email=user.email, full_name=user.full_name,
        role=user.role, phone=user.phone, active=user.active,
        location_id=user.location_id, location_name=loc_name,
    )


@router.patch("/{user_id}/status", response_model=UserAdminOut)
def change_user_status(
    user_id: int,
    data: UserStatusAdmin,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Suspender o reactivar: la cuenta y el historial permanecen."""
    user = _user_or_404(db, user_id)
    _allowed_target(current_user, user)
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="No puedes suspender o reactivar tu propia cuenta")
    user.active = data.active
    db.commit()
    db.refresh(user)
    return _out(user, db)


@router.post("/{user_id}/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def reset_user_password(
    user_id: int,
    data: PasswordResetAdmin,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Cambia el hash: invalida tokens de acceso y refresh ya emitidos."""
    user = _user_or_404(db, user_id)
    _allowed_target(current_user, user)
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Para tu propia contraseña utiliza el flujo de perfil")
    user.hashed_password = hash_password(data.password)
    db.commit()


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Baja lógica irreversible desde el panel; mantiene referencias contables."""
    user = _user_or_404(db, user_id)
    _allowed_target(current_user, user)
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="No puedes eliminar tu propia cuenta")
    user.active = False
    user.deleted = True
    # Se libera el correo para reutilización, y se revocan todos los tokens.
    # No se borran órdenes ni cajas ligadas por claves externas.
    user.email = f"deleted-user-{user.id}@invalid.local"
    user.full_name = f"Usuario eliminado #{user.id}"
    user.phone = None
    user.location_id = None
    user.hashed_password = hash_password(token_urlsafe(48))
    db.commit()
