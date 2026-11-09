"""Regresiones unitarias de la integración Wompi; no realizan cobros."""
import hashlib
from urllib.parse import parse_qs, urlsplit

import pytest

from app.core.config import settings
from app.services.wompi import (
    build_checkout_url, integrity_signature, verify_webhook_signature,
    wompi_enabled,
)


@pytest.fixture
def wompi_sandbox(monkeypatch):
    monkeypatch.setattr(settings, "WOMPI_ENV", "sandbox")
    monkeypatch.setattr(settings, "WOMPI_ALLOW_LIVE_PAYMENTS", False)
    monkeypatch.setattr(settings, "WOMPI_PUBLIC_KEY", "pub_test_" + "p" * 20)
    monkeypatch.setattr(settings, "WOMPI_PRIVATE_KEY", "prv_test_" + "q" * 20)
    monkeypatch.setattr(settings, "WOMPI_INTEGRITY_SECRET", "test_integrity_" + "i" * 20)
    monkeypatch.setattr(settings, "WOMPI_EVENTS_SECRET", "test_events_" + "e" * 20)


def test_checkout_integrity_is_calculated_server_side(wompi_sandbox):
    assert wompi_enabled()
    url = build_checkout_url(
        "WEB-123", 1250000, "cliente@example.com", "Cliente", "http://localhost:5173/pago-confirmado?order=WEB-123",
    )
    parts = urlsplit(url)
    params = parse_qs(parts.query)
    assert parts.netloc == "checkout.wompi.co"
    assert params["reference"] == ["WEB-123"]
    assert params["amount-in-cents"] == ["1250000"]
    assert params["currency"] == ["COP"]
    expected = hashlib.sha256(
        ("WEB-1231250000COP" + settings.WOMPI_INTEGRITY_SECRET).encode()
    ).hexdigest()
    assert params["signature:integrity"] == [expected]
    assert settings.WOMPI_INTEGRITY_SECRET not in url


def test_checkout_rejects_untrusted_http_redirect(wompi_sandbox):
    with pytest.raises(ValueError):
        build_checkout_url("WEB-1", 1000, "a@b.co", "Nombre", "http://example.com/redirect")


def test_event_signature_uses_ordered_properties_and_timestamp(wompi_sandbox):
    event = {
        "event": "transaction.updated",
        "environment": "test",
        "data": {"transaction": {
            "id": "TX-1", "status": "APPROVED", "amount_in_cents": 1250000,
            "reference": "WEB-123", "currency": "COP",
        }},
        "timestamp": 1530291411,
        "signature": {
            "properties": ["transaction.id", "transaction.status", "transaction.amount_in_cents"],
        },
    }
    raw = "TX-1APPROVED12500001530291411" + settings.WOMPI_EVENTS_SECRET
    event["signature"]["checksum"] = hashlib.sha256(raw.encode()).hexdigest()
    assert verify_webhook_signature(event, event["signature"]["checksum"])
    assert not verify_webhook_signature(event, "f" * 64)
    event["data"]["transaction"]["status"] = "DECLINED"
    assert not verify_webhook_signature(event)


def test_wompi_is_disabled_without_secrets(monkeypatch, wompi_sandbox):
    monkeypatch.setattr(settings, "WOMPI_EVENTS_SECRET", None)
    assert not wompi_enabled()
    assert not verify_webhook_signature({}, "")


def test_live_payments_require_explicit_flag(monkeypatch, wompi_sandbox):
    monkeypatch.setattr(settings, "WOMPI_ENV", "production")
    monkeypatch.setattr(settings, "WOMPI_PUBLIC_KEY", "pub_prod_" + "p" * 20)
    monkeypatch.setattr(settings, "WOMPI_PRIVATE_KEY", "prv_prod_" + "q" * 20)
    monkeypatch.setattr(settings, "WOMPI_INTEGRITY_SECRET", "prod_integrity_" + "i" * 20)
    monkeypatch.setattr(settings, "WOMPI_EVENTS_SECRET", "prod_events_" + "e" * 20)
    assert not wompi_enabled()
    monkeypatch.setattr(settings, "WOMPI_ALLOW_LIVE_PAYMENTS", True)
    assert wompi_enabled()
