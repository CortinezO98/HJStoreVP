# HJStoreVP — Inventario administrativo Bootstrap

## Modernización
- Encabezado con acciones de actualización, ingreso de mercancía y transferencias.
- Estadísticas de productos, puntos físicos, canal web y alertas.
- Búsqueda por nombre/SKU/categoría; filtros de alerta de stock, sin existencias y estado activo; ordenación por nombre, SKU y existencias.
- Tabla Bootstrap adaptada a pantallas pequeñas con desplazamiento horizontal y detalle por ubicación disponible.
- Paginación cliente (10, 15, 25, 50), posterior a la carga de la lista completa con páginas de 100 solicitadas al backend.
- Ventanas de ingreso, transferencia y consulta visual mejoradas, sin cambiar las validaciones del servidor ni los endpoints.
- Reutiliza estilos del panel con Bootstrap; conserva los roles actuales (super_admin, admin, seller).

## Límites
Esta fase es de **presentación y navegación**. No cambia inventario real, reservas, límites concurrentes, transacciones, reglas de negocio ni migraciones. El desglose por sede se consulta al abrir el detalle, sin inventar existencias por punto en la tabla. Los controles antifraude y las pruebas funcionales integrales corresponden a la fase final.

## Actualización Windows CMD
```cmd
cd C:\Users\jjcor\Documents\Github\HJStoreVP
git status --short
git pull --ff-only origin main
docker compose restart frontend-admin
docker compose ps frontend-admin
```
Si hay cambios locales, incluidos archivos lock npm no versionados, revisarlos antes de actualizar. El módulo usa Bootstrap ya instalado; no agrega dependencias npm. Sin migraciones de Alembic.
