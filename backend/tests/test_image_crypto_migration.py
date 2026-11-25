"""Regresión aislada de codificación de imágenes y cifrado MFA tras actualización.

No utiliza bases de datos, SMTP ni servicios externos.
"""
import io
from importlib.metadata import version

import pytest
from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException
from PIL import Image

from app.api.v1.endpoints.images import normalize_image
from app.core.config import settings
from app.services.mfa import decrypt_secret, encrypt_secret, new_secret


def _pattern(mode="RGB"):
    image = Image.new(mode, (128, 128))
    for y in range(128):
        for x in range(128):
            values = ((x * 3 + y * 7) % 256,
                      (x * 9 + y * 2) % 256,
                      (x * 5 + y * 11) % 256)
            image.putpixel((x, y), values + ((x + y) % 256,) if mode == "RGBA" else values)
    return image


@pytest.mark.parametrize("format_name", ["PNG", "JPEG", "WEBP", "GIF"])
def test_supported_image_formats_normalize_to_webp(format_name):
    original = _pattern()
    buffer = io.BytesIO()
    original.save(buffer, format=format_name)
    normalized, extension = normalize_image(buffer.getvalue())
    assert extension == "webp"
    with Image.open(io.BytesIO(normalized)) as image:
        assert image.format == "WEBP"
        assert image.size == (128, 128)
        image.verify()


def test_transparency_survives_normalization():
    buffer = io.BytesIO()
    _pattern("RGBA").save(buffer, format="PNG")
    normalized, extension = normalize_image(buffer.getvalue())
    assert extension == "webp"
    with Image.open(io.BytesIO(normalized)) as image:
        assert image.mode == "RGBA"
        extrema = image.getchannel("A").getextrema()
        assert extrema[0] < extrema[1]


def test_invalid_image_never_returns_normalized_content():
    with pytest.raises(HTTPException) as error:
        normalize_image(b"not-an-image")
    assert error.value.status_code == 415


def test_mfa_fernet_round_trip_and_ciphertext_not_plaintext():
    secret = new_secret()
    ciphertext = encrypt_secret(secret)
    assert ciphertext != secret
    assert decrypt_secret(ciphertext) == secret


def test_mfa_decryption_rejects_tampering_and_wrong_secret_key(monkeypatch):
    # Aislar la modalidad histórica de las variables reales del contenedor.
    monkeypatch.setattr(settings, "MFA_ENCRYPTION_KEYS", "")
    monkeypatch.setattr(settings, "SECRET_KEY", "fixture-legacy-signing-key-not-for-production")
    secret = new_secret()
    ciphertext = encrypt_secret(secret)
    with pytest.raises(InvalidToken):
        decrypt_secret("AAAA" + ciphertext[4:])
    monkeypatch.setattr(settings, "SECRET_KEY", "different-test-secret-key-which-is-not-production")
    with pytest.raises(InvalidToken):
        decrypt_secret(ciphertext)


def test_mfa_independent_key_survives_signing_key_change(monkeypatch):
    monkeypatch.setattr(settings, "SECRET_KEY", "fixture-legacy-signing-key-not-for-production")
    primary = Fernet.generate_key().decode()
    monkeypatch.setattr(settings, "MFA_ENCRYPTION_KEYS", primary)
    secret = new_secret()
    ciphertext = encrypt_secret(secret)
    with pytest.raises(InvalidToken):
        decrypt_secret("AAAA" + ciphertext[4:])
    monkeypatch.setattr(settings, "SECRET_KEY", "different-test-secret-key-which-is-not-production")
    assert decrypt_secret(ciphertext) == secret
    monkeypatch.setattr(settings, "MFA_ENCRYPTION_KEYS", Fernet.generate_key().decode())
    with pytest.raises(InvalidToken):
        decrypt_secret(ciphertext)


def test_security_dependency_versions():
    assert version("pillow") == "13.0.0"
    assert version("cryptography") == "49.0.0"
