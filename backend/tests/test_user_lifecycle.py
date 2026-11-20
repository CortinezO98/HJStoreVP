"""Pruebas aisladas: ciclo de vida de usuarios sin alterar datos de producción."""
import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db.session import Base
from app.models.models import User, UserRole
from app.core.security import hash_password, credential_version, credential_version_matches
from app.api.v1.endpoints.users import (
    PasswordResetAdmin, UserStatusAdmin, UserCreateAdmin, UserUpdateAdmin,
    change_user_status, reset_user_password, delete_user, list_users,
    create_user, update_user,
)


@pytest.fixture
def lifecycle_db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        admin = User(
            email="root@example.org", full_name="Super Admin",
            role=UserRole.SUPER_ADMIN, active=True, hashed_password=hash_password("RootStrongPass123!"),
        )
        seller = User(
            email="seller@example.org", full_name="Vendedor",
            role=UserRole.SELLER, active=True, hashed_password=hash_password("SellerStrongPass123!"),
        )
        db.add_all([admin, seller])
        db.commit()
        db.refresh(admin)
        db.refresh(seller)
        yield db, admin, seller
    engine.dispose()


def test_suspend_and_reactivate_without_removing_user(lifecycle_db):
    db, admin, seller = lifecycle_db
    paused = change_user_status(seller.id, UserStatusAdmin(active=False), db, admin)
    assert paused.active is False
    assert db.get(User, seller.id) is not None
    resumed = change_user_status(seller.id, UserStatusAdmin(active=True), db, admin)
    assert resumed.active is True


def test_self_suspension_forbidden(lifecycle_db):
    db, admin, _ = lifecycle_db
    with pytest.raises(HTTPException) as exc:
        change_user_status(admin.id, UserStatusAdmin(active=False), db, admin)
    assert exc.value.status_code == 400


def test_password_reset_revokes_issued_credentials(lifecycle_db):
    db, admin, seller = lifecycle_db
    fingerprint = credential_version(seller.hashed_password)
    with pytest.raises(ValidationError):
        PasswordResetAdmin(password="short")
    reset_user_password(seller.id, PasswordResetAdmin(password="NewSellerPassword123!"), db, admin)
    db.refresh(seller)
    assert not credential_version_matches({"ver": fingerprint}, seller.hashed_password)


def test_logical_deletion_keeps_record_and_removes_login_email(lifecycle_db):
    db, admin, seller = lifecycle_db
    seller_id = seller.id
    delete_user(seller_id, db, admin)
    archived = db.get(User, seller_id)
    assert archived is not None and archived.deleted and not archived.active
    assert archived.email != "seller@example.org"
    assert seller_id not in [user.id for user in list_users(db=db, _=admin)]
    with pytest.raises(HTTPException) as exc:
        change_user_status(seller_id, UserStatusAdmin(active=True), db, admin)
    assert exc.value.status_code == 404


def test_last_superadmin_cannot_be_removed(lifecycle_db):
    db, admin, _ = lifecycle_db
    with pytest.raises(HTTPException) as exc:
        delete_user(admin.id, db, admin)
    assert exc.value.status_code == 400


def test_admin_cannot_escalate_seller_or_customer_roles(lifecycle_db):
    db, super_admin, seller = lifecycle_db
    admin = User(
        email="admin@example.org", full_name="Administrador",
        role=UserRole.ADMIN, active=True, hashed_password=hash_password("AdminStrongPass123!"),
    )
    customer = User(
        email="customer@example.org", full_name="Cliente",
        role=UserRole.CUSTOMER, active=True, hashed_password=hash_password("CustomerStrongPass123!"),
    )
    db.add_all([admin, customer])
    db.commit()
    for target in (seller, customer):
        for role in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
            with pytest.raises(HTTPException) as exc:
                update_user(target.id, UserUpdateAdmin(role=role), db, admin)
            assert exc.value.status_code == 403
            db.refresh(target)
            assert target.role not in (UserRole.ADMIN, UserRole.SUPER_ADMIN)


def test_superadmin_can_promote_other_user_but_not_demote_last_superadmin(lifecycle_db):
    db, super_admin, seller = lifecycle_db
    result = update_user(seller.id, UserUpdateAdmin(role=UserRole.ADMIN), db, super_admin)
    assert result.role == UserRole.ADMIN
    with pytest.raises(HTTPException) as exc:
        update_user(super_admin.id, UserUpdateAdmin(role=UserRole.SELLER), db, super_admin)
    assert exc.value.status_code in (400, 409)


def test_self_email_and_password_changes_require_profile_flow(lifecycle_db):
    db, super_admin, seller = lifecycle_db
    for changes in (
        {"email": "new-root@example.org"},
        {"password": "AnotherStrongPassword123!"},
    ):
        with pytest.raises(HTTPException) as exc:
            update_user(super_admin.id, UserUpdateAdmin(**changes), db, super_admin)
        assert exc.value.status_code == 403
    db.refresh(super_admin)
    assert super_admin.email == "root@example.org"


def test_admin_user_creation_requires_twelve_char_password(lifecycle_db):
    db, super_admin, seller = lifecycle_db
    data = UserCreateAdmin(
        email="newperson@example.org", full_name="Persona Nueva",
        role=UserRole.CUSTOMER, password="Short123!",
    )
    with pytest.raises(HTTPException) as exc:
        create_user(data, db, super_admin)
    assert exc.value.status_code == 400
    assert db.query(User).filter_by(email="newperson@example.org").first() is None
