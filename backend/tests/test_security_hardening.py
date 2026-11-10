"""Pruebas unitarias de límites de seguridad; no requieren servicios externos."""
import io

import pytest
from fastapi import HTTPException
from PIL import Image
from pydantic import ValidationError

from app.api.v1.endpoints.images import normalize_image, safe_product_file
from app.schemas.schemas import StockAdjust, StockTransfer


@pytest.mark.parametrize("qty", [-10, -1, 0])
def test_inventory_rejects_nonpositive_quantities(qty):
    with pytest.raises(ValidationError):
        StockAdjust(product_id=1, location_id=1, qty=qty)
    with pytest.raises(ValidationError):
        StockTransfer(product_id=1, from_location_id=1, to_location_id=2, qty=qty)


def test_image_rejects_malicious_content():
    with pytest.raises(HTTPException) as exc:
        normalize_image(b"<script>alert('hola')</script>")
    assert exc.value.status_code == 415


def test_image_normalizes_type_using_real_content_not_filename():
    source = io.BytesIO()
    Image.new("RGB", (20, 20), color="red").save(source, format="PNG")
    normalized, extension = normalize_image(source.getvalue())
    assert extension == "png"
    with Image.open(io.BytesIO(normalized)) as img:
        assert img.format == "PNG"
        assert img.size == (20, 20)


def test_image_rejects_oversized_payload():
    from app.api.v1.endpoints.images import MAX_SIZE_BYTES
    with pytest.raises(HTTPException) as exc:
        normalize_image(b"x" * (MAX_SIZE_BYTES + 1))
    assert exc.value.status_code == 413


def test_image_deletion_only_under_products_directory():
    assert safe_product_file("/uploads/../../private.env") is None
    assert safe_product_file("/uploads/products/../private.env") is None
    assert safe_product_file("/uploads/products/not-a-file/other.png") is None
