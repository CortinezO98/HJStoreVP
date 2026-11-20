# HJStoreVP — Respaldos integrales, observabilidad local y plan DRP

Fecha: 2026-11-19. Integrado en `main`. Alcance **local/de desarrollo**, sin migraciones ni cambios en ventas o inventario.

## Qué se añadió

### Copia del volumen de imágenes

`python scripts/backup_uploads.py`

- Usa `docker compose run --rm --no-deps -T backend` con el **volumen uploads_data existente del proyecto** (no inventa otro nombre Docker).
- Dentro del contenedor genera un TAR mediante la biblioteca Python, cuyo contenido se transmite al equipo Windows sin extraerlo ni escribir en el volumen original.
- Rechaza enlaces simbólicos y entradas especiales para impedir que una copia accidental incluya rutas fuera de `/app/uploads`.
- Comprime con GZIP en un archivo `.partial`; exige ejecución Docker correcta, recorre el archivo para validar miembros y bytes antes de renombrarlo `.tar.gz`.
- Genera SHA-256, usando nombre UTC, sin sobrescribir respaldos previos.
- No elimina imágenes ni realiza restauración. **Si las imágenes cambian durante la copia, el TAR podría reflejar instantes diferentes**; acordar una ventana sin escrituras para un punto recuperable.

### Respaldo de conjunto

`python scripts/backup_full_local.py`

Orquesta el respaldo SQL existente `backup_local.py` y el nuevo `backup_uploads.py`, comprueba los SHA-256 y crea un manifiesto `hjstorevp_pair_YYYYMMDDTHHMMSSZ.json` que vincula ambos respaldos. No elimina copias anteriores.

El volcado SQL usa `mariadb-dump --single-transaction`, apropiado para tablas InnoDB, pero **no convierte dos operaciones separadas SQL + archivos en un snapshot atómico**. Para coherencia fuerte, detener temporalmente las escrituras comerciales; una mera copia concurrente no garantiza punto en el tiempo.

### Verificación independiente

`python scripts/verify_backup_pair.py`

Valida que ambos archivos estén en la carpeta del manifiesto, verifica SHA-256, recorre el GZIP SQL completo y todas las entradas del TAR sin extraer. No escribe sobre Docker, MariaDB ni el volumen de imágenes. Una copia íntegra sigue necesitando una **restauración de ensayo** para certificar recuperabilidad.

### Monitoreo de desarrollo

`python scripts/healthcheck_local.py`

- Inspecciona estados de los contenedores obligatorios `db`, `redis`, `backend`, `frontend` y `frontend-admin`, respetando su información de healthcheck.
- Consulta endpoints HTTP locales del backend y ambos Vite.
- Advierte si el disco del workspace tiene menos de 10% libre.
- Muestra la antigüedad del respaldo de BD y del volumen de imágenes y la existencia de sus archivos SHA-256.
- Por defecto los respaldos faltantes se reportan como alerta sin hacer fallar el resultado general. Con `--require-backups`, una copia faltante/antigua retorna estado de fallo, útil para una programación que envíe notificaciones externas.
- Con `--json` produce datos estructurados para una tarea programada o sistema de monitoreo futuro. **No envía correo, no programa tareas por su cuenta y no imprime credenciales**.

## Actualización local de Windows

```cmd
cd C:\Users\jjcor\Documents\Github\HJStoreVP
git status --short
git pull --ff-only origin main
docker compose config --quiet
docker compose ps
docker compose exec backend alembic current
python scripts/healthcheck_local.py
python scripts/backup_full_local.py
python scripts/verify_backup_pair.py
python scripts/healthcheck_local.py --require-backups --max-age-hours 48
git log -1 --oneline
```

**No se requiere reconstruir contenedores** para estos scripts (se ejecutan en el anfitrión y usan el contenedor/imágenes que ya tienes). Si `docker compose ps` muestra servicios detenidos, revisar los logs antes de iniciar los faltantes. La revisión Alembic esperada continúa siendo `20261119_14`.

