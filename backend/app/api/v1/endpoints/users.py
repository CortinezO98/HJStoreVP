"""
Endpoints de gestión de usuarios.
Solo accesible para admin y super_admin.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from datetime import datetime
from sqlalchemy.orm import Session
from typing import List, Optional
from app.db.session import get_db
from app.core.deps import require_admin, require_super_admin
from app.core.security import hash_password
from app.models.models import User, UserRole, Location, LocationType
from app.schemas.schemas import UserCreate, UserUpdate, UserOut
from pydantic import BaseModel, EmailStr

router = APIRouter(prefix="/users", tags=["Usuarios"])


class UserCreateAdmin(BaseModel):
    email: EmailStr
    full_name: str
    password: str
    role: UserRole = UserRole.SELLER
    phone: Optional[str] = None
    location_id: Optional[int] = None


class UserUpdateAdmin(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[UserRole] = None
    location_id: Optional[int] = None
    active: Optional[bool] = None
    password: Optional[str] = None


class UserPasswordAdmin(BaseModel):
    password: str


class UserStatusAdmin(BaseModel):
    active: bool


class UserAdminOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: UserRole
    phone: Optional[str]
    active: bool
    location_id: Optional[int]
    location_name: Optional[str] = None

    model_config = {"from_attributes": True}


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
    q = db.query(User).filter(User.deleted_at.is_(None))
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
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail=f"El correo '{data.email}' ya está registrado")

    if len(data.password) < 12:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 12 caracteres")

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
    user = db.query(User).filter(User.id == user_id).first()
    if not user or user.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if current_user.role != UserRole.SUPER_ADMIN:
        if user.role in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
            raise HTTPException(status_code=403, detail="Solo Super Admin administra cuentas administrativas")
        if data.role in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
            raise HTTPException(status_code=403, detail="Solo Super Admin asigna roles administrativos")

    target_role = data.role if data.role is not None else user.role
    target_location = data.location_id if data.location_id is not None else user.location_id
    _ensure_seller_location(db, target_role, target_location)

    # No puede editarse a sí mismo el role/active
    if user.id == current_user.id and (data.role is not None or data.active is not None):
        raise HTTPException(status_code=400, detail="No puedes cambiar tu propio rol o estado")

    if data.email is not None and str(data.email).strip().lower() != user.email.lower():
        email = str(data.email).strip().lower()
        if db.query(User.id).filter(User.email == email, User.id != user.id).first():
            raise HTTPException(status_code=409, detail="El correo ya está registrado")
        user.email = email
    if data.full_name is not None:
        user.full_name = data.full_name
    if data.phone is not None:
        user.phone = data.phone
    if data.role is not None:
        user.role = data.role
    if data.location_id is not None:
        user.location_id = data.location_id
    if data.active is not None:
        user.active = data.active
    if data.password:
        if len(data.password) < 8:
            raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 8 caracteres")
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


def _can_manage_target(current_user: User, target: User):
    if current_user.role != UserRole.SUPER_ADMIN and target.role in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
        raise HTTPException(status_code=403, detail="Solo Super Admin administra cuentas administrativas")


@router.patch("/{user_id}/status", response_model=UserAdminOut)
def change_user_status(
    user_id: int,
    data: UserStatusAdmin,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    target = db.query(User).filter(User.id == user_id, User.deleted_at.is_(None)).first()
    if not target:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if target.id == current_user.id:
        raise HTTPException(status_code=400, detail="No puedes suspender tu propia cuenta")
    _can_manage_target(current_user, target)
    target.active = data.active
    db.commit()
    db.refresh(target)
    return UserAdminOut(
        id=target.id, email=target.email, full_name=target.full_name,
        role=target.role, phone=target.phone, active=target.active,
        location_id=target.location_id,
        location_name=target.location.name if target.location else None,
    )


@router.put("/{user_id}/password", status_code=status.HTTP_204_NO_CONTENT)
def reset_user_password(
    user_id: int,
    data: UserPasswordAdmin,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    target = db.query(User).filter(User.id == user_id, User.deleted_at.is_(None)).first()
    if not target:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    _can_manage_target(current_user, target)
    if len(data.password) < 12:
        raise HTTPException(status_code=422, detail="La contraseña debe tener al menos 12 caracteres")
    target.hashed_password = hash_password(data.password)
    db.commit()
    # Los tokens anteriores dejan de ser válidos por credential_version.


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Baja lógica irreversible desde el panel; conserva referencias y auditorías."""
    target = db.query(User).filter(User.id == user_id, User.deleted_at.is_(None)).first()
    if not target:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if target.id == current_user.id:
        raise HTTPException(status_code=400, detail="No puedes eliminar tu propia cuenta")
    _can_manage_target(current_user, target)
    target.active = False
    target.deleted_at = datetime.utcnow()
    db.commit()
