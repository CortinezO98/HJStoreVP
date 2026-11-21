"""Chromium E.4.3 — panel aislado, jamás localhost:5174 ni API :8000.

Requiere docker-compose.e2e.yml y e2e_seed.py, y detiene cualquier
solicitud que intente publicar portada o salir de puertos E2E locales.
"""
from urllib.parse import urlsplit

import pytest
from playwright.sync_api import expect, sync_playwright

ADMIN = "http://127.0.0.1:25174"
API = "http://127.0.0.1:18000"
PASSWORD = "E2E-Admin-Only-123!"


def _assert_e2e_services(request):
    # Abortamos si el host responde en un puerto accidental distinto.
    for url in (ADMIN + "/", API + "/health"):
        result = request.get(url, timeout=12000)
        assert result.status == 200, f"No responde entorno E2E: {url}"
    # Cuentas sintéticas verificables antes de abrir formularios.
    response = request.post(API + "/api/v1/auth/login", data={
        "email": "e2e-superadmin@example.com", "password": PASSWORD,
    })
    assert response.status == 200
    assert response.json().get("user_role") == "super_admin"


def _context(browser, viewport):
    context = browser.new_context(base_url=ADMIN, viewport=viewport)
    allowed_hosts = {("127.0.0.1", 25174), ("127.0.0.1", 18000)}

    def block_external(route):
        request = route.request
        parsed = urlsplit(request.url)
        try:
            host_port = (parsed.hostname, parsed.port)
        except ValueError:
            return route.abort()
        if parsed.scheme not in ("http", "https") or host_port not in allowed_hosts:
            return route.abort()
        # Ni siquiera las pruebas pueden publicar la portada automáticamente.
        if (request.method.upper() in ("POST", "PUT", "PATCH", "DELETE")
                and parsed.path == "/api/v1/storefront-settings/admin/homepage-publish"):
            return route.abort()
        return route.continue_()

    context.route("**/*", block_external)
    return context


def _login(page, email):
    page.goto("/login")
    page.get_by_placeholder("admin@hjstorevp.com").fill(email)
    page.locator('input[type="password"]').fill(PASSWORD)
    page.get_by_role("button", name="Ingresar", exact=True).click()
    expect(page).to_have_url(ADMIN + "/", timeout=15000)
    assert page.evaluate("() => Boolean(sessionStorage.getItem('access_token'))")


def test_superadmin_designer_draft_does_not_publish():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            ctx = _context(browser, {"width": 1440, "height": 900})
            page = ctx.new_page()
            _assert_e2e_services(page.request)
            initial = page.request.get(API + "/api/v1/storefront-settings/public")
            assert initial.status == 200
            baseline = initial.json()
            _login(page, "e2e-superadmin@example.com")
            token = page.evaluate("() => sessionStorage.getItem('access_token')")
            draft_url = API + "/api/v1/storefront-settings/admin/homepage-draft"
            auth = {"Authorization": "Bearer " + token}
            before_draft = page.request.get(draft_url, headers=auth)
            assert before_draft.status == 200
            prior_count = len(before_draft.json()["draft"]["homepage_custom_sections"])
            page.goto("/estudio-inicio")
            expect(page.get_by_role("heading", name="Estudio visual del inicio").first).to_be_visible(timeout=15000)
            page.get_by_role("button", name="Crear banner", exact=True).click()
            expect(page.get_by_text("Cambios sin guardar")).to_be_visible()
            save = page.get_by_role("button", name="Guardar borrador")
            expect(save).to_be_enabled()
            save.click()
            expect(page.get_by_text("Borrador privado guardado", exact=True)).to_be_visible(timeout=15000)

            # GET público via API de pruebas: el borrador no se publica.
            after = page.request.get(API + "/api/v1/storefront-settings/public")
            assert after.status == 200
            assert after.json() == baseline
            saved = page.request.get(draft_url, headers=auth)
            assert saved.status == 200
            assert saved.json()["has_saved_draft"] is True
            assert len(saved.json()["draft"]["homepage_custom_sections"]) == prior_count + 1
            # Repetible: limpiar el borrador SÓLO de la base sintética.
            discarded = page.request.delete(draft_url, headers=auth)
            assert discarded.status == 200
            assert page.request.get(API + "/api/v1/storefront-settings/public").json() == baseline
            ctx.close()
        finally:
            browser.close()


@pytest.mark.parametrize("size", [{"width": 390, "height": 844}, {"width": 820, "height": 1180}])
def test_seller_cannot_access_superadmin_designer_at_responsive_sizes(size):
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            ctx = _context(browser, size)
            page = ctx.new_page()
            _assert_e2e_services(page.request)
            _login(page, "e2e-seller@example.com")
            page.goto("/estudio-inicio")
            expect(page).to_have_url(ADMIN + "/", timeout=15000)
            assert page.get_by_role("heading", name="Estudio visual del inicio").count() == 0
            # El servidor aplica RBAC, aunque la URL se invoque directamente.
            token = page.evaluate("() => sessionStorage.getItem('access_token')")
            blocked = page.request.get(
                API + "/api/v1/storefront-settings/admin/homepage-draft",
                headers={"Authorization": "Bearer " + token},
            )
            assert blocked.status == 403
            ctx.close()
        finally:
            browser.close()


def test_anonymous_admin_route_redirects_to_login():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            ctx = _context(browser, {"width": 1280, "height": 800})
            page = ctx.new_page()
            _assert_e2e_services(page.request)
            page.goto("/estudio-inicio")
            expect(page).to_have_url(ADMIN + "/login", timeout=15000)
            assert page.get_by_role("button", name="Ingresar", exact=True).is_visible()
            ctx.close()
        finally:
            browser.close()
