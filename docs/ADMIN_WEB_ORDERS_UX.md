# HJStoreVP — Modernización de Pedidos web y seguimiento (Bootstrap 5)

## Entregado
- Dashboard de indicadores de los pedidos **filtrados** (cantidad, valor de pedidos, pendientes, pagados); el valor mostrado no representa ingresos contables efectivamente recaudados.
- Búsqueda por número de orden, cliente, teléfono, ciudad y departamento, filtro de estado solicitado al backend y ordenación por fecha o monto.
- Tabla Bootstrap responsiva con paginación visual 10, 15, 25 o 50 filas por página, estados legibles y acción «Ver detalle».
- Diálogo de pedido con información del cliente, dirección, artículos y gestor de envíos.
- Gestor de envíos con formularios Bootstrap, guía, corrección auditada, novedades e historial en línea temporal.
- Control estático en CI para detectar pérdida de servicios, contratos y permisos.

## Alcance y restricciones
El rediseño conserva exactamente las operaciones existentes:
- `ordersApi.list`, `ordersApi.updateStatus` y sus validaciones server-side.
- `shipmentsApi.get`, `dispatch`, `correctGuide` y `addEvent`.
- La creación de guía continúa restringida a pedidos pagados o en preparación.
- Las transiciones del seguimiento y el bloqueo del evento de entrega se mantienen.
- La UI no crea integraciones automáticas con transportadoras ni automatiza pagos; los eventos del historial son **novedades registradas por HJStoreVP**.
- No hay cambios de backend, roles, esquema Alembic, órdenes, inventario ni base de datos.

La paginación es **en cliente sobre los pedidos devueltos por la API**, no amplía el alcance de la consulta existente. Las pruebas funcionales/integrales permanecen para la fase final; la CI comprueba contrato y compilación.

## Actualizar panel en Windows CMD
```cmd
cd C:\Users\jjcor\Documents\Github\HJStoreVP
git status --short
git pull --ff-only origin main
docker compose restart frontend-admin
docker compose ps frontend-admin
```

No requiere `npm install` nuevo ni migración de MariaDB. Si `git status` reporta cambios locales, conservarlos y revisarlos antes de actualizar.

## Próxima fase de diseño
Ventas físicas y caja: transacciones, POS, arqueos y navegación operativa, sin modificar montos ni reglas de cierre.
