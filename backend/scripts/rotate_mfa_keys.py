"""Diagnóstico por defecto; --apply requiere respaldo y ventana sin escrituras MFA."""
import argparse
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.core.config import settings
from app.db.session import SessionLocal
from app.models.models import UserMFASettings
from app.services.mfa import rotate_ciphertext


def rotate_records(db, apply=False):
    if not settings.MFA_ENCRYPTION_KEYS:
        raise ValueError("Configura las llaves independientes")
    counts = {"records": 0, "secrets": 0, "rotations": 0, "legacy_recovery": 0}
    try:
        query = db.query(UserMFASettings).order_by(UserMFASettings.user_id)
        if apply:
            query = query.with_for_update()
        for row in query.all():
            counts["records"] += 1
            counts["legacy_recovery"] += sum(not h.startswith("v2:") for h in (row.recovery_hashes or []))
            for field in ("secret_ciphertext", "pending_secret_ciphertext"):
                old = getattr(row, field)
                if old is None:
                    continue
                counts["secrets"] += 1
                new = rotate_ciphertext(old)
                if new != old:
                    counts["rotations"] += 1
                    if apply:
                        setattr(row, field, new)
        if apply:
            db.commit()
        else:
            db.rollback()
        return counts
    except Exception:
        db.rollback()
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--confirm-backup", action="store_true")
    args = parser.parse_args()
    if args.apply and not args.confirm_backup:
        parser.error("--apply exige --confirm-backup y ventana de mantenimiento")
    try:
        with SessionLocal() as db:
            result = rotate_records(db, args.apply)
        print("MODO:", "APLICADO" if args.apply else "DIAGNOSTICO")
        for key, value in result.items():
            print(key, value)
        return 0
    except Exception:
        print("Rotación abortada; no se muestran secretos. Revisa llaves y conectividad.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
