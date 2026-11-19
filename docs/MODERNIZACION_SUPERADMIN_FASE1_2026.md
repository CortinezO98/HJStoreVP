# HJStoreVP — Modernización incremental del panel administrativo (fase 1)

Fecha: 2026-11-19. Rama: main.

## Alcance entregado

**Navegación global**
- En cualquier pantalla administrativa, `Ctrl+K` (`Cmd+K` en macOS) abre un cuadro de búsqueda de módulos. También se abre desde el botón **Buscar módulo** del encabezado.
- Filtra únicamente los módulos que corresponden al rol actual según la lista de navegación existente: `super_admin`, `admin` y `seller`.
- Accesible con flechas arriba/abajo, Enter y Escape; soporta navegación con teclado y conserva el foco. En móviles ocupa el espacio disponible sin superponerse permanentemente al contenido.
- **Importante:** el filtrado visual no reemplaza `ProtectedAdmin` ni las autorizaciones del backend. No se modificaron rutas ni permisos.

**Dashboard para vendedores**
- El vendedor ahora tiene un punto de entrada operativo en el dashboard, con accesos permitidos a ventas físicas, caja y consulta de inventario.
- El dashboard financiero continúa restringido a administradores y superadministradores. No se muestran cifras contables sensibles al vendedor.

**Dashboard para administradores**
- Se añadió el botón **Actualizar indicadores**, que invalida las consultas React Query del tablero y solicita los datos actuales. No efectúa escrituras.
- Se respetan métricas y gráficos existentes; ningún cálculo financiero o comercial fue modificado.

**Estilos**
- Se agregaron estilos encapsulados en `frontend-admin/src/admin-bootstrap.css` y un componente nuevo `frontend-admin/src/components/layout/AdminCommandPalette.jsx`.
- Se mantiene el diseño actual del panel y sus funciones de productos, inventario, ventas, pedidos, notificaciones, integraciones, reportes y configuración de tienda.

## Instalación local

```cmd
cd C:\Users\jjcor\Documents\Github\HJStoreVP
git status --short
git pull --ff-only origin main
docker compose up -d --build frontend-admin
docker compose ps
docker compose logs --tail=80 frontend-admin
git log -1 --oneline
```

No requiere backend, migraciones, semillas ni reinicialización de base de datos.

## Verificaciones para la fase final

- Navegación de teclado, foco, Ctrl+K / Cmd+K, Escape, roles y restricciones del servidor.
- Botón Actualizar indicadores bajo carga y datos vacíos.
- Aspecto de pantallas grandes, tabletas y móviles; lectores de pantalla.
- El código se ha publicado y los archivos están presentes en GitHub; aún no se ha ejecutado con la base de datos y el navegador local del usuario.

## Continuación recomendada

Fase 2: patrones comunes de filtros, tablas, paginación, estados de carga y formularios en los módulos de gestión, preservando validaciones y operaciones existentes.
