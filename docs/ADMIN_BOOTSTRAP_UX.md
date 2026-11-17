# HJStoreVP — Rediseño del panel administrativo con Bootstrap 5.3.9

## Alcance
- Bootstrap **5.3.9** instalado con npm y CSS local dentro de Vite; no se usa CDN, script remoto ni jQuery.
- El panel conserva React, React Router, Tailwind y los servicios/estados existentes.
  Se añade una capa de estilos `admin-bootstrap.css` con especificidad del panel para
  evitar que Bootstrap sobrescriba la tienda pública, la API o las utilidades existentes.
- Navegación agrupada en cinco áreas, buscador de módulos, colapso por secciones,
  menú móvil, rol visible y acceso rápido a la tienda. Atajo Ctrl+K / Cmd+K.
- Dashboard incorpora accesos rápidos a productos, inventario, pedidos web y reportes.
- Nuevo diseño de configuración de tienda: navegación lateral por secciones,
  formularios Bootstrap, ayuda contextual, etiquetas obligatorias, previsualización
  de logotipo/banner y contador para políticas.
- La barra de guardar está en el flujo del documento: **no se superpone** con campos
  o con textos largos, y muestra si existen modificaciones sin publicar.
- Tablas y tarjetas comparten espaciado, bordes y jerarquía coherentes con el diseño.
- Los permisos existentes (super_admin / admin / seller), rutas y operaciones CRUD
  no cambian.

## Despliegue local (Windows CMD)

El paquete Bootstrap se agregó como dependencia NPM. **Un reinicio por sí solo
no lo instala**, porque Docker usa el volumen `/app/node_modules`.

1. Confirmar `git status --short` limpio.
2. `git pull --ff-only origin main`.
3. `docker compose exec frontend-admin npm install` (el contenedor necesita estar iniciado),
   que instala Bootstrap en el volumen de dependencias existente.
4. `docker compose restart frontend-admin`.
5. Confirmar que `docker compose ps frontend-admin` muestra `Up`.
6. Revisar `http://localhost:5174/` desde el navegador durante la fase de
   aceptación visual. Las pruebas funcionales e integrales permanecen para el cierre.

Alternativa para reconstruir la imagen cuando se prepare despliegue:
`docker compose build frontend-admin` y recrear ese servicio de forma controlada.

**No hace falta migrar MariaDB**, no cambian `alembic_version`, pagos ni inventario.

## Próximo alcance posible
Rediseño visual por módulo: tablas con acciones prioritarias, formularios
de productos y pedidos, y accesibilidad detallada, siempre con cambios
incrementales que no modifiquen reglas de negocio.
