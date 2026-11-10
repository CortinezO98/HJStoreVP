"""Herramienta de diagnóstico de login (solo lectura).

No modifica credenciales ni imprime hashes. El restablecimiento de
contraseñas requiere un procedimiento administrativo independiente.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent / 'backend'))
from app.db.session import SessionLocal
from app.models.models import User


def main():
    db = SessionLocal()
    try:
        row = db.query(User).filter(User.email == "admin@hjstorevp.com").first()
        print("Cuenta administrativa de referencia presente:", bool(row))
        if row:
            print("Activa:", bool(row.active))
            print("Rol:", row.role.value if hasattr(row.role, "value") else row.role)
    finally:
        db.close()


if __name__ == "__main__":
    main()
