"""Configuración pública del comercio; identidad, contenido y políticas."""
from typing import Optional
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.core.deps import require_super_admin
from app.core.config import settings
from app.api.v1.endpoints.images import normalize_image, MAX_SIZE_BYTES
from app.db.session import get_db
from app.models.models import StorefrontSettings, User

router = APIRouter(prefix="/storefront-settings", tags=["Configuración de tienda"])
ROW_ID = 1

DEFAULTS = {
    "store_name": "HJStoreVP",
    "tagline": "Estilo propio",
    "announcement": "DESCUBRE LA NUEVA COLECCIÓN · ENVÍOS A TODO COLOMBIA",
    "hero_eyebrow": "HJSTOREVP / NUEVA TEMPORADA",
    "hero_title": "EL ESTILO NO SE EXPLICA. SE LLEVA.",
    "hero_description": "Una selección de gorras, perfumes, relojes y accesorios para marcar tu propio ritmo.",
    "hero_button": "EXPLORAR COLECCIÓN",
    "hero_image_url": "",
    "logo_url": "",
    "contact_email": "",
    "contact_phone": "",
    "contact_whatsapp": "",
    "instagram_url": "",
    "facebook_url": "",
    "tiktok_url": "",
    "footer_description": "Una selección con carácter. Gorras, perfumes, relojes y accesorios para todos los estilos.",
    "shipping_policy": "",
    "returns_policy": "",
    "privacy_policy": "",
    "terms_policy": "",
}

class SettingsPayload(BaseModel):
    store_name: str = Field(min_length=1, max_length=100)
    tagline: str = Field(max_length=180)
    announcement: str = Field(max_length=220)
    hero_eyebrow: str = Field(max_length=120)
    hero_title: str = Field(max_length=160)
    hero_description: str = Field(max_length=500)
    hero_button: str = Field(max_length=60)
    hero_image_url: str = Field(max_length=500)
    logo_url: str = Field(max_length=500)
    contact_email: str = Field(max_length=254)
    contact_phone: str = Field(max_length=50)
    contact_whatsapp: str = Field(max_length=30)
    instagram_url: str = Field(max_length=300)
    facebook_url: str = Field(max_length=300)
    tiktok_url: str = Field(max_length=300)
    footer_description: str = Field(max_length=500)
    shipping_policy: str = Field(max_length=12000)
    returns_policy: str = Field(max_length=12000)
    privacy_policy: str = Field(max_length=12000)
    terms_policy: str = Field(max_length=12000)

    @field_validator("*")
    @classmethod
    def normalize(cls, value: str, info):
        value = value.strip()
        if "\x00" in value:
            raise ValueError("No se aceptan caracteres de control")
        if info.field_name in {"hero_image_url", "logo_url"} and value:
            from urllib.parse import urlsplit
            if value.startswith("/uploads/branding/") and ".." not in value and "\\" not in value:
                return value
            parts = urlsplit(value)
            if parts.scheme != "https" or not parts.hostname or parts.username or parts.password:
                raise ValueError("Usa una URL HTTPS o una imagen subida al catálogo")
        if info.field_name in {"instagram_url", "facebook_url", "tiktok_url"} and value:
            from urllib.parse import urlsplit
            parts = urlsplit(value)
            if parts.scheme != "https" or not parts.hostname or parts.username or parts.password:
                raise ValueError("El enlace de red social debe usar HTTPS")
        if info.field_name == "contact_email" and value:
            if "@" not in value or "\n" in value or "\r" in value:
                raise ValueError("Correo de contacto inválido")
        if info.field_name == "contact_whatsapp" and value:
            if not value.isdecimal() or not 7 <= len(value) <= 15:
                raise ValueError("WhatsApp debe llevar solo indicativo y dígitos")
        return value


def public_settings(db: Session) -> dict:
    row = db.get(StorefrontSettings, ROW_ID)
    return {**DEFAULTS, **(row.settings_data or {})} if row else dict(DEFAULTS)


@router.get("/public")
def get_public_settings(db: Session = Depends(get_db)):
    return public_settings(db)


@router.get("/admin")
def get_admin_settings(
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    row = db.get(StorefrontSettings, ROW_ID)
    return {
        "settings": public_settings(db),
        "updated_at": row.updated_at if row else None,
        "updated_by": row.updated_by if row else None,
    }


@router.put("/admin")
def update_admin_settings(
    payload: SettingsPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    row = db.query(StorefrontSettings).filter(StorefrontSettings.id == ROW_ID).with_for_update().first()
    if row is None:
        row = StorefrontSettings(id=ROW_ID, settings_data=payload.model_dump(), updated_by=current_user.id)
        db.add(row)
    else:
        row.settings_data = payload.model_dump()
        row.updated_by = current_user.id
        row.updated_at = datetime.utcnow()
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="La configuración fue modificada simultáneamente, vuelve a cargar")
    return public_settings(db)


@router.post("/admin/upload-image", status_code=201)
async def upload_brand_image(
    file: UploadFile = File(...),
    _: User = Depends(require_super_admin),
):
    if settings.STORAGE_BACKEND != "local":
        raise HTTPException(status_code=409, detail="Configura almacenamiento de imágenes antes de subir")
    raw = await file.read(MAX_SIZE_BYTES + 1)
    data, ext = normalize_image(raw)
    folder = Path(settings.UPLOAD_DIR).resolve() / "branding"
    folder.mkdir(parents=True, exist_ok=True)
    name = f"{uuid4().hex}.{ext}"
    target = folder / name
    with target.open("xb") as handle:
        handle.write(data)
    return {"url": f"/uploads/branding/{name}"}
