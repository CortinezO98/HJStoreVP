"""Diagnóstico de cuenta (solo lectura; nunca rota contraseñas)."""
from app.db.session import SessionLocal
from app.models.models import User


def main():
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(email="admin@hjstorevp.com").first()
        print("Cuenta administrativa de referencia presente:", bool(user))
        if user:
            print("Activa:", bool(user.active))
            print("Rol:", user.role.value if hasattr(user.role, "value") else user.role)
    finally:
        db.close()


if __name__ == "__main__":
    main()
