# HJStoreVP — Conciliación avanzada y recuperación controlada, fase inicial

Fecha: 2026-11-19. Rama: main. Solo consultas, sin operación monetaria.

## Situación a partir de la consola local

El usuario confirmó construcción Docker del backend/frontend, y Alembic mostró `Running upgrade 20261118_13 -> 20261119_14`, sin error en la salida compartida. No hay evidencia en esa salida de los comandos posteriores `docker compose up`, `alembic current` ni `docker compose ps`: comprobarlos por separado.

## Implementación entregada

- Endpoint protegido para ADMIN/SUPER_ADMIN:
  `GET /api/v1/commerce-operations/wompi-verify/{order_id}`.
- Solo consulta la transacción **ya vinculada** al pedido en `payment_ref`, a través de la consulta autorizada del servidor Wompi. No recibe un ID externo arbitrario.
- Compara el número de referencia, importe en centavos COP, moneda, identificador de transacción y estado del proveedor frente al pedido web local.
- Diagnósticos: `identity_mismatch`, `status_conflict`, `consistent`, `non_final_or_unknown`. Una respuesta "consistent" significa que los datos observados coinciden; no es certificación contable ni autorización para entregar productos.
- El módulo **Reportes → Integridad de pagos web** dispone de botón «Consultar Wompi» para hallazgos que tienen proveedor `wompi` y referencia conocida. Los resultados se muestran en el panel con estado local, externo y validaciones.
- El endpoint no llama `mark_paid`, no cancela pedidos, no envía webhooks, no crea compras y no actualiza existencias.
- Las referencias de pago duplicadas, solicitudes Addi `INITIATING-` sin referencia definitiva y reservas vencidas continúan visibles en los diagnósticos anteriores.

## Limitaciones de proveedor

- **Wompi**: esta función solo puede consultar una transacción con referencia ya guardada. Si el pedido todavía no tiene `payment_ref`, verificar en la pasarela fuera de esta consulta hasta disponer de un ID de transacción confiable.
- **Addi**: cuando queda `INITIATING-`, no se puede inferir el `applicationId` desde ese marcador. No reintentar `POST /applications` automáticamente; buscar primero la solicitud en el proveedor. El API de consulta existente requiere un identificador real. Un timeout no certifica rechazo.
- **Sistecréditos**: la existencia de una función de consulta por `transaction_id` no acredita que exista ni cuál sea el contrato real de conciliación. Pendiente validar documentación/credenciales y contrato de firma antes de automatizar.

## Actualización local (la migración previa ya aparece ejecutada)

Después de verificar que `alembic current` indica `20261119_14`:

```cmd
cd C:\Users\jjcor\Documents\Github\HJStoreVP
git status --short
git pull --ff-only origin main
docker compose up -d --build backend frontend frontend-admin
docker compose exec backend alembic current
docker compose ps
docker compose logs --tail=80 backend frontend frontend-admin
```

No hay nueva migración en esta fase. Evitar `docker compose down -v`, `alembic stamp` y pruebas con dinero real.

## Antes de producción

Se requieren validaciones controladas y documentadas de importes, estados, idempotencia, webhooks duplicados y tardíos, diferencias entre proveedor y base local, además de auditorías de permisos y carga. Esta entrega fue verificada como cambios de código publicados en GitHub; no certifica pruebas Docker ni pasarelas reales.
