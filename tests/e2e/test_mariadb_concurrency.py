"""Competencia por la ultima unidad con dos clientes reales, SOLO E2E aislado.

El test NO inicia ni confirma cobros. Requiere seed y BD temporal.
"""
import concurrent.futures
import json
import threading
import uuid
from urllib.error import HTTPError
from urllib.request import Request, urlopen

API = "http://127.0.0.1:18000"


def request(method, path, data=None, token=None, key=None):
    body = json.dumps(data).encode("utf-8") if data is not None else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    if key:
        headers["Idempotency-Key"] = key
    req = Request(API + path, data=body, headers=headers, method=method)
    try:
        with urlopen(req, timeout=15) as res:
            return res.status, json.load(res)
    except HTTPError as err:
        return err.code, json.load(err)


def register_customer():
    email = "e2e-race-" + uuid.uuid4().hex[:16] + "@example.com"
    code, data = request("POST", "/api/v1/auth/register", {
        "full_name": "Comprador E2E",
        "email": email,
        "password": "E2E-Password-12345",
    })
    assert code == 201, f"Registro E2E rechazado: HTTP {code}"
    return data["access_token"]


def test_two_customers_compete_for_last_stock_unit():
    status, products = request("GET", "/api/v1/products/")
    assert status == 200
    matches = [x for x in products if x.get("sku") == "E2E-RACE-001"]
    assert len(matches) == 1, "Falta producto sintético; detener prueba"
    product = matches[0]
    assert product["total_stock"] == 1, "Inventario sintético no está intacto; reiniciar stack E2E"

    status, rates = request(
        "GET", "/api/v1/shipping/quote?department=Cundinamarca&city=Bogot%C3%A1"
    )
    assert status == 200
    matches = [x for x in rates if x.get("carrier") == "E2E Test Carrier"]
    assert len(matches) == 1
    rate = matches[0]

    tokens = [register_customer(), register_customer()]
    payload = {
        "items": [{"product_id": product["id"], "qty": 1}],
        "shipping_rate_id": rate["id"],
        "shipping_price_confirmed": float(rate["price"]),
        "shipping_address": {
            "full_name": "Comprador E2E",
            "phone": "3000000000",
            "address_line1": "Calle 123 E2E",
            "city": "Bogotá",
            "department": "Cundinamarca",
        },
    }
    start = threading.Barrier(2)

    def purchase(token):
        start.wait(timeout=10)
        return request("POST", "/api/v1/orders/web", payload, token=token, key=uuid.uuid4().hex)

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        future1 = pool.submit(purchase, tokens[0])
        future2 = pool.submit(purchase, tokens[1])
        results = [future1.result(timeout=25), future2.result(timeout=25)]

    statuses = sorted(status for status, _ in results)
    assert statuses == [201, 409], f"Resultado de competencia inesperado: {statuses}"

    status, after = request("GET", "/api/v1/products/")
    assert status == 200
    item = next(x for x in after if x.get("sku") == "E2E-RACE-001")
    assert item["total_stock"] == 0, "El inventario final debe ser cero (sin sobreventa)"

    for token in tokens:
        code, orders = request("GET", "/api/v1/orders/my-orders", token=token)
        assert code == 200
        assert len(orders) in (0, 1)
    assert sum(len(request("GET", "/api/v1/orders/my-orders", token=t)[1]) for t in tokens) == 1
