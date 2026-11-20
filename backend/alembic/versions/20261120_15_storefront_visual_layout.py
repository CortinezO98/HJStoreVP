"""Add relational homepage blocks and slides without replacing legacy JSON.

Revision ID: 20261120_15
Revises: 20261119_14

The migration copies every published, draft, and retained history visual to
normalized tables. No existing settings rows, JSON keys or uploaded files change.
"""
from alembic import op
import sqlalchemy as sa
import json

revision = "20261120_15"
down_revision = "20261119_14"
branch_labels = None
depends_on = None


def _entries(data):
    yield ("hero", "hero", 0, {
        "presentation": data.get("hero_presentation") or {},
        "carousel": data.get("hero_carousel_settings") or {},
        "section_order": data.get("homepage_section_order") or [],
        "hidden_sections": data.get("homepage_hidden_sections") or [],
    }, [{"image_url": image} for image in (data.get("hero_images") or [])])
    yield ("statement", "statement", 1, {
        "presentation": data.get("statement_presentation") or {},
        "carousel": data.get("statement_carousel_settings") or {},
    }, [{"image_url": image} for image in (data.get("statement_images") or [])])
    for i, banner in enumerate(data.get("homepage_banners") or []):
        yield ("campaign", f"campaign:{i}", i + 2, dict(banner), [dict(banner)])
    for i, block in enumerate(data.get("homepage_visual_blocks") or []):
        yield ("visual", "visual:" + str(block.get("id") or f"legacy:{i}"),
               i + 20, {k: v for k, v in block.items() if k != "items"},
               [dict(item) for item in (block.get("items") or [])])
    tiles = data.get("homepage_category_tiles") or []
    yield ("categories", "categories", 100, {"count": len(tiles)}, [dict(tile) for tile in tiles])
    loyalty = data.get("homepage_loyalty_banner")
    if isinstance(loyalty, dict):
        yield ("loyalty", "loyalty", 110, dict(loyalty), [dict(loyalty)])


def upgrade():
    inspector = sa.inspect(op.get_bind())
    has_blocks = inspector.has_table("storefront_visual_blocks")
    has_slides = inspector.has_table("storefront_visual_slides")
    if has_blocks != has_slides:
        raise RuntimeError("Esquema visual incompleto; se requiere inspección antes de migrar")
    if not has_blocks:
        op.create_table(
            "storefront_visual_blocks",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("storefront_id", sa.Integer(),
                      sa.ForeignKey("storefront_settings.id", ondelete="CASCADE"), nullable=False),
            sa.Column("scope", sa.String(70), nullable=False),
            sa.Column("block_key", sa.String(110), nullable=False),
            sa.Column("block_type", sa.String(40), nullable=False),
            sa.Column("position", sa.Integer(), nullable=False),
            sa.Column("configuration", sa.JSON(), nullable=False),
            sa.UniqueConstraint("storefront_id", "scope", "block_key",
                                name="uq_visual_block_scope_key"),
        )
        op.create_index("ix_visual_block_scope_position", "storefront_visual_blocks",
                        ["storefront_id", "scope", "position"])
        op.create_table(
            "storefront_visual_slides",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("block_id", sa.Integer(),
                      sa.ForeignKey("storefront_visual_blocks.id", ondelete="CASCADE"), nullable=False),
            sa.Column("position", sa.Integer(), nullable=False),
            sa.Column("image_url", sa.String(500), nullable=False, server_default=""),
            sa.Column("mobile_image_url", sa.String(500), nullable=False, server_default=""),
            sa.Column("title", sa.String(160), nullable=False, server_default=""),
            sa.Column("link", sa.String(300), nullable=False, server_default="/catalogo"),
            sa.Column("configuration", sa.JSON(), nullable=False),
            sa.UniqueConstraint("block_id", "position", name="uq_visual_slide_position"),
        )

    bind = op.get_bind()
    settings_rows = bind.execute(sa.text("SELECT id, settings_data FROM storefront_settings")).fetchall()
    blocks = sa.table("storefront_visual_blocks",
        sa.column("id", sa.Integer), sa.column("storefront_id", sa.Integer),
        sa.column("scope", sa.String), sa.column("block_key", sa.String),
        sa.column("block_type", sa.String), sa.column("position", sa.Integer),
        sa.column("configuration", sa.JSON))
    slides = sa.table("storefront_visual_slides",
        sa.column("block_id", sa.Integer), sa.column("position", sa.Integer),
        sa.column("image_url", sa.String), sa.column("mobile_image_url", sa.String),
        sa.column("title", sa.String), sa.column("link", sa.String),
        sa.column("configuration", sa.JSON))

    for row in settings_rows:
        if bind.execute(sa.text(
            "SELECT id FROM storefront_visual_blocks WHERE storefront_id = :sid LIMIT 1"
        ), {"sid": row.id}).first():
            # Already mirrored by development startup or a previous committed write.
            # Do not overwrite live rows while stamping the Alembic revision.
            continue
        value = row.settings_data
        stored = json.loads(value) if isinstance(value, str) else (value or {})
        if not isinstance(stored, dict):
            raise ValueError("La configuración de tienda no es un objeto JSON")
        scopes = {"published": {k: v for k, v in stored.items() if not k.startswith("_")}}
        draft = stored.get("_homepage_draft")
        if isinstance(draft, dict) and isinstance(draft.get("data"), dict):
            scopes["draft"] = draft["data"]
        for version in stored.get("_homepage_history") or []:
            if isinstance(version, dict) and isinstance(version.get("data"), dict):
                version_id = str(version.get("id") or "")
                if version_id and len(version_id) <= 50 and all(c.isalnum() or c in "-_" for c in version_id):
                    scopes["history:" + version_id] = version["data"]

        for scope, data in scopes.items():
            for kind, key, position, config, items in _entries(data):
                result = bind.execute(blocks.insert().values(
                    storefront_id=row.id, scope=scope, block_key=key,
                    block_type=kind, position=position, configuration=config,
                ))
                block_id = result.inserted_primary_key[0]
                for item_position, item in enumerate(items):
                    bind.execute(slides.insert().values(
                        block_id=block_id, position=item_position,
                        image_url=str(item.get("image_url") or ""),
                        mobile_image_url=str(item.get("mobile_image_url") or ""),
                        title=str(item.get("title") or "")[:160],
                        link=str(item.get("link") or "/catalogo")[:300],
                        configuration=item,
                    ))


def downgrade():
    raise RuntimeError(
        "La nueva estructura contiene borradores e historial editorial. "
        "Antes de revertir se requiere respaldo verificado y procedimiento manual."
    )
