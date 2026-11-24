"""Política ficticia exclusiva de la SQLite aislada de pruebas."""
from app.models.models import StorefrontSettings, User
from tests.test_main import TestingSession


def registration_consent(client):
    with TestingSession() as db:
        assert db.bind.dialect.name == "sqlite"
        row = db.get(StorefrontSettings, 1)
        if row is None:
            admin = db.query(User).filter_by(email="test@hjstorevp.com").one()
            db.add(StorefrontSettings(id=1, settings_data={"privacy_policy": "Política ficticia exclusiva de pruebas"}, updated_by=admin.id))
            db.commit()
    response = client.get("/api/v1/auth/registration-policy")
    assert response.status_code == 200
    assert response.json()["available"]
    return {"accepts_data_policy": True, "data_policy_version": response.json()["version"]}
