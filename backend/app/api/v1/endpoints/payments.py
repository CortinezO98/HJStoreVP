"""
Endpoints de pagos — Wompi + Sistecréditos + Addi.
"""
import json
import uuid
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session, joinedload
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pydantic import BaseModel
from typing import Optional

from app.db.session import get_db
from app.core.deps import get_current_user
from app.core.config import settings
from app.models.models import User, Order, OrderStatus, OrderChannel, OrderItem
from app.services.stock_reservations import cancel_web_order, lock_web_order, mark_paid
from app.services.wompi import (
    build_checkout_url, verify_webhook_signature as verify_wompi_sig,
    get_transaction as get_wompi_transaction, wompi_enabled,
)
from app.services.credito import (
    build_sistecreditos_url, sistecreditos_enabled,
    create_addi_application, addi_enabled,
    verify_sistecreditos_webhook, verify_addi_webhook,
    get_sistecreditos_transaction, get_addi_application,
)

router = APIRouter(prefix="/payments", tags=["Pagos"])

# Los webhooks no transportan archivos. Limitar payload antes de decodificar
# JSON/HMAC evita que un remitente anónimo consuma memoria sin límite.
MAX_WEBHOOK_BODY_BYTES = 128 * 1024


async def read_bounded_webhook(request: Request) -> bytes:
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            declared = int(content_length)
        except ValueError:
            raise HTTPException(status_code=400, detail="Content-Length inválido")
        if declared < 0:
            raise HTTPException(status_code=400, detail="Content-Length inválido")
        if declared > MAX_WEBHOOK_BODY_BYTES:
            raise HTTPException(status_code=413, detail="Webhook demasiado grande")

    size = 0
    chunks = []
    async for chunk in request.stream():
        size += len(chunk)
        if size > MAX_WEBHOOK_BODY_BYTES:
            raise HTTPException(status_code=413, detail="Webhook demasiado grande")
        chunks.append(chunk)
    if not size:
        raise HTTPException(status_code=400, detail="Webhook vacío")
    return b"".join(chunks)



# ── Schemas ───────────────────────────────────────────────────────────────────

class InitiatePaymentRequest(BaseModel):
    order_number: str
    method: str = "wompi"   # "wompi" | "sistecreditos" | "addi"
    customer_phone: Optional[str] = None
    customer_id: Optional[str] = None   # Cédula — requerida por Sistecréditos


class PaymentMethodInfo(BaseModel):
    id: str
    name: str
    description: str
    enabled: bool
    logo: str


class InitiatePaymentResponse(BaseModel):
    order_number: str
    method: str
    checkout_url: str
    amount: float
    currency: str = "COP"
    enabled: bool


# ── Endpoint: métodos disponibles ─────────────────────────────────────────────

@router.get("/methods")
def get_payment_methods():
    """
    Retorna los métodos de pago disponibles y su estado de activación.
    El frontend usa esto para mostrar u ocultar opciones de pago.
    """
    return [
        PaymentMethodInfo(
            id="wompi",
            name="Wompi",
            description="Tarjeta débito, crédito o PSE",
            enabled=wompi_enabled(),
            logo="/logos/wompi.svg",
        ),
        PaymentMethodInfo(
            id="sistecreditos",
            name="Sistecréditos",
            description="Crédito a cuotas sin tarjeta",
            enabled=sistecreditos_enabled(),
            logo="/logos/sistecreditos.svg",
        ),
        PaymentMethodInfo(
            id="addi",
            name="Addi",
            description="Crédito instantáneo con tu cédula",
            enabled=addi_enabled(),
            logo="/logos/addi.svg",
        ),
    ]


# ── Endpoint: iniciar pago ────────────────────────────────────────────────────

