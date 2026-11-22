# Rediseño del catálogo HJStoreVP — noviembre 2026

## Alcance

La tienda pública usa React/Vite; el backend FastAPI y el panel administrativo no se modificaron.
Todas las preferencias comerciales y los datos se leen de las APIs ya existentes.

### Código fuente completo (archivos, no extractos)

- [Catálogo / página principal](src/pages/shop/CatalogPage.jsx)
- [Sincronización de filtros con URL](src/hooks/useCatalogFilters.js)
- [Banner de categoría](src/components/shop/CategoryHero.jsx)
- [Filtros, chips, barra y bottom sheet](src/components/shop/CatalogControls.jsx)
- [Tarjetas y acciones de carrito](src/components/shop/ProductCard.jsx)
- [Búsqueda superpuesta](src/components/shop/SearchOverlay.jsx)
- [Integración con el header actual](src/components/layout/ShopLayout.jsx)
- [SEO de categorías](src/components/shop/StoreMetadata.jsx)
- [Estilos del catálogo](src/catalog-redesign.css)
- [Importación de estilos](src/main.jsx)
- [Importación de Anton e Inter](index.html)

## Datos reales disponibles

- `GET /categories` devuelve categorías activas, `description` y `product_count`.
- `GET /products` devuelve productos principales, precio efectivo, inventario, categoría e imagen principal; permite ordenar y filtrar por categoría, precio, disponibilidad y atributos.
- `GET /products/filters` devuelve colores, tallas y presentaciones disponibles para la categoría/búsqueda.
- Los conteos por categoría/precio del nuevo diseño se muestran solo si se ha consultado el catálogo completo (menos de 100 productos en la respuesta de exploración); de lo contrario no se inventan números. El `product_count` de categorías puede incluir variantes y no es directamente equivalente al número de tarjetas.
- Las recomendaciones cruzadas eligen hasta cuatro productos de categorías diferentes, de los primeros cien productos consultados.

## Datos faltantes / decisiones explícitas

1. La API pública `GET /categories` no incluye `image_url`: el banner omite el espacio de la imagen cuando no existe. El componente soportará `image_url` si se incluye en el futuro. No se creó imagen ficticia.
2. No hay conteos de resultados o facetas por filtro desde `GET /products`. Se muestran resultados de la página y conteos calculados solo cuando la muestra está completa. Para catálogos grandes se recomienda un endpoint paginado con `total` y facetas de filtro.
3. El listado público de productos no devuelve los colores específicos de cada producto ni la fecha de creación necesaria para marcar `NUEVO`. Se conservan las variantes reales en el filtro global. Las tarjetas no inventan puntos de color ni etiquetas de novedad.
4. No existe una guía de tallas verificada en la tienda; el filtro de gorras muestra una indicación para consultar la ficha del producto en lugar de enlazar a una guía ficticia.
5. El buscador devuelve hasta ocho sugerencias reales y ofrece ver todos los resultados; no presenta un total no disponible.
6. La venta cruzada aprovecha productos disponibles de otras categorías y puede contener menos de cuatro si no hay suficientes.

## Comprobación local

```bat
cd /d C:\Users\jjcor\Documents\Github\HJStoreVP
git pull --ff-only origin main
docker compose restart frontend
cd frontend
npm install
npm run build
npm run verify:bundle
npm run verify:routes
```

Abrir:
- `http://localhost:5173/catalogo`
- `http://localhost:5173/catalogo?categoria=gorras`
- `http://localhost:5173/catalogo?categoria=gorras&disponible=1&orden=price_asc`
- La lupa del header y la tecla `/`

Validar la compra con productos sin variantes y la navegación al detalle con variantes, sin confirmar pedidos reales.

La compilación, las pruebas de bundle y las pruebas visuales deben realizarse en el entorno local; la publicación de código por GitHub no equivale a validación exitosa.
