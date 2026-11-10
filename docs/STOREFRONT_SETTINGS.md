# HJStoreVP — Configuración general administrable

## Alcance

Nueva opción del panel **Configuración de tienda** visible y editable solo
por usuarios con rol `super_admin` (autorización exigida también por API).

Configuración pública comercial, separada de secretos de infraestructura:
- Identidad: nombre, eslogan, anuncio superior, descripción del pie.
- Portada: encabezado, título, descripción, texto del botón, imagen del banner.
- Branding: logo e imágenes almacenadas en `uploads/branding` después de
  verificar formato, dimensiones y normalizar con Pillow.
- Contacto: correo, teléfono, WhatsApp numérico, Instagram, Facebook y TikTok.
- Textos administrables de políticas: envíos, devoluciones, privacidad y
  términos; no se renderiza HTML ni se presupone que tengan aprobación legal.

El sitio muestra los campos guardados; mientras no hay configuración
persistida mantiene valores por defecto de identidad. Las políticas solo
aparecen como enlaces cuando existe contenido publicado.

## API
- `GET /api/v1/storefront-settings/public`: solo información pública.
- `GET /api/v1/storefront-settings/admin`: superadmin, valor y auditoría.
- `PUT /api/v1/storefront-settings/admin`: superadmin, valores validados.
- `POST /api/v1/storefront-settings/admin/upload-image`: superadmin, multipart.

No se editan credenciales, descuentos, impuestos, pagadores, facturación
DIAN ni el servidor SMTP por este módulo.

## Almacenamiento y migración

La revisión `20261110_12` crea únicamente `storefront_settings`
(`id`, `settings_data`, `updated_by`, `updated_at`).
No elimina ni transforma productos, órdenes ni existencias.

**Proceso recomendado para entorno local actual (Windows CMD):**
1. Confirmar que `git status --short` no muestra cambios.
2. Respaldar MariaDB y conservar copia **fuera del repositorio**.
3. `docker compose stop backend`.
4. `git pull --ff-only origin main`.
5. `docker compose run --rm --no-deps backend alembic current` debe ser
   `20261110_11` y `alembic heads` `20261110_12`.
6. `docker compose run --rm --no-deps backend alembic upgrade head`.
7. Verificar `alembic current` = `20261110_12`, después iniciar backend.
8. Verificar salud de backend con `curl http://localhost:8000/health`.

**No usar `docker compose down -v` ni reejecutar migraciones fallidas sin inspección.**

## Límites
- Los enlaces de imágenes externas se restringen a HTTPS. Para desarrollo
  se admiten imágenes subidas en ruta `/uploads/branding`.
- La configuración no sustituye la revisión legal de los textos de política.
- La definición legal y tributaria, pruebas integrales de comportamiento y
  auditoría final siguen siendo fases del cierre.