@router.post("/initiate", response_model=InitiatePaymentResponse)
async def initiate_payment(
    data: InitiatePaymentRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Inicia el proceso de pago con el método seleccionado."""
    order = db.query(Order).filter(
        Order.order_number == data.order_number,
        Order.customer_id == current_user.id,
        Order.channel == OrderChannel.WEB,
    ).options(joinedload(Order.items)).first()

    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")

    # Bloqueo compatible con cancelación y webhooks concurrentes.
    order = lock_web_order(db, order.id)

    if order.status != OrderStatus.PENDING:
        raise HTTPException(
            status_code=400,
            detail=f"Esta orden ya tiene estado: {order.status.value}"
        )

    # Registrar método iniciado. Evita liberar stock mientras una pasarela
    # todavía puede confirmar un cobro; no equivale a confirmar el pago.
    if order.payment_method and order.payment_method != data.method:
        raise HTTPException(
            status_code=409,
            detail="Ya hay un método de pago iniciado para este pedido; verifica su estado",
        )

    amount = float(order.total_amount)
    amount_cents = int(order.total_amount * 100)
    method = data.method

    # ── Wompi ─────────────────────────────────────────────────
    if method == "wompi":
        is_wompi_enabled = wompi_enabled()
        redirect = settings.WOMPI_REDIRECT_URL
        if not redirect:
            raise HTTPException(status_code=503, detail="Redirección Wompi no configurada")

        if not is_wompi_enabled:
            raise HTTPException(status_code=503, detail="Wompi no está configurado")
        try:
            url = build_checkout_url(
                order_number=order.order_number,
                amount_in_cents=amount_cents,
                customer_email=current_user.email,
                customer_name=current_user.full_name,
                redirect_url=f"{redirect}{'&' if '?' in redirect else '?'}order={order.order_number}&provider=wompi",
            )
        except ValueError:
            raise HTTPException(status_code=503, detail="Configuración Wompi inválida")
        order.payment_method = "wompi"
        db.commit()
        return InitiatePaymentResponse(
            order_number=order.order_number, method="wompi",
            checkout_url=url, amount=amount, enabled=is_wompi_enabled,
        )

    # ── Sistecréditos ─────────────────────────────────────────
    elif method == "sistecreditos":
        if not sistecreditos_enabled():
            raise HTTPException(status_code=503, detail="Sistecréditos no está configurado")
        try:
            url = await build_sistecreditos_url(
            order_number=order.order_number,
            amount=amount,
            customer_email=current_user.email,
            customer_name=current_user.full_name,
            customer_phone=data.customer_phone or current_user.phone or "",
            customer_id=data.customer_id or "",
            )
        except (httpx.HTTPError, ValueError, KeyError, AttributeError, TypeError):
            raise HTTPException(status_code=502, detail="No fue posible iniciar Sistecréditos") from None
        if sistecreditos_enabled():
            order.payment_method = "sistecreditos"
            db.commit()
        return InitiatePaymentResponse(
            order_number=order.order_number, method="sistecreditos",
            checkout_url=url, amount=amount, enabled=sistecreditos_enabled(),
        )

    # ── Addi ──────────────────────────────────────────────────
    elif method == "addi":
        if not addi_enabled():
            raise HTTPException(status_code=503, detail="Addi no está configurado")
        # Addi crea un recurso externo real por cada solicitud. No repetir
        # aplicaciones ya asociadas: el cliente debe consultar primero la
        # solicitud existente para evitar varias aprobaciones del mismo pedido.
        if order.payment_method == "addi" and order.payment_ref:
            raise HTTPException(
                status_code=409,
                detail=(
                    "Este pedido ya tiene una solicitud Addi iniciada. "
                    "Verifica su estado antes de crear otra aplicación."
                ),
            )
        # Registrar intención ANTES de invocar al proveedor. Si la llamada
        # remota funciona pero la respuesta se pierde, no generar otra
        # solicitud que pueda producir una segunda aprobación.
        attempt_marker = "INITIATING-" + uuid.uuid4().hex
        order.payment_method = "addi"
        order.payment_ref = attempt_marker
        db.commit()
        items = [
            {
                "name":       oi.product_name,
                "qty":        oi.qty,
                "unit_price": float(oi.unit_price),
                "sku":        oi.product_sku,
            }
            for oi in order.items
        ]
        try:
            result = await create_addi_application(
            order_number=order.order_number,
            amount=amount,
            customer_email=current_user.email,
            customer_name=current_user.full_name,
            customer_phone=data.customer_phone or current_user.phone or "",
            items=items,
            )
        except (httpx.HTTPError, ValueError, KeyError, AttributeError, TypeError):
            raise HTTPException(status_code=502, detail="No fue posible iniciar Addi") from None
        # Guardar el ID de la aplicación Addi en la orden para seguimiento
        if not result.get("applicationId") or not result.get("url"):
            raise HTTPException(status_code=502, detail="Addi no devolvió una solicitud válida")
        # Puede haber llegado un webhook firmado durante la llamada remota.
        # Nunca sobrescribir una referencia confirmada por el proveedor.
        order = lock_web_order(db, order.id)
        if order.payment_ref == attempt_marker and order.status == OrderStatus.PENDING:
            order.payment_ref = str(result["applicationId"])
            db.commit()
        elif order.payment_ref != str(result["applicationId"]):
            raise HTTPException(
                status_code=409,
                detail="La solicitud cambió durante la iniciación; revisar el proveedor",
            )

        return InitiatePaymentResponse(
            order_number=order.order_number, method="addi",
            checkout_url=result["url"], amount=amount, enabled=addi_enabled(),
        )

    else:
        raise HTTPException(status_code=400, detail=f"Método de pago no válido: {method}")


# ── Wompi: conciliación y webhook ───────────────────────────────────────────


def apply_wompi_transaction(db: Session, order: Order, tx: dict) -> dict:
    """Aplicar solo una transacción consultada con llave privada en Wompi."""
    tx_id = tx.get("id")
    reference = tx.get("reference")
    amount = tx.get("amount_in_cents")
    currency = tx.get("currency")
    provider_status = tx.get("status")

    if not tx_id or not reference or tx.get("currency") != "COP":
        raise HTTPException(status_code=409, detail="Datos Wompi incompletos; conciliación requerida")
    if str(reference) != order.order_number or type(amount) is not int or amount != int(order.total_amount * 100):
        raise HTTPException(status_code=409, detail="Referencia o monto inconsistente; conciliación requerida")
    if order.payment_method not in (None, "wompi"):
        raise HTTPException(status_code=409, detail="El pedido usa otra pasarela")
    if order.payment_ref and str(order.payment_ref) != str(tx_id):
        raise HTTPException(status_code=409, detail="Otra transacción ya vinculada al pedido")

    if provider_status == "APPROVED":
        if order.status == OrderStatus.CANCELLED:
            raise HTTPException(status_code=409, detail="Pago tardío en pedido cancelado; conciliación requerida")
        changed = mark_paid(db, order, "wompi", str(tx_id))
        return {"status": "paid", "changed": changed}
    if provider_status in ("DECLINED", "ERROR", "VOIDED"):
        if order.status == OrderStatus.PENDING:
            changed = cancel_web_order(
                db, order, f"Wompi {provider_status}", provider_confirmed_failure=True
            )
            order.payment_ref = str(tx_id)
            return {"status": "cancelled", "changed": changed}
        if order.status == OrderStatus.CANCELLED:
            return {"status": "cancelled", "changed": False}
        raise HTTPException(status_code=409, detail="Pedido pagado con resultado contradictorio")
    return {"status": "pending", "changed": False}


@router.post("/webhook/wompi", status_code=status.HTTP_200_OK)
async def wompi_webhook(request: Request, db: Session = Depends(get_db)):
    if not wompi_enabled():
        raise HTTPException(status_code=503, detail="Wompi no configurado")
    body = await read_bounded_webhook(request)
    try:
        event = json.loads(body)
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Evento JSON inválido")
    if not isinstance(event, dict) or event.get("event") != "transaction.updated":
        return {"status": "ignored"}
    expected_env = "test" if settings.WOMPI_ENV == "sandbox" else "prod"
    if event.get("environment") != expected_env:
        raise HTTPException(status_code=401, detail="Ambiente de evento incorrecto")
    if not verify_wompi_sig(event, request.headers.get("x-event-checksum", "")):
        raise HTTPException(status_code=401, detail="Firma Wompi inválida")

    data_block = event.get("data")
    if not isinstance(data_block, dict):
        raise HTTPException(status_code=400, detail="Datos de evento inválidos")
    event_tx = data_block.get("transaction")
    if not isinstance(event_tx, dict) or not isinstance(event_tx.get("id"), (str, int)):
        raise HTTPException(status_code=400, detail="Transacción inválida")
    if isinstance(event_tx.get("id"), bool) or not str(event_tx["id"]).strip():
        raise HTTPException(status_code=400, detail="ID de transacción inválido")
    try:
        tx = await get_wompi_transaction(str(event_tx["id"]))
    except (httpx.HTTPError, ValueError, KeyError):
        raise HTTPException(status_code=503, detail="No fue posible consultar Wompi")
    if tx.get("reference") != event_tx.get("reference"):
        raise HTTPException(status_code=409, detail="Referencia del evento no coincide")

    order = db.query(Order).filter(
        Order.order_number == tx.get("reference"),
        Order.channel == OrderChannel.WEB,
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")

    order = lock_web_order(db, order.id)
    result = apply_wompi_transaction(db, order, tx)
    if result["changed"]:
        db.commit()
    return {"status": result["status"]}


class WompiReconcileRequest(BaseModel):
    order_number: str
    transaction_id: str


@router.post("/wompi/reconcile")
async def reconcile_wompi(
    data: WompiReconcileRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """El cliente puede pedir consulta, pero jamás definir el estado de pago."""
    if not wompi_enabled():
        raise HTTPException(status_code=503, detail="Wompi no configurado")
    order = db.query(Order).filter(
        Order.order_number == data.order_number,
        Order.customer_id == current_user.id,
        Order.channel == OrderChannel.WEB,
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    try:
        tx = await get_wompi_transaction(data.transaction_id)
    except (httpx.HTTPError, ValueError, KeyError):
        raise HTTPException(status_code=503, detail="No fue posible verificar la transacción")
    order = lock_web_order(db, order.id)
    result = apply_wompi_transaction(db, order, tx)
    if result["changed"]:
        db.commit()
    return result


# ── Webhook: Sistecréditos ────────────────────────────────────────────────────

def _credit_id(value):
    if not isinstance(value, (str, int)) or isinstance(value, bool):
        raise ValueError("Identificador inválido")
    value = str(value)
    if not (1 <= len(value) <= 180) or not all(c.isascii() and (c.isalnum() or c in "-_") for c in value):
        raise ValueError("Identificador inválido")
    return value


def _credit_amount(value):
    if isinstance(value, bool) or not isinstance(value, (str, int, float, Decimal)):
        raise ValueError("Monto inválido")
    amount = Decimal(str(value))
    if not amount.is_finite() or amount <= 0 or amount != amount.quantize(Decimal("0.01")):
        raise ValueError("Monto inválido")
    return amount


async def _credit_webhook(request, db, provider, verify, fetch, signature_header, id_field, amount_field):
    body = await read_bounded_webhook(request)
    try:
        payload = body.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="Codificación de webhook inválida") from None
    if not verify(payload, request.headers.get(signature_header, "")):
        raise HTTPException(status_code=401, detail="Firma inválida")
    try:
        event = json.loads(payload)
        if not isinstance(event, dict):
            raise ValueError("Evento inválido")
        reference = event.get("orderId")
        if not isinstance(reference, str) or not 1 <= len(reference) <= 50:
            raise ValueError("Pedido inválido")
        transaction_id = _credit_id(event.get(id_field))
        event_status = event.get("status")
        if not isinstance(event_status, str) or not 1 <= len(event_status) <= 40:
            raise ValueError("Estado inválido")
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Evento inválido o incompleto") from None

    # La firma solo autentica el aviso; el estado comercial proviene de la API.
    try:
        tx = await fetch(transaction_id)
    except (httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError):
        raise HTTPException(status_code=503, detail="No fue posible verificar la transacción") from None
    try:
        if not isinstance(tx, dict):
            raise ValueError("Respuesta inválida")
        confirmed_id = _credit_id(tx.get(id_field))
        confirmed_status = tx.get("status")
        amount = _credit_amount(tx.get(amount_field))
        if (confirmed_id != transaction_id or tx.get("orderId") != reference or
                tx.get("currency") != "COP" or not isinstance(confirmed_status, str) or
                confirmed_status.upper() != event_status.upper()):
            raise ValueError("Datos contradictorios")
    except (ValueError, TypeError, InvalidOperation):
        raise HTTPException(status_code=409, detail="Datos del proveedor inconsistentes; conciliación requerida") from None

    order = db.query(Order).filter(Order.order_number == reference, Order.channel == OrderChannel.WEB).first()
    if not order:
        return {"status": "order_not_found"}
    order = lock_web_order(db, order.id)
    if order.payment_method != provider or amount != Decimal(str(order.total_amount)):
        raise HTTPException(status_code=409, detail="Proveedor o monto incompatible; conciliación requerida")
    if order.payment_ref and order.payment_ref != transaction_id:
        # Una iniciación Addi incierta solo se vincula con verificación independiente.
        if not (provider == "addi" and order.payment_ref.startswith("INITIATING-")):
            raise HTTPException(status_code=409, detail="Referencia incompatible")
    other = db.query(Order).filter(Order.id != order.id, Order.payment_method == provider,
                                   Order.payment_ref == transaction_id).first()
    if other:
        raise HTTPException(status_code=409, detail="Referencia ya vinculada a otro pedido")

    state = confirmed_status.upper()
    # ACTIVE no demuestra desembolso. Mantener la reserva hasta confirmación final.
    approved = {"DISBURSED"} if provider == "sistecreditos" else {"PAID"}
    failed = {"REJECTED", "CANCELLED", "EXPIRED"}
    if state in approved:
        if order.status == OrderStatus.CANCELLED:
            return {"status": "manual_review", "reason": "late_payment"}
        changed = mark_paid(db, order, provider, transaction_id)
    elif state in failed:
        if order.status == OrderStatus.CANCELLED:
            return {"status": "processed"}
        if order.status != OrderStatus.PENDING:
            raise HTTPException(status_code=409, detail="Estado final contradictorio")
        try:
            changed = cancel_web_order(db, order, f"{provider} {state}", provider_confirmed_failure=True)
        except HTTPException as exc:
            if exc.status_code == 409:
                db.rollback()
                return {"status": "manual_review", "reason": "reservation_conflict"}
            raise
        order.payment_ref = transaction_id
    else:
        return {"status": "ignored", "reason": "unconfirmed_payment"}
    if changed:
        db.commit()
    return {"status": "processed"}


@router.post("/webhook/sistecreditos", status_code=status.HTTP_200_OK)
async def sistecreditos_webhook(request: Request, db: Session = Depends(get_db)):
    return await _credit_webhook(request, db, "sistecreditos", verify_sistecreditos_webhook,
                                 get_sistecreditos_transaction, "x-signature", "transactionId", "amount")


@router.post("/webhook/addi", status_code=status.HTTP_200_OK)
async def addi_webhook(request: Request, db: Session = Depends(get_db)):
    return await _credit_webhook(request, db, "addi", verify_addi_webhook,
                                 get_addi_application, "x-addi-signature", "applicationId", "totalAmount")


# ── Consulta de estado ────────────────────────────────────────────────────────

@router.get("/status/{order_number}")
async def payment_status(
    order_number: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    order = db.query(Order).filter(
        Order.order_number == order_number,
        Order.customer_id == current_user.id,
    ).first()

    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")

    return {
        "order_number":   order.order_number,
        "status":         order.status.value,
        "total_amount":   float(order.total_amount),
        "paid_at":        order.paid_at.isoformat() if order.paid_at else None,
        "payment_method": order.payment_method,
        # No exponer el marcador técnico de una iniciación Addi incompleta.
        "payment_ref":    None if (order.payment_ref or "").startswith("INITIATING-") else order.payment_ref,
        "payment_initiation_pending": (order.payment_ref or "").startswith("INITIATING-"),
    }


# ── Demo: confirmar sin pago real (solo desarrollo) ───────────────────────────

def require_demo_payments():
    if not (settings.ALLOW_DEMO_PAYMENTS and settings.ENVIRONMENT in ("development", "test")):
        raise HTTPException(status_code=404, detail="Not found")


@router.post("/confirm-demo", include_in_schema=False, dependencies=[Depends(require_demo_payments)])
async def confirm_demo(
    data: InitiatePaymentRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_demo_payments()

    order = db.query(Order).filter(
        Order.order_number == data.order_number,
        Order.customer_id == current_user.id,
    ).first()

    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    if order.status != OrderStatus.PENDING:
        raise HTTPException(status_code=409, detail="Solo se pueden confirmar pedidos pendientes")

    order = lock_web_order(db, order.id)
    if order.payment_method:
        raise HTTPException(status_code=409, detail="Pedido con pasarela iniciada: no admite confirmación demo")
    mark_paid(db, order, f"demo-{data.method}", f"DEMO-{order.order_number}")
    db.commit()

    return {"status": "paid", "order_number": order.order_number}
