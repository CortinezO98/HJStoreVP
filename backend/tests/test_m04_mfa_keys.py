"""M-04: secretos sintéticos; no usa MariaDB ni modifica el MFA real."""
import pytest
from cryptography.fernet import Fernet, InvalidToken
from pydantic import ValidationError
from app.core.config import settings, Settings
from app.services import mfa
from app.api.v1.endpoints.auth import _verify_mfa_code
from app.models.models import UserMFASettings
from scripts.rotate_mfa_keys import rotate_records
from tests.test_profile_mfa import mfa_db


@pytest.fixture
def independent(monkeypatch):
    monkeypatch.setattr(settings, "MFA_ENCRYPTION_KEYS", "")
    monkeypatch.setattr(settings, "MFA_RECOVERY_PEPPER", "")
    primary = Fernet.generate_key().decode()
    secondary = Fernet.generate_key().decode()
    return primary, secondary


def test_legacy_and_new_cipher(independent, monkeypatch):
    secret = mfa.new_secret()
    old = mfa.encrypt_secret(secret)
    primary, secondary = independent
    monkeypatch.setattr(settings, "MFA_ENCRYPTION_KEYS", primary + "," + secondary)
    assert mfa.decrypt_secret(old) == secret
    new = mfa.encrypt_secret(secret)
    assert Fernet(primary.encode()).decrypt(new.encode()).decode() == secret
    with pytest.raises(InvalidToken):
        mfa._legacy_cipher().decrypt(new.encode())
    assert mfa.decrypt_secret(Fernet(secondary.encode()).encrypt(secret.encode()).decode()) == secret


def test_rotate_both_fields_and_preserve_state(mfa_db, independent, monkeypatch):
    db, user = mfa_db
    secret = mfa.new_secret()
    old = mfa.encrypt_secret(secret)
    row = UserMFASettings(user_id=user.id, enabled=True, secret_ciphertext=old,
                          pending_secret_ciphertext=old, recovery_hashes=[], version=3, last_totp_step=123)
    db.add(row)
    db.commit()
    monkeypatch.setattr(settings, "MFA_ENCRYPTION_KEYS", independent[0])
    assert rotate_records(db)["rotations"] == 2
    assert row.secret_ciphertext == old
    assert rotate_records(db, True)["rotations"] == 2
    assert row.secret_ciphertext != old and row.pending_secret_ciphertext != old
    assert mfa.decrypt_secret(row.secret_ciphertext) == secret
    assert mfa.decrypt_secret(row.pending_secret_ciphertext) == secret
    assert row.enabled and row.version == 3 and row.last_totp_step == 123
    assert rotate_records(db, True)["rotations"] == 0


def test_atomic_abort(mfa_db, independent, monkeypatch):
    db, user = mfa_db
    old = mfa.encrypt_secret(mfa.new_secret())
    row = UserMFASettings(user_id=user.id, enabled=True, secret_ciphertext=old,
                          pending_secret_ciphertext="invalid", recovery_hashes=[])
    db.add(row)
    db.commit()
    monkeypatch.setattr(settings, "MFA_ENCRYPTION_KEYS", independent[0])
    with pytest.raises(InvalidToken):
        rotate_records(db, True)
    assert row.secret_ciphertext == old


def test_legacy_recovery_and_new_one_time(independent, monkeypatch):
    code = "ABCDEF1234"
    legacy = mfa.recovery_hash(code)
    monkeypatch.setattr(settings, "MFA_RECOVERY_PEPPER", "P" * 40)
    new = mfa.recovery_hash("987654ABCD")
    assert new.startswith("v2:")
    row = UserMFASettings(enabled=True, recovery_hashes=[legacy, new])
    assert _verify_mfa_code(row, code)
    assert not _verify_mfa_code(row, code)
    assert _verify_mfa_code(row, "987654ABCD")
    assert not _verify_mfa_code(row, "987654ABCD")


@pytest.mark.parametrize("environment", ["production", "staging"])
def test_required_configuration(environment):
    values = dict(ENVIRONMENT=environment, DEBUG=False, ALLOW_DEMO_PAYMENTS=False,
                  ADMIN_MFA_REQUIRED=True, AUTH_RATE_LIMIT_ENABLED=True,
                  AUTH_REFRESH_REPLAY_PROTECTION_ENABLED=True, SECRET_KEY="S"*48,
                  FIRST_ADMIN_PASSWORD="Fixture-not-default-123!", DATABASE_URL="sqlite://",
                  ALLOWED_ORIGINS=["https://example.org"], API_BASE_URL="https://api.example.org",
                  STORE_PUBLIC_URL="https://example.org", WOMPI_ENV="sandbox",
                  MFA_ENCRYPTION_KEYS="", MFA_RECOVERY_PEPPER="")
    with pytest.raises(ValidationError, match="MFA_ENCRYPTION_KEYS"):
        Settings(**values)
    values.update(MFA_ENCRYPTION_KEYS=Fernet.generate_key().decode(), MFA_RECOVERY_PEPPER="P"*40)
    assert Settings(**values).ENVIRONMENT == environment


@pytest.mark.parametrize("changes", [{"MFA_ENCRYPTION_KEYS":"bad"}, {"MFA_RECOVERY_PEPPER":"short"},
                                      {"MFA_RECOVERY_PEPPER":"S"*48}])
def test_invalid_configuration(changes):
    with pytest.raises(ValidationError):
        Settings(ENVIRONMENT="test", SECRET_KEY="S"*48, **changes)
