"""
Endpoints de pagos — Wompi + Sistecréditos + Addi.
"""
import json
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session, joinedload
from datetime import datetime
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
    redirect_base = "http://localhost:5173/pago-confirmado"
    method = data.method

    # ── Wompi ─────────────────────────────────────────────────
    if method == "wompi":
        is_wompi_enabled = wompi_enabled()
        redirect = settings.WOMPI_REDIRECT_URL or redirect_base

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
        redirect = settings.SISTECREDITOS_REDIRECT_URL or redirect_base
        url = build_sistecreditos_url(
            order_number=order.order_number,
            amount=amount,
            customer_email=current_user.email,
            customer_name=current_user.full_name,
            customer_phone=data.customer_phone or current_user.phone or "",
            customer_id=data.customer_id or "",
        )
        if sistecreditos_enabled():
            order.payment_method = "sistecreditos"
            db.commit()
        return InitiatePaymentResponse(
            order_number=order.order_number, method="sistecreditos",
            checkout_url=url, amount=amount, enabled=sistecreditos_enabled(),
        )

    # ── Addi ──────────────────────────────────────────────────
    elif method == "addi":
        items = [
            {
                "name":       oi.product_name,
                "qty":        oi.qty,
                "unit_price": float(oi.unit_price),
                "sku":        oi.product_sku,
            }
            for oi in order.items
        ]
        result = await create_addi_application(
            order_number=order.order_number,
            amount=amount,
            customer_email=current_user.email,
            customer_name=current_user.full_name,
            customer_phone=data.customer_phone or current_user.phone or "",
            items=items,
        )
        # Guardar el ID de la aplicación Addi en la orden para seguimiento
        order.payment_ref = result.get("applicationId")
        if addi_enabled():
            order.payment_method = "addi"
        db.commit()

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
    try:
        event = await request.json()
    except (ValueError, json.JSONDecodeError):
        raise HTTPException(status_code=400, detail="Evento JSON inválido")
    if not isinstance(event, dict) or event.get("event") != "transaction.updated":
        return {"status": "ignored"}
    expected_env = "test" if settings.WOMPI_ENV == "sandbox" else "prod"
    if event.get("environment") != expected_env:
        raise HTTPException(status_code=401, detail="Ambiente de evento incorrecto")
    if not verify_wompi_sig(event, request.headers.get("x-event-checksum", "")):
        raise HTTPException(status_code=401, detail="Firma Wompi inválida")

    event_tx = event.get("data", {}).get("transaction", {})
    if not isinstance(event_tx, dict) or not event_tx.get("id"):
        raise HTTPException(status_code=400, detail="Transacción inválida")
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

@router.post("/webhook/sistecreditos", status_code=status.HTTP_200_OK)
async def sistecreditos_webhook(request: Request, db: Session = Depends(get_db)):
    body = await request.body()
    payload_str = body.decode("utf-8")
    signature   = request.headers.get("x-signature", "")

    if not verify_sistecreditos_webhook(payload_str, signature):
        raise HTTPException(status_code=401, detail="Firma inválida")

    try:
        event = json.loads(payload_str)
    except Exception:
        raise HTTPException(status_code=400, detail="Payload inválido")

    # Sistecréditos envía: orderId, status, transactionId
    order_id   = event.get("orderId") or event.get("order_id")
    sc_status  = event.get("status", "").upper()
    tx_id      = event.get("transactionId") or event.get("transaction_id")

    if not order_id:
        return {"status": "ignored"}

    order = db.query(Order).filter(
        Order.order_number == order_id, Order.channel == OrderChannel.WEB,
    ).first()
    if not order:
        return {"status": "order_not_found"}
    order = lock_web_order(db, order.id)

    if sc_status in ["APPROVED", "DISBURSED", "ACTIVE"]:
        if order.status == OrderStatus.CANCELLED:
            return {"status": "manual_review", "reason": "late_payment"}
        mark_paid(db, order, "sistecreditos", str(tx_id) if tx_id else None)
    elif sc_status in ["REJECTED", "CANCELLED", "EXPIRED"]:
        if order.status == OrderStatus.PENDING:
            try:
                cancel_web_order(db, order, f"Sistecréditos {sc_status}", provider_confirmed_failure=True)
            except HTTPException as exc:
                if exc.status_code == 409:
                    return {"status": "manual_review", "reason": "legacy_reservation"}
                raise
        elif order.status != OrderStatus.CANCELLED:
            return {"status": "ignored", "reason": "final_order"}
    else:
        return {"status": "ignored", "reason": "unhandled_event"}
    db.commit()
    return {"status": "processed"}


# ── Webhook: Addi ─────────────────────────────────────────────────────────────

@router.post("/webhook/addi", status_code=status.HTTP_200_OK)
async def addi_webhook(request: Request, db: Session = Depends(get_db)):
    body = await request.body()
    payload_str = body.decode("utf-8")
    signature   = request.headers.get("x-addi-signature", "")

    if not verify_addi_webhook(payload_str, signature):
        raise HTTPException(status_code=401, detail="Firma inválida")

    try:
        event = json.loads(payload_str)
    except Exception:
        raise HTTPException(status_code=400, detail="Payload inválido")

    # Addi envía: orderId, status, applicationId
    order_id    = event.get("orderId") or event.get("order_id")
    addi_status = event.get("status", "").upper()
    app_id      = event.get("applicationId") or event.get("id")

    if not order_id:
        return {"status": "ignored"}

    order = db.query(Order).filter(
        Order.order_number == order_id, Order.channel == OrderChannel.WEB,
    ).first()
    if not order:
        return {"status": "order_not_found"}
    order = lock_web_order(db, order.id)

    if addi_status in ["APPROVED", "PAID", "ACTIVE"]:
        if order.status == OrderStatus.CANCELLED:
            return {"status": "manual_review", "reason": "late_payment"}
        mark_paid(db, order, "addi", str(app_id) if app_id else None)
    elif addi_status in ["REJECTED", "CANCELLED", "EXPIRED"]:
        if order.status == OrderStatus.PENDING:
            try:
                cancel_web_order(db, order, f"Addi {addi_status}", provider_confirmed_failure=True)
            except HTTPException as exc:
                if exc.status_code == 409:
                    return {"status": "manual_review", "reason": "legacy_reservation"}
                raise
        elif order.status != OrderStatus.CANCELLED:
            return {"status": "ignored", "reason": "final_order"}
    else:
        return {"status": "ignored", "reason": "unhandled_event"}
    db.commit()
    return {"status": "processed"}


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
        "payment_ref":    order.payment_ref,
    }


# ── Demo: confirmar sin pago real (solo desarrollo) ───────────────────────────

@router.post("/confirm-demo")
async def confirm_demo(
    data: InitiatePaymentRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if settings.ENVIRONMENT != "development":
        raise HTTPException(status_code=404, detail="Not found")

    order = db.query(Order).filter(
        Order.order_number == data.order_number,
        Order.customer_id == current_user.id,
    ).first()

    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    if order.status != OrderStatus.PENDING:
        raise HTTPException(status_code=409, detail="Solo se pueden confirmar pedidos pendientes")

    order = lock_web_order(db, order.id)
    mark_paid(db, order, f"demo-{data.method}", f"DEMO-{order.order_number}")
    db.commit()

    return {"status": "paid", "order_number": order.order_number}
