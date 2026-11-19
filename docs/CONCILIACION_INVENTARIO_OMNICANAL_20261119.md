# HJStoreVP — Conciliación de inventario omnicanal

Fecha: 2026-11-19. Rama `main`. Entrega incremental de diagnósticos **solo lectura**.

## Situación previa verificada

- Los pedidos web tienen reservas `held` por línea, producto y ubicación. La reserva ya descontó `qty_available`.
- Al confirmar el proveedor un pago, la reserva se marca `committed`, **sin descontar stock por segunda vez**.
- Una cancelación web de pedido pendiente sin pago iniciado puede marcar `released` y restaurar inventario una sola vez. Si existe un intento de pago, debe comprobarse el estado con el proveedor.
- Ventas físicas descuentan stock con actualización condicional y registran un movimiento `out_sale` vinculado al pedido.
- Posventa puede reintegrar físicamente mercancía revendible a su sede original cuando existe reserva `committed`; los reembolsos siguen el módulo de posventa y no el selector de estados de pedidos.
- Ya existían auditorías de saldos negativos, aritmética de movimientos, existencias por sede y pedidos con pagos pendientes.

## Mejoras añadidas

### 1. Integridad de reservas web

`GET /api/v1/inventory/audit/reservation-integrity`

Requiere ADMIN/SUPER_ADMIN. Parámetros: `location_id` opcional, `page` desde 1, `per_page` de 1 a 100. Devuelve `total`, `items`, `note`.

Se detectan reservas con cantidad no positiva; línea del pedido ausente, de otro pedido, SKU o cantidad diferente; `held` cuyo pedido ya no es `pending`; `held` sin fila de inventario en su sede; `committed` con pedido no pagado; `released` con pedido no cancelado; y estados de reserva desconocidos.

**Limitación deliberada:** pedidos históricos sin filas de reserva no aparecen en esta consulta. Cero hallazgos no demuestra integridad de transacciones heredadas.

### 2. Conciliación de ventas físicas

`GET /api/v1/inventory/audit/physical-sale-integrity`

Mismos permisos y filtros. Agrupa movimientos `out_sale` por pedido, producto y sede y compara el negativo de su suma contra las unidades registradas en `order_items` del pedido físico. Detecta también pedidos físicos sin sede. Devuelve cantidades registradas/descontadas y motivo.

No compara movimientos históricos con el saldo **actual** de inventario, ya que otras operaciones legítimas pueden haberlo cambiado. Una diferencia es una señal de revisión, no autorización para sumar/restar stock.

### 3. Superadministrador

En `Inventario → Control y auditoría de inventario` se añadieron pestañas **Reservas web** y **Ventas físicas**, con filtro por sede, total de posibles diferencias, paginación y detalles. Solo aparecen a administradores (los vendedores no tienen acceso a consultas reservadas al administrador).

### 4. Restricción correcta en Pedidos web

El selector manual ahora permite únicamente `pending → cancelled` cuando no exista un pago iniciado y `paid → preparing`. No ofrece cancelación de pedidos pagados ni `preparing → cancelled`. La gestión de devoluciones/reembolsos se realiza por **Posventa**. Los pagos los confirma la pasarela; los despachos se gestionan por el módulo correspondiente. El backend continúa validando todos los cambios.

## Actualización en Windows

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

No hay migraciones nuevas ni scripts para sobrescribir inventario. **No ejecutar `docker compose down -v` ni ajustes automáticos en la base**.

## Comprobaciones en el cierre

Validar navegación y respuestas de ambos endpoints con un ADMIN y denegación de acceso a SELLER. Probar ventas/reservas ficticias con movimientos correctos e inconsistentes, valores reales de base y paginación, carga de consultas, conciliación con pasarelas, cancelaciones, reembolsos y concurrencia. Los commits GitHub se verificaron; no equivalen a pruebas de integración dentro del Docker local.
