# SEO avanzado HJStoreVP

## Integrado

- Un único `meta description` en el HTML base.
- Metadatos dinámicos para inicio, catálogo y ficha de producto:
  title, description, Open Graph, Twitter y URL canónica.
- `noindex,follow` en carrito, checkout, favoritos, login, registro,
  cuenta y confirmación de pago; filtros del catálogo se canonicalizan
  a `/catalogo` y se marcan noindex.
- JSON-LD `Product` y `Offer` en la ficha, con precio COP y stock
  del catálogo. No declara valoraciones, reviews ni precios falsos.
- `/sitemap.xml` dinámico: portada, catálogo, categorías activas y
  productos principales activos; no incluye variantes individuales
  ni productos desactivados. `lastmod` desde `updated_at`.
- `/robots.txt`: desarrollo bloquea toda indexación; producción declara
  sitemap y excluye rutas privadas.
- `/share/product/{slug}`: HTML generado en servidor para WhatsApp y
  redes, con Open Graph y Product JSON-LD. Botón «Compartir producto»
  usa Web Share API o copia enlace. Personas son redirigidas a ficha
  comercial mediante JavaScript con enlace alternativo visible.
- Proxy Vite para servir `/sitemap.xml`, `/robots.txt` y
  `/share/product/{slug}` en desarrollo, sin cambiar el backend API.

## Paso previo a publicación

Configurar `STORE_PUBLIC_URL=https://TU_DOMINIO_REAL` en backend,
y el mismo dominio en el frontend público. No utilizar localhost
en producción. El proxy inverso productivo debe enviar al backend
las rutas `/sitemap.xml`, `/robots.txt`, `/share/` y `/uploads/`
(si se usa almacenamiento local), además de `/api/`.

**SPA:** las fichas `/producto/{slug}` sirven un shell HTML en una
aplicación Vite/React. Los metadatos client-side ayudan a navegadores
que ejecutan JavaScript, pero no garantizan indexación o rich snippets
de Google. Las vistas `/share/` ofrecen Open Graph en servidor para
redes sociales. Para SEO técnico completo, configurar prerender
o SSR de URLs canónicas `/producto/{slug}` y categorías en despliegue
productivo, con HTML real de producto y status HTTP 404 para inactivos.
El registro en Search Console y el dominio de producción se dejarán
para el paso de puesta en producción.

## Notas

- La lista de variantes mantiene sus propias existencias. El
  JSON-LD por producto padre utiliza el menor precio activo y
  la disponibilidad global; el pago siempre valida servidor.
- No se habilitan valoraciones estructuradas sin evidencia real.
- No hay tablas ni migraciones nuevas; Alembic sigue en
  `20261110_11`.
- Las pruebas integrales y auditoría final se reservan para el
  cierre, conforme al plan del proyecto.
