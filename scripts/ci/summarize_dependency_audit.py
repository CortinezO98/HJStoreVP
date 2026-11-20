"""Summarize dependency audit JSON without ignoring scanner errors.

Usage: python scripts/ci/summarize_dependency_audit.py npm|python path.json
This script intentionally does not fail solely because vulnerabilities exist.
Approval policy follows after risk triage, never automatic --force updates.
"""
import json
import sys
from pathlib import Path


def summarize(kind: str, path: Path) -> dict:
    if kind not in ("npm", "python"):
        raise ValueError("Tipo de escáner no permitido")
    if not path.is_file() or not path.stat().st_size:
        raise ValueError("El escáner no generó un informe")
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("Formato JSON inesperado")

    if kind == "npm":
        if payload.get("error"):
            raise ValueError("npm audit devolvió un error de herramienta")
        vulnerabilities = payload.get("vulnerabilities")
        metadata = payload.get("metadata")
        if not isinstance(vulnerabilities, dict) or not isinstance(metadata, dict):
            raise ValueError("Informe npm audit incompleto")
        counts = {level: 0 for level in ("critical", "high", "moderate", "low", "info")}
        for item in vulnerabilities.values():
            level = (item or {}).get("severity")
            if level in counts:
                counts[level] += 1
        return {"scanner": "npm", "packages_with_findings": len(vulnerabilities),
                "severity": counts}

    dependencies = payload.get("dependencies")
    if not isinstance(dependencies, list):
        raise ValueError("Informe pip-audit incompleto")
    affected = []
    findings = 0
    for dependency in dependencies:
        issues = dependency.get("vulns", [])
        if not isinstance(issues, list):
            raise ValueError("Hallazgos pip-audit con formato inválido")
        if issues:
            affected.append(str(dependency.get("name", "unknown")))
            findings += len(issues)
    return {"scanner": "pip-audit", "affected_packages": sorted(affected),
            "findings": findings}


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Uso: summarize_dependency_audit.py npm|python ruta.json")
    try:
        result = summarize(sys.argv[1], Path(sys.argv[2]))
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"ERROR: informe no válido: {exc}", file=sys.stderr)
        raise SystemExit(2)
    print(json.dumps(result, sort_keys=True, ensure_ascii=False))
    if result.get("packages_with_findings", result.get("findings", 0)):
        print("::warning::Auditoría detectó dependencias vulnerables. Clasificar antes de desplegar.")
