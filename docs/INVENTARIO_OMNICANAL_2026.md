# HJStoreVP — Inventario omnicanal (noviembre 2026)

## Cambio implementado en main

- El checkout web reserva una unidad de pedido completa en **una sola ubicación activa**, preferentemente de tipo WEB si tiene suficiente inventario. En caso contrario intenta sedes activas en orden de mayor stock. Cada descuento es atómico y condicionado a stock suficiente. Si ninguna ubicación puede satisfacer toda la cantidad, devuelve HTTP 409.
- En el catálogo público, el campo histórico `total_stock` ahora indica la **cantidad máxima abastecible por una sede activa** para cada SKU vendible. En el panel administrativo, `total_stock` mantiene la suma global informativa. En productos con variantes, el total público agrega el máximo abastecible de cada variante activa; la venta requiere seleccionar una variante.
- El detalle de productos y la lista de variantes tienen la misma semántica de disponibilidad pública.
- API administrativa `GET /api/v1/inventory/overview?search=&page=1&per_page=40`: matriz paginada de SKU (incluye variantes), total global y stock web abastecible, con detalle por sede, sedes inactivas explícitas y sin mutación de datos.
- En el panel **Inventario** del superadministrador se muestra la matriz por SKU/sede, búsqueda y paginación, y se refresca al reponer, transferir o pulsar Actualizar.
- Las ventas físicas rechazan elegir una ubicación de tipo WEB, evitando registrar ventas de mostrador contra el almacén web.

## Reglas y límites

- El sistema **no divide automáticamente un renglón de pedido web entre sedes**. Ejemplo: 3 unidades en sede A y 3 en sede B significan un máximo abastecible online de 3 unidades por línea de pedido, no 6. Esta decisión respeta la restricción existente de una reserva por línea en `order_stock_reservations`; dividir reservas requeriría migración y revisión integral.
- El catálogo ofrece una instantánea no bloqueante; al crear la orden se comprueba de nuevo el stock y se descuenta de forma transaccional. La reserva exacta se conserva con la sede que descontó stock.
- El stock web se limita a ubicaciones activas. El stock global del administrador incluye también saldos en ubicaciones inactivas, pero queda claramente diferenciado.
- Productos padre con variantes, variantes cuyo padre está inactivo y SKU inactivos se marcan no vendibles para la columna web de la matriz.
- Las cantidades de `qty_available` de los pedidos web ya se descuentan en el momento de reservar; el contador `qty_reserved` histórico es independiente y **no debe volver a restarse** para calcular el stock ofrecido al público.
- La existencia global no es un único almacén: el inventario físico no se mueve al crear una venta web en otra ubicación. La sede exacta queda registrada en la reserva.
- No se habilita sincronización con POS externos ni centros de distribución de terceros: el POS físico aquí es el integrado en HJStoreVP.

## Actualización local (Windows)

```cmd
cd C:\Users\jjcor\Documents\Github\HJStoreVP
git status --short
git pull --ff-only origin main
docker compose up -d --build backend frontend-admin
docker compose ps
docker compose logs --tail=80 backend frontend-admin
docker compose exec backend alembic current
```

No se ha añadido migración de base de datos. **No** ejecutar `docker compose down -v`, seeds destructivos ni operaciones manuales de ajuste de inventario.

## Validaciones a reservar para fase final

- Escenarios con stock distribuido (3+3), sedes inactivas, sede web vacía y stock físico disponible.
- Alta concurrencia: checkout web contra web, web contra ventas físicas, transferencia contra checkout; rollback completo ante error.
- Variantes agotadas o cuyos padres estén inactivos, seguridad por roles y registros de movimientos.
- Revisar al integrar un POS externo antes de afirmar sincronización con sistemas de terceros.

Esta entrega corresponde a implementación de código; no se han ejecutado pruebas integrales con la base de datos local del comercio.
