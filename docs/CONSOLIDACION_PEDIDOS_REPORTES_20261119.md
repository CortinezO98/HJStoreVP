# HJStoreVP — Consolidación de pedidos y reportes

Fecha: 2026-11-19 · Rama: main · Cambios de frontend administrativo únicamente.

## Pedidos web

- El selector de estado ya **no propone `paid`**: los pagos se confirman exclusivamente a través del proveedor de pagos y sus webhooks.
- Los estados `shipped` y `delivered` siguen siendo responsabilidad del gestor de despachos; no se modifican manualmente desde el listado.
- El panel ofrece únicamente transiciones manuales admitidas por el backend actual:
  - pendiente → cancelado;
  - pagado → en preparación o cancelado;
  - en preparación → cancelado.
- Los estados terminales (enviado, entregado, cancelado) no exponen acciones de cambio manual.
- Antes de aplicar una transición, aparece una **confirmación explícita** con el número del pedido, estado anterior y estado nuevo. La cancelación advierte sobre la posible liberación de reservas de stock.
- Se impiden envíos simultáneos desde la interfaz mientras la mutación está pendiente; el backend continúa siendo la autoridad, bloqueando cualquier transición inválida.
- Se agregó navegación accesible con teclado, foco en la confirmación, Escape y retorno del foco.
- El listado utiliza el componente compartido de estados vacíos/error y mantiene reintento, filtros, ordenamiento y paginación de 10/15/25/50 registros.

## Reportes y exportaciones

- Las vistas previas de pedidos web y ventas físicas dejaron de mostrar solo ocho filas sin continuación: ahora tienen **paginación independiente de ocho registros**.
- Al cambiar filtros se reinicia la paginación a la primera página. Los límites de página se ajustan dinámicamente si cambia el total.
- **Exportar pedidos web (CSV)** y **Exportar ventas físicas (CSV)** descargan ahora exactamente los datos filtrados de su sección. Previamente ambos botones lanzaban el Excel completo.
- Se mantiene por separado la descarga general `.xlsx` desde el proveedor de informes financieros; no se modifica ni se sustituye.
- La salida CSV aplica escape básico de campos potencialmente interpretados como fórmulas en hojas de cálculo, además de comillas y saltos de línea.
- Si falla el servicio de pedidos o ventas se muestra un error y reintento; la exportación CSV afectada se deshabilita, evitando generar un archivo aparentemente vacío o incompleto.
- El filtro de rango de fechas verifica que la fecha inicial no supere a la final, informa el error y bloquea las exportaciones afectadas.

## Seguridad y datos

No se modificaron modelos, migraciones, estados internos del backend, reglas de inventario, transacciones, pasarelas ni webhooks. Los botones de transición se limitan a las rutas previamente permitidas; todas las validaciones definitivas continúan en el servidor.

## Actualización en Windows

```cmd
cd C:\Users\jjcor\Documents\Github\HJStoreVP
git status --short
git pull --ff-only origin main
docker compose up -d --build frontend-admin
docker compose ps
docker compose logs --tail=80 frontend-admin
git log -1 --oneline
```

No ejecutar `docker compose down -v` ni reinicializar la base de datos.

## Validación pendiente

Los archivos se confirmaron en GitHub, pero no se han ejecutado pruebas integrales ni compilación en el Docker local. Durante el cierre: validar transiciones de estado con pedidos ficticios, reintentos, integración de despachos, filtros, paginación, CSV/Excel, teclados, permisos y comportamiento móvil.
