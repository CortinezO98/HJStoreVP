"""Biblioteca multimedia: sólo lectura, acceso restringido y rutas seguras.

Los archivos se crean exclusivamente dentro de la carpeta temporal aislada por pytest.
No requieren MariaDB, Redis ni imágenes comerciales reales.
"""
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app
from app.core.config import settings
from app.core.deps import require_super_admin


def test_media_library_requires_authentication():
    response = TestClient(app).get("/api/v1/storefront-settings/admin/media-library")
    assert response.status_code in (401, 403)


def test_media_library_lists_only_valid_images_and_paginates(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "STORAGE_BACKEND", "local")
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))
    folder = tmp_path / "branding"
    folder.mkdir()
    names = [f"{uuid4().hex}.webp" for _ in range(3)]
    for name in names:
        (folder / name).write_bytes(b"test-media")
    (folder / "notes.txt").write_text("not an image")
    (folder / "not-a-uuid.webp").write_bytes(b"not-listed")
    app.dependency_overrides[require_super_admin] = lambda: object()
    try:
        client = TestClient(app)
        result = client.get("/api/v1/storefront-settings/admin/media-library", params={"page_size": 2})
        assert result.status_code == 200
        body = result.json()
        assert body["total"] == 3
        assert len(body["items"]) == 2
        assert all(row["url"].startswith("/uploads/branding/") for row in body["items"])
        next_page = client.get("/api/v1/storefront-settings/admin/media-library",
                               params={"page": 2, "page_size": 2})
        assert next_page.status_code == 200
        assert len(next_page.json()["items"]) == 1
        assert {row["filename"] for row in body["items"] + next_page.json()["items"]} == set(names)
        assert client.get("/api/v1/storefront-settings/admin/media-library",
                          params={"search": names[0][:8]}).json()["total"] == 1
        assert client.get("/api/v1/storefront-settings/admin/media-library",
                          params={"page_size": 1000}).status_code == 422
    finally:
        app.dependency_overrides.pop(require_super_admin, None)


def test_media_library_nonlocal_storage_rejected(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "STORAGE_BACKEND", "spaces")
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))
    app.dependency_overrides[require_super_admin] = lambda: object()
    try:
        response = TestClient(app).get("/api/v1/storefront-settings/admin/media-library")
        assert response.status_code == 409
    finally:
        app.dependency_overrides.pop(require_super_admin, None)
