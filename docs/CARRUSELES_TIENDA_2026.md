# HJStoreVP — Carruseles de portada y fotografía de producto

Fecha: 2026-11-18. Implementación incremental en `main`.

## 1. Carrusel promocional de la portada

- El superadministrador dispone del panel **Configuración de la tienda → Portada de la tienda → Carrusel de imágenes del inicio**.
- Puede subir hasta 8 imágenes JPG, PNG, WEBP o GIF usando el endpoint existente de imágenes de branding, ver una vista previa, ordenar las imágenes con flechas, eliminarlas del carrusel y hacer clic en **Guardar y publicar** para actualizar la tienda.
- El sistema almacena las URLs ordenadas en `storefront_settings.settings_data.hero_images` (campo JSON ya existente): **no se agregan tablas ni migraciones**.
- Las imágenes publicadas reemplazan el panel editorial «ESTILO PROPIO» del lado derecho de la portada. Rotan cada **6 segundos**, con avance y retroceso manual e indicadores. Si solo hay una imagen, permanece fija. Si no hay ninguna o las imágenes fallan, aparece el diseño editorial «ESTILO PROPIO».
- El valor histórico `hero_image_url` permanece guardado pero **no se usa para el carrusel**: anteriormente contenía un gráfico técnico ajeno a la tienda. Así evitamos mostrarlo por accidente. Para publicar nuevas imágenes se usa el control múltiple.
- Las imágenes con error de carga se excluyen en el cliente hasta que se actualice la página. El servidor valida URLs y limita a ocho entradas.
- El autoplay se pausa al pasar el cursor o enfocar los controles, con la pestaña en segundo plano o si el sistema pide movimiento reducido.

## 2. Carrusel de productos

- Al abrir `/producto/:slug`, la ficha usa `product.images` ordenadas por `sort_order`, o las imágenes de la variante seleccionada, o la imagen principal en ausencia de galería.
- Si hay dos o más fotografías, rotan cada **5 segundos**; hay flechas y miniaturas para navegar manualmente. Si solo hay una, no aparece autoplay. Cuando cambias de variante, se reinicia desde la primera fotografía disponible.
- Al pasar el cursor, enfocar los controles, ocultar la pestaña o solicitar movimiento reducido, se pausa el desplazamiento.
- Cuando no hay ninguna fotografía disponible, se presenta una marca «HJVP · FOTOGRAFÍA NO DISPONIBLE».
- Esto **no sube imágenes de productos**: la carga y administración de fotografías sigue en su módulo de catálogo. La galería usa imágenes reales existentes y no inventa productos.

## Despliegue local

```cmd
cd C:\Users\jjcor\Documents\Github\HJStoreVP
git status --short
git pull --ff-only origin main
docker compose up -d --build backend frontend-admin frontend
docker compose ps
docker compose logs --tail=70 backend frontend-admin frontend
docker compose exec backend alembic current
git log -1 --oneline
```

Es necesario reconstruir **los tres servicios** porque hay cambios en configuración de backend, panel administrativo y tienda pública. No se requiere Alembic nuevo. No usar `docker compose down -v`.

## Verificación final pendiente

En la fase de pruebas, validar subida múltiple, orden, ausencia de imágenes, cambio de galería mientras hay usuarios navegando, variante con/sin fotos, autoplay/pausa y navegación por teclado en escritorio y móvil. Los cambios están publicados en GitHub, no se han ejecutado contra el entorno Docker local del usuario.
