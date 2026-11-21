"""E.4 — permisos, diseñador de inicio e imágenes; SQLite efímera obligatoria.

Ningún caso publica la tienda real ni carga archivos en el almacenamiento comercial.
"""
from copy import deepcopy
from uuid import uuid4

import pytest

from app.core.security import hash_password
from app.models.models import StorefrontSettings, User, UserRole, ProductImage
from tests.test_main import (
    TestingSession, TestWebOrderStockReservations as StockFixture,
    setup_db, client, auth_headers,
)

PREFIX = "/api/v1/storefront-settings"


def _role_headers(client, role):
    db = TestingSession()
    email = f"e4-{role.value}-{uuid4().hex[:10]}@example.com"
    try:
        db.add(User(
            email=email, full_name="Auditoría E4",
            hashed_password=hash_password("E4-Password-123!"),
            role=role, active=True,
        ))
        db.commit()
    finally:
        db.close()
    logged = client.post("/api/v1/auth/login", json={
        "email": email, "password": "E4-Password-123!",
    })
    assert logged.status_code == 200, logged.text
    return {"Authorization": "Bearer " + logged.json()["access_token"]}


@pytest.mark.parametrize("role", [UserRole.ADMIN, UserRole.SELLER, UserRole.CUSTOMER])
def test_non_superadmin_cannot_access_home_designer_or_modify_draft(client, role):
    headers = _role_headers(client, role)
    public_before = client.get(PREFIX + "/public").json()
    for path in (
        "/admin", "/admin/homepage-draft", "/admin/homepage-versions",
    ):
        assert client.get(PREFIX + path, headers=headers).status_code == 403
    assert client.put(PREFIX + "/admin/homepage-draft", headers=headers,
                      json={"draft": {"hero_title": "CAMBIO ILEGAL"}}).status_code == 403
    assert client.post(PREFIX + "/admin/homepage-publish", headers=headers).status_code == 403
    assert client.delete(PREFIX + "/admin/homepage-draft", headers=headers).status_code == 403
    assert client.get(PREFIX + "/public").json() == public_before


def test_anonymous_cannot_operate_designer(client):
    assert client.get(PREFIX + "/public").status_code == 200
    assert client.get(PREFIX + "/admin/homepage-draft").status_code in (401, 403)
    assert client.post(PREFIX + "/admin/homepage-publish").status_code in (401, 403)


def test_custom_section_stays_private_until_explicit_publish(client, auth_headers):
    before = client.get(PREFIX + "/public")
    assert before.status_code == 200
    baseline = before.json()
    initial = client.get(PREFIX + "/admin/homepage-draft", headers=auth_headers)
    assert initial.status_code == 200, initial.text
    draft = deepcopy(initial.json()["draft"])
    section_id = "e4_" + uuid4().hex[:12]
    section = {
        "id": section_id, "type": "carousel",
        "title": "Sección E4 solo borrador",
        "active": False, "items": [],
    }
    draft["homepage_custom_sections"].append(section)
    draft["homepage_section_order"].append("custom:" + section_id)
    saved = client.put(PREFIX + "/admin/homepage-draft",
                       json={"draft": draft}, headers=auth_headers)
    assert saved.status_code == 200, saved.text
    assert saved.json()["saved"] is True
    stored = client.get(PREFIX + "/admin/homepage-draft", headers=auth_headers)
    assert stored.status_code == 200
    assert stored.json()["has_saved_draft"] is True
    assert any(s["id"] == section_id for s in stored.json()["draft"]["homepage_custom_sections"])
    assert client.get(PREFIX + "/public").json() == baseline

    published = client.post(PREFIX + "/admin/homepage-publish", headers=auth_headers)
    assert published.status_code == 200, published.text
    assert published.json()["published"] is True
    after = client.get(PREFIX + "/public")
    assert after.status_code == 200
    # Bloque inactivo no se muestra entre las campañas públicas,
    # pero su definición persiste y la ordenación sí se publica.
    assert "custom:" + section_id in after.json()["homepage_section_order"]
    assert client.get(PREFIX + "/admin/homepage-draft", headers=auth_headers).json()["has_saved_draft"] is False
    versions = client.get(PREFIX + "/admin/homepage-versions", headers=auth_headers)
    assert versions.status_code == 200
    assert len(versions.json()) == 1
    db = TestingSession()
    try:
        assert db.get(StorefrontSettings, 1).updated_by is not None
    finally:
        db.close()


def test_discard_draft_leaves_public_homepage_unmodified(client, auth_headers):
    baseline = client.get(PREFIX + "/public").json()
    state = client.get(PREFIX + "/admin/homepage-draft", headers=auth_headers).json()
    draft = state["draft"]
    draft["hero_title"] = "Texto privado sin publicar E4"
    assert client.put(PREFIX + "/admin/homepage-draft",
                      json={"draft": draft}, headers=auth_headers).status_code == 200
    assert client.get(PREFIX + "/public").json() == baseline
    discarded = client.delete(PREFIX + "/admin/homepage-draft", headers=auth_headers)
    assert discarded.status_code == 200, discarded.text
    assert discarded.json()["discarded"] is True
    assert client.get(PREFIX + "/public").json() == baseline


@pytest.mark.parametrize("mutation", ["missing_order", "duplicate_section", "unapproved_image"])
def test_invalid_homepage_draft_rejected_without_public_changes(
    client, auth_headers, mutation,
):
    baseline = client.get(PREFIX + "/public").json()
    draft = client.get(PREFIX + "/admin/homepage-draft", headers=auth_headers).json()["draft"]
    if mutation == "missing_order":
        draft["homepage_custom_sections"] = [{
            "id": "e4_invalid", "type": "carousel", "active": False, "items": [],
        }]
    elif mutation == "duplicate_section":
        block = {"id": "e4_repeated", "type": "banner", "active": False, "items": []}
        draft["homepage_custom_sections"] = [block, deepcopy(block)]
        draft["homepage_section_order"].append("custom:e4_repeated")
    else:
        draft["hero_images"] = ["javascript:alert(1)"]
    denied = client.put(PREFIX + "/admin/homepage-draft",
                        json={"draft": draft}, headers=auth_headers)
    assert denied.status_code == 422, denied.text
    assert client.get(PREFIX + "/public").json() == baseline


def test_product_image_upload_rejects_invalid_bytes_without_file_or_row(
    client, auth_headers,
):
    product_id, _ = StockFixture.create_stock(qty=3)
    db = TestingSession()
    try:
        assert db.query(ProductImage).filter_by(product_id=product_id).count() == 0
    finally:
        db.close()
    response = client.post(
        f"/api/v1/products/{product_id}/images",
        files={"files": ("fake.png", b"not-a-real-image", "image/png")},
        headers=auth_headers,
    )
    assert response.status_code == 415, response.text
    db = TestingSession()
    try:
        assert db.query(ProductImage).filter_by(product_id=product_id).count() == 0
    finally:
        db.close()


def test_integration_overview_requires_admin_and_hides_configuration_secrets(
    client, auth_headers,
):
    assert client.get("/api/v1/integrations/overview").status_code in (401, 403)
    customer = _role_headers(client, UserRole.CUSTOMER)
    assert client.get("/api/v1/integrations/overview", headers=customer).status_code == 403
    response = client.get("/api/v1/integrations/overview", headers=auth_headers)
    assert response.status_code == 200, response.text
    assert isinstance(response.json()["integrations"], list)
    serialized = response.text.lower()
    for private_key in ("private_key", "events_secret", "smtp_password", "database_url"):
        assert private_key not in serialized
