"""
Endpoints de gestión de usuarios.
Solo accesible para admin y super_admin.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from app.db.session import get_db
from app.core.deps import require_admin, require_super_admin
from app.core.security import hash_password
from app.models.models import User, UserRole
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

    model_config = {"from_attributes": True}


@router.get("", response_model=List[UserAdminOut])
def list_users(
    role: Optional[str] = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    from app.models.models import Location
    q = db.query(User)
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

    # Verificar email único
    if db.query(User).filter(User.email == data.email).first():
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
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    # No puede editarse a sí mismo el role/active
    if user.id == current_user.id and (data.role is not None or data.active is not None):
        raise HTTPException(status_code=400, detail="No puedes cambiar tu propio rol o estado")

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


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="No puedes desactivar tu propia cuenta")

    user.active = False
    db.commit()
