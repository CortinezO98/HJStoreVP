# HJStoreVP — Catálogo administrativo Bootstrap (Productos y Categorías)

## Alcance implementado

- **Productos**: resumen de activos/inactivos/destacados, buscador por nombre/SKU/categoría, filtros combinados, ordenación por nombre/SKU/precio, paginación local (10/15/25/50), acciones de edición visibles y mejora de los diálogos.
- Los productos se siguen consultando con la paginación de backend existente (100 por solicitud). La paginación visible opera sobre la lista completa ya consultada; no cambia los contratos ni el inventario.
- Se conserva el formulario existente de producto, incluyendo costo, margen, precio calculado, descripción, stock mínimo, estado y destacado, así como los gestores de **imágenes y variantes**.
- Se añade confirmación antes de desactivar un producto, sin cambiar la lógica de desactivación.
- **Categorías**: resumen, búsqueda por nombre/slug/descripción, filtro de visibilidad, orden por aparición, tarjetas con acciones accesibles, modal Bootstrap para crear/editar y manejo visible de fallos de carga.
- Se mantienen `/categories`, `/categories/{id}/toggle`, `productsApi`, `apiClient` y los permisos de rutas existentes.
- Nuevos estilos de catálogo en `admin-bootstrap.css`, limitados al panel; no impactan el sitio público.

## Control de cambios

No hay migraciones ni cambios de backend. No tocar datos, volúmenes, configuración de pagos, roles ni lógica de pedidos.

La CI del panel debe ejecutar el contrato administrativo y `npm run build` (no es una prueba funcional E2E).
El plan conserva las **pruebas integrales para la fase final**.

## Actualización local Windows CMD

```cmd
cd C:\Users\jjcor\Documents\Github\HJStoreVP
git status --short
git pull --ff-only origin main
docker compose restart frontend-admin
docker compose ps frontend-admin
```

El rediseño solo modifica archivos existentes y no incorpora dependencias. Bootstrap 5.3.9 se instaló en la fase anterior. Si hay cambios locales (incluido un `package-lock.json` no rastreado), conservarlos y revisar antes de actualizar.

## Próxima fase UX

Inventario: filtros, movimientos, transferencias y ventanas de gestión, sin alterar validación ni operaciones concurrentes.
