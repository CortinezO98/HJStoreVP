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
    # El endpoint consulta la configuración para obtener referencias de uso.
    # Crear exclusivamente las tablas de la SQLite aislada por conftest.py.
    from app.db.session import Base, engine
    if engine.dialect.name != "sqlite":
        raise RuntimeError("Prueba bloqueada fuera de SQLite aislada")
    Base.metadata.create_all(bind=engine)
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


def test_media_usage_tracks_published_draft_and_history():
    from app.api.v1.endpoints.storefront_settings import media_usage
    first = "/uploads/branding/" + uuid4().hex + ".webp"
    second = "/uploads/branding/" + uuid4().hex + ".webp"
    third = "/uploads/branding/" + uuid4().hex + ".webp"
    stored = {
        "hero_images": [first],
        "_homepage_draft": {"data": {"homepage_banners": [{"image_url": second}]}},
        "_homepage_history": [{"data": {"homepage_category_tiles": [{"mobile_image_url": third}]}}],
    }
    usage = media_usage(stored)
    assert usage[first] == ["published"]
    assert usage[second] == ["draft"]
    assert usage[third] == ["history"]


def test_media_metadata_validation_rejects_excess_and_controls():
    import pytest
    from pydantic import ValidationError
    from app.api.v1.endpoints.storefront_settings import MediaMetadataUpdate
    assert MediaMetadataUpdate(title="  Campaña ", tags=["Moda", "moda", "  ofertas "]).model_dump() == {
        "title": "Campaña", "tags": ["Moda", "ofertas"]
    }
    with pytest.raises(ValidationError):
        MediaMetadataUpdate(title="Ejemplo", tags=["etiqueta"] * 9)
    with pytest.raises(ValidationError):
        MediaMetadataUpdate(title="linea\nmodificada")


def test_media_metadata_endpoint_does_not_change_published_settings(tmp_path, monkeypatch):
    from types import SimpleNamespace
    from app.db.session import Base, SessionLocal, engine
    from app.db.session import get_db
    from app.models.models import StorefrontSettings

    monkeypatch.setattr(settings, "STORAGE_BACKEND", "local")
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))
    folder = tmp_path / "branding"
    folder.mkdir()
    name = f"{uuid4().hex}.webp"
    (folder / name).write_bytes(b"isolated-test-image")
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as session:
        row = session.get(StorefrontSettings, 1)
        if row is None:
            row = StorefrontSettings(id=1, settings_data={"hero_title": "PORTADA ORIGINAL"})
            session.add(row)
        else:
            row.settings_data = {"hero_title": "PORTADA ORIGINAL"}
        session.commit()

    app.dependency_overrides[require_super_admin] = lambda: SimpleNamespace(id=1)

    def fake_db():
        with SessionLocal() as session:
            yield session

    app.dependency_overrides[get_db] = fake_db
    try:
        client = TestClient(app)
        endpoint = f"/api/v1/storefront-settings/admin/media-library/{name}/metadata"
        response = client.put(endpoint, json={"title": "Colección de otoño", "tags": ["banner", "inicio"]})
        assert response.status_code == 200, response.text
        result = client.get("/api/v1/storefront-settings/admin/media-library",
                            params={"search": "Colección"})
        assert result.status_code == 200
        assert result.json()["total"] == 1
        assert result.json()["items"][0]["tags"] == ["banner", "inicio"]
        with SessionLocal() as session:
            stored = session.get(StorefrontSettings, 1).settings_data
            assert stored["hero_title"] == "PORTADA ORIGINAL"
            assert stored["_media_library_metadata"][name]["title"] == "Colección de otoño"
        assert client.put("/api/v1/storefront-settings/admin/media-library/traversal.webp/metadata",
                          json={"title": "invalido"}).status_code == 422
        assert client.put("/api/v1/storefront-settings/admin/media-library/"
                          + f"{uuid4().hex}.webp/metadata", json={"title": "no existe"}).status_code == 404
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(require_super_admin, None)
        with SessionLocal() as session:
            row = session.get(StorefrontSettings, 1)
            if row is not None:
                session.delete(row)
                session.commit()
