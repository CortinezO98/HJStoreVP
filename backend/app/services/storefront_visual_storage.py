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
    "hero_images", "statement_images", "homepage_banners", "homepage_custom_sections",
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
    for index, block in enumerate(data.get("homepage_custom_sections") or []):
        key = str(block.get("id") or f"legacy-custom:{index}")
        yield _entry("custom", f"custom:{key}", 120 + index,
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

def expected_visual_scopes(stored: dict) -> dict[str, dict]:
    """All scopes derived from the authoritative JSON settings row."""
    scopes = {
        "published": {key: value for key, value in stored.items() if not key.startswith("_")}
    }
    draft = stored.get("_homepage_draft")
    if isinstance(draft, dict) and isinstance(draft.get("data"), dict):
        scopes["draft"] = draft["data"]
    for version in stored.get("_homepage_history") or []:
        if not isinstance(version, dict) or not isinstance(version.get("data"), dict):
            continue
        vid = str(version.get("id") or "")
        if vid and len(vid) <= 50 and all(ch.isalnum() or ch in "-_" for ch in vid):
            scopes["history:" + vid] = version["data"]
    return scopes


def inspect_homepage_mirror(db: Session, storefront_id: int, stored: dict) -> dict:
    """Read-only full-content comparison, including slide order and JSON config.

    The report excludes actual campaign text, image paths and customer data.
    """
    from collections import Counter
    expected_scopes = expected_visual_scopes(stored)
    expected = {
        (scope, key): (kind, position, config, slides)
        for scope, data in expected_scopes.items()
        for kind, key, position, config, slides in iter_visual_entries(data)
    }
    records = db.query(StorefrontVisualBlock).filter(
        StorefrontVisualBlock.storefront_id == storefront_id
    ).all()
    actual = {
        (block.scope, block.block_key): (
            block.block_type, block.position, block.configuration,
            [
                {
                    "image_url": slide.image_url,
                    "mobile_image_url": slide.mobile_image_url,
                    "title": slide.title,
                    "link": slide.link,
                    "configuration": slide.configuration,
                } for slide in sorted(block.items, key=lambda slide: slide.position)
            ],
        )
        for block in records
    }
    mismatched = 0
    for key, (kind, position, config, slides) in expected.items():
        row = actual.get(key)
        if row is None:
            continue
        actual_kind, actual_position, actual_config, actual_slides = row
        if (actual_kind != kind or actual_position != position or actual_config != config
                or len(actual_slides) != len(slides)):
            mismatched += 1
            continue
        for slide_position, expected_slide in enumerate(slides):
            stored_slide = actual_slides[slide_position]
            if (
                stored_slide["configuration"] != expected_slide
                or stored_slide["image_url"] != str(expected_slide.get("image_url") or "")
                or stored_slide["mobile_image_url"] != str(expected_slide.get("mobile_image_url") or "")
                or stored_slide["title"] != str(expected_slide.get("title") or "")[:160]
                or stored_slide["link"] != str(expected_slide.get("link") or "/catalogo")[:300]
            ):
                mismatched += 1
                break
    expected_count = Counter(scope for scope, _ in expected)
    actual_count = Counter(scope for scope, _ in actual)
    missing = set(expected) - set(actual)
    extra = set(actual) - set(expected)
    return {
        "in_sync": not (missing or extra or mismatched),
        "expected_blocks": len(expected),
        "actual_blocks": len(actual),
        "expected_slides": sum(len(entry[3]) for entry in expected.values()),
        "actual_slides": sum(len(block.items) for block in records),
        "missing_blocks": len(missing),
        "extra_blocks": len(extra),
        "changed_blocks": mismatched,
        "published_blocks": actual_count.get("published", 0),
        "draft_blocks": actual_count.get("draft", 0),
        "history_blocks": sum(v for scope, v in actual_count.items() if scope.startswith("history:")),
        "expected_published_blocks": expected_count.get("published", 0),
        "expected_draft_blocks": expected_count.get("draft", 0),
    }
