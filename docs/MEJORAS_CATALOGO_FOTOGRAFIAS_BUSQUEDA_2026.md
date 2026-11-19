# HJStoreVP — Catálogo, imágenes, búsqueda y accesibilidad

Fecha: 2026-11-19. Implementación incremental publicada directamente en `main`.

## Gestión de fotografías del producto

El panel de **Productos → Editar producto → Imágenes** conserva la carga múltiple y selección de imagen principal. Ahora también permite:

- Ordenar cada fotografía con flechas de anterior/siguiente; el cambio se confirma con `PATCH /api/v1/products/{product_id}/images/order`.
- La primera posición se convierte en la fotografía principal. Al seleccionar una fotografía como principal también pasa a la primera posición. La portada del catálogo y la galería muestran la misma imagen al inicio.
- Editar la descripción alternativa de cada fotografía con `PATCH /api/v1/products/{product_id}/images/{image_id}/alt`. Entre 3 y 180 caracteres; usar descripciones reales, no palabras clave repetitivas.
- El endpoint de orden exige lista completa de IDs, sin duplicados, y comprueba que correspondan exactamente al producto actual; devuelve 409 si la galería cambió y debe recargarse.
- Todas las rutas de modificación exigen `require_admin`; se bloquea el producto durante la operación con `with_for_update`. No cambian precios, stock ni imágenes físicas excepto cuando el usuario usa las operaciones existentes de subida o eliminación.
- La galería en la ficha pública ordena primero `is_primary` y luego `sort_order`, tanto en fotografías del producto como de su variante; el carrusel previo de cinco segundos permanece activo.

## Búsqueda inmediata

En el encabezado de la tienda, al escribir al menos **dos caracteres** se consultan hasta seis productos mediante el endpoint público existente `GET /api/v1/products`. Las peticiones se retrasan 280 ms para limitar la frecuencia. Los resultados incluyen nombre, categoría y precio, y admiten ratón y flechas del teclado + Enter. El botón «Ver todos los resultados» conserva la búsqueda en el catálogo, incluidos sus filtros existentes.

Se emplea `useQuery` con caché breve, pero **no** se exponen endpoints privados ni se modifica la API de búsqueda. Estas sugerencias no sustituyen el buscador del catálogo.

## Instalación

```cmd
cd C:\Users\jjcor\Documents\Github\HJStoreVP
git status --short
git pull --ff-only origin main
docker compose up -d --build backend frontend-admin frontend
docker compose ps
docker compose logs --tail=80 backend frontend-admin frontend
docker compose exec backend alembic current
git log -1 --oneline
```

No requiere migraciones. No ejecutar semillas ni `docker compose down -v`.

## Pruebas pendientes

Las comprobaciones integrales se mantienen para la fase final: subir 1-10 imágenes, marcar principal, reordenar y editar descripción; concurrencia de administradores; galería y variantes; búsqueda con teclado, móvil, resultados vacíos y enlaces; perfiles con y sin permisos. En esta entrega solo se verificaron archivos publicados en GitHub; no se ejecutó contra la base local del usuario.
