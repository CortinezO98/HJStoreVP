# HJStoreVP — Fotografías HD, encuadre y rendimiento

Fecha: 2026-11-19. Mejoras incrementales publicadas en `main`. No hay migraciones ni cambios a fotografías previamente guardadas.

## Encuadre de fotografías nuevas

**Productos → Editar → Imágenes → Seleccionar imágenes**: las imágenes JPG/PNG/WEBP ingresan a una cola de recorte una por una. El editor abre la fotografía, permite **zoom de 1–3×**, desplazamiento horizontal/vertical y vista previa cuadrada. **Aplicar encuadre** genera en el navegador una copia WEBP 1800×1800 con calidad 90; después de ajustar el lote, **Subir imágenes** agrega esas copias al catálogo. **Cancelar** descarta solamente la imagen pendiente, no modifica la galería ni la foto original.

**Configuración de tienda → Portada → Carruseles**: cada imagen nueva de banner o campaña secundaria pasa por el mismo editor, pero con relación **16:9**, 1920×1080 y calidad 90. El resultado se carga a almacenamiento pero solo aparece públicamente después de **Guardar y publicar**. En caso de error de red la imagen permanece en la cola para reintentar. Se conservan el orden de imágenes, límites de ocho por carrusel y fallback editorial original si está vacío.

Los archivos existentes no se recortan ni se reprocesan automáticamente. Se pueden volver a cargar con el nuevo encuadre desde la biblioteca de archivos del administrador. El archivo original en el computador permanece intacto.

## Procesamiento de servidor

`backend/app/api/v1/endpoints/images.py` acepta JPEG/PNG/WEBP y GIF legado; valida el contenido con Pillow (no confía en la extensión), detecta imágenes excesivamente grandes, corrige EXIF, usa remuestreo LANCZOS si supera 2400×2400 px, elimina metadatos y guarda una versión WEBP con calidad 88. Conserva transparencia cuando existe. Mantiene la validación de máximo de archivo configurada en `MAX_UPLOAD_SIZE_MB` y el límite de píxeles para evitar decompression bombs.

Las URLs de almacenamiento basadas en UUID bajo `/uploads/products/` y `/uploads/branding/` reciben `Cache-Control: public, max-age=31536000, immutable` para reutilizar recursos ya cargados. La cabecera no se aplica a API, sesiones, pedidos ni información de usuario.

## Carga de páginas

- Imagen visible de banner principal y ficha de producto: prioridad alta y carga inmediata.
- Tarjetas de catálogo, miniaturas y segundo banner fuera de pantalla: lazy + prioridad baja y decodificación asíncrona.
- Se conservan los carruseles de 5/6 segundos, selección manual, orden por principal y pausas de accesibilidad.
- No se habilitó carga automática de **todas** las fotografías del carrusel para evitar gasto innecesario de datos.

## Limitaciones y criterios

- Salida WEBP es excelente para fotografía comercial pero puede no sustituir al original de estudio a efectos de impresión y retoque. Conserva los originales fuera de la aplicación.
- El encuadre puede ampliar visualmente una foto si la fuente tiene menor resolución; no inventa detalle.
- No implementa todavía thumbnails de varios tamaños con `srcset`, recorte retroactivo ni almacenamiento CDN; son mejoras futuras opcionales.
- No evita que un usuario intente subir archivos que excedan el límite del backend, ni garantiza que todas las imágenes grandes se puedan abrir en móviles antiguos.
- Falta verificar el comportamiento real y el ahorro de bytes en el Docker local, además de la batería completa de pruebas al final del proyecto.

## Actualización local

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

No usar `docker compose down -v`, `alembic downgrade`, ni scripts para reescribir imágenes antiguas.
