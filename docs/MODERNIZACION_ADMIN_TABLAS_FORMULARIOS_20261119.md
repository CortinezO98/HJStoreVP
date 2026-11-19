# HJStoreVP — Modernización del superadministrador, etapa 2

Fecha: 2026-11-19. Integrado directamente a `main`.

## Alcance de la entrega

### Gestión de productos, inventario y ventas físicas
- Componente común `frontend-admin/src/components/AdminTableMessage.jsx` dentro de `<tbody>` para estados vacíos y fallos de carga, con mensaje contextual, lectura accesible y botón de reintento cuando corresponde.
- Productos, Inventario y Ventas físicas ahora distinguen `isError` de listas realmente vacías. Un error de backend no se anuncia como catálogo sin referencias ni como ventas inexistentes.
- El diseño compartido en `frontend-admin/src/admin-bootstrap.css` mejora la legibilidad de tablas, el foco de teclado, el scroll horizontal de columnas y los estados de consulta en celular.
- No se cambió el contrato de API, las rutas ni los cálculos de inventario, ventas o pedidos.

### Edición de productos
- Validación adicional en el cliente: nombre y SKU no vacíos; costo y porcentaje de ganancia finitos y no negativos; precio calculado válido; alerta mínima como entero no negativo.
- Se corrige el caso en que **alerta mínima de stock = 0** se convertía involuntariamente en 5 por el uso de `|| 5`.
- Campos esenciales con identificadores y etiquetas vinculadas para accesibilidad.
- Se mantienen las mutaciones existentes y los controles de permisos del servidor.

## Publicación local

```cmd
cd C:\Users\jjcor\Documents\Github\HJStoreVP
git status --short
git pull --ff-only origin main
docker compose up -d --build frontend-admin
docker compose ps
docker compose logs --tail=80 frontend-admin
git log -1 --oneline
```

No requiere backend, base de datos ni migraciones. No ejecutar operaciones destructivas ni limpiar volúmenes.

## Estado y verificaciones pendientes

Los archivos actualizados se leyeron en GitHub después de publicar; aún no se ha ejecutado una compilación ni pruebas visuales contra el entorno Docker del usuario. En la fase final verificar tablas vacías, errores y reintentos, permisos de vendedor, móvil, validaciones del formulario, paginación y edición concurrente.

Siguiente trabajo recomendado: consolidar patrones de filtros, paginadores y confirmaciones de acciones de WebOrders/Reports; después cerrar seguridad, conciliación y rendimiento antes de facturación DIAN.
