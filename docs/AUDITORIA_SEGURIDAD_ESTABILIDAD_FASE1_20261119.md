# HJStoreVP — Auditoría de seguridad y estabilidad, etapa inicial

Fecha: 2026-11-19 · Rama: main · Alcance: controles defensivos no destructivos.

## Inventario de controles observado

- Autenticación: JWT access/refresh, límites de intentos por cuenta/IP, protección contra replay de refresh y versiones de credenciales para revocar sesiones.
- Autorización: roles CUSTOMER, SELLER, ADMIN y SUPER_ADMIN con dependencias server-side en rutas privadas. La ocultación de acciones en el frontend nunca sustituye controles backend.
- Compras: claves idempotentes por cliente, índice único MariaDB, reservas de inventario con disminución condicional, bloqueo de pedido en webhooks y cancelaciones.
- Integraciones de pago: comprobación de firma por proveedor según la implementación actual; Wompi verifica detalles contra su API.
- Imágenes: decodificación de contenido, restricciones de formatos/tamaño/resolución, normalización WEBP, nombres aleatorios y protección al eliminar archivos.
- API: Swagger deshabilitado en producción, nosniff, DENY framing y cabeceras básicas.

Estos controles requieren pruebas integrales posteriores; enumerarlos **no constituye una certificación**.

## Riesgos concretos corregidos en esta entrega

### 1. Publicación de archivos locales
Antes: `app.mount('/uploads', StaticFiles(...))` publicaba la raíz completa del almacenamiento. Una copia de respaldo o documento guardado accidentalmente allí podría quedar descargable.

Ahora solo se publican `/uploads/products/*` y `/uploads/branding/*`, los dos directorios de imágenes utilizados por la tienda. Se conserva la URL de fotografías existentes. No se borran archivos. Los demás archivos bajo `uploads` no se sirven por esta ruta pública.

### 2. Webhooks anónimos sin límite dedicado de bytes
Antes: Wompi, Addi y Sistecréditos podían leer `request.body()` / `request.json()` completos antes de inspeccionar el tamaño.

Ahora: `read_bounded_webhook` limita el contenido a **128 KiB** durante el streaming, verifica `Content-Length` cuando existe y rechaza solicitudes vacías, demasiado grandes y JSON inválido. Se mantiene la validación criptográfica ya existente: una solicitud de tamaño válido no adquiere permisos adicionales.

### 3. Tipos inesperados de JSON firmado
Se validan objetos y campos básicos antes de emplear `.upper()` o `.get()`. Los cuerpos malformados devuelven 400 en lugar de una excepción sin manejar, sin aceptar pagos.

### 4. Configuración y cabeceras
- CORS ahora declara métodos HTTP y cabeceras de navegador explícitos: Authorization, Content-Type, Idempotency-Key y X-Requested-With.
- Respuestas privadas/sensibles y operaciones de escritura se marcan `Cache-Control: no-store`.
- HSTS (un año) se anuncia cuando `ENVIRONMENT=production`; se requiere proxy/dominio con HTTPS real.
- La aplicación rechaza iniciar en producción si `ALLOWED_ORIGINS` contiene entradas no HTTPS o locales, si API_BASE_URL/STORE_PUBLIC_URL no usan HTTPS, o si Wompi se configura en producción sin opt-in de pagos reales.
- Los valores de desarrollo no cambian; esto no habilita pagos.

## Actualización local (sin migración nueva)

```cmd
cd C:\Users\jjcor\Documents\Github\HJStoreVP
git status --short
git pull --ff-only origin main
docker compose up -d --build backend frontend-admin
docker compose exec backend alembic current
docker compose ps
docker compose logs --tail=80 backend frontend-admin
git log -1 --oneline
```

Alembic debe seguir en `20261119_14`. No reinicializar volúmenes, no usar `down -v` y no hacer `stamp` para ocultar errores.

## Riesgos pendientes para cierre de seguridad/producción

1. Validar firma, importe, moneda y estados definitivos según contratos oficiales vigentes de Addi y Sistecréditos antes de cobros reales.
2. Endurecer despliegue real: reverse proxy HTTPS, rate limits de borde y de webhooks, balance de workers, rotación de secretos, segmentación de red, CORS por dominios finales y eliminación de defaults en producción.
3. Auditoría final de autorización horizontal por usuario/pedido, subidas de fotos y rutas estáticas, límites de carga bajo concurrencia, idempotencia/webhooks duplicados y fuera de orden, cancelaciones y posventa.
4. Crear procedimientos de backup cifrado, restauración ensayada, monitoreo de fallos, alertas y retención de logs sin tokens.
5. Revisar dependencias y CVE actualizados al momento de lanzamiento; habilitar escaneo de secretos/dependencias y CI de pruebas antes de merge.

## Límites de verificación

Se inspeccionó el código fuente y se confirmaron los archivos en GitHub. No hay pruebas integrales, pentest, prueba de carga ni verificación de pasarelas en ejecución en el equipo Windows/Docker del usuario. No se debe presentar esta entrega como lista para producción.
