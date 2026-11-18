# HJStoreVP — Segunda etapa UX Bootstrap: Productos y categorías

## Objetivo
Modernización visual del **frontend-admin** conservando endpoints, estado del
servidor, autorización, reglas comerciales, inventario y datos existentes.
Bootstrap 5.3.9 y Tailwind continúan coexistiendo exclusivamente en el panel.

## Productos
- Búsqueda por nombre, SKU y categoría; filtros de categoría, estado y destacados.
- Botón para limpiar todos los filtros.
- Ordenación por nombre, SKU y precio de venta.
- **Paginación local de 20 filas** sobre la lista ya recuperada por páginas del
  backend, con rango visible y botones Anterior/Siguiente. No limita el
  catálogo por backend ni cambia los filtros existentes.
- Tabla con estilo Bootstrap y acciones de edición accesibles.
- Editor organizado en identificación, precio/stock y presentación/publicación.
- Precio estimado COP visible mientras se escribe costo o margen.
- Galería de fotografías con modal y carga de archivos más clara.
- Variantes (SKU, atributos, precios, existencias y fotos) con panel visual
  coherente, sin cambiar lógica ni endpoints.

## Categorías
- Resumen de cantidad total, activas y productos vinculados.
- Búsqueda y filtro por estado, ordenamiento por `sort_order`.
- Tarjetas con estado, descripción, orden, cantidad de productos y acciones.
- Editor con campos, etiquetas y ayuda visual Bootstrap.
- Se mantiene activación y desactivación, edición y creación existentes.

## Seguridad y alcance
- Se conserva el mismo RBAC `super_admin/admin` y la navegación del sistema.
- Las acciones CRUD siguen usando las APIs existentes.
- Sin migraciones, tablas nuevas ni cambios a productos, stock o ventas.
- Verificación automática estática de contratos funcionales y compilación
  del panel. Las pruebas integrales con usuarios siguen previstas al final.
- El informe `npm audit` del panel registra dependencias vulnerables; tratar
  en una intervención separada y controlada, sin usar `npm audit fix --force`.

## Instalación local (CMD)
Desde la raíz de HJStoreVP, con Git limpio:

```cmd
git status --short
git pull --ff-only origin main
docker compose restart frontend-admin
docker compose ps frontend-admin
```

No se añadieron paquetes NPM en esta etapa, por lo que no se necesita ejecutar
`npm install`. No usar `docker compose down -v`.

## Próximo trabajo de diseño
Inventario: disponibilidad y movimientos por ubicación, alertas, filtros y
diálogos unificados. Después, pedidos web, ventas físicas y caja.
