# HJStoreVP — Seguridad transaccional y conciliación de pagos (etapa incremental)

Fecha: 2026-11-19. Rama: `main`.

## Revisión del código existente

Se inspeccionaron directamente `backend/app/api/v1/endpoints/payments.py`, `orders.py`, `post_sale.py`, `services/stock_reservations.py`, los modelos de `orders` y reservas, y el panel administrativo.

- La creación web reserva unidades por producto/sede dentro de la transacción del pedido, con condición de stock suficiente.
- La confirmación del proveedor transforma `held → committed`; no descuenta stock otra vez.
- El pedido web se bloquea con `SELECT ... FOR UPDATE` durante eventos de pago/cancelación.
- Wompi verifica la firma y consulta la transacción por API antes de aplicar su estado, comprobando moneda COP, importe en centavos y referencia del pedido.
- Los webhooks de Sistecréditos y Addi validan su firma mediante los verificadores configurados y verifican referencias asociadas antes de marcar pagado.
- Las reservas vencidas no se liberan automáticamente porque pueden existir cobros confirmados tardíamente.
- Los reembolsos y devoluciones tienen un flujo separado en Posventa.

Estas características ya existían; no se reimplementaron.

## Implementado ahora

### 1. Diagnóstico interno de pagos web, solo lectura

Nuevo endpoint: `GET /api/v1/commerce-operations/payment-integrity?page=1&per_page=25`.

Requiere `ADMIN` o `SUPER_ADMIN`, usa paginación de 1 a 100 y no cambia ningún pedido. Busca:

1. Pedidos pagados, en preparación, enviados o entregados sin `paid_at`, proveedor o referencia registrados.
2. Pedidos pendientes/cancelados que todavía tengan fecha de pago.
3. Pendientes con referencia externa pero sin proveedor.
4. Referencias externas repetidas en dos o más pedidos del mismo proveedor, un riesgo de conciliación.

La auditoría devuelve motivos explícitos y referencia, sin concluir que existe fraude ni afirmar que la pasarela haya confirmado el pago. Registros históricos pueden tener trazabilidad incompleta.

### 2. Tablero administrativo

En `Reportes → Integridad de pagos web` se muestra el número de hallazgos, detalle del pedido, estado/proveedor, referencia, total, motivos y paginación. Errores de consulta admiten reintento; no existen botones de cobro, aprobación, cancelación o ajuste de stock.

### 3. Idempotencia parcial de Addi

Cuando el pedido pendiente ya tiene `payment_method=addi` y una `payment_ref` guardada, `POST /api/v1/payments/initiate` responde 409 en lugar de llamar a Addi para crear otra aplicación externa. La operación existente queda para conciliación/seguimiento. Se mantienen los controles de proveedor y propiedad del pedido.

Esta protección evita **reintentos secuenciales después de guardar la primera referencia**, pero no garantiza idempotencia completa entre una caída de red y una operación remota ya creada; para eso se necesita un identificador de solicitud externo aceptado por el proveedor o un registro transaccional de intentos.

## Pendientes antes de pagos reales

- **Idempotencia persistente de creación de pedidos web:** actualmente el frontend evita doble clic y reutiliza un pedido creado en la misma sesión; todavía se requiere una clave idempotente duradera y una tabla/índice único en servidor para reintentos desde otras pestañas o después de fallos de red. Esto requiere una migración aditiva cuidadosamente planificada y pruebas de concurrencia.
- **Conciliación transaccional externa de Sistecréditos y Addi:** verificar garantías reales de los eventos firmados, montos/moneda, estados definitivos y consultas de proveedor. No asumir que todos los eventos tienen igual contrato.
- **Idempotencia de iniciación con proveedor ante fallos parciales:** especialmente cuando se creó una aplicación remota pero no se confirmó en la BD.
- **Pruebas integrales al cierre**, con respuestas duplicadas/fuera de orden, pagos tardíos, timeout, cambios de tarifa/stock y rollback.
- Reglas de negocio para reversos, disputas y devoluciones ante contracargos.

## Actualizar entorno

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

No se agregaron migraciones ni se manipularon órdenes, reservas o importes existentes. No ejecutar transacciones reales ni webhooks artificiales en producción sin un plan de pruebas.

**Estado de verificación:** commits y archivos cotejados en GitHub. No equivale a compilación Docker, pruebas funcionales o certificación del proveedor en el equipo del usuario.
