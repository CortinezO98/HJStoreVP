#!/usr/bin/env python3
"""Verifica que el contexto de la imagen de producción del backend no incluya
pruebas, semillas, depuración, secretos ni documentación interna, y que el
repositorio no tenga scripts de depuración o semillas destructivas.

Reproduce las reglas de .dockerignore (última coincidencia gana, `!` incluye).
Uso: python scripts/ci/verify_production_context.py   → código 1 si hay rastros.
"""
from __future__ import annotations

import fnmatch
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
IGNORE_FILE = BACKEND / "Dockerfile.production.dockerignore"

FORBIDDEN_IN_IMAGE = [
    ("tests/*", "carpeta de pruebas"),
    ("*/tests/*", "carpeta de pruebas"),
    ("test_*.py", "archivo de prueba"),
    ("*/test_*.py", "archivo de prueba"),
    ("conftest.py", "configuración de pytest"),
    ("*seed*.py", "semilla de datos"),
    ("*debug*.py", "script de depuración"),
    (".env*", "archivo de entorno"),
    ("*/.env*", "archivo de entorno"),
    ("*.md", "documentación interna"),
    ("*.sql", "volcado de base de datos"),
    ("*.pem", "llave o certificado"),
    ("*.key", "llave o certificado"),
]
REQUIRED_IN_IMAGE = ["app/main.py", "alembic.ini", "requirements.txt", "scripts/bootstrap_admin.py"]
FORBIDDEN_IN_REPO = ["debug_login.py", "seed_final.py", "backend/debug_login.py", "backend/seed_final.py", "backend/seed.py"]


def load_rules(path: Path) -> list[tuple[bool, str]]:
    rules = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        negate = line.startswith("!")
        pattern = line[1:] if negate else line
        rules.append((negate, pattern.rstrip("/") if pattern.endswith("/") else pattern))
    return rules


def matches(rel: str, pattern: str) -> bool:
    parts = rel.split("/")
    candidates = ["/".join(parts[: i + 1]) for i in range(len(parts))]
    for candidate in candidates:
        if fnmatch.fnmatchcase(candidate, pattern):
            return True
        if pattern.startswith("**/") and fnmatch.fnmatchcase(candidate.split("/")[-1], pattern[3:]):
            return True
        if pattern.startswith("**/") and fnmatch.fnmatchcase(candidate, pattern[3:]):
            return True
    return False


def included(rel: str, rules: list[tuple[bool, str]]) -> bool:
    keep = True
    for negate, pattern in rules:
        if matches(rel, pattern):
            keep = negate
    return keep


def main() -> int:
    problems: list[str] = []
    if not IGNORE_FILE.exists():
        print(f"✗ Falta {IGNORE_FILE.relative_to(ROOT)}")
        return 1
    rules = load_rules(IGNORE_FILE)
    context = sorted(
        p.relative_to(BACKEND).as_posix()
        for p in BACKEND.rglob("*")
        if p.is_file() and included(p.relative_to(BACKEND).as_posix(), rules)
    )
    for rel in context:
        for pattern, reason in FORBIDDEN_IN_IMAGE:
            if fnmatch.fnmatchcase(rel, pattern):
                problems.append(f"imagen backend incluiría {rel}: {reason}")
                break
    for rel in REQUIRED_IN_IMAGE:
        if rel not in context:
            problems.append(f"imagen backend NO incluiría {rel} (necesario para operar)")
    for rel in FORBIDDEN_IN_REPO:
        if (ROOT / rel).exists():
            problems.append(f"el repositorio aún contiene {rel} (depuración o semilla destructiva)")
    if problems:
        print(f"✗ {len(problems)} problema(s) de limpieza para producción:")
        for problem in problems:
            print(f"  - {problem}")
        return 1
    print(f"✓ Contexto de producción limpio: {len(context)} archivos, sin pruebas, semillas, depuración ni secretos.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
