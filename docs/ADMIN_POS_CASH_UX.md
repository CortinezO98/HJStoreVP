# HJStoreVP — Modernización de Ventas físicas y Caja con Bootstrap

## Ventas físicas
- Encabezado profesional y formulario POS con estilo uniforme, lista de productos disponibles y resumen de venta.
- Búsqueda de productos por nombre/SKU, selección por sede según rol y control existente de cantidades frente a `qty_available`.
- Botones de cantidad y retirada con etiquetas accesibles. Productos sin existencias deshabilitados visualmente.
- Historial con búsqueda por orden y punto, ordenación por fecha o importe, tabla Bootstrap y paginación cliente (10, 15, 25, 50).
- Se conservan `physicalSalesApi.create`, `physicalSalesApi.list`, `myStock` y `inventoryApi.byLocation` y la invalidación de cachés ya implementada.

## Caja y arqueos
- Indicadores claros de turnos, turnos abiertos y saldo esperado del turno seleccionado.
- Selección de sede para roles admin/super_admin. Los vendedores siguen utilizando la asignación del servicio `authApi.me`.
- Bloques visuales de apertura, turno seleccionado, registro de movimientos y arqueo/cierre. Estados abiertos/cerrados visibles.
- Formulario Bootstrap accesible y tabla responsive del historial.
- Se conservan permisos y endpoints de `cashApi.open`, `cashApi.movement`, `cashApi.close`, `cashApi.sessions` y `cashApi.movements`.
- La confirmación previa al cierre definitivo permanece intacta. La diferencia presentada es estimada por la interfaz; el backend determina el cierre registrado.

## Restricciones
Solo cambia el frontend administrativo. No modifica precios, stock, transacciones, impuestos, migraciones Alembic, base de datos ni el cálculo de caja. Los permisos existentes permanecen. Esta modernización no introduce nuevos métodos de pago ni procesos contables.

La CI ejecuta contratos estáticos y compilación Vite; las pruebas manuales y de integración siguen reservadas para el cierre.

## Actualización local (CMD Windows)
```cmd
cd C:\Users\jjcor\Documents\Github\HJStoreVP
git status --short
git pull --ff-only origin main
docker compose restart frontend-admin
docker compose ps frontend-admin
```

No hay nuevas dependencias npm ni migraciones. Si `git status` muestra modificaciones locales, conservarlas y revisarlas antes del pull.

## Siguiente fase sugerida
Modernizar gestión de usuarios, permisos y reportes; finalmente revisar las dependencias npm y ejecutar pruebas integrales.
