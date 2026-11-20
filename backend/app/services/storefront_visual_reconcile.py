"""Verifica y, con autorización explícita, reconstruye el espejo visual relacional.

Uso (desde /app)::
  python -m app.services.storefront_visual_reconcile --check
  python -m app.services.storefront_visual_reconcile --apply --backup-confirmed

No crea la fila storefront_settings. Nunca modifica settings_data y no publica
borradores. Las operaciones de aplicación se hacen bajo bloqueo de la fila.
"""
import argparse
import json
import sys

from sqlalchemy import inspect
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.models import StorefrontSettings, StorefrontVisualBlock
from app.services.storefront_visual_storage import (
    inspect_homepage_mirror, mirror_homepage,
)

ROW_ID = 1


def audit(db: Session) -> tuple[dict, StorefrontSettings | None]:
    row = db.get(StorefrontSettings, ROW_ID)
    inspector = inspect(db.get_bind())
    ready = (
        inspector.has_table("storefront_visual_blocks")
        and inspector.has_table("storefront_visual_slides")
    )
    if not ready:
        return {
            "schema_ready": False,
            "source_exists": row is not None,
            "in_sync": False,
            "message": "Debes aplicar la migración Alembic antes de reconciliar.",
        }, row
    if row is None:
        orphan_count = db.query(StorefrontVisualBlock).filter(
            StorefrontVisualBlock.storefront_id == ROW_ID
        ).count()
        return {
            "schema_ready": True,
            "source_exists": False,
            "in_sync": orphan_count == 0,
            "actual_blocks": orphan_count,
            "expected_blocks": 0,
            "message": "No existe una configuración guardada: no hay datos que copiar.",
        }, row
    result = inspect_homepage_mirror(db, ROW_ID, dict(row.settings_data or {}))
    return {"schema_ready": True, "source_exists": True, **result}, row


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--check", action="store_true", help="Inspeccionar sin escribir en BD")
    group.add_argument("--apply", action="store_true", help="Reconstruir espejo desde JSON")
    parser.add_argument(
        "--backup-confirmed", action="store_true",
        help="Confirmas que ya generaste y verificaste un respaldo previo",
    )
    args = parser.parse_args()
    if args.apply and not args.backup_confirmed:
        parser.error("--apply requiere --backup-confirmed")

    with SessionLocal() as db:
        status, row = audit(db)
        if args.check:
            print(json.dumps(status, ensure_ascii=False, indent=2))
            return 0 if status.get("schema_ready") else 2

        if not status["schema_ready"]:
            print(json.dumps(status, ensure_ascii=False, indent=2))
            return 2
        if row is None:
            print(json.dumps(status, ensure_ascii=False, indent=2))
            return 3
        if status["in_sync"]:
            print(json.dumps({**status, "action": "sin_cambios"}, ensure_ascii=False, indent=2))
            return 0

        # Revalidate while holding the source row lock so editor saves cannot
        # interleave and make the mirror stale.
        row = db.query(StorefrontSettings).filter(
            StorefrontSettings.id == ROW_ID
        ).with_for_update().first()
        if row is None:
            db.rollback()
            print('La configuración fue eliminada durante la reconciliación.')
            return 3
        locked_status = inspect_homepage_mirror(db, ROW_ID, dict(row.settings_data or {}))
        if locked_status["in_sync"]:
            db.rollback()
            print(json.dumps({**locked_status, "action": "sin_cambios"}, ensure_ascii=False, indent=2))
            return 0
        try:
            mirror_homepage(db, ROW_ID, dict(row.settings_data or {}))
            verified = inspect_homepage_mirror(db, ROW_ID, dict(row.settings_data or {}))
            if not verified["in_sync"]:
                raise RuntimeError("La comparación posterior no coincide; cambios cancelados")
            db.commit()
        except Exception:
            db.rollback()
            raise
        print(json.dumps({**verified, "action": "espejo_reconciliado",
                          "json_modificado": False}, ensure_ascii=False, indent=2))
        return 0


if __name__ == "__main__":
    sys.exit(main())
