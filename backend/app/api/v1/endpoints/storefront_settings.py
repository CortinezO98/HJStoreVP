"""Configuración pública del comercio; identidad, contenido y políticas."""
from typing import Optional, Literal
from urllib.parse import urlsplit, urlencode
from datetime import datetime
import hashlib
import json
from copy import deepcopy
from zoneinfo import ZoneInfo
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel, Field, ValidationError, field_validator, model_validator
from sqlalchemy import inspect
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.core.deps import require_super_admin
from app.core.config import settings
from app.api.v1.endpoints.images import normalize_image, MAX_SIZE_BYTES
from app.db.session import get_db
from app.models.models import StorefrontSettings, User, Product, Category, StorefrontVisualBlock
from app.services.storefront_visual_storage import mirror_homepage

router = APIRouter(prefix="/storefront-settings", tags=["Configuración de tienda"])
ROW_ID = 1
BOGOTA_TZ = ZoneInfo("America/Bogota")


def validate_campaign_schedule(starts_at: str, ends_at: str):
    """Schedule strings are ISO minute precision in Colombia local time."""
    def parse(value):
        if not value:
            return None
        try:
            return datetime.strptime(value, "%Y-%m-%dT%H:%M").replace(tzinfo=BOGOTA_TZ)
        except ValueError as exc:
            raise ValueError("Usa fecha y hora AAAA-MM-DDTHH:MM") from exc
    start, end = parse(starts_at), parse(ends_at)
    if start and end and end <= start:
        raise ValueError("La finalización debe ser posterior al inicio")


def campaign_in_window(item: dict, now: datetime) -> bool:
    if not item.get("active"):
        return False
    start = item.get("starts_at", "")
    end = item.get("ends_at", "")
    try:
        validate_campaign_schedule(start, end)
        if start and now < datetime.strptime(start, "%Y-%m-%dT%H:%M").replace(tzinfo=BOGOTA_TZ):
            return False
        if end and now >= datetime.strptime(end, "%Y-%m-%dT%H:%M").replace(tzinfo=BOGOTA_TZ):
            return False
    except (ValueError, TypeError):
        return False
    return True


