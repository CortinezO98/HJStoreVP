"""E.5.5: navegador isolado, RBAC de monitor, sin datos ni alertas comerciales."""
from playwright.sync_api import expect, sync_playwright

from test_admin_browser import ADMIN, API, _assert_e2e_services, _context, _login


def test_superadmin_monitoring_page_is_readonly_and_reports_no_data_e2e():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            ctx = _context(browser, {"width": 390, "height": 844})
            page = ctx.new_page()
            _assert_e2e_services(page.request)
            _login(page, "e2e-superadmin@example.com")
            page.goto("/monitoreo-tecnico")
            expect(page.get_by_role("heading", name="Monitoreo técnico", level=1)).to_be_visible(timeout=15000)
            # En contenedor E2E no hay backend/monitoring: el reporte es
            # 503, nunca se muestra una métrica ficticia.
            expect(page.get_by_role("alert")).to_contain_text("No existe un informe local", timeout=15000)
            assert page.get_by_role("button", name="Actualizar informe").is_visible()
            assert page.locator("body").evaluate(
                "(el) => el.scrollWidth <= document.documentElement.clientWidth + 2")
            ctx.close()
        finally:
            browser.close()


def test_seller_cannot_view_monitoring_or_server_data():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            ctx = _context(browser, {"width": 820, "height": 1180})
            page = ctx.new_page()
            _assert_e2e_services(page.request)
            _login(page, "e2e-seller@example.com")
            page.goto("/monitoreo-tecnico")
            expect(page).to_have_url(ADMIN + "/", timeout=15000)
            token = page.evaluate("() => sessionStorage.getItem('access_token')")
            denied = page.request.get(
                API + "/api/v1/operations-monitoring",
                headers={"Authorization": "Bearer " + token},
            )
            assert denied.status == 403
            ctx.close()
        finally:
            browser.close()
