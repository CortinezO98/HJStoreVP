"""E2E navegador, únicamente contra docker-compose.e2e.yml.

No presiona finalizar compra ni inicia pasarelas de pago.
Ejecutar con pytest tras instalar playwright y navegador Chromium.
"""
import uuid

from playwright.sync_api import expect, sync_playwright

STORE = "http://127.0.0.1:25173"
API = "http://127.0.0.1:18000"


def get_seed_product(request):
    response = request.get(API + "/api/v1/products/")
    assert response.status == 200
    candidates = [p for p in response.json() if p.get("sku") == "E2E-BROWSER-001"]
    assert len(candidates) == 1, "Falta seed E2E; no continuar sobre datos comerciales"
    product = candidates[0]
    assert product["total_stock"] == 6
    return product


def test_register_cart_login_checkout_without_payment():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            isolated = browser.new_context(base_url=STORE, viewport={"width": 1280, "height": 900})
            # Bloquear conexiones externas inadvertidas (analítica, terceros, pasarelas).
            isolated.route("**/*", lambda route: (
                route.continue_() if route.request.url.startswith(
                    (STORE + "/", API + "/")
                ) else route.abort()
            ))
            page = isolated.new_page()
            product = get_seed_product(page.request)
            email = "e2e-browser-" + uuid.uuid4().hex[:12] + "@example.com"
            password = "Test-E2E-Strong-123!"

            page.goto("/registro")
            page.locator("#register-name").fill("Cliente Sintetico E2E")
            page.locator("#register-email").fill(email)
            page.locator("#register-password").fill(password)
            page.locator("#register-confirm").fill(password)
            page.get_by_role("button", name="CREAR CUENTA").click()
            expect(page).to_have_url("**/mi-cuenta")
            token = page.evaluate("() => sessionStorage.getItem('access_token')")
            assert token, "Registro no creó sesión utilizable"

            # Sembrar SOLO carrito local del navegador: no tocar inventario ni DB.
            page.goto("/carrito")
            page.evaluate(
                """product => localStorage.setItem('hjstore-cart',
                  JSON.stringify({state:{items:[{product,qty:1}]},version:0}))""",
                product,
            )
            page.reload()
            expect(page.get_by_text("Producto sintético E2E navegador").first).to_be_visible()
            page.get_by_role("button", name="Continuar a entrega y pago").click()
            expect(page).to_have_url("**/checkout")

            page.locator("#checkout-full-name").fill("Cliente Sintetico E2E")
            page.locator("#checkout-phone").fill("3000000000")
            page.locator("#checkout-street").fill("Calle 123 local de prueba")
            page.locator("#checkout-department").select_option("Cundinamarca")
            page.locator("#checkout-city").fill("Bogotá")
            expect(page.get_by_text("E2E Test Carrier").first).to_be_visible(timeout=15000)
            # La prueba se DETIENE antes de enviar formulario / iniciar pago.

            response = page.request.get(
                API + "/api/v1/orders/my-orders",
                headers={"Authorization": "Bearer " + token},
            )
            assert response.status == 200
            assert response.json() == [], "El recorrido pasivo no debe crear pedidos"

            # Segunda sesión real e independiente: credenciales recién registradas.
            fresh = browser.new_context(base_url=STORE)
            fresh.route("**/*", lambda route: (
                route.continue_() if route.request.url.startswith(
                    (STORE + "/", API + "/")
                ) else route.abort()
            ))
            login = fresh.new_page()
            login.goto("/login")
            login.locator("#login-email").fill(email)
            login.locator("#login-password").fill(password)
            login.get_by_role("button", name="INGRESAR", exact=True).click()
            expect(login).to_have_url("**/mi-cuenta")
            assert login.evaluate("() => Boolean(sessionStorage.getItem('access_token'))")
            fresh.close()
            isolated.close()
        finally:
            browser.close()
