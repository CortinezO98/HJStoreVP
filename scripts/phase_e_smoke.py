#!/usr/bin/env python3
"""Fase E: verificaciones HTTP pasivas de HJStoreVP, solo localhost.

No hace login, POST, pagos, cambios de datos ni sigue redirecciones.
"""
import argparse
import json
import sys
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

ALLOWED_HOSTS = frozenset({"127.0.0.1", "localhost", "::1"})
MAX_BYTES = 131072


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


@dataclass(frozen=True)
class Check:
    name: str
    target: str
    path: str
    expected: frozenset[int]
    content_type: str | None = None
    contains: str | None = None
    header: tuple[str, str] | None = None


CHECKS = (
    Check("API health", "api", "/health", frozenset({200}), "application/json", '"status"'),
    Check("Catalogo publico", "api", "/api/v1/products/", frozenset({200}), "application/json"),
    Check("Usuarios protegidos", "api", "/api/v1/users", frozenset({401, 403})),
    Check("Integraciones protegidas", "api", "/api/v1/integrations/overview", frozenset({401, 403})),
    Check("API nosniff", "api", "/health", frozenset({200}), header=("X-Content-Type-Options", "nosniff")),
    Check("Tienda portada", "store", "/", frozenset({200}), "text/html", "<div"),
    Check("Tienda catalogo SPA", "store", "/catalogo", frozenset({200}), "text/html"),
    Check("Tienda checkout SPA", "store", "/checkout", frozenset({200}), "text/html"),
    Check("Tienda confirmacion SPA", "store", "/pago-confirmado", frozenset({200}), "text/html"),
    Check("Admin login SPA", "admin", "/login", frozenset({200}), "text/html"),
    Check("Admin disenador SPA", "admin", "/estudio-inicio", frozenset({200}), "text/html"),
)


def local_url(value: str) -> str:
    parts = urlsplit(value)
    if parts.scheme != "http" or parts.hostname not in ALLOWED_HOSTS:
        raise ValueError("Solo origenes HTTP localhost")
    if not parts.port or not 1 <= parts.port <= 65535:
        raise ValueError("Puerto TCP explicito obligatorio")
    if parts.username or parts.password or parts.query or parts.fragment or parts.path not in ("", "/"):
        raise ValueError("El origen no debe incluir ruta, credenciales ni parametros")
    return value.rstrip("/")


def fetch_local(origin: str, path: str, timeout: float):
    url = urljoin(origin + "/", path.lstrip("/"))
    if urlsplit(url).hostname not in ALLOWED_HOSTS:
        raise ValueError("Destino externo bloqueado")
    opener = build_opener(NoRedirect)
    req = Request(url, headers={"Accept": "text/html, application/json"}, method="GET")
    try:
        response = opener.open(req, timeout=timeout)
    except HTTPError as exc:
        response = exc
    with response:
        return response.status, response.headers, response.read(MAX_BYTES)


def run_checks(origins: dict[str, str], timeout=5.0):
    results = []
    for check in CHECKS:
        try:
            status, headers, body = fetch_local(origins[check.target], check.path, timeout)
            success = status in check.expected
            if check.content_type:
                success &= check.content_type in headers.get("Content-Type", "").lower()
            if check.contains:
                success &= check.contains in body.decode("utf-8", errors="replace")
            if check.header:
                name, value = check.header
                success &= headers.get(name, "").lower() == value.lower()
            detail = f"HTTP {status}"
        except (OSError, ValueError, URLError) as exc:
            success = False
            detail = f"Conexion/validacion: {type(exc).__name__}"
        results.append({"check": check.name, "ok": bool(success), "detail": detail})
    return results


def main(argv=None):
    parser = argparse.ArgumentParser(description="Fase E: comprobaciones pasivas localhost")
    parser.add_argument("--api", default="http://127.0.0.1:8000")
    parser.add_argument("--store", default="http://127.0.0.1:5173")
    parser.add_argument("--admin", default="http://127.0.0.1:5174")
    parser.add_argument("--timeout", type=float, default=5.0)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    try:
        origins = {name: local_url(getattr(args, name)) for name in ("api", "store", "admin")}
        if not 0.1 <= args.timeout <= 30:
            raise ValueError("Timeout entre 0.1 y 30 segundos")
    except ValueError as exc:
        parser.error(str(exc))
    results = run_checks(origins, args.timeout)
    if args.json:
        print(json.dumps({"passed": sum(x["ok"] for x in results), "total": len(results), "checks": results},
                         ensure_ascii=False, indent=2))
    else:
        for item in results:
            print(f"{'OK' if item['ok'] else 'FALLO'} | {item['check']} | {item['detail']}")
        print(f"Resultado: {sum(x['ok'] for x in results)}/{len(results)}")
        print("Nota: HTTP 200 en una SPA no demuestra permisos o compras funcionales.")
    return 0 if all(x["ok"] for x in results) else 1


if __name__ == "__main__":
    sys.exit(main())
