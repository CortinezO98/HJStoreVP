"""Wompi Web Checkout: firmado, validación de eventos y consultas backend.

Docs:
https://docs.wompi.co/docs/colombia/widget-checkout-web/
https://docs.wompi.co/docs/colombia/eventos/
https://docs.wompi.co/docs/colombia/seguimiento-de-transacciones/
"""
from __future__ import annotations

import hashlib
import hmac
from decimal import Decimal
from urllib.parse import urlencode, urlsplit

import httpx

from app.core.config import settings

WOMPI_CHECKOUT_URL = "https://checkout.wompi.co/p/"
WOMPI_API_URLS = {
    "sandbox": "https://sandbox.wompi.co/v1",
    "production": "https://production.wompi.co/v1",
}


def wompi_enabled() -> bool:
    """Fail-closed: 4 credentials for selected environment and production opt-in."""
    environment = settings.WOMPI_ENV
    if environment not in WOMPI_API_URLS:
        return False
    prefix = "test" if environment == "sandbox" else "prod"
    expected = {
        "public": f"pub_{prefix}_",
        "private": f"prv_{prefix}_",
        "integrity": f"{prefix}_integrity_",
        "events": f"{prefix}_events_",
    }
    configured = {
        "public": settings.WOMPI_PUBLIC_KEY,
        "private": settings.WOMPI_PRIVATE_KEY,
        "integrity": settings.WOMPI_INTEGRITY_SECRET,
        "events": settings.WOMPI_EVENTS_SECRET,
    }
    if environment == "production" and not settings.WOMPI_ALLOW_LIVE_PAYMENTS:
        return False
    return all(
        isinstance(configured[k], str)
        and configured[k].startswith(prefix_value)
        and len(configured[k]) > len(prefix_value) + 8
        for k, prefix_value in expected.items()
    )


def _amount_cents(amount: Decimal) -> int:
    value = amount * 100
    if amount <= 0 or value != value.to_integral_value():
        raise ValueError("Importe COP inválido")
    return int(value)


def integrity_signature(reference: str, amount_in_cents: int, currency: str = "COP") -> str:
    """SHA256(reference + amount cents + currency + integrity secret)."""
    secret = settings.WOMPI_INTEGRITY_SECRET
    if not secret or not reference or amount_in_cents <= 0 or currency != "COP":
        raise ValueError("Integridad Wompi no configurada")
    raw = f"{reference}{amount_in_cents}{currency}{secret}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def build_checkout_url(
    order_number: str,
    amount_in_cents: int,
    customer_email: str,
    customer_name: str,
    redirect_url: str,
) -> str:
    if not wompi_enabled():
        raise ValueError("Wompi no está habilitado")
    redirect = urlsplit(redirect_url)
    local_dev = (
        settings.WOMPI_ENV == "sandbox"
        and redirect.scheme == "http"
        and redirect.hostname in ("localhost", "127.0.0.1")
    )
    if not (redirect.scheme == "https" or local_dev):
        raise ValueError("La URL de retorno debe utilizar HTTPS")
    params = {
        "public-key": settings.WOMPI_PUBLIC_KEY,
        "currency": "COP",
        "amount-in-cents": str(amount_in_cents),
        "reference": order_number,
        "signature:integrity": integrity_signature(order_number, amount_in_cents),
        "redirect-url": redirect_url,
        "customer-data:email": customer_email,
        "customer-data:full-name": customer_name,
    }
    return WOMPI_CHECKOUT_URL + "?" + urlencode(params)


def _lookup_property(data: dict, property_path: str):
    current = data
    for segment in property_path.split("."):
        if not isinstance(current, dict) or segment not in current:
            raise ValueError("Propiedad de firma inexistente")
        current = current[segment]
    if isinstance(current, bool) or current is None or isinstance(current, (list, dict)):
        raise ValueError("Valor de firma no escalar")
    return str(current)


def verify_webhook_signature(event: dict, signature_header: str = "") -> bool:
    """SHA256(values(signature.properties) + timestamp + events_secret).

    La firma se compara en tiempo constante. Rechaza propiedades ambiguas,
    firmas inconsistentes en header/body y secretos ausentes.
    """
    if not wompi_enabled() or not isinstance(event, dict):
        return False
    try:
        signature_data = event["signature"]
        properties = signature_data["properties"]
        timestamp = event["timestamp"]
        body_checksum = signature_data["checksum"]
        if (
            not isinstance(properties, list) or not (1 <= len(properties) <= 20)
            or not isinstance(timestamp, int) or isinstance(timestamp, bool)
            or not isinstance(body_checksum, str) or len(body_checksum) != 64
            or not all(isinstance(prop, str) and prop.startswith("transaction.") for prop in properties)
            or len(set(properties)) != len(properties)
        ):
            return False
        data = event["data"]
        values = "".join(_lookup_property(data, prop) for prop in properties)
        expected = hashlib.sha256(
            (values + str(timestamp) + settings.WOMPI_EVENTS_SECRET).encode("utf-8")
        ).hexdigest()
        if signature_header and not hmac.compare_digest(
            signature_header.lower(), body_checksum.lower()
        ):
            return False
        return hmac.compare_digest(expected, body_checksum.lower())
    except (KeyError, TypeError, ValueError, AttributeError):
        return False


async def get_transaction(transaction_id: str) -> dict:
    """Consulta autenticada; nunca se llama desde el navegador."""
    if not wompi_enabled():
        raise ValueError("Wompi no configurado")
    if not transaction_id or len(transaction_id) > 128 or not all(
        c.isalnum() or c in "-_" for c in transaction_id
    ):
        raise ValueError("ID Wompi inválido")
    api_url = WOMPI_API_URLS[settings.WOMPI_ENV]
    async with httpx.AsyncClient(timeout=12.0) as client:
        response = await client.get(
            f"{api_url}/transactions/{transaction_id}",
            headers={"Authorization": f"Bearer {settings.WOMPI_PRIVATE_KEY}"},
        )
        response.raise_for_status()
        result = response.json()["data"]
        if not isinstance(result, dict):
            raise ValueError("Respuesta Wompi inválida")
        return result
