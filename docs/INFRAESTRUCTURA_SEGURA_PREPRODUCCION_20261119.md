# HJStoreVP — Infraestructura segura y preparación para producción (etapa 1)

Fecha: 2026-11-19 · Rama `main`.

## Cambios aplicados al entorno local

- `docker-compose.yml`: se elimina la propiedad obsoleta `version` de Compose.
- El backend (`8000`), la tienda (`5173`) y el panel (`5174`) escuchan en **127.0.0.1** del equipo anfitrión. MariaDB (`3306`) y Redis (`6379`) ya estaban limitados a loopback y permanecen así.
- Rotación `json-file` para los siete servicios, con `max-size: 10m` y `max-file: 3`, para limitar crecimiento de los logs de contenedores nuevos/recreados.
- Healthcheck HTTP de backend `/health` con Python de la imagen existente, intervalo de 30 s, plazo de 5 s y arranque de 35 s. Indica respuesta HTTP, **no** prueba integridad de MariaDB, Redis ni pasarelas.
- Conservados nombres de contenedores, volúmenes persistentes `db_data`, `redis_data`, `uploads_data`, permisos, rutas internas, perfiles de workers y modo desarrollo con recarga. **No se habilita un modo productivo por este cambio**.
- `scripts/backup_local.py`: genera un volcado `mariadb-dump --single-transaction --quick --routines --events --triggers`, comprimido `.sql.gz` con nombre UTC y archivo `.sha256`, sin exponer contraseñas ni sobrescribir respaldos. Se ignora `backups/` en Git. No prueba restauración, no cifra archivos y **no respalda por sí mismo el volumen de imágenes**.

## Procedimiento local

```cmd
cd C:\Users\jjcor\Documents\Github\HJStoreVP
git status --short
git pull --ff-only origin main
docker compose config --quiet
docker compose up -d --build backend frontend frontend-admin
docker compose ps
docker compose exec backend alembic current
docker compose logs --tail=80 backend frontend frontend-admin
python scripts/backup_local.py
git log -1 --oneline
```

La versión de Alembic sigue siendo `20261119_14` y no hay nueva migración.

Si `docker compose config --quiet` falla, **no iniciar la actualización**. No usar `docker compose down -v`, `alembic stamp` ni `docker volume prune`.

El archivo `.sql.gz` y su `.sha256` se crean en `backups/local/`. Conservar una copia **cifrada fuera del computador** y verificar restauración de prueba, sin afectar la BD operativa. El checksum detecta diferencias accidentales, pero **no reemplaza cifrado ni firma digital**.

## Respaldo del almacenamiento de imágenes

El volumen Docker `uploads_data` contiene fotografías/cargas independientes de MariaDB. Debe respaldarse en un segundo artefacto, con inventario, checksum y restauración ensayada. Un dump de base de datos **NO** incluye ese volumen. Hacer ambos respaldos próximos en el tiempo, conservar consistencia y no restaurar archivos antiguos sobre imágenes nuevas.

## Diseño de despliegue productivo — todavía no implementado

1. Construir imágenes **de producción**: frontend y panel compilados con Vite y servidos con Nginx/Caddy; backend sin `--reload` ni montajes de código fuente.
2. Exponer únicamente 443/HTTPS a Internet mediante reverse proxy; backend y MariaDB/Redis únicamente en red privada de Docker/VPC; cerrar puertos internos.
3. Crear secretos únicos en gestor de secretos o montajes protegidos, evitar contraseñas por defecto y utilizar un usuario MariaDB con privilegios mínimos; deshabilitar DEBUG y `/docs` conforme configuración existente.
4. Definir dominios HTTPS, ALLOWED_ORIGINS exactos, cookies/tokens, CSP, cabeceras y credenciales reales separadas sandbox/producción. No activar Wompi, Addi ni Sistecréditos hasta validación de contratos y pruebas.
5. Preparar supervisión de aplicación, base de datos, cola y Redis, retención mínima de logs, alertas, copias automáticas cifradas, restauración DRP y procedimiento de rotación de credenciales.
6. Configurar CI para dependencias/CVE, escaneo de secretos, tests y revisión de permisos. Probar concurrencia de stock, idempotencia, webhooks duplicados/tardíos y acceso horizontal.

## Observaciones / limitaciones

La seguridad de ejecución del entorno de desarrollo no convierte los servidores Vite en servicios listos para producción. Los archivos se han actualizado y consultado en GitHub, pero no hemos validado todavía el resultado de `docker compose config`, compilación ni restauración en el equipo Windows del usuario. Se mantienen las pruebas integrales para el cierre y la facturación DIAN como última fase.
