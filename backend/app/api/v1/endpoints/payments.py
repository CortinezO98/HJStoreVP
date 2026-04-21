"""
Endpoints de pagos — Wompi + Sistecréditos + Addi.
"""
import json
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session, joinedload
from datetime import datetime
from pydantic import BaseModel
from typing import Optional

from app.db.session import get_db
from app.core.deps import get_current_user
from app.core.config import settings
from app.models.models import User, Order, OrderStatus, OrderChannel, OrderItem
from app.services.wompi import (
    build_checkout_url, verify_webhook_signature as verify_wompi_sig
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
            enabled=bool(settings.WOMPI_PUBLIC_KEY and "PLACEHOLDER" not in (settings.WOMPI_PUBLIC_KEY or "")),
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

    if order.status != OrderStatus.PENDING:
        raise HTTPException(
            status_code=400,
            detail=f"Esta orden ya tiene estado: {order.status.value}"
        )

    amount = float(order.total_amount)
    amount_cents = int(order.total_amount * 100)
    redirect_base = "http://localhost:5173/pago-confirmado"
    method = data.method

    # ── Wompi ─────────────────────────────────────────────────
    if method == "wompi":
        wompi_enabled = bool(settings.WOMPI_PUBLIC_KEY and "PLACEHOLDER" not in (settings.WOMPI_PUBLIC_KEY or ""))
        redirect = settings.WOMPI_REDIRECT_URL or redirect_base

        if wompi_enabled:
            url = build_checkout_url(
                order_number=order.order_number,
                amount_in_cents=amount_cents,
                customer_email=current_user.email,
                customer_name=current_user.full_name,
                redirect_url=f"{redirect}?order={order.order_number}&provider=wompi",
            )
        else:
            url = f"http://localhost:5173/pago-demo?order={order.order_number}&provider=wompi&amount={amount}"

        return InitiatePaymentResponse(
            order_number=order.order_number, method="wompi",
            checkout_url=url, amount=amount, enabled=wompi_enabled,
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
        db.commit()

        return InitiatePaymentResponse(
            order_number=order.order_number, method="addi",
            checkout_url=result["url"], amount=amount, enabled=addi_enabled(),
        )

    else:
        raise HTTPException(status_code=400, detail=f"Método de pago no válido: {method}")


# ── Webhook: Wompi ────────────────────────────────────────────────────────────

@router.post("/webhook/wompi", status_code=status.HTTP_200_OK)
async def wompi_webhook(request: Request, db: Session = Depends(get_db)):
    body = await request.body()
    payload_str = body.decode("utf-8")
    timestamp  = request.headers.get("x-event-checksum-timestamp", "")
    signature  = request.headers.get("x-event-checksum", "")

    if not verify_wompi_sig(payload_str, timestamp, signature):
        raise HTTPException(status_code=401, detail="Firma inválida")

    try:
        event = json.loads(payload_str)
    except Exception:
        raise HTTPException(status_code=400, detail="Payload inválido")

    tx = event.get("data", {}).get("transaction", {})
    reference   = tx.get("reference")
    wompi_status = tx.get("status")
    tx_id        = tx.get("id")

    if not reference:
        return {"status": "ignored"}

    order = db.query(Order).filter(Order.order_number == reference).first()
    if not order:
        return {"status": "order_not_found"}

    if wompi_status == "APPROVED":
        order.status = OrderStatus.PAID
        order.payment_method = "wompi"
        order.payment_ref = tx_id
        order.paid_at = datetime.utcnow()
    elif wompi_status in ["DECLINED", "ERROR", "VOIDED"]:
        order.status = OrderStatus.CANCELLED
        order.payment_ref = tx_id

    db.commit()
    return {"status": "processed"}


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

    order = db.query(Order).filter(Order.order_number == order_id).first()
    if not order:
        return {"status": "order_not_found"}

    if sc_status in ["APPROVED", "DISBURSED", "ACTIVE"]:
        order.status = OrderStatus.PAID
        order.payment_method = "sistecreditos"
        order.payment_ref = tx_id
        order.paid_at = datetime.utcnow()
    elif sc_status in ["REJECTED", "CANCELLED", "EXPIRED"]:
        order.status = OrderStatus.CANCELLED
        order.payment_ref = tx_id

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

    order = db.query(Order).filter(Order.order_number == order_id).first()
    if not order:
        return {"status": "order_not_found"}

    if addi_status in ["APPROVED", "PAID", "ACTIVE"]:
        order.status = OrderStatus.PAID
        order.payment_method = "addi"
        order.payment_ref = app_id
        order.paid_at = datetime.utcnow()
    elif addi_status in ["REJECTED", "CANCELLED", "EXPIRED"]:
        order.status = OrderStatus.CANCELLED
        order.payment_ref = app_id

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

    order.status = OrderStatus.PAID
    order.payment_method = f"demo-{data.method}"
    order.payment_ref = f"DEMO-{order.order_number}"
    order.paid_at = datetime.utcnow()
    db.commit()

    return {"status": "paid", "order_number": order.order_number}
