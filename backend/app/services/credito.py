"""
Integración con Sistecréditos y Addi.
Ambas son pasarelas de crédito colombianas para compras a cuotas.

Para activar, agregar al .env:

── Sistecréditos ──────────────────────────────────────────────
SISTECREDITOS_API_KEY=your_api_key
SISTECREDITOS_STORE_ID=your_store_id
SISTECREDITOS_SECRET=your_secret
SISTECREDITOS_ENV=sandbox  # o 'production'
SISTECREDITOS_REDIRECT_URL=http://localhost:5173/pago-confirmado

── Addi ───────────────────────────────────────────────────────
ADDI_CLIENT_ID=your_client_id
ADDI_CLIENT_SECRET=your_client_secret
ADDI_ENV=sandbox  # o 'production'
ADDI_REDIRECT_URL=http://localhost:5173/pago-confirmado

Documentación:
  Sistecréditos: https://developers.sistecréditos.com
  Addi:          https://developers.addi.com
"""
import hashlib
import hmac
import httpx
from app.core.config import settings

# ── URLs por entorno ──────────────────────────────────────────────────────────

SISTECREDITOS_URLS = {
    "sandbox":    "https://sandbox-api.sistecréditos.com/v1",
    "production": "https://api.sistecréditos.com/v1",
}

ADDI_URLS = {
    "sandbox":    "https://sandbox.addi.com/v1",
    "production": "https://api.addi.com/v1",
}


# ── Sistecréditos ─────────────────────────────────────────────────────────────

def sistecreditos_enabled() -> bool:
    return bool(
        settings.SISTECREDITOS_API_KEY and
        "PLACEHOLDER" not in (settings.SISTECREDITOS_API_KEY or "")
    )


def build_sistecreditos_url(
    order_number: str,
    amount: float,
    customer_email: str,
    customer_name: str,
    customer_phone: str,
    customer_id: str = "",
) -> str:
    """
    Genera la URL de pago de Sistecréditos.
    El cliente es redirigido aquí para solicitar su crédito.
    """
    if not sistecreditos_enabled():
        return f"http://localhost:5173/pago-demo?order={order_number}&provider=sistecreditos&amount={amount}"

    import urllib.parse
    base_url = SISTECREDITOS_URLS.get(
        settings.SISTECREDITOS_ENV or "sandbox",
        SISTECREDITOS_URLS["sandbox"]
    )
    redirect = settings.SISTECREDITOS_REDIRECT_URL or "http://localhost:5173/pago-confirmado"

    params = {
        "apiKey":      settings.SISTECREDITOS_API_KEY,
        "storeId":     settings.SISTECREDITOS_STORE_ID or "",
        "orderId":     order_number,
        "amount":      str(int(amount)),
        "email":       customer_email,
        "name":        customer_name,
        "phone":       customer_phone,
        "document":    customer_id,
        "redirectUrl": f"{redirect}?order={order_number}&provider=sistecreditos",
        "currency":    "COP",
    }
    return f"{base_url}/checkout?{urllib.parse.urlencode(params)}"


async def get_sistecreditos_transaction(transaction_id: str) -> dict:
    """Consulta el estado de una transacción en Sistecréditos."""
    base_url = SISTECREDITOS_URLS.get(settings.SISTECREDITOS_ENV or "sandbox")
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{base_url}/transactions/{transaction_id}",
            headers={
                "Authorization": f"Bearer {settings.SISTECREDITOS_API_KEY}",
                "x-store-id": settings.SISTECREDITOS_STORE_ID or "",
            },
        )
        resp.raise_for_status()
        return resp.json()


def verify_sistecreditos_webhook(payload: str, signature: str) -> bool:
    """Verifica la firma del webhook de Sistecréditos."""
    if not settings.SISTECREDITOS_SECRET:
        return True
    expected = hmac.new(
        settings.SISTECREDITOS_SECRET.encode(),
        payload.encode(),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


# ── Addi ──────────────────────────────────────────────────────────────────────

def addi_enabled() -> bool:
    return bool(
        settings.ADDI_CLIENT_ID and
        "PLACEHOLDER" not in (settings.ADDI_CLIENT_ID or "")
    )


async def get_addi_access_token() -> str:
    """Obtiene el token de acceso de Addi (OAuth2 client_credentials)."""
    base_url = ADDI_URLS.get(settings.ADDI_ENV or "sandbox")
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{base_url}/oauth/token",
            data={
                "grant_type":    "client_credentials",
                "client_id":     settings.ADDI_CLIENT_ID,
                "client_secret": settings.ADDI_CLIENT_SECRET,
            },
        )
        resp.raise_for_status()
        return resp.json()["access_token"]


async def create_addi_application(
    order_number: str,
    amount: float,
    customer_email: str,
    customer_name: str,
    customer_phone: str,
    items: list,
) -> dict:
    """
    Crea una solicitud de crédito en Addi.
    Retorna la URL donde el cliente completa su solicitud.
    """
    if not addi_enabled():
        return {
            "url": f"http://localhost:5173/pago-demo?order={order_number}&provider=addi&amount={amount}",
            "applicationId": f"DEMO-{order_number}",
        }

    token = await get_addi_access_token()
    base_url = ADDI_URLS.get(settings.ADDI_ENV or "sandbox")
    redirect = settings.ADDI_REDIRECT_URL or "http://localhost:5173/pago-confirmado"

    payload = {
        "orderId":      order_number,
        "totalAmount":  amount,
        "currency":     "COP",
        "redirectUrl":  f"{redirect}?order={order_number}&provider=addi",
        "webhookUrl":   f"{settings.API_BASE_URL or 'http://localhost:8000'}/api/v1/payments/webhook/addi",
        "client": {
            "email":     customer_email,
            "firstName": customer_name.split()[0] if customer_name else "",
            "lastName":  " ".join(customer_name.split()[1:]) if customer_name else "",
            "cellphone": customer_phone,
        },
        "items": [
            {
                "name":     item.get("name", "Producto"),
                "quantity": item.get("qty", 1),
                "unitPrice": item.get("unit_price", 0),
                "sku":      item.get("sku", ""),
            }
            for item in (items or [])
        ],
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{base_url}/applications",
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
        )
        resp.raise_for_status()
        data = resp.json()
        return {
            "url":           data.get("redirectUrl") or data.get("url"),
            "applicationId": data.get("id") or data.get("applicationId"),
        }


async def get_addi_application(application_id: str) -> dict:
    """Consulta el estado de una solicitud de crédito en Addi."""
    token = await get_addi_access_token()
    base_url = ADDI_URLS.get(settings.ADDI_ENV or "sandbox")
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{base_url}/applications/{application_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        resp.raise_for_status()
        return resp.json()


def verify_addi_webhook(payload: str, signature: str) -> bool:
    """Verifica la firma del webhook de Addi."""
    if not settings.ADDI_CLIENT_SECRET:
        return True
    expected = hmac.new(
        settings.ADDI_CLIENT_SECRET.encode(),
        payload.encode(),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)
