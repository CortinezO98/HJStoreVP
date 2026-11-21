#!/usr/bin/env python3
"""HJStoreVP E.5.1: auditoría ESTÁTICA de preparación para producción.

Sólo lee archivos del repositorio. No carga .env, no usa Docker, no importa
la aplicación, no abre sockets, no consulta DB, no imprime secretos.

No acredita HTTPS real, respaldos restaurables, migraciones aplicadas,
vulnerabilidades de dependencias ni estado de infraestructura externa.
"""
from __future__ import annotations

import argparse
import json
import re
from dataclasses import asdict, dataclass
from pathlib import Path


@dataclass(frozen=True)
class Check:
    code: str
    status: str
    description: str
    remediation: str = ""


def _read(repo: Path, name: str) -> str | None:
    try:
        path = repo / name
        if not path.is_file():
            return None
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        return None


def inspect_repository(repo: Path) -> list[Check]:
    """Retorna sólo metadatos seguros, sin volcar archivos/configuración."""
    result: list[Check] = []

    def record(code: str, status: str, description: str, remediation: str = ""):
        result.append(Check(code, status, description, remediation))

    compose = _read(repo, "docker-compose.yml")
    backend = _read(repo, "backend/app/core/config.py")
    dockerfile = _read(repo, "backend/Dockerfile")
    main = _read(repo, "backend/app/main.py")
    alembic = _read(repo, "backend/alembic/env.py")
    gitignore = _read(repo, ".gitignore")
    e2e = _read(repo, "docker-compose.e2e.yml")

    if compose is None:
        record("COMPOSE_MISSING", "BLOCKER", "No existe docker-compose.yml")
    else:
        # Confirmar el modelo de desarrollo, NO asumir que ya existe un
        # manifiesto de producción independiente.
        patterns = {
            "COMPOSE_DEV_ENV": (r"ENVIRONMENT=development", "Compose principal fuerza modo desarrollo"),
            "COMPOSE_RELOAD": (r"uvicorn[^\n]*--reload", "Backend arranca con recarga de desarrollo"),
            "COMPOSE_DB_FALLBACK": (r"DB_PASSWORD:-hjstore123|DB_ROOT_PASSWORD:-rootpass", "Hay contraseñas de desarrollo como valores de respaldo"),
            "COMPOSE_SECRET_FALLBACK": (r"SECRET_KEY:-changeme", "La clave de firma tiene valor de respaldo inseguro"),
        }
        for code, (pattern, message) in patterns.items():
            if re.search(pattern, compose, re.I):
                record(code, "BLOCKER", message,
                       "Usar manifiesto de producción separado con secretos obligatorios sin fallback")
            else:
                record(code, "PASS", "No se detectó el patrón de desarrollo: " + code)
        if re.search(r"\./backend:/app", compose):
            record("CODE_BIND_MOUNT", "BLOCKER",
                   "Se monta código fuente del host dentro del backend",
                   "Crear imagen inmutable para despliegue; no montar el código")
        else:
            record("CODE_BIND_MOUNT", "PASS", "Sin montaje directo de código backend en Compose principal")
        if re.search(r"127\.0\.0\.1:8000:8000", compose):
            record("LOCAL_BIND_API", "PASS", "La API se limita a loopback en el Compose principal")
        else:
            record("LOCAL_BIND_API", "WARNING",
                   "No se verificó que el puerto API esté limitado a loopback",
                   "Publicar únicamente tras un proxy TLS/controles de red")
    if dockerfile is None:
        record("DOCKERFILE_MISSING", "BLOCKER", "Falta backend/Dockerfile")
    else:
        if re.search(r"--reload", dockerfile):
            record("IMAGE_RELOAD", "BLOCKER", "Dockerfile utiliza --reload",
                   "Eliminar recarga de desarrollo de imagen destinada a producción")
        else:
            record("IMAGE_RELOAD", "PASS", "Dockerfile sin recarga de desarrollo")
        if re.search(r"^USER\s+\S+", dockerfile, re.M):
            record("IMAGE_NONROOT", "PASS", "Dockerfile declara usuario de ejecución")
        else:
            record("IMAGE_NONROOT", "WARNING", "No se identifica usuario no privilegiado",
                   "Preparar una imagen productiva con UID/GID no root")
    if backend is None:
        record("SETTINGS_MISSING", "BLOCKER", "No se encontró configuración central")
    else:
        for code, fragments, desc in [
            ("PROD_DEBUG_GUARD", ("if self.DEBUG:", "DEBUG debe ser false"), "Bloqueo de DEBUG en producción"),
            ("PROD_CORS_GUARD", ("ALLOWED_ORIGINS debe contener", "https://"), "CORS HTTPS restringido"),
            ("PROD_SECRET_GUARD", ("SECRET_KEY insegura",), "Validación de clave de firma"),
            ("PROD_AUTH_GUARD", ("Protecciones Redis de autenticación obligatorias",), "Protecciones de autenticación"),
        ]:
            record(code, "PASS" if all(x in backend for x in fragments) else "BLOCKER",
                   desc if all(x in backend for x in fragments) else "Falta una defensa explícita: " + desc)
    if main is None:
        record("MAIN_MISSING", "BLOCKER", "No se encontró backend/app/main.py")
    else:
        record("PROD_DOCS_DISABLED",
               "PASS" if 'settings.ENVIRONMENT != "production" else None' in main else "WARNING",
               "Revisado cierre de OpenAPI en entorno producción",
               "Verificar mediante HTTP sobre staging antes de desplegar")
    if alembic and "run_migrations_online" in alembic:
        record("ALEMBIC_PRESENT", "PASS", "Repositorio incluye motor de migraciones Alembic")
    else:
        record("ALEMBIC_PRESENT", "BLOCKER", "No se detectó configuración Alembic operativa")
    record("MIGRATIONS_DB_STATUS", "MANUAL",
           "No se ha comparado revisión Alembic con una base staging",
           "En staging aislado ejecutar alembic current/heads y practicar rollback")
    record("BACKUP_RESTORE", "MANUAL",
           "No se ha restaurado un respaldo y cotejado la integridad en staging",
           "Validar restauración de MariaDB + imágenes y objetivos RPO/RTO")
    record("TLS_EDGE", "MANUAL",
           "HTTPS/HSTS/certificados externos no se verifican con auditoría estática",
           "Probar TLS, proxy, DNS y cabeceras en staging")
    record("PROVIDER_LIVE", "MANUAL",
           "No se habilitan ni verifican pagos, correo y demás proveedores",
           "Activar sólo después de pruebas y aprobaciones por proveedor")
    if gitignore and ".env" in gitignore and "*.key" in gitignore:
        record("SECRET_IGNORE", "PASS", "Gitignore excluye .env y archivos de claves")
    else:
        record("SECRET_IGNORE", "WARNING", "Revisar exclusiones de secretos en Git")
    if e2e and "name: hjstorevp-e2e" in e2e and "tmpfs:" in e2e:
        record("E2E_ISOLATION", "PASS", "Compose E2E identifica proyecto distinto y BD temporal")
    else:
        record("E2E_ISOLATION", "WARNING", "No se confirmó el aislamiento E2E")
    return result


