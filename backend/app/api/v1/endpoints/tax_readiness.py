"""Configuración tributaria DIAN, exclusivamente preparatoria.

No conecta con DIAN, no emite XML, no asigna numeración fiscal ni calcula
impuestos en órdenes. Debe ser revisada por el responsable tributario.
"""
import re
from datetime import datetime
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator
from sqlalchemy.orm import Session

from app.core.deps import require_admin
from app.db.session import get_db
from app.models.models import Product, ProductTaxProfile, TaxIssuerProfile, User

router = APIRouter(prefix="/tax-readiness", tags=["Configuración tributaria"])


class IssuerIn(BaseModel):
    legal_name: str = Field(min_length=3, max_length=200)
    tax_id: str = Field(pattern=r"^[0-9]{5,15}$")
    verification_digit: str | None = Field(default=None, pattern=r"^[0-9]$")
    person_type: Literal["natural", "juridica"]
    tax_regime: str = Field(min_length=3, max_length=60)
    fiscal_responsibilities: list[str] = Field(min_length=1, max_length=20)
    economic_activities: list[str] = Field(min_length=1, max_length=20)
    fiscal_address: str = Field(min_length=5, max_length=350)
    city: str = Field(min_length=2, max_length=100)
    department: str = Field(min_length=2, max_length=100)
    contact_email: EmailStr
    operation_mode: Literal["pending", "free_dian", "own_software", "tech_provider"]
    provider_name: str | None = Field(default=None, max_length=120)

    @field_validator("legal_name", "tax_regime", "fiscal_address", "city", "department")
    @classmethod
    def strip_required(cls, value):
        value = value.strip()
        if len(value) < 2:
            raise ValueError("Dato requerido")
        return value

    @field_validator("fiscal_responsibilities", "economic_activities")
    @classmethod
    def validate_codes(cls, value):
        result = [code.strip().upper() for code in value]
        if any(not re.fullmatch(r"[A-Z0-9.-]{1,15}", x) for x in result):
            raise ValueError("Los códigos deben ser alfanuméricos")
        if len(set(result)) != len(result):
            raise ValueError("Código duplicado")
        return result

    @model_validator(mode="after")
    def validate_provider(self):
        if self.operation_mode == "tech_provider" and not (self.provider_name or "").strip():
            raise ValueError("Indica el proveedor tecnológico propuesto")
        return self


class IssuerOut(IssuerIn):
    id: int
    readiness_status: str
    model_config = {"from_attributes": True}


class TaxProductIn(BaseModel):
    tax_treatment: Literal["pending", "taxed", "exempt", "excluded", "not_subject"]
    tariff_code: str | None = Field(default=None, max_length=40)
    tax_rate: Decimal | None = Field(default=None, ge=0, le=100, max_digits=7, decimal_places=4)
    accounting_note: str | None = Field(default=None, max_length=500)
    reviewed_by_accountant: bool = False

    @model_validator(mode="after")
    def validate_tax_rate(self):
        if self.tax_treatment == "taxed" and self.tax_rate is None:
            raise ValueError("Indica una tasa revisada por el contador")
        if self.tax_treatment != "taxed" and self.tax_rate is not None:
            raise ValueError("No registrar tasas para tratamientos no gravados")
        return self


class TaxProductOut(TaxProductIn):
    id: int
    product_id: int
    model_config = {"from_attributes": True}


def _issuer(db: Session) -> TaxIssuerProfile | None:
    # Solo hay un emisor en la instancia de HJStoreVP; sin multitenencia.
    return db.get(TaxIssuerProfile, 1)


@router.get("/issuer", response_model=IssuerOut | None)
def issuer_profile(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    return _issuer(db)


@router.put("/issuer", response_model=IssuerOut)
def save_issuer(
    data: IssuerIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    issuer = db.query(TaxIssuerProfile).filter(
        TaxIssuerProfile.id == 1
    ).with_for_update().first()
    if issuer is None:
        # ID fijo + PK preservan un único emisor incluso en alta concurrente.
        issuer = TaxIssuerProfile(id=1)
        db.add(issuer)
    for key, value in data.model_dump(mode="python").items():
        setattr(issuer, key, str(value) if key == "contact_email" else value)
    # Guardar perfil NO acredita habilitación ni puede habilitar la emisión.
    issuer.readiness_status = "draft"
    db.commit()
    db.refresh(issuer)
    return issuer


@router.get("/products", response_model=list[TaxProductOut])
def tax_products(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    return db.query(ProductTaxProfile).order_by(ProductTaxProfile.product_id).limit(500).all()


@router.put("/products/{product_id}", response_model=TaxProductOut)
def save_product_tax(
    product_id: int,
    data: TaxProductIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    record = db.query(ProductTaxProfile).filter(
        ProductTaxProfile.product_id == product_id
    ).with_for_update().first()
    if record is None:
        record = ProductTaxProfile(product_id=product_id)
        db.add(record)
    for key, value in data.model_dump().items():
        setattr(record, key, value)
    db.commit()
    db.refresh(record)
    return record


@router.get("/readiness")
def fiscal_readiness(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    issuer = _issuer(db)
    products_total = db.query(Product).filter(Product.active.is_(True)).count()
    reviewed = db.query(ProductTaxProfile).join(
        Product, Product.id == ProductTaxProfile.product_id
    ).filter(
        Product.active.is_(True),
        ProductTaxProfile.reviewed_by_accountant.is_(True),
        ProductTaxProfile.tax_treatment != "pending",
    ).count()
    checks = {
        "issuer_profile": issuer is not None,
        "operation_mode_selected": bool(
            issuer and issuer.operation_mode != "pending"
        ),
        "all_active_products_classified": reviewed == products_total,
        "dian_provider_verified": False,
        "certificate_configured": False,
        "authorized_numbering_verified": False,
        "dian_habilitation_verified": False,
        "real_invoice_issuance_enabled": False,
    }
    return {
        "status": "preparation_only",
        "checks": checks,
        "classified_products": reviewed,
        "active_products": products_total,
        "can_issue_electronic_invoices": False,
        "message": (
            "La configuración es preliminar. Este módulo no tiene conexión DIAN "
            "ni permite emitir facturas electrónicas o notas crédito oficiales."
        ),
    }
