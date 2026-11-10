# Fase 4 — Fotografías por variante y filtros dinámicos

## Fotografías por SKU

Las variantes reutilizan la tabla `product_images`: cada variante es un registro
`products` y puede contener su galería propia sin columnas o migraciones nuevas.

**Panel:** Productos → Editar → Gestionar variantes → Gestionar fotos.
Se reutilizan los endpoints de carga, selección de foto principal y eliminación
que ya validan contenido real, tamaño y permisos de administrador.

La ficha pública cambia de galería al seleccionar una variante. Si la referencia
no tiene fotos propias, muestra las imágenes del producto principal. El carrito
conserva la foto de la variante elegida.

## Filtros en el catálogo

El endpoint público `GET /api/v1/products/filters` devuelve valores existentes
de color, talla y presentación, a partir de variantes y productos padres activos.
Acepta `category` y `search` para mostrar opciones relevantes al contexto.

`GET /api/v1/products/` acepta `color`, `talla` y `presentacion` como
parámetros opcionales. Varios atributos se aplican sobre **la misma variante**,
no sobre varias variantes diferentes del mismo producto.

Al aplicar atributos, el precio publicado, el stock y la fotografía principal
de las tarjetas corresponden a las referencias activas que coinciden con
la búsqueda. Si una variante carece de portada, se mantiene la portada general.

Los filtros se conservan en la URL y reinician la paginación a la primera página.
Se integran con categoría, precio, ordenación y disponibilidad existentes.

## Despliegue

- No hay migraciones nuevas: se reutilizan las tablas existentes de la Fase 4.
- Actualizar el código de `main`. Con el backend ejecutándose mediante
  `uvicorn --reload`, las rutas nuevas se cargan automáticamente.
- Confirmar `alembic current`: debe seguir mostrando `20261110_11`.
- Los uploads existentes permanecen en el volumen `uploads_data`.
- Las verificaciones integrales y de seguridad quedan para la fase final.

## Limitaciones

- Los valores de atributos deben coincidir exactamente con los definidos por
  administración (incluidas mayúsculas). Evitar duplicados como `Negro`/`negro`.
- Las facetas muestran opciones activas, incluso si alguna no tiene existencias;
  la disponibilidad definitiva se comprueba al crear el pedido.
- Las tarjetas muestran una foto de referencia que coincide con el filtro cuando
  existe una portada individual; las fotos siguen administradas por SKU.