def summarize(checks: list[Check]) -> dict[str, object]:
    counts = {s: sum(c.status == s for c in checks) for s in
              ("BLOCKER", "WARNING", "MANUAL", "PASS")}
    return {"ready_for_production": False, "counts": counts,
            "checks": [asdict(c) for c in checks],
            "notice": "Diagnóstico estático; no verifica infraestructura ni autoriza despliegue"}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--json", action="store_true", help="Salida JSON sin secretos")
    args = parser.parse_args(argv)
    findings = inspect_repository(args.repo_root.resolve())
    summary = summarize(findings)
    if args.json:
        print(json.dumps(summary, ensure_ascii=False, indent=2))
    else:
        for check in findings:
            print(f"[{check.status}] {check.code}: {check.description}")
            if check.status != "PASS" and check.remediation:
                print(f"  Accion: {check.remediation}")
        print("Conteos:", summary["counts"])
        print("NO APTO PARA PRODUCCION: verificación estática y validaciones manuales pendientes")
    # Siempre requiere validación manual independiente. Si hay bloqueos,
    # señalizar al CI mediante exit 2; en ausencia de bloqueos sigue
    # devolviendo 1 (aún no es una autorización de despliegue).
    return 2 if any(x.status == "BLOCKER" for x in findings) else 1


if __name__ == "__main__":
    raise SystemExit(main())
