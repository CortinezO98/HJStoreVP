# HJStoreVP — Control del inventario omnicanal y auditoría

Fecha: 2026-11-18. Implementación aditiva y de **solo lectura**; no ejecuta migraciones, semillas ni ajustes de stock.

## Capacidades

1. `GET /api/v1/inventory/alerts/by-location`: alertas de stock por ubicación **activa** y SKU activo, incluyendo cero unidades cuando todavía no existe una fila de inventario. Usa el mínimo actual por producto como umbral **por sede**; excluye el SKU padre de productos con variantes para evitar alertas sobre agrupadores no vendibles. Filtros: `location_id`, `search`, `page`, `per_page`.
2. `GET /api/v1/inventory/audit/movements`: consulta paginada de `stock_movements` con fecha, referencia de pedido, sede, SKU, tipo, cantidad, saldo antes/después, notas y nombre del responsable, si existe. Filtros: `location_id`, `product_id`, `movement_type`, `date_from`, `date_to`, `page`, `per_page`.
3. `GET /api/v1/inventory/audit/anomalies`: hallazgos sobre saldos negativos (`qty_available` o `qty_reserved`), reservas `held` sin fila de inventario de su producto y sede, y movimientos con aritmética incompatible (`qty_after != qty_before + qty`). Filtros: `location_id`, `page`, `per_page`.
4. En `frontend-admin/src/pages/InventoryPage.jsx` se integra `InventoryAuditPanel` con pestañas, selección de sede, búsqueda de alertas, fecha y tipo de movimiento, paginación y refresco después de entradas y transferencias.

Todas estas rutas usan `require_admin`: accesibles a SUPER_ADMIN y ADMIN, no a vendedores ni clientes. No exponen credenciales ni datos privados de compradores.

## Interpretación correcta

- `qty_available` ya se descuenta en el momento de reservar un pedido web; **no** debe restarse una segunda vez el contador `qty_reserved`.
- Un `qty_reserved` positivo no es por sí solo una inconsistencia: su semántica histórica es distinta del estado `held` en `order_stock_reservations`.
- Las alertas aplican el mínimo configurado a cada sede activa; ese mínimo no es necesariamente un umbral distinto para cada tienda.
- La auditoría de movimientos muestra lo que quedó registrado. Un movimiento que no aparece en este historial requiere investigación específica; no se concluye que el saldo de inventario actual sea igual al último `qty_after` porque pueden existir reservas y liberaciones de pedidos en otros flujos.
- Estos diagnósticos cubren **condiciones concretas**, no garantizan conciliación completa entre movimientos, reservas e inventario.
- No se corrigen ni restablecen automáticamente saldos, reservas ni pedidos.

## Actualización local

Desde la carpeta raíz de HJStoreVP en CMD:

```cmd
git status --short
git pull --ff-only origin main
docker compose up -d --build backend frontend-admin
docker compose ps
docker compose logs --tail=80 backend frontend-admin
docker compose exec backend alembic current
git log -1 --oneline
```

No hay migraciones nuevas. Nunca usar `docker compose down -v` ni ejecutar scripts destructivos para actualizar.

## Validación a efectuar en fase integral

Consultar los tres endpoints con administrador, vendedor y cliente; verificar paginación/filtros, cero stock sin fila, historial de movimientos, integridad de reservas, sedes inactivas y escenarios de concurrencia real MariaDB. Esta implementación no se ha ejecutado contra la base local del usuario.
