# HJStoreVP — Pagos, pedidos y notificaciones (fase de consolidación)

Fecha: 18 de noviembre de 2026. Cambios desplegados en `main`, sin migraciones ni alteración manual de pedidos.

## Seguridad de inicio de pago y webhooks

- `POST /api/v1/payments/initiate` devuelve HTTP 503 cuando Sistecréditos o Addi no están configurados; ya no devuelve al cliente una URL simulada como si fuera pago real.
- Addi requiere `applicationId` y URL de checkout antes de asociar la solicitud a un pedido.
- Los webhooks firmados de Addi y Sistecréditos rechazan eventos de otro proveedor y referencias incompatibles con la orden vinculada.
- Las confirmaciones demo de desarrollo no se permiten si existe un método de pasarela ya iniciado para el pedido.
- No se activaron pasarelas reales, credenciales, comprobantes de pago, cobros ni reembolsos. No se ha comprobado la integración real con Wompi/Addi/Sistecréditos. Las firmas y contratos de eventos requieren validación con cada proveedor antes de producción.
- **Advertencia pendiente de auditoría de integración:** La URL de checkout actual de Sistecréditos incorpora un identificador API en parámetros. No usar credenciales productivas hasta comprobar el flujo oficial, uso permitido de credenciales y compatibilidad con el proveedor.

## Monitoreo administrativo (solo lectura)

- `GET /api/v1/commerce-operations/overview?pending_hours=2&shipment_hours=24&limit=15` requiere `require_admin` (ADMIN o SUPER_ADMIN).
- Totales de pedidos web por estado; pendientes antiguos; pedidos pagados/en preparación sin despacho registrado, reservas HELD cuyo plazo ya transcurrió; contadores de correos `pending`, `sending`, `sent`, `failed`.
- Consulta por rangos relativos a UTC. No contiene correo del cliente, documentos, tokens, ni credenciales.
- La sección **Seguimiento de pagos, pedidos y comunicaciones** se añadió a `frontend-admin/src/pages/ReportsPage.jsx`.
- Un pedido pendiente puede seguir procesándose en la pasarela. Una reserva HELD vencida no se libera automáticamente; hacerlo sin verificación puede producir sobreventa o pagos tardíos.
- Los despachos son estados administrativos registrados en HJStoreVP, no confirmación directa de una transportadora.

## Actualización de entorno local

```cmd
cd C:\Users\jjcor\Documents\Github\HJStoreVP
git status --short
git pull --ff-only origin main
docker compose up -d --build backend frontend-admin
docker compose ps
docker compose logs --tail=80 backend frontend-admin
docker compose exec backend alembic current
git log -1 --oneline
```

No se requiere Alembic nuevo. No ejecutar semillas ni `docker compose down -v`.

## Pendientes para finalizar esta fase

- Validar los proveedores reales con credenciales y documentación contratada, incluyendo esquema webhook, firma, callbacks, pagos repetidos y conciliación financiera.
- Auditoría integral de idempotencia, backoff de correos y tratamiento manual de pagos tardíos y devoluciones.
- Pruebas finales con distintos roles y concurrencia en MariaDB. El código se ha publicado pero **no** se ha ejecutado contra la base local del usuario.
