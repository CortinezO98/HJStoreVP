#!/usr/bin/env python3
"""Pruebas de caja negra pasivas de HJStoreVP, EXCLUSIVAMENTE localhost.

Solo solicitudes GET y HEAD: no autentica, modifica, compra, sube archivos,
prueba contraseñas, satura servicios ni recopila información privada.
Ejecutar en un entorno local controlado:
    python scripts/blackbox_local.py
"""
import json
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

BASE = "http://127.0.0.1:8000"
TIMEOUT = 4


def request(path, method="GET"):
    url = BASE + path
    parsed = urlparse(url)
    if parsed.hostname not in {"localhost", "127.0.0.1", "::1"}:
        raise ValueError("Solo se permite el entorno local")
    try:
        with urlopen(Request(url, method=method), timeout=TIMEOUT) as response:
            payload = response.read(256_000) if method == "GET" else b""
            return response.status, {key.lower(): value for key, value in response.headers.items()}, payload
    except HTTPError as error:
        return error.code, {key.lower(): value for key, value in error.headers.items()}, b""
    except URLError as error:
        print(f"[ERROR] API local no disponible: {type(error.reason).__name__}")
        sys.exit(2)


def report(title, passed, note=""):
    print(f"{'OK' if passed else 'HALLAZGO'} | {title}" + (f" | {note}" if note else ""))
    return 0 if passed else 1


def main():
    failed = 0
    status, headers, _ = request("/health")
    failed += report("Health accesible", status == 200, str(status))

    status, headers, data = request("/api/v1/products/")
    products = []
    try:
        products = json.loads(data)
    except (ValueError, UnicodeDecodeError):
        pass
    failed += report("Catálogo público disponible", status == 200 and isinstance(products, list), str(status))
    leak = isinstance(products, list) and any(
        isinstance(row, dict) and ("cost_price" in row or "margin_pct" in row)
        for row in products
    )
    failed += report("Catálogo no divulga costo/margen", not leak,
                     "Respuesta sin productos: comprobación parcial" if not products else "")

    if isinstance(products, list) and products:
        item_id = next((p.get("id") for p in products if isinstance(p, dict) and p.get("id")), None)
        if item_id:
            detail_status, _, detail = request(f"/api/v1/products/{item_id}")
            try:
                obj = json.loads(detail)
            except (ValueError, UnicodeDecodeError):
                obj = {}
            failed += report("Detalle no divulga costo/margen",
                             detail_status == 200 and "cost_price" not in obj and "margin_pct" not in obj)

    status, _, _ = request("/api/v1/products/?include_inactive=true")
    failed += report("Productos inactivos restringidos", status in (401, 403), str(status))
    status, _, _ = request("/api/v1/categories?include_inactive=true")
    failed += report("Categorías inactivas restringidas", status in (401, 403), str(status))
    status, _, _ = request("/api/v1/users")
    failed += report("Usuarios privados", status in (401, 403), str(status))
    status, _, _ = request("/api/v1/integrations/overview")
    failed += report("Integraciones privadas", status in (401, 403), str(status))

    _, headers, _ = request("/health")
    failed += report("Cabecera nosniff", headers.get("x-content-type-options") == "nosniff")
    failed += report("Cabecera anti-iframe", headers.get("x-frame-options") == "DENY")
    failed += report("Política de referer", bool(headers.get("referrer-policy")))

    status, _, _ = request("/docs", method="HEAD")
    print(f"INFO | /docs responde {status} (en desarrollo puede estar disponible; en producción debería ser 404)")

    print(f"\nResultado: {failed} hallazgos o comprobaciones fallidas.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
