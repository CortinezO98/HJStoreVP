"""Fase E.4.2 — fotos, historial y auditoría, exclusivamente SQLite temporal.

Los archivos de prueba van al UPLOAD_DIR temporal de conftest; sin API externa.
"""
from copy import deepcopy
from io import BytesIO
from pathlib import Path

import pytest
from PIL import Image

from app.core.config import settings
from app.models.models import Inventory, ProductImage, StockMovement, StorefrontSettings
from tests.test_main import (
    TestingSession, TestWebOrderStockReservations as StockFixture,
    setup_db, client, auth_headers,
)

HOME = "/api/v1/storefront-settings"


def _photo():
    image = Image.new("RGB", (128, 128))
    pixels = image.load()
    for y in range(128):
        for x in range(128):
            pixels[x, y] = (x * 2, y * 2, (x + y) % 256)
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def test_valid_product_image_then_delete_clears_file_and_database(client, auth_headers):
    product_id, _ = StockFixture.create_stock(qty=3)
    response = client.post(
        f"/api/v1/products/{product_id}/images",
        files=[("files", ("synthetic.png", _photo(), "image/png"))],
        headers=auth_headers,
    )
    assert response.status_code == 201, response.text
    assert len(response.json()) == 1
    photo = response.json()[0]
    assert photo["is_primary"] is True
    assert photo["url"].startswith("/uploads/products/")
    file_path = Path(settings.UPLOAD_DIR) / "products" / photo["url"].split("/")[-1]
    assert file_path.is_file()
    db = TestingSession()
    try:
        assert db.query(ProductImage).filter_by(product_id=product_id).count() == 1
    finally:
        db.close()
    deleted = client.delete(
        f"/api/v1/products/{product_id}/images/{photo['id']}",
        headers=auth_headers,
    )
    assert deleted.status_code == 204, deleted.text
    assert not file_path.exists()
    db = TestingSession()
    try:
        assert db.query(ProductImage).filter_by(product_id=product_id).count() == 0
    finally:
        db.close()


def test_invalid_image_batch_is_atomic(client, auth_headers):
    product_id, _ = StockFixture.create_stock(qty=3)
    response = client.post(
        f"/api/v1/products/{product_id}/images",
        files=[
            ("files", ("safe.png", _photo(), "image/png")),
            ("files", ("fake.png", b"not an image", "image/png")),
        ],
        headers=auth_headers,
    )
    assert response.status_code == 415, response.text
    db = TestingSession()
    try:
        assert db.query(ProductImage).filter_by(product_id=product_id).count() == 0
    finally:
        db.close()
    assert not list((Path(settings.UPLOAD_DIR) / "products").glob("*.webp"))


def test_restore_published_version_only_as_draft(client, auth_headers):
    baseline = client.get(HOME + "/public").json()
    original = client.get(HOME + "/admin/homepage-draft", headers=auth_headers).json()["draft"]
    revision = deepcopy(original)
    revision["hero_title"] = "CAMBIO E42 PUBLICADO"
    assert client.put(HOME + "/admin/homepage-draft",
                      json={"draft": revision}, headers=auth_headers).status_code == 200
    published = client.post(HOME + "/admin/homepage-publish", headers=auth_headers)
    assert published.status_code == 200, published.text
    visible = client.get(HOME + "/public").json()
    assert visible["hero_title"] == "CAMBIO E42 PUBLICADO"
    versions = client.get(HOME + "/admin/homepage-versions", headers=auth_headers)
    assert versions.status_code == 200, versions.text
    assert len(versions.json()) == 1
    restored = client.post(
        HOME + f"/admin/homepage-versions/{versions.json()[0]['id']}/restore-draft",
        headers=auth_headers,
    )
    assert restored.status_code == 200, restored.text
    assert restored.json()["published_unchanged"] is True
    assert client.get(HOME + "/public").json() == visible
    draft = client.get(HOME + "/admin/homepage-draft", headers=auth_headers).json()
    assert draft["has_saved_draft"] is True
    assert draft["draft"]["hero_title"] == baseline["hero_title"]
    assert client.delete(HOME + "/admin/homepage-draft", headers=auth_headers).status_code == 200
    assert client.get(HOME + "/public").json() == visible


def test_stale_draft_publish_rejected_and_publication_preserved(client, auth_headers):
    snapshot = client.get(HOME + "/public").json()
    state = client.get(HOME + "/admin/homepage-draft", headers=auth_headers).json()
    pending = deepcopy(state["draft"])
    pending["hero_title"] = "BORRADOR ANTIGUO E42"
    assert client.put(HOME + "/admin/homepage-draft",
                      json={"draft": pending}, headers=auth_headers).status_code == 200
    # Una publicación externa concurrente cambia el hash, igual que /admin.
    db = TestingSession()
    try:
        row = db.get(StorefrontSettings, 1)
        values = dict(row.settings_data)
        values["hero_title"] = "PUBLICACIÓN MÁS RECIENTE E42"
        row.settings_data = values
        db.commit()
    finally:
        db.close()
    now = client.get(HOME + "/public").json()
    assert now["hero_title"] == "PUBLICACIÓN MÁS RECIENTE E42"
    denied = client.post(HOME + "/admin/homepage-publish", headers=auth_headers)
    assert denied.status_code == 409, denied.text
    assert client.get(HOME + "/public").json() == now
    assert client.get(HOME + "/admin/homepage-draft", headers=auth_headers).json()["has_saved_draft"]


def test_inventory_replenishment_creates_actor_attributed_movement(client, auth_headers):
    product_id, inv_id = StockFixture.create_stock(qty=5)
    db = TestingSession()
    try:
        location = db.get(Inventory, inv_id).location_id
    finally:
        db.close()
    result = client.post(
        "/api/v1/inventory/replenish",
        json={"product_id": product_id, "location_id": location,
              "qty": 3, "notes": "Recepción aislada E42"},
        headers=auth_headers,
    )
    assert result.status_code == 200, result.text
    db = TestingSession()
    try:
        assert db.get(Inventory, inv_id).qty_available == 8
        movement = db.query(StockMovement).filter_by(product_id=product_id).one()
        assert movement.qty == 3
        assert movement.qty_before == 5
        assert movement.qty_after == 8
        assert movement.created_by is not None
    finally:
        db.close()


def test_commercial_audit_is_superadmin_only(client, auth_headers):
    assert client.get("/api/v1/commercial-audit").status_code in (401, 403)
    response = client.get("/api/v1/commercial-audit", headers=auth_headers)
    assert response.status_code == 200, response.text
    assert "items" in response.json()
