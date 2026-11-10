"""Documentos comerciales INTERNOS: comprobantes y borradores de notas crédito.

Sin firma electrónica, numeración DIAN, CUFE/CUDE, transmisión ni expedición
fiscal. Nunca llamar "factura electrónica" a la salida de esta API.
"""
from datetime import datetime
from decimal import Decimal
from html import escape

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_admin
from app.db.session import get_db
from app.models.models import (
    CommercialDocument, CommercialDocumentEvent, Order, OrderItem, OrderChannel,
    OrderStatus, PostSaleCase, User, UserRole,
)

router = APIRouter(prefix="/billing", tags=["Comprobantes internos"])

PAID_ORDER_STATES = {
    OrderStatus.PAID, OrderStatus.PREPARING,
    OrderStatus.SHIPPED, OrderStatus.DELIVERED, OrderStatus.REFUNDED,
}


class DocumentOut(BaseModel):
    id: int
    document_type: str
    order_id: int
    post_sale_case_id: int | None
    internal_reference: str
    status: str
    amount: Decimal
    created_at: datetime
    model_config = {"from_attributes": True}


class DocumentEventOut(BaseModel):
    action: str
    note: str | None
    created_at: datetime
    model_config = {"from_attributes": True}


class DocumentDetailOut(DocumentOut):
    snapshot: dict
    events: list[DocumentEventOut]


def _access(db: Session, order: Order, user: User) -> None:
    if user.role in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
        return
    if (
        user.role == UserRole.CUSTOMER and order.channel == OrderChannel.WEB
        and order.customer_id == user.id
    ):
        return
    if (
        user.role == UserRole.SELLER and order.channel == OrderChannel.PHYSICAL
        and user.location_id is not None and order.location_id == user.location_id
    ):
        return
    raise HTTPException(status_code=404, detail="Documento o pedido no encontrado")


def _order_snapshot(order: Order) -> dict:
    rows = [{
        "name": item.product_name,
        "sku": item.product_sku,
        "qty": item.qty,
        "unit_price": str(item.unit_price),
        "line_total": str(item.unit_price * item.qty),
    } for item in order.items]
    return {
        "order_number": order.order_number,
        "channel": order.channel.value,
        "order_date": order.created_at.isoformat() if order.created_at else "",
        "subtotal": str(order.subtotal),
        "discount_amount": str(order.discount_amount or 0),
        "shipping_amount": str(order.shipping_amount or 0),
        "total_amount": str(order.total_amount),
        "payment_method": order.payment_method or "No informado",
        "items": rows,
    }


def _event(db: Session, document: CommercialDocument, actor: User, action: str, note: str) -> None:
    db.add(CommercialDocumentEvent(
        document_id=document.id, actor_id=actor.id, action=action, note=note,
    ))


