"""Create a human-readable, bounded dependency remediation report.

Reads the JSON already produced by npm audit and pip-audit; never contacts
registries, installs packages, or suggests force upgrades.
"""
import argparse
import json
from pathlib import Path

from summarize_dependency_audit import summarize


def _cell(value) -> str:
    return str(value if value is not None else "—").replace("|", "\\|").replace("\n", " ")[:220]


def npm_findings(payload):
    rows = []
    for name, entry in sorted(payload["vulnerabilities"].items()):
        via = entry.get("via", [])
        cves = []
        for item in via:
            if isinstance(item, dict):
                ref = item.get("url") or item.get("name") or item.get("title")
                if ref:
                    cves.append(str(ref))
        fix = entry.get("fixAvailable")
        if isinstance(fix, dict):
            suggestion = str(fix.get("name", name)) + "@" + str(fix.get("version", "unknown"))
            if fix.get("isSemVerMajor"):
                suggestion += " (major: revisar compatibilidad)"
        elif fix is True:
            suggestion = "Corrección disponible; validar npm audit fix --dry-run"
        else:
            suggestion = "Sin corrección automática indicada"
        rows.append({
            "package": name,
            "severity": entry.get("severity", "unknown"),
            "direct": bool(entry.get("isDirect", False)),
            "installed_range": entry.get("range", "unknown"),
            "fix": suggestion,
            "references": sorted(set(cves))[:4],
        })
    priority = {"critical": 0, "high": 1, "moderate": 2, "low": 3, "info": 4}
    return sorted(rows, key=lambda x: (priority.get(x["severity"], 99), x["package"]))


def python_findings(payload):
    rows = []
    for package in payload["dependencies"]:
        for issue in package.get("vulns", []):
            rows.append({
                "package": package.get("name", "unknown"),
                "installed": package.get("version", "unknown"),
                "advisory": issue.get("id", "unknown"),
                "fix": ", ".join(issue.get("fix_versions", []) or []) or "No indicada",
            })
    return sorted(rows, key=lambda x: (x["package"], x["advisory"]))


def markdown_report(kind: str, payload: dict, *, project: str) -> str:
    # This is called only after summarize() has validated the raw JSON.
    lines = [f"### Dependencias: {project}", "", "Informe para revisión humana; no autoriza despliegue por sí solo.", ""]
    if kind == "npm":
        findings = npm_findings(payload)
        lines.append(f"Paquetes con hallazgos: **{len(findings)}**.")
        if findings:
            lines += ["", "| Severidad | Paquete | Directa | Rango afectado | Corrección informada | Referencias (máx. 4) |",
                      "|---|---|---|---|---|---|"]
            for row in findings[:100]:
                values = [_cell(row[key]) for key in
                          ("severity", "package", "direct", "installed_range", "fix")]
                values.append(_cell(", ".join(row["references"]) if row["references"] else "—"))
                lines.append("| " + " | ".join(values) + " |")
            if len(findings) > 100:
                lines.append(f"\nSe omitieron {len(findings)-100} filas de la vista; ver JSON original.")
        else:
            lines.append("Sin hallazgos reportados por npm audit en este análisis.")
    else:
        findings = python_findings(payload)
        lines.append(f"Avisos de seguridad: **{len(findings)}**.")
        if findings:
            lines += ["", "| Paquete | Versión | Aviso | Versiones sugeridas |",
                      "|---|---|---|---|"]
            for row in findings[:100]:
                lines.append("| " + " | ".join(_cell(row[key]) for key in
                             ("package", "installed", "advisory", "fix")) + " |")
            if len(findings) > 100:
                lines.append(f"\nSe omitieron {len(findings)-100} filas; ver JSON original.")
        else:
            lines.append("Sin hallazgos reportados por pip-audit en este análisis.")
    lines += ["", "> Las versiones sugeridas por los escáneres requieren evaluación de compatibilidad, exposición real y pruebas antes de actualizar.", ""]
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("kind", choices=("npm", "python"))
    parser.add_argument("path", type=Path)
    parser.add_argument("--project", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    summarize(args.kind, args.path)  # fails closed for missing/malformed data
    payload = json.loads(args.path.read_text(encoding="utf-8"))
    args.output.write_text(
        markdown_report(args.kind, payload, project=args.project), encoding="utf-8"
    )
    print(f"Informe de clasificación generado: {args.output}")


if __name__ == "__main__":
    main()