Si falta Docker Desktop, no es posible crear las copias de volúmenes por estos scripts.

El script `backup_full_local.py` realiza dos copias **secuenciales**, no suspende ventas automáticamente. Si una falla, conserva la copia exitosa, informa conjunto incompleto y no crea manifiesto de pareja.

## Cómo ejecutar una copia coherente con mínimo riesgo

1. Informar mantenimiento local, evitar compras, edición de productos, carga de imágenes, cobros y operaciones de posventa.
2. Verificar que no existan trabajos activos en workers ni solicitudes en tránsito. No cancelar una pasarela real en ejecución para efectuar el respaldo.
3. Ejecutar `backup_full_local.py` cuando no haya escrituras. Conservar en el mismo destino los archivos `.sql.gz`, `.tar.gz`, sus `.sha256` y el `.json`.
4. Ejecutar `verify_backup_pair.py`. Hacer una copia **cifrada fuera del computador** y preservar llaves de cifrado de manera separada.
5. Reanudar operación únicamente tras comprobar que el entorno original no se alteró.

No ejecutar `docker compose down -v`, `docker volume prune`, `alembic stamp` ni copiar archivos directamente a las carpetas activas como procedimiento de recuperación.

## Plan de restauración aislada (no automatizado)

La primera restauración deberá hacerse en un **Docker Compose Project diferente**, con nombres de contenedores y puertos distintos, sin montar `db_data` o `uploads_data` productivos ni apuntar a servicios de cobro reales.

1. Comprobar `verify_backup_pair.py` antes de transportar archivos.
2. Preparar una copia aislada de la configuración y volúmenes nuevos, con `ENVIRONMENT=development` y pasarelas reales desactivadas. Los nombres fijos `container_name` del Compose de desarrollo deben retirarse/cambiarse en esa copia antes de levantarla. No se debe usar el Compose original del repositorio para dos stacks simultáneos.
3. Restaurar el volcado SQL **solo** en la MariaDB aislada, verificando cabecera, tablas y revisión Alembic. Tener en cuenta que el `--databases` original contiene nombre de BD.
4. Extraer el TAR `uploads` **solo** hacia un directorio/volumen nuevo y comprobar que ningún archivo sea enlace o ruta de escape. Nunca restaurar sobre el volumen activo.
5. Revisar coherencia de URLs de imágenes, catálogo, existencias, pedidos e integridad de reservas; comprobar si el momento de captura permitió imágenes duplicadas/faltantes.
6. Registrar fecha de ensayo, duración real, errores, RPO/RTO medidos y responsable que autorizó el procedimiento. Solo después definir procedimientos de recuperación productiva.

**Importante sobre Redis:** `redis_data` existe por separado y no está incluido en los dos archivos anteriores. No declarar DRP integral de todo el estado hasta decidir qué datos Redis deben persistir y cómo respaldarlos o regenerarlos. Tampoco se están exportando secretos de configuración ni credenciales de proveedores; recuperarlos desde un gestor de secretos.

## Pendientes siguientes

- Procedimiento verificable de respaldo/restauración Redis si contiene estado no regenerable.
- Ensayo de restauración en un proyecto Docker aislado, sin tocar el equipo operativo.
- Automatización controlada de copias con Windows Task Scheduler, retención externa cifrada y alertas; no programar sin definir horario y política.
- Preparar imágenes de producción sin Vite dev server ni Uvicorn `--reload`, dominio HTTPS y reverse proxy, redes privadas, control de secretos y CI/CD.
- Pruebas integrales de seguridad, carga y concurrencia **al cierre**, como se acordó. Facturación electrónica DIAN **al final del proyecto**.

## Verificación de esta entrega

Los archivos se publicaron y cotejaron en GitHub, pero los scripts **no se han ejecutado en el Docker Desktop del usuario**. La ejecución local y la restauración aislada son condiciones obligatorias para afirmar que existe un respaldo recuperable.
