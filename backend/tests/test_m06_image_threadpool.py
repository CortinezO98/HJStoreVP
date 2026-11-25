"""M-06: verificar que ambas rutas delegan la normalización a otro hilo."""
import asyncio
import io
import threading
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException, UploadFile

from app.api.v1.endpoints import images, storefront_settings


def test_brand_normalizes_off_event_loop(monkeypatch, tmp_path):
    monkeypatch.setattr(storefront_settings.settings, "UPLOAD_DIR", str(tmp_path))
    monkeypatch.setattr(storefront_settings.settings, "STORAGE_BACKEND", "local")
    caller = threading.get_ident()
    seen = []
    def normalize(raw):
        seen.append(threading.get_ident())
        assert raw == b"synthetic"
        return b"normalized", "webp"
    monkeypatch.setattr(storefront_settings, "normalize_image", normalize)
    result = asyncio.run(storefront_settings.upload_brand_image(
        file=UploadFile(file=io.BytesIO(b"synthetic")), _=None))
    assert seen and seen[0] != caller
    assert (tmp_path / "branding" / result["url"].rsplit("/", 1)[-1]).read_bytes() == b"normalized"


def test_catalog_invalid_batch_normalizes_off_loop_without_mutation(monkeypatch):
    caller = threading.get_ident()
    seen = []
    def normalize(raw):
        seen.append(threading.get_ident())
        if raw == b"invalid":
            raise HTTPException(status_code=415, detail="Imagen inválida")
        return b"normalized", "webp"
    monkeypatch.setattr(images, "normalize_image", normalize)
    db = MagicMock()
    with pytest.raises(HTTPException) as error:
        asyncio.run(images.upload_images(
            product_id=1, files=[UploadFile(file=io.BytesIO(b"valid")),
                                 UploadFile(file=io.BytesIO(b"invalid"))],
            db=db, _=None))
    assert error.value.status_code == 415
    assert len(seen) == 2 and all(t != caller for t in seen)
    db.query.assert_not_called()
    db.add.assert_not_called()
    db.commit.assert_not_called()


def test_catalog_valid_batch_normalizes_off_loop(monkeypatch, tmp_path):
    caller = threading.get_ident()
    seen = []
    def normalize(raw):
        seen.append(threading.get_ident())
        return b"normalized", "webp"
    monkeypatch.setattr(images, "normalize_image", normalize)
    monkeypatch.setattr(images.settings, "UPLOAD_DIR", str(tmp_path))
    db = MagicMock()
    db.query.return_value.filter.return_value.with_for_update.return_value.first.return_value = SimpleNamespace(name="Producto")
    db.query.return_value.filter.return_value.order_by.return_value.first.return_value = None
    db.query.return_value.filter.return_value.first.return_value = None
    result = asyncio.run(images.upload_images(
        product_id=1, files=[UploadFile(file=io.BytesIO(b"synthetic"))], db=db, _=None))
    assert seen and seen[0] != caller
    assert len(result) == 1 and result[0].is_primary
    assert len(list((tmp_path / "products").glob("*.webp"))) == 1
    db.commit.assert_called_once()
