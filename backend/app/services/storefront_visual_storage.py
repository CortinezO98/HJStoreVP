"""Non-destructive relational mirror of the existing homepage JSON document.

During the compatibility transition, storefront_settings.settings_data remains the
read/publication contract. This mirror is transactional and independently queryable,
not a replacement for the JSON source of truth.

A missing migration does not silently drop the JSON write: call sites check the
presence of both new tables before invoking this module.
"""
from sqlalchemy.orm import Session

from app.models.models import StorefrontVisualBlock, StorefrontVisualSlide


VISUAL_FIELDS = (
    "hero_images", "statement_images", "homepage_banners",
    "homepage_visual_blocks", "homepage_category_tiles", "homepage_loyalty_banner",
    "hero_presentation", "statement_presentation",
    "hero_carousel_settings", "statement_carousel_settings",
    "homepage_section_order", "homepage_hidden_sections",
)


def _entry(kind: str, key: str, position: int, config: dict, slides: list[dict]):
    return kind, key, position, config, slides


def iter_visual_entries(data: dict):
    """Stable order within each scope; no destructive transformations."""
    images = data.get("hero_images") or []
    yield _entry("hero", "hero", 0, {
        "presentation": data.get("hero_presentation") or {},
        "carousel": data.get("hero_carousel_settings") or {},
        "section_order": data.get("homepage_section_order") or [],
        "hidden_sections": data.get("homepage_hidden_sections") or [],
    }, [{"image_url": image} for image in images])
    yield _entry("statement", "statement", 1, {
        "presentation": data.get("statement_presentation") or {},
        "carousel": data.get("statement_carousel_settings") or {},
    }, [{"image_url": image} for image in (data.get("statement_images") or [])])
    for index, banner in enumerate(data.get("homepage_banners") or []):
        yield _entry("campaign", f"campaign:{index}", index + 2, dict(banner), [dict(banner)])
    for index, block in enumerate(data.get("homepage_visual_blocks") or []):
        key = str(block.get("id") or f"legacy:{index}")
        yield _entry("visual", f"visual:{key}", index + 20,
                     {k: v for k, v in block.items() if k != "items"},
                     [dict(item) for item in (block.get("items") or [])])
    tiles = data.get("homepage_category_tiles") or []
    yield _entry("categories", "categories", 100, {"count": len(tiles)}, [dict(tile) for tile in tiles])
    loyalty = data.get("homepage_loyalty_banner")
    if isinstance(loyalty, dict):
        yield _entry("loyalty", "loyalty", 110, dict(loyalty), [dict(loyalty)])


def mirror_homepage(db: Session, storefront_id: int, stored: dict):
    """Replace the mirror atomically within the caller's existing transaction.

    The caller MUST commit/rollback; this function never commits.
    Relational IDs are internal, and are not referenced by published URLs.
    """
    scopes = {
        "published": {key: value for key, value in stored.items() if not key.startswith("_")}
    }
    draft = stored.get("_homepage_draft")
    if isinstance(draft, dict) and isinstance(draft.get("data"), dict):
        scopes["draft"] = draft["data"]
    history = stored.get("_homepage_history") or []
    for version in history:
        if isinstance(version, dict) and isinstance(version.get("data"), dict):
            vid = str(version.get("id") or "")
            if vid and len(vid) <= 50 and all(c.isalnum() or c in "-_" for c in vid):
                scopes["history:" + vid] = version["data"]

    existing = db.query(StorefrontVisualBlock).filter(
        StorefrontVisualBlock.storefront_id == storefront_id
    ).all()
    for block in existing:
        db.delete(block)
    db.flush()  # Ensure unique scope/key constraints cannot conflict.

    for scope, content in scopes.items():
        for kind, key, position, configuration, slides in iter_visual_entries(content):
            block = StorefrontVisualBlock(
                storefront_id=storefront_id, scope=scope,
                block_key=key, block_type=kind, position=position,
                configuration=configuration,
            )
            for index, item in enumerate(slides):
                block.items.append(StorefrontVisualSlide(
                    position=index,
                    image_url=str(item.get("image_url") or ""),
                    mobile_image_url=str(item.get("mobile_image_url") or ""),
                    title=str(item.get("title") or "")[:160],
                    link=str(item.get("link") or "/catalogo")[:300],
                    configuration=item,
                ))
            db.add(block)
    db.flush()