@router.post("/receipt/{order_id}", response_model=DocumentOut)
def create_receipt(
    order_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Comprobante de compra interno, generado solo para ventas pagadas."""
    order = db.query(Order).filter(Order.id == order_id).with_for_update().first()
    if not order:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    _access(db, order, user)
    if order.status not in PAID_ORDER_STATES or order.paid_at is None and order.channel == OrderChannel.WEB:
        raise HTTPException(status_code=409, detail="Se requiere pago confirmado para generar el comprobante")

    reference = f"HJ-COMP-{order.id}"
    doc = db.query(CommercialDocument).filter(
        CommercialDocument.internal_reference == reference
    ).first()
    if doc:
        return doc

    doc = CommercialDocument(
        document_type="purchase_receipt",
        order_id=order.id, internal_reference=reference,
        status="internal", amount=order.total_amount,
        snapshot=_order_snapshot(order), created_by_id=user.id,
    )
    db.add(doc)
    db.flush()
    _event(db, doc, user, "created", "Comprobante comercial interno generado desde venta confirmada")
    db.commit()
    db.refresh(doc)
    return doc


@router.post("/credit-note-draft/{case_id}", response_model=DocumentOut)
def create_credit_note_draft(
    case_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Borrador vinculado a posventa: NO es nota crédito electrónica DIAN."""
    # Bloquear primero la orden y luego el caso, misma secuencia de posventa.
    source = db.query(PostSaleCase.order_id).filter(PostSaleCase.id == case_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Caso no encontrado")
    order = db.query(Order).filter(Order.id == source.order_id).with_for_update().first()
    case = db.query(PostSaleCase).filter(
        PostSaleCase.id == case_id
    ).with_for_update().first()
    if not order or not case or order.channel != OrderChannel.WEB:
        raise HTTPException(status_code=409, detail="Caso no elegible")
    if (
        case.kind != "return" or case.status not in ("received", "closed")
        or case.refund_status != "externally_recorded"
        or not case.refund_reference or not case.refund_amount
    ):
        raise HTTPException(
            status_code=409,
            detail="Se necesita devolución recibida y reembolso externo documentado",
        )
    if case.refund_amount <= 0 or case.refund_amount > order.total_amount:
        raise HTTPException(status_code=409, detail="Monto de ajuste inválido")
    # Vinculación documental, nunca se modifica la orden original.
    reference = f"HJ-AJUSTE-{case.id}"
    existing = db.query(CommercialDocument).filter(
        CommercialDocument.internal_reference == reference
    ).first()
    if existing:
        return existing
    original = db.query(CommercialDocument).filter(
        CommercialDocument.internal_reference == f"HJ-COMP-{order.id}"
    ).first()
    if not original:
        raise HTTPException(
            status_code=409,
            detail="Genera primero el comprobante interno de la venta original",
        )
    doc = CommercialDocument(
        document_type="credit_note_draft",
        order_id=order.id, post_sale_case_id=case.id,
        internal_reference=reference, status="draft",
        amount=case.refund_amount,
        snapshot={
            "order_number": order.order_number,
            "original_receipt": original.internal_reference,
            "case_id": case.id,
            "reason": case.reason,
            "qty": case.qty,
            "product": db.get(OrderItem, case.order_item_id).product_name if case.order_item_id else "",
            "amount": str(case.refund_amount),
            "external_refund_reference": case.refund_reference,
        },
        created_by_id=admin.id,
    )
    db.add(doc)
    db.flush()
    _event(db, doc, admin, "draft_created", "Borrador interno: pendiente de trámite tributario externo")
    db.commit()
    db.refresh(doc)
    return doc


@router.get("/mine", response_model=list[DocumentOut])
def my_documents(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role != UserRole.CUSTOMER:
        return []
    docs = (
        db.query(CommercialDocument).join(Order, Order.id == CommercialDocument.order_id)
        .filter(
            Order.customer_id == user.id,
            Order.channel == OrderChannel.WEB,
            CommercialDocument.document_type == "purchase_receipt",
        )
        .order_by(CommercialDocument.id.desc()).limit(100).all()
    )
    return docs


@router.get("/admin", response_model=list[DocumentOut])
def admin_documents(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    return db.query(CommercialDocument).order_by(
        CommercialDocument.id.desc()
    ).limit(200).all()


@router.get("/{document_id}", response_model=DocumentDetailOut)
def document_detail(
    document_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    doc = db.get(CommercialDocument, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    order = db.get(Order, doc.order_id)
    _access(db, order, user)
    if doc.document_type == "credit_note_draft" and user.role not in (
        UserRole.SUPER_ADMIN, UserRole.ADMIN
    ):
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    events = db.query(CommercialDocumentEvent).filter(
        CommercialDocumentEvent.document_id == doc.id
    ).order_by(CommercialDocumentEvent.id).all()
    return DocumentDetailOut(
        **{field: getattr(doc, field) for field in (
            "id", "document_type", "order_id", "post_sale_case_id",
            "internal_reference", "status", "amount", "created_at", "snapshot"
        )},
        events=events,
    )


@router.get("/{document_id}/print")
def print_document(
    document_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    doc = db.get(CommercialDocument, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    order = db.get(Order, doc.order_id)
    _access(db, order, user)
    if doc.document_type == "credit_note_draft" and user.role not in (
        UserRole.SUPER_ADMIN, UserRole.ADMIN
    ):
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    info = doc.snapshot or {}
    def e(value):
        return escape(str(value), quote=True)
    rows = ""
    if doc.document_type == "purchase_receipt":
        for item in info.get("items", []):
            rows += (
                "<tr><td>" + e(item.get("name", "")) + "</td><td>" +
                e(item.get("qty", "")) + "</td><td>" +
                e(item.get("unit_price", "")) + "</td><td>" +
                e(item.get("line_total", "")) + "</td></tr>"
            )
        title = "Comprobante interno de compra"
        details = (
            f"<p>Pedido: {e(info.get('order_number', ''))}</p>"
            f"<p>Subtotal: {e(info.get('subtotal', ''))} COP"
            f" | Envío: {e(info.get('shipping_amount', ''))} COP</p>"
            "<table><thead><tr><th>Artículo</th><th>Cantidad</th>"
            "<th>Precio</th><th>Total</th></tr></thead><tbody>" + rows + "</tbody></table>"
        )
    else:
        title = "Borrador interno de ajuste por devolución"
        details = (
            f"<p>Pedido: {e(info.get('order_number', ''))}</p>"
            f"<p>Comprobante relacionado: {e(info.get('original_receipt', ''))}</p>"
            f"<p>Producto: {e(info.get('product', ''))}</p>"
            f"<p>Motivo: {e(info.get('reason', ''))}</p>"
            f"<p>Cantidad: {e(info.get('qty', ''))}</p>"
        )
    html = (
        '<!doctype html><html lang="es"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<title>HJStoreVP · Documento interno</title>'
        '<style>body{font:15px Arial,sans-serif;max-width:780px;margin:35px auto;padding:20px;color:#222}'
        'h1{font-size:24px}table{width:100%;border-collapse:collapse;margin:25px 0}'
        'td,th{border-bottom:1px solid #ddd;padding:12px;text-align:left}'
        '.banner{background:#fff3dd;padding:14px;border:1px solid #dfc58d;font-weight:bold}'
        '@media print{body{margin:0}.banner{border:1px solid #555}}</style></head><body>'
        '<h2>HJSTOREVP</h2><div class="banner">DOCUMENTO INTERNO — '
        'NO ES FACTURA ELECTRÓNICA NI NOTA CRÉDITO VALIDADA POR LA DIAN</div>'
        f'<h1>{e(title)}</h1><p>Referencia interna: {e(doc.internal_reference)}</p>'
        + details + f'<h2>Importe: {e(doc.amount)} COP</h2>'
        '<p>Este documento no tiene validez como factura electrónica o nota crédito fiscal.'
        ' Para esos fines se requiere emisión y validación mediante la DIAN o un proveedor habilitado.</p>'
        '</body></html>'
    )
    return Response(
        content=html,
        media_type="text/html; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{doc.internal_reference}.html"',
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        },
    )
