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


## Fase de estabilización y correcciones visuales

- Búsqueda solo en el header (lupa o tecla `/`); eliminado el buscador lateral duplicado.
- Color se obtiene de facetas de variantes. Cuando una categoría tiene productos individuales con colores explícitos en su nombre, se usan sus nombres reales como respaldo de frontend (negra, blanca, azul, beige, etc.). El catálogo todavía necesita un atributo normalizado por producto para filtrar de forma exacta a gran escala.
- Tallas S/M, L/XL y Ajustable exclusivas de gorras; las no configuradas se muestran deshabilitadas. Guía contextual sin inventar medidas.
- Puntos de color de variantes mediante ficha pública, y de productos individuales cuando el nombre identifica un color. `Desde` solo cuando el backend devuelve variantes con precios distintos.
- Formato único de COP en vistas de compra y posventa: `$40.000`, sin espacios.
- Paginación agrupada desde páginas reales por URL, sin estado local compartido entre filtros o historial. Pruebas Node para paginación, query params, colores y COP.
- Imagen de categoría procedente de la ficha pública del primer producto de esa categoría; sin reservar espacio si no hay imagen.
- La barra del catálogo sigue en `position: sticky`; el botón de filtros y el selector de orden comparten altura.

### Pruebas automatizadas del catálogo

```bat
cd /d C:\Users\jjcor\Documents\Github\HJStoreVP\frontend
npm run verify:catalog
npm run verify:routes
npm run verify:checkout
npm run build
npm run verify:bundle
```

### Capturas funcionales reproducibles (máquina del desarrollador)

Para verificar *la tienda real que ejecutas*, arranca frontend/backend con Docker
y ejecuta desde `frontend/`:

```bat
npm install --no-save playwright
npx playwright install chromium
npm run capture:catalog
```

Se guardan en `frontend/artifacts/catalog/` las capturas:
1. `01-toolbar-sticky.png`
2. `02-filtros-chips-url.png`
3. `03-sin-resultados.png`
4. `04-cargando.png`
5. `05-error-api.png`
6. `06-movil-375-filtros-abiertos.png`
7. `07-buscador-abierto.png`

Las capturas de carga y error interceptan temporalmente la API desde Playwright:
*no modifican archivos ni registros del backend*. Los archivos resultantes se
ignoran en Git. El script requiere que `localhost:5173` esté accesible desde
Windows y que el backend local funcione para las escenas con datos reales.

## Refinamiento final de QA — catálogo público

- La categoría de la URL determina inmediatamente título, descripción de respaldo y migas, sin esperar la consulta de categorías.
- El header mantiene enlaces primarios independientemente de la API de categorías. La lista dinámica solo alimenta sugerencias de búsqueda.
- Chips de categorías usan esqueletos durante la carga. Color usa esqueletos hasta tener facetas y catálogo; se oculta en el error del listado y solo muestra estado vacío después de respuesta exitosa.
- No se muestra «0 productos» cuando falla el listado. Los precios y colores con conteo cero comprobable se deshabilitan.
- Los chips de filtro muestran categoría humanizada, búsqueda y rangos de precio con formato COP. El panel de búsqueda usa un único botón de limpieza, recientes locales (máximo cinco) y cuenta las sugerencias obtenidas, sin afirmar que sean el total del backend.
- La captura de filtros activos espera tarjetas reales, utiliza Gorras + color Negro + precio máximo y muestra la URL en la evidencia. Las simulaciones de red de Playwright viven exclusivamente en `tests/e2e`; no son importadas por el frontend de producción.
- La compilación de producción elimina orígenes de desarrollo del JS antes del cálculo del hash. El despliegue público requiere proxy del mismo origen para `/api` y `/uploads` cuando no se configura una URL pública.