HOMEPAGE_SECTION_IDS = (
    "newest", "statement", "featured", "campaigns", "personalized",
    "visual", "categories", "loyalty", "services", "faq", "closing",
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
    "homepage_custom_sections": [],
    "homepage_category_tiles": [],
    "hero_presentation": {"text_align": "left", "text_position": "center", "overlay_opacity": 65},
    "statement_presentation": {"text_align": "left", "text_position": "center", "overlay_opacity": 65},
    "hero_carousel_settings": {"autoplay": True, "interval_ms": 6000, "show_navigation": True},
    "statement_carousel_settings": {"autoplay": True, "interval_ms": 6000, "show_navigation": True},
    "homepage_loyalty_banner": None,
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
    image_url: str = Field(default="", max_length=500)
    mobile_image_url: str = Field(default="", max_length=500)
    title: str = Field(min_length=1, max_length=80)
    subtitle: str = Field(default="", max_length=160)
    button_text: str = Field(default="DESCUBRIR", max_length=40)
    link: str = Field(default="/catalogo", max_length=300)
    destination_type: Literal["custom", "product", "category", "collection"] = "custom"
    destination_slug: str = Field(default="", max_length=160, pattern=r"^[a-zA-Z0-9_-]*$")

    active: bool = True
    starts_at: str = Field(default="", max_length=16)
    ends_at: str = Field(default="", max_length=16)
    text_align: str = Field(default="left", pattern=r"^(left|center|right)$")
    text_position: str = Field(default="bottom", pattern=r"^(top|center|bottom)$")
    overlay_opacity: int = Field(default=65, ge=0, le=90)

    @model_validator(mode="after")
    def validate_schedule(self):
        validate_campaign_schedule(self.starts_at, self.ends_at)
        if self.active and (not self.image_url or not self.title.strip()):
            raise ValueError("Una campaña activa requiere imagen y título")
        return self

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
    destination_type: Literal["custom", "product", "category", "collection"] = "custom"
    destination_slug: str = Field(default="", max_length=160, pattern=r"^[a-zA-Z0-9_-]*$")

    text_align: str = Field(default="left", pattern=r"^(left|center|right)$")
    text_position: str = Field(default="bottom", pattern=r"^(top|center|bottom)$")
    overlay_opacity: int = Field(default=65, ge=0, le=90)

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
    starts_at: str = Field(default="", max_length=16)
    ends_at: str = Field(default="", max_length=16)
    autoplay: bool = False
    interval_ms: int = Field(default=6000, ge=2500, le=20000)
    show_navigation: bool = True
    items: list[HomepageVisualItem] = Field(default_factory=list, max_length=8)

    @model_validator(mode="after")
    def validate_published(self):
        validate_campaign_schedule(self.starts_at, self.ends_at)
        if self.active and (not self.items or any(not item.image_url for item in self.items)):
            raise ValueError("Un bloque activo necesita imágenes en todos sus elementos")
        return self



class HomepageCategoryTile(BaseModel):
    category_slug: str = Field(min_length=1, max_length=120, pattern=r"^[a-zA-Z0-9_-]+$")
    image_url: str = Field(default="", max_length=500)
    mobile_image_url: str = Field(default="", max_length=500)
    title: str = Field(default="", max_length=80)

    @field_validator("image_url", "mobile_image_url")
    @classmethod
    def valid_image(cls, value: str) -> str:
        return HomepageBanner.image_is_safe(value)


class HomepageLoyaltyBanner(BaseModel):
    image_url: str = Field(default="", max_length=500)
    mobile_image_url: str = Field(default="", max_length=500)
    eyebrow: str = Field(default="HJSTOREVP / CLUB", max_length=80)
    title: str = Field(default="TU ESTILO TIENE BENEFICIOS", max_length=110)
    description: str = Field(default="", max_length=260)
    button_text: str = Field(default="DESCUBRIR BENEFICIOS", max_length=45)
    link: str = Field(default="/mi-cuenta", max_length=300)
    destination_type: Literal["custom", "product", "category", "collection"] = "custom"
    destination_slug: str = Field(default="", max_length=160, pattern=r"^[a-zA-Z0-9_-]*$")

    active: bool = False
    starts_at: str = Field(default="", max_length=16)
    ends_at: str = Field(default="", max_length=16)
    text_align: str = Field(default="left", pattern=r"^(left|center|right)$")
    text_position: str = Field(default="bottom", pattern=r"^(top|center|bottom)$")
    overlay_opacity: int = Field(default=65, ge=0, le=90)

    @field_validator("image_url", "mobile_image_url")
    @classmethod
    def valid_image(cls, value: str) -> str:
        return HomepageBanner.image_is_safe(value)

    @field_validator("link")
    @classmethod
    def valid_link(cls, value: str) -> str:
        value = value.strip()
        if value in ("/mi-cuenta", "/registro"):
            return value
        return HomepageBanner.link_is_internal(value)

    @model_validator(mode="after")
    def check_banner(self):
        validate_campaign_schedule(self.starts_at, self.ends_at)
        if self.mobile_image_url and not self.image_url:
            raise ValueError("La imagen móvil requiere una imagen de escritorio")
        if self.active and (not self.image_url or not self.title.strip()):
            raise ValueError("Un banner de fidelización activo necesita imagen y título")
        return self


class CarouselPresentation(BaseModel):
    autoplay: bool = True
    interval_ms: int = Field(default=6000, ge=2500, le=20000)
    show_navigation: bool = True


class BannerPresentation(BaseModel):
    text_align: str = Field(default="left", pattern=r"^(left|center|right)$")
    text_position: str = Field(default="center", pattern=r"^(top|center|bottom)$")
    overlay_opacity: int = Field(default=65, ge=0, le=90)


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
    homepage_custom_sections: list[HomepageVisualBlock] = Field(default_factory=list, max_length=12)
    homepage_category_tiles: list[HomepageCategoryTile] = Field(default_factory=list, max_length=10)
    homepage_loyalty_banner: Optional[HomepageLoyaltyBanner] = None
    hero_presentation: BannerPresentation = Field(default_factory=BannerPresentation)
    statement_presentation: BannerPresentation = Field(default_factory=BannerPresentation)
    hero_carousel_settings: CarouselPresentation = Field(default_factory=CarouselPresentation)
    statement_carousel_settings: CarouselPresentation = Field(default_factory=CarouselPresentation)

    @field_validator("homepage_category_tiles")
    @classmethod
    def unique_categories(cls, items: list[HomepageCategoryTile]) -> list[HomepageCategoryTile]:
        if len({item.category_slug for item in items}) != len(items):
            raise ValueError("No repitas una categoría en la galería")
        return items


    @field_validator("homepage_visual_blocks")
    @classmethod
    def unique_blocks(cls, blocks: list[HomepageVisualBlock]) -> list[HomepageVisualBlock]:
        if len({block.id for block in blocks}) != len(blocks):
            raise ValueError("Cada bloque debe tener un ID único")
        return blocks

    @field_validator("homepage_custom_sections")
    @classmethod
    def unique_custom_sections(cls, blocks: list[HomepageVisualBlock]) -> list[HomepageVisualBlock]:
        if len({block.id for block in blocks}) != len(blocks):
            raise ValueError("Las secciones personalizadas deben tener identificadores únicos")
        return blocks

    homepage_section_order: list[str] = Field(default_factory=lambda: list(HOMEPAGE_SECTION_IDS))
    homepage_hidden_sections: list[str] = Field(default_factory=list)

    @field_validator("homepage_section_order")
    @classmethod
    def validate_section_order(cls, sections: list[str]) -> list[str]:
        if len(sections) != len(set(sections)):
            raise ValueError("El orden de secciones contiene duplicados")
        if any(item not in HOMEPAGE_SECTION_IDS and not item.startswith("custom:") for item in sections):
            raise ValueError("El orden incluye secciones desconocidas")
        sections = list(sections)
        for added, after in (("visual", "campaigns"), ("loyalty", "categories")):
            if added not in sections:
                position = sections.index(after) + 1 if after in sections else len(sections)
                sections.insert(position, added)
        if not set(HOMEPAGE_SECTION_IDS).issubset(sections):
            raise ValueError("El orden debe mantener las secciones estructurales")
        return sections

    @field_validator("homepage_hidden_sections")
    @classmethod
    def validate_hidden_sections(cls, sections: list[str]) -> list[str]:
        if len(sections) != len(set(sections)):
            raise ValueError("Lista de secciones ocultas repetida")
        if any(item not in HOMEPAGE_SECTION_IDS and not item.startswith("custom:") for item in sections):
            raise ValueError("Lista de secciones ocultas no válida")
        return sections

    @model_validator(mode="after")
    def validate_custom_section_references(self):
        expected = {"custom:" + block.id for block in self.homepage_custom_sections}
        actual = {key for key in self.homepage_section_order if key.startswith("custom:")}
        if expected != actual:
            raise ValueError("El orden debe incluir exactamente las secciones creadas")
        if any(key.startswith("custom:") and key not in expected
               for key in self.homepage_hidden_sections):
            raise ValueError("Hay referencias ocultas a secciones eliminadas")
        if expected.intersection({"custom:" + block.id for block in self.homepage_visual_blocks}):
            raise ValueError("No reutilices identificadores de otros bloques")
        return self

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



COLLECTION_LINKS = {
    "newest": "/catalogo?sort=newest",
    "featured": "/catalogo?featured=true",
    "all": "/catalogo",
}


def destination_link(item: dict, db: Session) -> str:
    """Resolve only supported, active catalog destinations; never trust a raw slug as URL."""
    kind = item.get("destination_type", "custom")
    slug = item.get("destination_slug", "")
    if kind == "product":
        match = db.query(Product.id).filter(Product.slug == slug, Product.active.is_(True)).first()
        return f"/producto/{slug}" if match else "/catalogo"
    if kind == "category":
        match = db.query(Category.id).filter(Category.slug == slug, Category.active.is_(True)).first()
        return "/catalogo?" + urlencode({"categoria": slug}) if match else "/catalogo"
    if kind == "collection":
        return COLLECTION_LINKS.get(slug, "/catalogo")
    return item.get("link") or "/catalogo"


def validate_destination(item: dict, db: Session) -> None:
    kind = item.get("destination_type", "custom")
    if kind == "custom":
        return
    slug = item.get("destination_slug", "")
    if not slug or (kind == "collection" and slug not in COLLECTION_LINKS):
        raise HTTPException(status_code=422, detail="Selecciona un destino válido para la campaña")
    if kind == "product" and not db.query(Product.id).filter(
        Product.slug == slug, Product.active.is_(True)
    ).first():
        raise HTTPException(status_code=422, detail="El producto de la campaña no existe o está inactivo")
    if kind == "category" and not db.query(Category.id).filter(
        Category.slug == slug, Category.active.is_(True)
    ).first():
        raise HTTPException(status_code=422, detail="La categoría de la campaña no existe o está inactiva")


def validate_published_destinations(settings_data: dict, db: Session) -> None:
    for banner in settings_data.get("homepage_banners", []):
        if banner.get("active") and banner.get("image_url"):
            validate_destination(banner, db)
    for block in [*settings_data.get("homepage_visual_blocks", []), *settings_data.get("homepage_custom_sections", [])]:
        if block.get("active"):
            for item in block.get("items", []):
                validate_destination(item, db)
    loyalty = settings_data.get("homepage_loyalty_banner")
    if isinstance(loyalty, dict) and loyalty.get("active"):
        validate_destination(loyalty, db)


def resolve_public_destinations(settings_data: dict, db: Session) -> None:
    for banner in settings_data.get("homepage_banners", []):
        banner["link"] = destination_link(banner, db)
    for block in [*settings_data.get("homepage_visual_blocks", []), *settings_data.get("homepage_custom_sections", [])]:
        for item in block.get("items", []):
            item["link"] = destination_link(item, db)
    loyalty = settings_data.get("homepage_loyalty_banner")
    if isinstance(loyalty, dict):
        loyalty["link"] = destination_link(loyalty, db)


def sync_visual_layout_if_ready(db: Session, row: StorefrontSettings) -> None:
    """Keep old JSON compatible before migration; mirror atomically after it.

    Migration 20261120_15 must be applied before relational tracking is enabled.
    Never alter the published JSON if the new tables do not exist yet.
    """
    inspector = inspect(db.get_bind())
    if not (inspector.has_table("storefront_visual_blocks")
            and inspector.has_table("storefront_visual_slides")):
        return
    db.flush()
    mirror_homepage(db, row.id, dict(row.settings_data or {}))


@router.get("/admin/homepage-storage-health")
def visual_storage_health(
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    from app.services.storefront_visual_storage import inspect_homepage_mirror
    inspector = inspect(db.get_bind())
    ready = (inspector.has_table("storefront_visual_blocks")
             and inspector.has_table("storefront_visual_slides"))
    row = db.get(StorefrontSettings, ROW_ID)
    if not ready:
        return {
            "schema_ready": False, "source_exists": row is not None,
            "in_sync": False, "expected_blocks": None, "actual_blocks": None,
            "published_blocks": 0, "draft_blocks": 0, "history_blocks": 0,
        }
    if row is None:
        # Empty mirror and absent configuration is an uninitialized storefront,
        # not a data-loss or out-of-sync event.
        count = db.query(StorefrontVisualBlock).filter(
            StorefrontVisualBlock.storefront_id == ROW_ID).count()
        return {
            "schema_ready": True, "source_exists": False,
            "in_sync": count == 0, "expected_blocks": 0, "actual_blocks": count,
            "published_blocks": 0, "draft_blocks": 0, "history_blocks": 0,
        }
    return {
        "schema_ready": True, "source_exists": True,
        **inspect_homepage_mirror(db, row.id, dict(row.settings_data or {})),
    }



def public_settings(db: Session) -> dict:
    row = db.get(StorefrontSettings, ROW_ID)
    return {**DEFAULTS, **{key: value for key, value in (row.settings_data or {}).items() if not key.startswith('_')}} if row else dict(DEFAULTS)


@router.get("/public")
def get_public_settings(db: Session = Depends(get_db)):
    data = deepcopy(public_settings(db))
    now = datetime.now(BOGOTA_TZ)
    data["homepage_banners"] = [
        banner for banner in data.get("homepage_banners", [])
        if banner.get("image_url") and campaign_in_window(banner, now)
    ]
    data["homepage_loyalty_banner"] = (
        data["homepage_loyalty_banner"]
        if isinstance(data.get("homepage_loyalty_banner"), dict)
        and data["homepage_loyalty_banner"].get("image_url")
        and campaign_in_window(data["homepage_loyalty_banner"], now)
        else None
    )
    data["homepage_custom_sections"] = [
        block for block in data.get("homepage_custom_sections", [])
        if block.get("items") and campaign_in_window(block, now)
    ]
    data["homepage_visual_blocks"] = [
        block for block in data.get("homepage_visual_blocks", [])
        if block.get("items") and campaign_in_window(block, now)
    ]
    resolve_public_destinations(data, db)
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
    validate_published_destinations(payload.model_dump(), db)
    row = db.query(StorefrontSettings).filter(StorefrontSettings.id == ROW_ID).with_for_update().first()
    if row is None:
        row = StorefrontSettings(id=ROW_ID, settings_data=payload.model_dump(), updated_by=current_user.id)
        db.add(row)
    else:
        row.settings_data = {**payload.model_dump(), **{key: value for key, value in (row.settings_data or {}).items() if key.startswith('_')}}
        row.updated_by = current_user.id
        row.updated_at = datetime.utcnow()
    sync_visual_layout_if_ready(db, row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="La configuración fue modificada simultáneamente, vuelve a cargar")
    return public_settings(db)



# El borrador reside en la misma fila JSON; las claves privadas nunca salen
# por /public ni por /admin. No requiere modificar el esquema de base de datos.
HOMEPAGE_EDIT_FIELDS = (
    "hero_eyebrow", "hero_title", "hero_description", "hero_button",
    "hero_images", "statement_images", "homepage_banners", "homepage_visual_blocks",
    "homepage_custom_sections",
    "homepage_category_tiles", "homepage_loyalty_banner",
    "hero_carousel_settings", "statement_carousel_settings",
    "hero_presentation", "statement_presentation",
    "homepage_section_order", "homepage_hidden_sections",
)
DRAFT_KEY = "_homepage_draft"
HISTORY_KEY = "_homepage_history"
HISTORY_LIMIT = 5


def published_homepage(settings_data: dict) -> dict:
    source = {**DEFAULTS, **{key: value for key, value in settings_data.items() if not key.startswith("_")}}
    return {key: source[key] for key in HOMEPAGE_EDIT_FIELDS}


def homepage_fingerprint(homepage: dict) -> str:
    serialized = json.dumps(homepage, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def validated_homepage(data: dict, base: dict) -> dict:
    if not set(data).issubset(set(HOMEPAGE_EDIT_FIELDS)) or not data:
        raise HTTPException(status_code=422, detail="El borrador debe contener exactamente los campos visuales permitidos")
    try:
        merged = SettingsPayload.model_validate(
            {**DEFAULTS, **{k: v for k, v in base.items() if not k.startswith("_")}, **data}
        )
    except ValidationError as exc:
        # La validación se ejecuta dentro del endpoint, no al deserializar
        # su request; traducirla a 422 en lugar de dejar escapar un HTTP 500.
        raise HTTPException(
            status_code=422,
            detail="La configuración visual del borrador contiene datos inválidos",
        ) from exc
    dump = merged.model_dump()
    return {key: dump[key] for key in HOMEPAGE_EDIT_FIELDS}


class HomepageDraftSave(BaseModel):
    draft: dict


@router.get("/admin/homepage-draft")
def get_homepage_draft(
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    row = db.get(StorefrontSettings, ROW_ID)
    stored = dict(row.settings_data or {}) if row else {}
    published = published_homepage(stored)
    saved = stored.get(DRAFT_KEY)
    return {
        "draft": saved["data"] if isinstance(saved, dict) and isinstance(saved.get("data"), dict) else published,
        "has_saved_draft": isinstance(saved, dict),
        "published_hash": homepage_fingerprint(published),
        "draft_base_hash": saved.get("base_hash") if isinstance(saved, dict) else homepage_fingerprint(published),
    }


@router.put("/admin/homepage-draft")
def save_homepage_draft(
    payload: HomepageDraftSave,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    row = db.query(StorefrontSettings).filter(StorefrontSettings.id == ROW_ID).with_for_update().first()
    stored = dict(row.settings_data or {}) if row else {}
    published = published_homepage(stored)
    draft = validated_homepage(payload.draft, stored)
    existing = stored.get(DRAFT_KEY)
    base_hash = existing.get("base_hash") if isinstance(existing, dict) else homepage_fingerprint(published)
    stored[DRAFT_KEY] = {"data": draft, "base_hash": base_hash}
    if row is None:
        row = StorefrontSettings(id=ROW_ID, settings_data=stored, updated_by=current_user.id)
        db.add(row)
    else:
        row.settings_data = stored
        row.updated_by = current_user.id
        row.updated_at = datetime.utcnow()
    sync_visual_layout_if_ready(db, row)
    db.commit()
    return {"saved": True, "draft_base_hash": base_hash, "published_hash": homepage_fingerprint(published)}


@router.post("/admin/homepage-publish")
def publish_homepage_draft(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    row = db.query(StorefrontSettings).filter(StorefrontSettings.id == ROW_ID).with_for_update().first()
    if row is None or not isinstance((row.settings_data or {}).get(DRAFT_KEY), dict):
        raise HTTPException(status_code=404, detail="No hay un borrador guardado para publicar")
    stored = dict(row.settings_data)
    saved = stored[DRAFT_KEY]
    published = published_homepage(stored)
    if saved.get("base_hash") != homepage_fingerprint(published):
        raise HTTPException(status_code=409, detail="La portada publicada cambió desde que inició este borrador. Revise los cambios antes de publicarlo.")
    draft = validated_homepage(saved.get("data", {}), stored)
    validate_published_destinations(draft, db)
    history = list(stored.get(HISTORY_KEY) or [])
    history.insert(0, {
        "id": uuid4().hex,
        "saved_at": datetime.now(BOGOTA_TZ).isoformat(timespec="seconds"),
        "saved_by": current_user.id,
        "data": published,
    })
    stored[HISTORY_KEY] = history[:HISTORY_LIMIT]
    stored.update(draft)
    stored.pop(DRAFT_KEY, None)
    row.settings_data = stored
    row.updated_by = current_user.id
    row.updated_at = datetime.utcnow()
    sync_visual_layout_if_ready(db, row)
    db.commit()
    return {"published": True, "published_hash": homepage_fingerprint(published_homepage(stored))}


@router.delete("/admin/homepage-draft")
def discard_homepage_draft(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    row = db.query(StorefrontSettings).filter(StorefrontSettings.id == ROW_ID).with_for_update().first()
    if row and DRAFT_KEY in (row.settings_data or {}):
        stored = dict(row.settings_data)
        stored.pop(DRAFT_KEY)
        row.settings_data = stored
        row.updated_by = current_user.id
        row.updated_at = datetime.utcnow()
        sync_visual_layout_if_ready(db, row)
        db.commit()
    return {"discarded": True}



@router.get("/admin/homepage-versions")
def get_homepage_versions(
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    row = db.get(StorefrontSettings, ROW_ID)
    history = (row.settings_data or {}).get(HISTORY_KEY, []) if row else []
    # Metadatos; nunca exponer datos internos ni el historial en /public.
    return [{
        "id": version["id"],
        "saved_at": version["saved_at"],
        "saved_by": version.get("saved_by"),
    } for version in history if isinstance(version, dict) and "id" in version]


@router.post("/admin/homepage-versions/{version_id}/restore-draft")
def restore_homepage_version_as_draft(
    version_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    row = db.query(StorefrontSettings).filter(StorefrontSettings.id == ROW_ID).with_for_update().first()
    if row is None:
        raise HTTPException(status_code=404, detail="No hay versiones anteriores")
    stored = dict(row.settings_data or {})
    if DRAFT_KEY in stored:
        raise HTTPException(status_code=409, detail="Descarta primero el borrador actual antes de recuperar una versión")
    history = stored.get(HISTORY_KEY) or []
    version = next((v for v in history if isinstance(v, dict) and v.get("id") == version_id), None)
    if version is None:
        raise HTTPException(status_code=404, detail="Versión no encontrada")
    published = published_homepage(stored)
    draft = validated_homepage(version.get("data", {}), stored)
    stored[DRAFT_KEY] = {
        "data": draft,
        "base_hash": homepage_fingerprint(published),
    }
    row.settings_data = stored
    row.updated_by = current_user.id
    row.updated_at = datetime.utcnow()
    sync_visual_layout_if_ready(db, row)
    db.commit()
    return {"restored_as_draft": True, "published_unchanged": True}


# Biblioteca de marca persistente sobre el almacenamiento ya existente.
# Sin borrado físico: un archivo podría seguir referenciado en portada o historial.
@router.get("/admin/media-library")
def list_brand_images(
    page: int = 1,
    page_size: int = 24,
    search: str = "",
    _: User = Depends(require_super_admin),
):
    if settings.STORAGE_BACKEND != "local":
        raise HTTPException(
            status_code=409,
            detail="La biblioteca multimedia requiere almacenamiento local configurado",
        )
    if page < 1 or not 1 <= page_size <= 60:
        raise HTTPException(status_code=422, detail="Paginación no válida")
    if len(search) > 100:
        raise HTTPException(status_code=422, detail="Búsqueda demasiado larga")
    folder = Path(settings.UPLOAD_DIR).resolve() / "branding"
    if not folder.exists():
        return {"items": [], "total": 0, "page": page, "page_size": page_size}
    # Solo los archivos que el propio cargador genera; ignorar symlinks,
    # rutas ajenas y archivos temporales.
    import re
    pattern = re.compile(r"^[0-9a-f]{32}\\.(?:webp|png|jpg|jpeg|gif)$", re.IGNORECASE)
    query = search.strip().lower()
    files = []
    for entry in folder.iterdir():
        if not pattern.fullmatch(entry.name) or entry.is_symlink() or not entry.is_file():
            continue
        if query and query not in entry.name.lower():
            continue
        info = entry.stat()
        files.append((info.st_mtime, entry.name, info.st_size))
    files.sort(key=lambda item: (item[0], item[1]), reverse=True)
    offset = (page - 1) * page_size
    return {
        "items": [
            {"url": f"/uploads/branding/{name}", "filename": name,
             "bytes": size, "updated_at": datetime.fromtimestamp(timestamp).isoformat()}
            for timestamp, name, size in files[offset:offset + page_size]
        ],
        "total": len(files), "page": page, "page_size": page_size,
    }


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
