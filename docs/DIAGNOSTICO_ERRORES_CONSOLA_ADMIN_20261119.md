# HJStoreVP — Diagnóstico HTTP 401/403/422 y advertencias de React Router

Fecha: 2026-11-19. Rama: `main`.

## Qué significan los mensajes

- React Router `v7_startTransition` y `v7_relativeSplatPath`: advertencias de compatibilidad futura, no errores. Optar por las banderas requiere comprobar navegación y rutas con wildcard; no se cambió de versión ni se silenciaron.
- HTTP 422 en `GET /api/v1/products?...per_page=200`: el backend exige `1 <= per_page <= 100`. El módulo Reportes pedía 200 y ahora recorre todas las páginas de 100.
- HTTP 403 en `products?include_inactive=true` y `categories?include_inactive=true`: esos listados requieren rol ADMIN o SUPER_ADMIN. Una credencial de acceso vencida en una ruta pública opcional se interpreta como usuario sin privilegios, lo que también causa 403.
- HTTP 401 en `locations` e `inventory`: no se recibió una sesión de acceso válida. Puede deberse a token vencido/revocado, ausencia de sesión o usuario inactivo. No se puede diferenciar sin el cuerpo de la respuesta o la verificación de usuario.

## Correcciones

1. `frontend-admin/src/pages/ReportsPage.jsx`: paginación secuencial del listado completo de productos con límite máximo de 100.
2. `frontend-admin/src/services/api.js`: renovación de token compartida ante 401 y, específicamente, ante 403 de catálogo administrativo con `include_inactive=true`. No se convierte ningún 403 legítimo en permiso. Si el refresh vence, se limpian las credenciales y se solicita iniciar sesión. Si falta refresh y hay 401, se redirige a login.
3. `frontend-admin/src/pages/InventoryPage.jsx`: al acceder como vendedor, no solicita las consultas ni muestra las mutaciones reservadas a administradores (matriz omnicanal, alertas, transferencias, ingreso de mercancía, auditoría). Mantiene el acceso permitido al detalle de inventario de su punto y al catálogo público.

## Actualizar

```cmd
cd C:\Users\jjcor\Documents\Github\HJStoreVP
git status --short
git pull --ff-only origin main
docker compose up -d --build frontend-admin
docker compose logs --tail=70 frontend-admin
git log -1 --oneline
```

Solo se modificó el frontend administrativo. No hay migraciones ni cambios de autorización en backend. Si la sesión ya estaba revocada, cerrar sesión y volver a ingresar con el usuario administrador válido. No pegar tokens, contraseñas ni cabeceras Authorization en mensajes.

La verificación en GitHub confirma el contenido de los archivos; no equivale a una prueba real con el navegador y la base de datos local.
