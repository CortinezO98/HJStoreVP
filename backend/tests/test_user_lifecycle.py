"""Contratos unitarios del ciclo de vida de cuentas administrativas.
No altera base productiva: utiliza SQLite temporal en memoria.
"""
import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.db.session import Base
from app.core.security import hash_password, verify_password, credential_version
from app.models.models import User, UserRole, Location, LocationType
from app.api.v1.endpoints.users import (
    UserUpdateAdmin, UserPasswordAdmin, UserStatusAdmin, delete_user,
    change_user_status, reset_user_password, update_user, list_users,
)


@pytest.fixture
def accounts():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine, tables=[Location.__table__, User.__table__])
    with Session(engine) as db:
        location = Location(name="Sede de prueba", type=LocationType.PHYSICAL, active=True)
        db.add(location)
        db.flush()
        admin = User(email="admin@example.com", full_name="Administrador", role=UserRole.SUPER_ADMIN,
                     active=True, hashed_password=hash_password("AdministradorClaveSegura2026"))
        seller = User(email="seller@example.com", full_name="Vendedor", role=UserRole.SELLER,
                      location_id=location.id, active=True,
                      hashed_password=hash_password("VendedorClaveSegura2026"))
        db.add_all([admin, seller])
        db.commit()
        yield db, admin, seller
    engine.dispose()


def test_pause_reactivate_and_protect_self(accounts):
    db, admin, seller = accounts
    change_user_status(seller.id, UserStatusAdmin(active=False), db, admin)
    assert not seller.active
    change_user_status(seller.id, UserStatusAdmin(active=True), db, admin)
    assert seller.active
    with pytest.raises(HTTPException) as error:
        change_user_status(admin.id, UserStatusAdmin(active=False), db, admin)
    assert error.value.status_code == 400


def test_password_rotation_revokes_old_credential_version(accounts):
    db, admin, seller = accounts
    before = credential_version(seller.hashed_password)
    reset_user_password(seller.id, UserPasswordAdmin(password="NuevaClaveFuerte2026!"), db, admin)
    assert credential_version(seller.hashed_password) != before
    assert verify_password("NuevaClaveFuerte2026!", seller.hashed_password)
    with pytest.raises(HTTPException) as error:
        reset_user_password(seller.id, UserPasswordAdmin(password="corta"), db, admin)
    assert error.value.status_code == 422


def test_change_email_rejects_duplicate(accounts):
    db, admin, seller = accounts
    update_user(seller.id, UserUpdateAdmin(email="nuevo@example.com"), db, admin)
    assert seller.email == "nuevo@example.com"
    with pytest.raises(HTTPException) as error:
        update_user(seller.id, UserUpdateAdmin(email=admin.email), db, admin)
    assert error.value.status_code == 409


def test_soft_delete_keeps_row_and_hides_account(accounts):
    db, admin, seller = accounts
    delete_user(seller.id, db, admin)
    assert not seller.active
    assert seller.deleted_at is not None
    assert db.get(User, seller.id) is seller
    ids = [user.id for user in list_users(db=db, _=admin)]
    assert seller.id not in ids
    with pytest.raises(HTTPException) as error:
        change_user_status(seller.id, UserStatusAdmin(active=True), db, admin)
    assert error.value.status_code == 404
    with pytest.raises(HTTPException) as error:
        delete_user(admin.id, db, admin)
    assert error.value.status_code == 400


def test_normal_admin_cannot_operate_administrative_accounts(accounts):
    db, superadmin, seller = accounts
    regular = User(email="regular@example.com", full_name="Admin", role=UserRole.ADMIN,
                   active=True, hashed_password=hash_password("ClaveAdminRegular2026"))
    db.add(regular)
    db.commit()
    for operation in (
        lambda: delete_user(superadmin.id, db, regular),
        lambda: change_user_status(superadmin.id, UserStatusAdmin(active=False), db, regular),
        lambda: reset_user_password(superadmin.id, UserPasswordAdmin(password="ClaveFuerteNueva2026"), db, regular),
    ):
        with pytest.raises(HTTPException) as error:
            operation()
        assert error.value.status_code == 403
