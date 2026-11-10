# Fase 4 — Mejoras de experiencia de compra (primera entrega)

## Alcance implementado

- Categorías visibles en portada, navegación y catálogo obtenidas del endpoint
  público `/api/v1/categories` en lugar de un listado fijo.
- Se conserva búsqueda, filtros por precio, stock, orden y paginación existentes.
- Lista de favoritos local persistida en el navegador, accesible desde la
  cabecera, tarjetas, detalle y la ruta `/favoritos`.
- Favoritos consultan el producto actualizado antes de mostrar su precio:
  no reutilizan el precio guardado y avisan si ya no está publicado.
- Título y metadescripción del detalle del producto ajustados al contenido.

## Compatibilidad y límites

- No se modifican bases de datos, reservas, pagos, inventario ni checkout.
- Favoritos son locales a ese navegador y no se sincronizan entre dispositivos;
  no deben confundirse con preferencias ligadas a una cuenta.
- La metadata modificada con JavaScript mejora la navegación, pero para
  indexación SEO completa habrá que añadir renderizado previo/SSR, sitemap
  de productos y dominio público cuando se prepare producción.
- Esta entrega no agrega variantes de SKU ni stock por talla/color:
  eso requiere modelo propio, inventario por variante y flujos de selección,
  para evitar vender productos inexistentes. Se realizará en una entrega
  separada de la fase 4 antes de las pruebas integrales.
- Pruebas integrales y auditoría de seguridad reservadas para el cierre.
