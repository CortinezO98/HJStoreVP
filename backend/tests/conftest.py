"""Aislamiento obligatorio de la suite: jamás conectar pytest a MariaDB/Redis reales.

Este conftest se importa antes de los módulos de tests. Se fuerza una
SQLite efímera para cualquier uso accidental de SessionLocal y se
deshabilita el limitador Redis salvo pruebas que usan FakeRedis explícito.
"""
import gc
import os
import sys
import tempfile
import warnings

if "app.db.session" in sys.modules or "app.core.config" in sys.modules:
    raise RuntimeError("Los módulos de aplicación se cargaron antes del aislamiento pytest.")

_directory = tempfile.TemporaryDirectory(prefix="hjstorevp-pytest-")
_db_file = os.path.join(_directory.name, "app-isolated.db")
os.environ["DATABASE_URL"] = "sqlite:///" + _db_file
os.environ["REDIS_URL"] = "redis://127.0.0.1:1/15"
os.environ["AUTH_RATE_LIMIT_ENABLED"] = "false"
os.environ["AUTH_REFRESH_REPLAY_PROTECTION_ENABLED"] = "false"
os.environ["EMAIL_NOTIFICATIONS_ENABLED"] = "false"
os.environ["EMAIL_LIVE_DELIVERY_ALLOWED"] = "false"
os.environ["CART_RECOVERY_DELIVERY_ENABLED"] = "false"
os.environ["CART_RECOVERY_LIVE_ALLOWED"] = "false"
os.environ["WOMPI_ALLOW_LIVE_PAYMENTS"] = "false"
os.environ["ENVIRONMENT"] = "testing"
os.environ["UPLOAD_DIR"] = os.path.join(_directory.name, "uploads")

def pytest_sessionstart(session):
    from app.db.session import engine
    if engine.dialect.name != "sqlite":
        raise RuntimeError("BLOQUEADO: pytest no puede ejecutar contra una BD comercial.")


def pytest_unconfigure(config):
    """Cerrar conexiones SQLite antes de eliminar el directorio temporal.

    En Windows, SQLite impide borrar un archivo mientras alguna conexión
    permanece abierta. Se liberan solo motores SQLite de módulos de pruebas
    ya importados; nunca se crean conexiones a bases comerciales.
    """
    from sqlalchemy.engine import Engine

    motores = set()
    for modulo in tuple(sys.modules.values()):
        nombre = getattr(modulo, "__name__", "")
        if not nombre.startswith(("app.", "test_", "tests.")):
            continue
        for valor in vars(modulo).values():
            if isinstance(valor, Engine) and valor.dialect.name == "sqlite":
                motores.add(valor)

    for motor in motores:
        motor.dispose()
    gc.collect()

    try:
        _directory.cleanup()
    except PermissionError as error:
        warnings.warn(
            f"No se pudo eliminar la SQLite temporal de pruebas: {error}",
            RuntimeWarning,
            stacklevel=1,
        )
