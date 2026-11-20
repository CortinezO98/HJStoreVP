"""Configuración pública del comercio; identidad, contenido y políticas."""
from typing import Optional
from urllib.parse import urlsplit
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.core.deps import require_super_admin
from app.core.config import settings
from app.api.v1.endpoints.images import normalize_image, MAX_SIZE_BYTES
from app.db.session import get_db
from app.models.models import StorefrontSettings, User

router = APIRouter(prefix="/storefront-settings", tags=["Configuración de tienda"])
ROW_ID = 1
HOMEPAGE_SECTION_IDS = (
    "newest", "statement", "featured", "campaigns", "personalized",
    "categories", "services", "faq", "closing",
)

DEFAULTS = {
    "store_name": "HJStoreVP",
    "tagline": "Estilo propio",
    "announcement": "DESCUBRE LA NUEVA COLECCIÓN · ENVÍOS A TODO COLOMBIA",
    "hero_eyebrow": "HJSTOREVP / NUEVA TEMPORADA",
    "hero_title": "EL ESTILO NO SE EXPLICA. SE LLEVA.",
    "hero_description": "Una selección de gorras, perfumes, relojes y accesorios para marcar tu propio ritmo.",
    "hero_button": "EXPLORAR COLECCIÓN",
    "hero_image_url": "",
    "hero_images": [],
    "statement_images": [],
    "homepage_banners": [],
    "homepage_visual_blocks": [],
    "homepage_section_order": list(HOMEPAGE_SECTION_IDS),
    "homepage_hidden_sections": [],
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

class HomepageBanner(BaseModel):
    """Campaña fotográfica publicada en el inicio."""
    image_url: str = Field(min_length=1, max_length=500)
    mobile_image_url: str = Field(default="", max_length=500)
    title: str = Field(min_length=1, max_length=80)
    subtitle: str = Field(default="", max_length=160)
    button_text: str = Field(default="DESCUBRIR", max_length=40)
    link: str = Field(default="/catalogo", max_length=300)
    active: bool = True

    @field_validator("image_url", "mobile_image_url")
    @classmethod
    def image_is_safe(cls, value: str) -> str:
        value = value.strip()
        if not value:
            return value
        if value.startswith("/uploads/branding/"):
            name = value.removeprefix("/uploads/branding/")
            if not name or any(c in name for c in ("/", chr(92), "?", "#")) or ".." in name:
                raise ValueError("Ruta de imagen no válida")
            return value
        parts = urlsplit(value)
        if parts.scheme != "https" or not parts.hostname or parts.username or parts.password:
            raise ValueError("La imagen debe ser HTTPS o una subida a la tienda")
        return value

    @field_validator("link")
    @classmethod
    def link_is_internal(cls, value: str) -> str:
        value = value.strip()
        if not value.startswith("/") or value.startswith("//") or chr(92) in value or any(ord(c) < 32 for c in value):
            raise ValueError("El enlace debe ser una ruta interna")
        if value.split("?", 1)[0].split("#", 1)[0] not in ("/", "/catalogo", "/registro", "/login"):
            if not value.startswith("/producto/"):
                raise ValueError("Selecciona una ruta de la tienda permitida")
        return value



class HomepageVisualItem(BaseModel):
    image_url: str = Field(default="", max_length=500)
    mobile_image_url: str = Field(default="", max_length=500)
    title: str = Field(default="", max_length=80)
    subtitle: str = Field(default="", max_length=160)
    button_text: str = Field(default="VER AHORA", max_length=40)
    link: str = Field(default="/catalogo", max_length=300)

    @field_validator("image_url", "mobile_image_url")
    @classmethod
    def valid_image(cls, value: str) -> str:
        return HomepageBanner.image_is_safe(value)

    @field_validator("link")
    @classmethod
    def valid_link(cls, value: str) -> str:
        return HomepageBanner.link_is_internal(value)

    @model_validator(mode="after")
    def validate_mobile(self):
        if not self.image_url and self.mobile_image_url:
            raise ValueError("La imagen móvil requiere una imagen de escritorio")
        return self


class HomepageVisualBlock(BaseModel):
    id: str = Field(min_length=8, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")
    type: str = Field(pattern=r"^(banner|mosaic|carousel)$")
    title: str = Field(default="", max_length=90)
    active: bool = False
    items: list[HomepageVisualItem] = Field(default_factory=list, max_length=8)

    @model_validator(mode="after")
    def validate_published(self):
        if self.active and (not self.items or any(not item.image_url for item in self.items)):
            raise ValueError("Un bloque activo necesita imágenes en todos sus elementos")
        return self


class SettingsPayload(BaseModel):
    store_name: str = Field(min_length=1, max_length=100)
    tagline: str = Field(max_length=180)
    announcement: str = Field(max_length=220)
    hero_eyebrow: str = Field(max_length=120)
    hero_title: str = Field(max_length=160)
    hero_description: str = Field(max_length=500)
    hero_button: str = Field(max_length=60)
    hero_image_url: str = Field(max_length=500)
    hero_images: list[str] = Field(default_factory=list, max_length=8)
    statement_images: list[str] = Field(default_factory=list, max_length=8)
    homepage_banners: list[HomepageBanner] = Field(default_factory=list, max_length=6)
    homepage_visual_blocks: list[HomepageVisualBlock] = Field(default_factory=list, max_length=6)

    @field_validator("homepage_visual_blocks")
    @classmethod
    def unique_blocks(cls, blocks: list[HomepageVisualBlock]) -> list[HomepageVisualBlock]:
        if len({block.id for block in blocks}) != len(blocks):
            raise ValueError("Cada bloque debe tener un ID único")
        return blocks

    homepage_section_order: list[str] = Field(default_factory=lambda: list(HOMEPAGE_SECTION_IDS))
    homepage_hidden_sections: list[str] = Field(default_factory=list)

    @field_validator("homepage_section_order")
    @classmethod
    def validate_section_order(cls, sections: list[str]) -> list[str]:
        if len(sections) != len(HOMEPAGE_SECTION_IDS) or set(sections) != set(HOMEPAGE_SECTION_IDS):
            raise ValueError("El orden debe incluir cada sección del inicio una sola vez")
        return sections

    @field_validator("homepage_hidden_sections")
    @classmethod
    def validate_hidden_sections(cls, sections: list[str]) -> list[str]:
        if len(sections) != len(set(sections)) or any(section not in HOMEPAGE_SECTION_IDS for section in sections):
            raise ValueError("Lista de secciones ocultas no válida")
        return sections

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

    @field_validator("hero_images", "statement_images")
    @classmethod
    def validate_hero_images(cls, images: list[str]) -> list[str]:
        unique: list[str] = []
        for raw in images:
            if not isinstance(raw, str):
                raise ValueError("Cada imagen debe ser una URL")
            value = raw.strip()
            if not value or len(value) > 500 or chr(0) in value:
                raise ValueError("URL de banner no válida")
            if value.startswith("/uploads/branding/"):
                if ".." in value or chr(92) in value or "?" in value or "#" in value:
                    raise ValueError("Ruta de banner no válida")
                if len(value.removeprefix("/uploads/branding/")) < 5:
                    raise ValueError("Imagen de banner no válida")
            else:
                parts = urlsplit(value)
                if parts.scheme != "https" or not parts.hostname or parts.username or parts.password:
                    raise ValueError("Las imágenes deben usar HTTPS o ser subidas a la tienda")
            if value not in unique:
                unique.append(value)
        return unique

    @field_validator("*")
    @classmethod
    def normalize(cls, value, info):
        if not isinstance(value, str):
            return value
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
    data = public_settings(db)
    data["homepage_visual_blocks"] = [
        block for block in data.get("homepage_visual_blocks", [])
        if block.get("active") and block.get("items")
    ]
    return data


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
