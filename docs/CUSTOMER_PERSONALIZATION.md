# Fase: personalización de experiencia de cliente — HJStoreVP

## Alcance entregado

- **Vistos recientemente (opt-in):** historial en `localStorage` administrado con Zustand;
  desactivado por defecto, hasta 12 pares ID/slug, sin precios, costos ni correos;
  activar/desactivar o borrar el historial desde la portada. Desactivar lo vacía.
- **Productos actualizados:** portada consulta los productos vistos a la API, no
  muestra precios históricos del navegador. Si se desactiva o retira un producto,
  deja de aparecer en consultas públicas.
- **Intereses:** combinación de favoritos del navegador e historial (solo si
  está activado) para proponer otras referencias de categorías relacionadas.
- **API:** `GET /api/v1/recommendations/personalized?product_ids=1&product_ids=2&limit=8`,
  no requiere identificación, no crea perfiles ni guarda clics; limita los IDs
  a 30 y resultados a 12. Reutiliza el algoritmo de compras confirmadas y
  disponibilidad del módulo comercial.
- **Portada:** «SELECCIONADOS PARA TI» y «VISTOS RECIENTEMENTE» antes de categorías.
  Sin intereses, muestra invitación a guardar favoritos y no inventa sugerencias.
- **Privacidad:** sin servicios de analítica de terceros, sin cookies de seguimiento,
  sin base de datos de navegación ni sincronización del historial con el servidor.
  Los favoritos existentes continúan disponibles en el mismo navegador.
- **Compatibilidad:** las tarjetas siguen usando selección de variante cuando
  corresponde; los pedidos, pagos, reservas de stock y reglas de impuestos
  se mantienen sin cambios.

## Despliegue
No hay migraciones nuevas. Alembic permanece en `20261110_11`.
Actualizar `main` con árbol Git limpio, permitir recarga en desarrollo o
reiniciar backend/frontend si fuera necesario.

## Fuera de alcance
Personalización multiplataforma por cuenta, análisis de conversión y
segmentación de marketing: requieren políticas adicionales de privacidad y
aprobación; no se introducen implícitamente. Pruebas E2E y de seguridad
continúan reservadas para el cierre del proyecto.
