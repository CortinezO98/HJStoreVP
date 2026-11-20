# HJStoreVP · Migración relacional de la portada (20261120_15)

## Objetivo y compatibilidad

Esta revisión es **aditiva**, no reemplaza de forma irreversible la configuración
de tienda. Agrega:

- `storefront_visual_blocks`: bloque, tipo, posición, configuración y ámbito.
- `storefront_visual_slides`: diapositiva, orden, imágenes, texto, enlace y configuración.
- Ámbitos: `published`, `draft` y `history:<id>`.

La fuente de lectura y publicación de la tienda sigue siendo
`storefront_settings.settings_data`, con sus claves heredadas.
**No eliminar esta columna, sus claves, ni las imágenes almacenadas.**
La migración copia los datos publicados, borradores e historial y, después,
el backend mantiene los registros relacionales sincronizados en la
**misma transacción** que los cambios del JSON.

Se trata de una etapa de transición: no proclamar el nuevo almacenamiento
como fuente única de verdad ni eliminar el sistema JSON.

## Antes de aplicar la migración

1. Sincroniza `main` y comprueba el estado de git.
2. Genera y verifica un respaldo de la base de datos y del volumen de imágenes.
   No basta con ejecutar un comando de backup sin comprobar el archivo.
3. Revisa qué revisión registra Alembic:
   `docker compose exec backend alembic current`.
4. Revisa la secuencia disponible:
   `docker compose exec backend alembic heads`.

La revisión nueva se llama `20261120_15` y depende de `20261119_14`.
Si el ambiente está en una revisión anterior, Alembic ejecutará las
revisiones intermedias. Revisa previamente sus efectos.

## Migrar (con backup confirmado)

Desde la carpeta del repositorio:

```bat
docker compose up -d backend db
docker compose exec backend alembic current
docker compose exec backend alembic heads
docker compose exec backend alembic upgrade head
docker compose exec backend alembic current
docker compose up -d --build frontend frontend-admin
```

**Desarrollo:** FastAPI ejecuta `Base.metadata.create_all()`. Es posible que
las nuevas tablas ya existan al iniciar antes de ejecutar Alembic.
La migración tolera ambas tablas ya existentes y realiza backfill **solo
cuando el comercio todavía no tiene bloques en el espejo relacional**.
Si detecta solo una de las dos tablas, se detiene sin borrarlas.

## Comprobación de integridad y estado

Con sesión de superadministrador, el Diseñador de inicio consulta:

`GET /api/v1/storefront-settings/admin/homepage-storage-health`

Campos:
- `schema_ready`: ambas tablas existen.
- `published_blocks`: total de bloques publicados registrados.
- `draft_blocks`: total de bloques de borrador registrados.
- `history_blocks`: total de bloques históricos registrados.
- `in_sync`: revisión inicial de las cantidades de bloques publicados y
  de borrador contra el JSON (no es una verificación criptográfica ni
  certifica contenidos o imágenes).

Para validar operaciones: guardar borrador, revisarlo, publicar solo con
autorización, verificar enlace de imágenes anteriores, recuperar versión
histórica y revisar de nuevo el estado. Confirmar también rutas, stock,
carrito, checkout y permisos de superadministrador.

## Reversión segura

El downgrade se ha bloqueado intencionalmente para evitar borrar borradores
e historial. En caso de problemas, restaurar desde respaldo con un procedimiento
planificado, manteniendo `storefront_settings.settings_data` y las imágenes.
No usar `alembic downgrade` para eliminar los nuevos datos sin verificación.

## Alcance que queda pendiente

La transición final para que las tablas relacionales sean la fuente primaria
requiere más pruebas de consistencia, una lectura relacional completa,
observabilidad y una migración controlada de los consumidores existentes.
Esto se hará en una fase posterior, no automáticamente durante esta revisión.
