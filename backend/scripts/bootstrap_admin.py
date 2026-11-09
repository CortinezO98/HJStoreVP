"""Creación segura del primer superadministrador de HJStoreVP.

Uso (desde backend/):
    python scripts/bootstrap_admin.py

No admite contraseñas por argumentos, no imprime credenciales y no
modifica cuentas existentes. Para crear administradores posteriores,
utiliza el panel Usuarios con una sesión super_admin.
"""
import getpass
import re
import sys
from pathlib import Path

# Permite ejecutar este archivo desde backend/ sin instalar el paquete.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import func
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.models import User, UserRole


def main():
    db = SessionLocal()
    try:
        existing_super_admin = (
            db.query(User.id)
            .filter(User.role == UserRole.SUPER_ADMIN)
            .first()
        )
        if existing_super_admin:
            print(
                "Ya existe un superadministrador. "
                "No se modificó ninguna cuenta. "
                "Usa Administración > Usuarios para crear más administradores."
            )
            return 1

        name = input("Nombre completo: ").strip()
        email = input("Correo electrónico: ").strip().lower()
        if not name or len(name) > 200:
            print("El nombre es obligatorio (máximo 200 caracteres).")
            return 1
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email) or len(email) > 255:
            print("Correo electrónico inválido.")
            return 1
        if db.query(User.id).filter(func.lower(User.email) == email).first():
            print("Ya existe una cuenta con este correo. No se hicieron cambios.")
            return 1

        password = getpass.getpass("Contraseña nueva (mínimo 12 caracteres): ")
        confirm = getpass.getpass("Repite la contraseña: ")
        if password != confirm:
            print("Las contraseñas no coinciden.")
            return 1
        if len(password) < 12 or len(password.encode("utf-8")) > 72:
            print("La contraseña debe tener al menos 12 caracteres y máximo 72 bytes.")
            return 1
        if not any(char.isalpha() for char in password) or not any(char.isdigit() for char in password):
            print("La contraseña debe contener letras y números.")
            return 1

        db.add(
            User(
                email=email,
                full_name=name,
                hashed_password=hash_password(password),
                role=UserRole.SUPER_ADMIN,
                active=True,
            )
        )
        db.commit()
        print(f"Superadministrador creado correctamente: {email}")
        return 0
    except Exception:
        db.rollback()
        print("No fue posible crear el administrador. Revisa la conexión y los logs del backend.")
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
