# HJStoreVP — Recuperación controlada de solicitudes incompletas

Fecha de integración: 2026-11-19. Rama: main.

## Objetivo
Ayudar al superadministrador a identificar pedidos cuyos pagos tienen resultado incierto, sin confundir una demora o falta de webhook con un rechazo y sin iniciar cobros adicionales.

## Implementación
- Nuevo endpoint protegido con `require_admin`: `GET /api/v1/commerce-operations/payment-recovery-queue`.
- Filtros: `provider` (wompi, addi, sistecreditos), `pending_minutes` (5–10080), `page`, `per_page` (1–100).
- Detecta tres situaciones:
  1. **Intento Addi ambiguo:** la referencia empieza por `INITIATING-`. Puede significar una aplicación remota creada cuya respuesta se perdió. No realizar un nuevo `POST /applications`; ubicarla por número de pedido en el proveedor.
  2. **Pedido pendiente antiguo:** existe método de pago iniciado y ha superado el umbral de antigüedad desde su última actualización. No supone pago fallido. Consultar el portal del proveedor.
  3. **Cancelación con fecha de pago:** inconsistencia que requiere revisión prioritaria en proveedor y posventa. No alterar inventario o reintegrar fondos automáticamente.
- La respuesta oculta el identificador técnico `INITIATING-` y solo comunica si existe referencia externa verificable. Incluye prioridad y orientación operativa, sin datos personales del comprador.
- Nuevo componente `PaymentRecoveryQueue.jsx` en **Reportes**, junto a la conciliación interna y la consulta manual Wompi ya integradas. Filtros, paginación, errores con reintento, lectura accesible y totales.
- **Solo lectura**: no se llama a `mark_paid`, `cancel_web_order`, `create_addi_application`, `get_addi_application` ni `get_sistecreditos_transaction` desde esta cola. No hay actualizaciones SQL ni migraciones.

## Restricciones importantes
El código de `backend/app/services/credito.py` expone funciones para consulta de solicitudes por ID, pero no existe verificación concluyente en el proyecto del contrato real, esquema de estados y garantías de autenticidad/referencia/monto de Addi o Sistecréditos. No se automatizará la recuperación de esos cobros hasta validar credenciales, documentación y contratos del proveedor. La consulta por número de pedido debe realizarse manualmente en el portal contractual si no se conoce el ID externo.

El umbral (30 minutos por defecto) solo clasifica casos para revisar: **no define vencimiento del pago ni fecha de expiración de una reserva**. Una consulta sin casos no certifica todos los cobros del sistema. Los pagos reales permanecen pendientes de las pruebas integrales y habilitación controlada.

## Actualización en el PC Windows
Si la migración anterior ya está aplicada, **esta entrega no necesita otra migración**:

```cmd
cd C:\Users\jjcor\Documents\Github\HJStoreVP
git status --short
git pull --ff-only origin main
docker compose up -d --build backend frontend-admin
docker compose exec backend alembic current
docker compose ps
docker compose logs --tail=80 backend frontend-admin
git log -1 --oneline
```

Alembic debe mostrar `20261119_14`. Si aparece otra versión o errores SQL, no ejecutar `alembic stamp` ni reinicializar volúmenes.

## Estado de verificación
Los archivos se publicaron y volvieron a consultar en GitHub. Esto no sustituye una compilación, pruebas con el backend Docker local, respuestas firmadas de pasarelas, ni pruebas reales con dinero. Conservar pruebas funcionales integrales y de seguridad para la etapa final acordada.
