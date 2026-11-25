"""M-07: Argon2id, compatibilidad bcrypt y actualización antes de emitir tokens."""
import bcrypt

from app.core.security import hash_password, verify_password, verify_and_update_password, decode_token, credential_version
from app.models.models import User, UserMFASettings
from tests.test_main import client, setup_db, TestingSession

PASSWORD = "Test1234!"


def legacy():
    return bcrypt.hashpw(PASSWORD.encode(), bcrypt.gensalt(rounds=4)).decode()


def install_legacy():
    with TestingSession() as db:
        user = db.query(User).filter_by(email="test@hjstorevp.com").one()
        user.hashed_password = legacy()
        db.commit()
        return user.id, user.hashed_password


def test_argon2_new_password():
    hashed = hash_password(PASSWORD)
    assert hashed.startswith("$argon2id$")
    assert verify_password(PASSWORD, hashed)
    assert not verify_password("wrong", hashed)
    assert verify_and_update_password(PASSWORD, hashed) == (True, None)


def test_bcrypt_upgrade_and_wrong_password():
    old = legacy()
    assert verify_and_update_password("wrong", old) == (False, None)
    valid, new = verify_and_update_password(PASSWORD, old)
    assert valid and new.startswith("$argon2id$")
    assert verify_password(PASSWORD, new)


def test_invalid_hash_fails_closed():
    for value in ("invalid", "$2b$12$invalid", "$argon2id$v=19$invalid"):
        assert not verify_password(PASSWORD, value)
        assert verify_and_update_password(PASSWORD, value) == (False, None)


def test_legacy_long_password_not_silently_rebound():
    password = "a" * 73
    old = bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=4)).decode()
    assert verify_and_update_password(password, old) == (True, None)


def test_login_migrates_and_issues_current_tokens(client):
    uid, old = install_legacy()
    failed = client.post("/api/v1/auth/login", json={"email":"test@hjstorevp.com","password":"wrong"})
    assert failed.status_code == 401
    with TestingSession() as db:
        assert db.get(User, uid).hashed_password == old
    result = client.post("/api/v1/auth/login", json={"email":"test@hjstorevp.com","password":PASSWORD})
    assert result.status_code == 200
    with TestingSession() as db:
        updated = db.get(User, uid).hashed_password
        assert updated.startswith("$argon2id$")
        assert decode_token(result.json()["access_token"])["ver"] == credential_version(updated)
    assert client.get("/api/v1/auth/me", headers={"Authorization":"Bearer "+result.json()["access_token"]}).status_code == 200


def test_mfa_challenge_uses_new_hash_without_access(client):
    uid, old = install_legacy()
    with TestingSession() as db:
        db.add(UserMFASettings(user_id=uid, enabled=True, version=1, recovery_hashes=[]))
        db.commit()
    result = client.post("/api/v1/auth/login", json={"email":"test@hjstorevp.com","password":PASSWORD})
    assert result.status_code == 200
    assert result.json()["mfa_required"] is True
    assert "access_token" not in result.json()
    with TestingSession() as db:
        updated = db.get(User, uid).hashed_password
        assert updated.startswith("$argon2id$")
        assert decode_token(result.json()["challenge_token"])["ver"] == credential_version(updated)
