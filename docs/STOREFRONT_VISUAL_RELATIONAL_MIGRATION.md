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


## Diagnóstico de tablas vacías (fase 11)

La migración Alembic `20261120_15` puede ejecutarse correctamente con
**cero bloques y cero diapositivas** si `storefront_settings` aún no contiene
una fila para la tienda. No crear esa fila ni publicar una portada para llenar
artificialmente las tablas.

Verificación de solo lectura:

```bat
docker compose exec db mariadb -u hjstore -phjstore123 hjstorevp -e "SELECT id, updated_at, JSON_LENGTH(settings_data) AS campos FROM storefront_settings; SELECT scope, COUNT(*) AS bloques FROM storefront_visual_blocks GROUP BY scope;"
docker compose exec backend python -m app.services.storefront_visual_reconcile --check
```

El primer comando usa únicamente las credenciales predeterminadas de desarrollo:
ajusta el usuario y la contraseña a tu entorno sin compartir secretos.
El segundo comando no escribe en la base.

Si `source_exists` es `false`, no hay una configuración JSON que migrar.
El comportamiento correcto es mantener las tablas vacías hasta que el
superadministrador configure y guarde la portada.

Si existe configuración (`source_exists=true`) y `in_sync=false`,
verifica primero un respaldo de la BD e imágenes. Con respaldo confirmado,
la reconciliación explícita y transaccional es:

```bat
docker compose exec backend python -m app.services.storefront_visual_reconcile --apply --backup-confirmed
docker compose exec backend python -m app.services.storefront_visual_reconcile --check
```

`--apply` no crea la configuración original ni modifica el JSON publicado:
solo reconstruye su espejo relacional, después de revalidar bajo bloqueo de fila.
Nunca se ejecuta automáticamente durante una consulta pública.

El Diseñador consulta `/admin/homepage-storage-health` y compara las
configuraciones completas y las diapositivas, no solamente los recuentos.
No cambiar las lecturas públicas al almacenamiento relacional hasta tener
`in_sync=true` y validar el comportamiento del editor y la tienda.


## Inicialización segura del primer borrador y secciones independientes

Para una tienda con `source_exists=false`, abrir
`http://localhost:5174/estudio-inicio` con una cuenta superadministradora.

1. Pulsar **Inicializar borrador privado** aunque todavía no se hayan
   modificado campos. El backend guarda únicamente `_homepage_draft`
   y genera el espejo relacional de `published` y `draft`.
   **Esto no publica la portada y no crea campañas o fotos de muestra**.
2. Revisar que `source_exists=true` y `in_sync=true` en el diagnóstico.
3. Para crear secciones independientes, seleccionar **Crear banner**,
   **Crear mosaico** o **Crear carrusel**. Se crea una sección inactiva;
   agregar imágenes y configurar su visibilidad y activación.
4. Usar las flechas para ordenar, casilla para ocultar y papelera para
   eliminar las secciones personalizadas. La eliminación solo afecta
   el borrador hasta publicarlo y no elimina archivos del volumen de imágenes.
5. Las secciones estructurales (productos, pagos, FAQ, etc.) se pueden
   ocultar, pero no se borran sus datos comerciales.
6. **Guardar borrador** y comprobar `in_sync=true`. Solo al seleccionar
   **Publicar portada** se expone la nueva disposición a clientes.

Las secciones independientes se guardan en `homepage_custom_sections`
y `homepage_section_order`, con máximo 12 secciones y 8 imágenes por
sección. Se reflejan en las tablas creadas por Alembic `20261120_15`,
sin nuevas migraciones ni alteraciones de catálogo.

**Revisión visual:** la cuadrícula de fotografías de categorías solo
muestra las fotos que el administrador elige. Un producto con una imagen
incorrecta (por ejemplo, documentos o diagramas) debe corregirse en el
catálogo; este cambio no lo elimina ni altera de manera silenciosa.
El simulador del Diseñador es orientativo, no sustituye la inspección
visual real en escritorio y móvil.

No confundir inicializar un borrador con publicar la tienda. Evitar
usar el formulario general de configuración para cambios de la portada
si existe un borrador no publicado, pues ese formulario opera sobre
configuración pública. Usar el Estudio visual como flujo principal.
