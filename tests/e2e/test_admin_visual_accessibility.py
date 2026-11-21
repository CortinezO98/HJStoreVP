"""E.4.4: navegación, responsive y accesibilidad básica del panel E2E.

Sólo 127.0.0.1:25174 -> API 127.0.0.1:18000. No publica portada.
No reemplaza una auditoría formal WCAG, ni pruebas de contraste/lector de pantalla.
"""
import pytest
from playwright.sync_api import expect, sync_playwright

from test_admin_browser import (
    ADMIN, API, _assert_e2e_services, _context, _login,
)

# Vistas representativas de administración, no todas las combinaciones posibles.
ROUTES = (
    ("/", "Dashboard"),
    ("/productos", "Productos"),
    ("/inventario", "Inventario"),
    ("/estudio-inicio", "Estudio visual del inicio"),
)
VIEWPORTS = (
    {"width": 1440, "height": 900},
    {"width": 820, "height": 1180},
    {"width": 390, "height": 844},
)


def _assert_no_document_overflow(page, tolerance=2):
    dimensions = page.evaluate("""() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth
    })""")
    assert dimensions["document"] <= dimensions["viewport"] + tolerance, (
        f"Desbordamiento horizontal del documento en {page.url}: {dimensions}"
    )
    assert dimensions["body"] <= dimensions["viewport"] + tolerance, (
        f"Desbordamiento horizontal del body en {page.url}: {dimensions}"
    )


@pytest.mark.parametrize("viewport", VIEWPORTS, ids=["desktop", "tablet", "mobile"])
def test_admin_routes_render_without_global_horizontal_overflow(viewport):
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            ctx = _context(browser, viewport)
            page = ctx.new_page()
            _assert_e2e_services(page.request)
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            _login(page, "e2e-superadmin@example.com")
            for route, label in ROUTES:
                page.goto(route)
                expect(page).to_have_url(ADMIN + route, timeout=15000)
                expect(page.locator("#admin-main")).to_be_visible(timeout=15000)
                if route == "/estudio-inicio":
                    expect(page.get_by_role("heading", name=label, exact=True).first).to_be_visible(timeout=15000)
                else:
                    expect(page.locator(".admin-topbar-title")).to_have_text(label, timeout=15000)
                # Esperar fuentes y renderizado; no iniciar ni modificar operaciones comerciales.
                page.evaluate("() => document.fonts.ready")
                _assert_no_document_overflow(page)
            assert not errors, f"Errores JavaScript no controlados: {errors}"
            ctx.close()
        finally:
            browser.close()


def test_keyboard_skip_link_and_command_palette():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            ctx = _context(browser, VIEWPORTS[0])
            page = ctx.new_page()
            _assert_e2e_services(page.request)
            _login(page, "e2e-superadmin@example.com")
            page.goto("/")
            skip = page.get_by_role("link", name="Saltar al contenido")
            assert skip.count() == 1
            assert skip.get_attribute("href") == "#admin-main"
            page.keyboard.press("Control+k")
            dialog = page.get_by_role("dialog")
            expect(dialog).to_be_visible(timeout=5000)
            page.keyboard.press("Escape")
            expect(dialog).to_be_hidden()
            ctx.close()
        finally:
            browser.close()


def test_mobile_menu_opens_and_closes_by_keyboard():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            ctx = _context(browser, VIEWPORTS[2])
            page = ctx.new_page()
            _assert_e2e_services(page.request)
            _login(page, "e2e-superadmin@example.com")
            page.goto("/")
            toggle = page.get_by_role("button", name="Abrir menú de administración")
            expect(toggle).to_be_visible(timeout=10000)
            toggle.click()
            expect(page.locator("#admin-mobile-sidebar")).to_be_visible()
            assert toggle.get_attribute("aria-expanded") == "true"
            page.keyboard.press("Escape")
            expect(page.locator("#admin-mobile-sidebar")).to_have_count(0)
            assert toggle.get_attribute("aria-expanded") == "false"
            _assert_no_document_overflow(page)
            ctx.close()
        finally:
            browser.close()


def test_home_designer_create_and_delete_unsaved_section_without_publication():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            ctx = _context(browser, VIEWPORTS[0])
            page = ctx.new_page()
            _assert_e2e_services(page.request)
            baseline = page.request.get(API + "/api/v1/storefront-settings/public")
            assert baseline.status == 200
            baseline_data = baseline.json()
            _login(page, "e2e-superadmin@example.com")
            token = page.evaluate("() => sessionStorage.getItem('access_token')")
            url = API + "/api/v1/storefront-settings/admin/homepage-draft"
            headers = {"Authorization": "Bearer " + token}
            before = page.request.get(url, headers=headers)
            assert before.status == 200
            assert before.json()["has_saved_draft"] is False, "Inicia con BD E2E limpia"
            page.goto("/estudio-inicio")
            expect(page.get_by_role("heading", name="Estudio visual del inicio").first).to_be_visible(timeout=15000)
            page.get_by_role("button", name="Crear mosaico", exact=True).click()
            expect(page.get_by_text("Cambios sin guardar")).to_be_visible()
            remove = page.get_by_role("button", name="Eliminar sección")
            expect(remove).to_have_count(1)
            page.once("dialog", lambda dialog: dialog.accept())
            remove.click()
            expect(remove).to_have_count(0)
            assert page.request.get(url, headers=headers).json()["has_saved_draft"] is False
            assert page.request.get(API + "/api/v1/storefront-settings/public").json() == baseline_data
            ctx.close()
        finally:
            browser.close()
