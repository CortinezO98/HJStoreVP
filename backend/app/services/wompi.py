"""
Servicio de integración con Wompi.
Documentación: https://docs.wompi.co

Para activar en producción, agregar al .env:
    WOMPI_PUBLIC_KEY=pub_prod_XXXX
    WOMPI_PRIVATE_KEY=prv_prod_XXXX
    WOMPI_EVENTS_SECRET=XXXX
    WOMPI_REDIRECT_URL=https://tudominio.com/pago-confirmado

En sandbox (pruebas):
    WOMPI_PUBLIC_KEY=pub_test_XXXX
    WOMPI_PRIVATE_KEY=prv_test_XXXX
"""
import hashlib
import hmac
import httpx
from app.core.config import settings

WOMPI_API_URL = "https://api-sandbox.co.uat.wompi.dev/v1"  # Sandbox
# WOMPI_API_URL = "https://production.wompi.co/v1"         # Producción


async def get_acceptance_token() -> str:
    """
    Obtiene el acceptance_token requerido por Wompi antes de crear transacciones.
    Se llama una vez al inicio del checkout.
    """
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{WOMPI_API_URL}/merchants/{settings.WOMPI_PUBLIC_KEY}"
        )
        resp.raise_for_status()
        data = resp.json()
        return data["data"]["presigned_acceptance"]["acceptance_token"]


async def create_transaction(
    amount_in_cents: int,
    currency: str,
    order_number: str,
    customer_email: str,
    customer_name: str,
    customer_phone: str,
    redirect_url: str,
    reference: str,
) -> dict:
    """
    Crea una transacción en Wompi.
    Retorna la URL de pago para redirigir al cliente.
    """
    acceptance_token = await get_acceptance_token()

    payload = {
        "amount_in_cents": amount_in_cents,
        "currency": currency,
        "customer_email": customer_email,
        "payment_method": {
            "installments": 1,
        },
        "redirect_url": redirect_url,
        "reference": reference,
        "customer_data": {
            "phone_number": customer_phone,
            "full_name": customer_name,
        },
        "acceptance_token": acceptance_token,
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{WOMPI_API_URL}/transactions",
            json=payload,
            headers={
                "Authorization": f"Bearer {settings.WOMPI_PRIVATE_KEY}",
                "Content-Type": "application/json",
            },
        )
        resp.raise_for_status()
        return resp.json()["data"]


async def get_transaction(transaction_id: str) -> dict:
    """Consulta el estado de una transacción."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{WOMPI_API_URL}/transactions/{transaction_id}",
            headers={"Authorization": f"Bearer {settings.WOMPI_PRIVATE_KEY}"},
        )
        resp.raise_for_status()
        return resp.json()["data"]


def verify_webhook_signature(payload_str: str, timestamp: str, signature: str) -> bool:
    """
    Verifica que el webhook proviene realmente de Wompi.
    Usa el WOMPI_EVENTS_SECRET del .env
    """
    if not settings.WOMPI_EVENTS_SECRET:
        return True  # En desarrollo sin secret, aceptar todo

    checksum_str = payload_str + timestamp + settings.WOMPI_EVENTS_SECRET
    expected = hashlib.sha256(checksum_str.encode()).hexdigest()
    return hmac.compare_digest(expected, signature)


def build_checkout_url(
    order_number: str,
    amount_in_cents: int,
    customer_email: str,
    customer_name: str,
    redirect_url: str,
) -> str:
    """
    Genera la URL del widget de Wompi (opción sin redirección de API).
    Esta es la forma más simple — abre el checkout de Wompi directamente.
    """
    import urllib.parse
    params = {
        "public-key": settings.WOMPI_PUBLIC_KEY or "pub_test_PLACEHOLDER",
        "currency": "COP",
        "amount-in-cents": str(amount_in_cents),
        "reference": order_number,
        "redirect-url": redirect_url,
        "customer-data:email": customer_email,
        "customer-data:full-name": customer_name,
    }
    query = urllib.parse.urlencode(params)
    return f"https://checkout.wompi.co/p/?{query}"
