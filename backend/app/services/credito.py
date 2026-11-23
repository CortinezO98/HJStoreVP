"""Adaptadores de crédito: deshabilitados hasta verificar contratos oficiales.

Las rutas provisionales solo pueden ensayarse en sandbox con opt-in.
No se envían credenciales en enlaces al navegador.
"""
import hashlib
import hmac
from urllib.parse import quote, urlencode, urlsplit
import httpx
from app.core.config import settings, require_https_provider_url


def _configured(*values):
    return all(isinstance(v, str) and v.strip() and "PLACEHOLDER" not in v.upper() for v in values)


def sistecreditos_enabled() -> bool:
    return bool(settings.SISTECREDITO_INTEGRATION_VERIFIED and
                settings.SISTECREDITOS_ENV == "sandbox" and
                settings.ENVIRONMENT in ("development", "test") and
                _configured(settings.SISTECREDITO_BASE_URL, settings.SISTECREDITOS_API_KEY,
                            settings.SISTECREDITOS_STORE_ID, settings.SISTECREDITOS_SECRET,
                            settings.SISTECREDITOS_REDIRECT_URL))


def addi_enabled() -> bool:
    return bool(settings.ADDI_INTEGRATION_VERIFIED and settings.ADDI_ENV == "sandbox" and
                settings.ENVIRONMENT in ("development", "test") and
                _configured(settings.ADDI_BASE_URL, settings.ADDI_CLIENT_ID,
                            settings.ADDI_CLIENT_SECRET, settings.ADDI_WEBHOOK_SECRET, settings.ADDI_REDIRECT_URL) and
                settings.ADDI_WEBHOOK_SECRET != settings.ADDI_CLIENT_SECRET)


def _base(value):
    value = require_https_provider_url(value)
    if urlsplit(value).query:
        raise ValueError("URL base inválida")
    return value.rstrip("/")


def _redirect(value, order_number, provider):
    if not value:
        raise ValueError("Redirección no configurada")
    return value + ("&" if "?" in value else "?") + urlencode({"order": order_number, "provider": provider})


def _checkout_url(value, *secrets):
    value = require_https_provider_url(value)
    from urllib.parse import unquote
    decoded = unquote(value)
    if any(secret and secret in decoded for secret in secrets):
        raise ValueError("Respuesta del proveedor contiene credenciales")
    return value


async def build_sistecreditos_url(order_number, amount, customer_email, customer_name,
                                  customer_phone, customer_id=""):
    if not sistecreditos_enabled():
        raise ValueError("Sistecréditos no verificado")
    # TODO: confirmar ruta, esquema y autenticación con el contrato oficial.
    async with httpx.AsyncClient(timeout=15, follow_redirects=False) as client:
        response = await client.post(
            f"{_base(settings.SISTECREDITO_BASE_URL)}/checkout",
            headers={"Authorization": f"Bearer {settings.SISTECREDITOS_API_KEY}",
                     "x-store-id": settings.SISTECREDITOS_STORE_ID},
            json={"orderId": order_number, "amount": amount, "currency": "COP",
                  "email": customer_email, "name": customer_name, "phone": customer_phone,
                  "document": customer_id,
                  "redirectUrl": _redirect(settings.SISTECREDITOS_REDIRECT_URL, order_number, "sistecreditos")},
        )
        response.raise_for_status()
        data = response.json()
        return _checkout_url(data.get("redirectUrl") or data.get("url"), settings.SISTECREDITOS_API_KEY,
                             settings.SISTECREDITOS_SECRET)


async def get_sistecreditos_transaction(transaction_id: str) -> dict:
    if not sistecreditos_enabled():
        raise ValueError("Sistecréditos no verificado")
    async with httpx.AsyncClient(timeout=15, follow_redirects=False) as client:
        response = await client.get(
            f"{_base(settings.SISTECREDITO_BASE_URL)}/transactions/{quote(transaction_id, safe='')}",
            headers={"Authorization": f"Bearer {settings.SISTECREDITOS_API_KEY}",
                     "x-store-id": settings.SISTECREDITOS_STORE_ID})
        response.raise_for_status()
        return response.json()


def verify_sistecreditos_webhook(payload: str, signature: str) -> bool:
    if not sistecreditos_enabled():
        return False
    expected = hmac.new(settings.SISTECREDITOS_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


async def get_addi_access_token() -> str:
    if not addi_enabled():
        raise ValueError("Addi no verificado")
    # TODO: validar ruta OAuth y contrato de aplicación con el proveedor.
    async with httpx.AsyncClient(timeout=15, follow_redirects=False) as client:
        response = await client.post(f"{_base(settings.ADDI_BASE_URL)}/oauth/token",
            data={"grant_type": "client_credentials", "client_id": settings.ADDI_CLIENT_ID,
                  "client_secret": settings.ADDI_CLIENT_SECRET})
        response.raise_for_status()
        return response.json()["access_token"]


async def create_addi_application(order_number, amount, customer_email, customer_name, customer_phone, items):
    if not addi_enabled():
        raise ValueError("Addi no verificado")
    token = await get_addi_access_token()
    payload = {"orderId": order_number, "totalAmount": amount, "currency": "COP",
               "redirectUrl": _redirect(settings.ADDI_REDIRECT_URL, order_number, "addi"),
               "webhookUrl": settings.API_BASE_URL.rstrip("/") + "/api/v1/payments/webhook/addi",
               "client": {"email": customer_email, "firstName": customer_name.split()[0] if customer_name else "",
                          "lastName": " ".join(customer_name.split()[1:]) if customer_name else "",
                          "cellphone": customer_phone},
               "items": [{"name": i.get("name", "Producto"), "quantity": i.get("qty", 1),
                          "unitPrice": i.get("unit_price", 0), "sku": i.get("sku", "")} for i in items or []]}
    async with httpx.AsyncClient(timeout=15, follow_redirects=False) as client:
        response = await client.post(f"{_base(settings.ADDI_BASE_URL)}/applications",
                                     json=payload, headers={"Authorization": f"Bearer {token}"})
        response.raise_for_status()
        data = response.json()
        return {"url": _checkout_url(data.get("redirectUrl") or data.get("url"), token,
                                     settings.ADDI_CLIENT_SECRET, settings.ADDI_CLIENT_ID),
                "applicationId": data.get("id") or data.get("applicationId")}


async def get_addi_application(application_id: str) -> dict:
    token = await get_addi_access_token()
    async with httpx.AsyncClient(timeout=15, follow_redirects=False) as client:
        response = await client.get(f"{_base(settings.ADDI_BASE_URL)}/applications/{quote(application_id, safe='')}",
                                    headers={"Authorization": f"Bearer {token}"})
        response.raise_for_status()
        return response.json()


def verify_addi_webhook(payload: str, signature: str) -> bool:
    if not addi_enabled():
        return False
    expected = hmac.new(settings.ADDI_WEBHOOK_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)
