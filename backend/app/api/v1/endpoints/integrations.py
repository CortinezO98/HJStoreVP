"""Centro de integraciones: estado de configuración, nunca estado de conexión en vivo.

No ejecuta solicitudes a proveedores ni expone credenciales. Exclusivo Admin.
"""
from fastapi import APIRouter, Depends
from app.core.config import settings
from app.core.deps import require_admin

router = APIRouter(prefix="/integrations", tags=["Centro de integraciones"])


def record(key, title, group, stage, status, detail, path=None):
    return {"key": key, "title": title, "group": group, "stage": stage,
            "status": status, "detail": detail, "path": path}


@router.get("/overview")
def overview(_=Depends(require_admin)):
    wompi_keys = all((
        settings.WOMPI_PUBLIC_KEY, settings.WOMPI_PRIVATE_KEY,
        settings.WOMPI_INTEGRITY_SECRET, settings.WOMPI_EVENTS_SECRET
    ))
    wompi_live = settings.ENVIRONMENT == "production" and settings.WOMPI_ALLOW_LIVE_PAYMENTS and settings.WOMPI_ENV == "production"
    smtp_ready = all((settings.SMTP_HOST, settings.SMTP_USER, settings.SMTP_PASSWORD, settings.EMAILS_FROM))
    notifications_on = smtp_ready and settings.EMAIL_NOTIFICATIONS_ENABLED and (
        settings.ENVIRONMENT != "production" or settings.EMAIL_LIVE_DELIVERY_ALLOWED
    )
    recovery_on = smtp_ready and settings.EMAIL_NOTIFICATIONS_ENABLED and settings.CART_RECOVERY_DELIVERY_ENABLED and (
        settings.ENVIRONMENT != "production" or
        (settings.EMAIL_LIVE_DELIVERY_ALLOWED and settings.CART_RECOVERY_LIVE_ALLOWED)
    )
    integrations = [
        record("wompi", "Wompi", "Pagos", "checkout implementado",
               "habilitado_por_configuracion" if wompi_keys and (settings.WOMPI_ENV != "production" or wompi_live) else "pendiente_configuracion",
               "Llaves presentes y ambiente permitido (no acredita conexión ni cobros)" if wompi_keys and (settings.WOMPI_ENV != "production" or wompi_live) else "Completar llaves y habilitación apropiada antes de cobrar", "/pedidos-web"),
        record("addi", "Addi", "Pagos", "integración sujeta a proveedor",
               "credenciales_presentes" if settings.ADDI_CLIENT_ID and settings.ADDI_CLIENT_SECRET else "pendiente_configuracion",
               "Solo presencia de credenciales; requiere validación con proveedor" if settings.ADDI_CLIENT_ID and settings.ADDI_CLIENT_SECRET else "Sin credenciales completas", "/pedidos-web"),
        record("sistecreditos", "Sistecréditos", "Pagos", "integración sujeta a proveedor",
               "credenciales_presentes" if all((settings.SISTECREDITOS_API_KEY, settings.SISTECREDITOS_STORE_ID, settings.SISTECREDITOS_SECRET)) else "pendiente_configuracion",
               "Solo presencia de credenciales; requiere validación con proveedor" if all((settings.SISTECREDITOS_API_KEY, settings.SISTECREDITOS_STORE_ID, settings.SISTECREDITOS_SECRET)) else "Sin credenciales completas", "/pedidos-web"),
        record("shipping", "Envíos y tarifas", "Logística", "tarifario manual",
               "modulo_disponible", "Cotizaciones manuales; sin conexión automática con transportadora", "/envios"),
        record("tracking", "Seguimiento", "Logística", "registro manual",
               "modulo_disponible", "Eventos internos; no son tracking verificado en tiempo real", "/pedidos-web"),
        record("notifications", "Correo transaccional", "Comunicación", "worker opcional",
               "habilitado_por_configuracion" if notifications_on else "deshabilitado",
               "Configuración de envío habilitada; entrega SMTP no comprobada" if notifications_on else "Envíos apagados o SMTP incompleto", "/notificaciones"),
        record("recovery", "Recuperación de carritos", "Comunicación", "worker y consentimiento",
               "habilitado_por_configuracion" if recovery_on else "deshabilitado",
               "Permisos individuales de clientes siguen siendo obligatorios" if recovery_on else "Envío automático apagado; requiere consentimiento", "/fidelizacion"),
        record("promotions", "Promociones y cupones", "Comercial", "gestión interna",
               "modulo_disponible", "Reglas de descuentos calculadas en backend", "/promociones"),
        record("loyalty", "Puntos de fidelización", "Comercial", "acumulación",
               "modulo_disponible", "Acumulación de puntos; canje todavía no implementado", "/fidelizacion"),
        record("post_sale", "Posventa y devoluciones", "Operación", "reembolsos documentados",
               "modulo_disponible", "No ejecuta reversos bancarios", "/posventa"),
        record("receipts", "Comprobantes internos", "Documentos", "documentos no fiscales",
               "modulo_disponible", "No son facturas ni notas crédito electrónicas", "/comprobantes"),
        record("dian", "Facturación DIAN", "Documentos", "preparación tributaria",
               "no_integrado", "Emisión fiscal desactivada; requiere habilitación real", "/configuracion-dian"),
        record("analytics", "Indicadores operativos", "Analítica", "reportes locales",
               "modulo_disponible", "Datos internos; no equivalen a conciliación bancaria", "/reportes"),
    ]
    return {"environment": settings.ENVIRONMENT,
            "disclaimer": "Estados basados en código/configuración local, no en salud de proveedor ni despliegue real. No se muestran llaves.",
            "integrations": integrations}
