"""
Endpoints de pagos con Wompi.
POST /payments/initiate  → Inicia el proceso de pago, retorna URL de Wompi
POST /payments/webhook   → Recibe notificaciones de Wompi cuando el pago se confirma
GET  /payments/status/{order_number} → Consulta estado de pago
"""
import json
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from datetime import datetime
from pydantic import BaseModel
from typing import Optional

from app.db.session import get_db
from app.core.deps import get_current_user
from app.core.config import settings
from app.models.models import User, Order, OrderStatus, OrderChannel
from app.services.wompi import (
    build_checkout_url, get_transaction, verify_webhook_signature
)

router = APIRouter(prefix="/payments", tags=["Pagos"])


class InitiatePaymentRequest(BaseModel):
    order_number: str


class InitiatePaymentResponse(BaseModel):
    order_number: str
    checkout_url: str
    amount: float
    currency: str = "COP"
    wompi_enabled: bool


@router.post("/initiate", response_model=InitiatePaymentResponse)
async def initiate_payment(
    data: InitiatePaymentRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Inicia el proceso de pago para una orden.
    Retorna la URL del checkout de Wompi para redirigir al cliente.
    """
    order = db.query(Order).filter(
        Order.order_number == data.order_number,
        Order.customer_id == current_user.id,
        Order.channel == OrderChannel.WEB,
    ).first()

    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")

    if order.status != OrderStatus.PENDING:
        raise HTTPException(
            status_code=400,
            detail=f"Esta orden ya tiene estado: {order.status.value}"
        )

    amount_in_cents = int(order.total_amount * 100)

    # URL de retorno después del pago
    redirect_url = settings.WOMPI_REDIRECT_URL or "http://localhost:5173/pago-confirmado"

    wompi_enabled = bool(settings.WOMPI_PUBLIC_KEY and "PLACEHOLDER" not in settings.WOMPI_PUBLIC_KEY)

    if wompi_enabled:
        checkout_url = build_checkout_url(
            order_number=order.order_number,
            amount_in_cents=amount_in_cents,
            customer_email=current_user.email,
            customer_name=current_user.full_name,
            redirect_url=f"{redirect_url}?order={order.order_number}",
        )
    else:
        # Modo demo — sin credenciales reales
        checkout_url = f"http://localhost:5173/pago-demo?order={order.order_number}&amount={order.total_amount}"

    return InitiatePaymentResponse(
        order_number=order.order_number,
        checkout_url=checkout_url,
        amount=float(order.total_amount),
        wompi_enabled=wompi_enabled,
    )


@router.post("/webhook", status_code=status.HTTP_200_OK)
async def wompi_webhook(request: Request, db: Session = Depends(get_db)):
    """
    Webhook que Wompi llama cuando ocurre un evento (pago aprobado, rechazado, etc).
    Configurar en el dashboard de Wompi:
    URL: https://tudominio.com/api/v1/payments/webhook
    """
    body = await request.body()
    payload_str = body.decode("utf-8")

    # Verificar firma
    timestamp = request.headers.get("x-event-checksum-timestamp", "")
    signature = request.headers.get("x-event-checksum", "")

    if not verify_webhook_signature(payload_str, timestamp, signature):
        raise HTTPException(status_code=401, detail="Firma del webhook inválida")

    try:
        event = json.loads(payload_str)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Payload inválido")

    event_type = event.get("event")
    transaction_data = event.get("data", {}).get("transaction", {})

    if not transaction_data:
        return {"status": "ignored"}

    reference = transaction_data.get("reference")
    wompi_status = transaction_data.get("status")
    transaction_id = transaction_data.get("id")

    if not reference:
        return {"status": "ignored"}

    # Buscar la orden por referencia (order_number)
    order = db.query(Order).filter(Order.order_number == reference).first()
    if not order:
        return {"status": "order_not_found"}

    # Actualizar estado según respuesta de Wompi
    if wompi_status == "APPROVED":
        order.status = OrderStatus.PAID
        order.payment_method = "wompi"
        order.payment_ref = transaction_id
        order.paid_at = datetime.utcnow()
        db.commit()
        return {"status": "order_paid", "order": reference}

    elif wompi_status in ["DECLINED", "ERROR", "VOIDED"]:
        order.status = OrderStatus.CANCELLED
        order.payment_ref = transaction_id
        db.commit()
        return {"status": "order_cancelled", "order": reference}

    return {"status": "event_processed"}


@router.get("/status/{order_number}")
async def payment_status(
    order_number: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Consulta el estado actual de una orden y su pago.
    El frontend llama esto cuando el cliente regresa de Wompi.
    """
    order = db.query(Order).filter(
        Order.order_number == order_number,
        Order.customer_id == current_user.id,
    ).first()

    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")

    return {
        "order_number": order.order_number,
        "status": order.status.value,
        "total_amount": float(order.total_amount),
        "paid_at": order.paid_at.isoformat() if order.paid_at else None,
        "payment_method": order.payment_method,
        "payment_ref": order.payment_ref,
    }


@router.post("/confirm-demo")
async def confirm_demo_payment(
    data: InitiatePaymentRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Solo para desarrollo: confirma una orden manualmente (simula pago aprobado).
    NO disponible en producción.
    """
    if settings.ENVIRONMENT != "development":
        raise HTTPException(status_code=404, detail="Not found")

    order = db.query(Order).filter(
        Order.order_number == data.order_number,
        Order.customer_id == current_user.id,
    ).first()

    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")

    order.status = OrderStatus.PAID
    order.payment_method = "demo"
    order.payment_ref = f"DEMO-{order.order_number}"
    order.paid_at = datetime.utcnow()
    db.commit()

    return {
        "status": "paid",
        "order_number": order.order_number,
        "message": "Pago simulado confirmado (modo desarrollo)"
    }
