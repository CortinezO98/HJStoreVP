# HJStoreVP — Usuarios, permisos y reportes (Bootstrap 5)

## Usuarios y permisos
- Encabezado y tarjetas resumen de usuarios, administradores, vendedores y cuentas activas.
- Buscador por nombre/correo/teléfono, filtros de rol y estado, limpiar filtros y paginación cliente (10/15/25/50).
- Tabla Bootstrap legible y formulario de alta/edición con mejor distribución responsive y etiquetas de campos.
- **Sin permisos nuevos.** Se conservan los roles `super_admin`, `admin`, `seller`, `customer`; solo el backend determina las operaciones autorizadas.
- El editor sigue ofreciendo roles admin/seller y exige punto físico para vendedores, conserva el alta/edición y la actualización optativa de contraseña. La página permanece protegida para admin/super_admin.

## Reportes y analítica comercial
- Cabecera profesional con navegación directa a resumen, tendencias, productos e indicadores operativos.
- Filtros Bootstrap de fecha, sede, categoría y año; botón para restablecer criterios y etiquetas accesibles.
- Conserva las tarjetas KPI, los análisis mensuales, sedes, productos, categorías, pedidos web, ventas físicas y el módulo `OperationalAnalytics`.
- Mantiene exportación CSV por cada reporte y **todas las fórmulas y consultas vigentes**. Los valores calculados en cliente pueden incluir pedidos no cobrados; no deben presentarse como dinero conciliado, ni como sustituto de un libro contable oficial.
- Mejor adaptación de tarjetas y filtros a pantallas pequeñas. No se agregaron nuevos endpoints ni librerías.

## Cambios técnicos y seguridad
Solo cambian JSX, estilos exclusivos del panel en `admin-bootstrap.css`, documentación y las verificaciones estáticas. Sin migraciones Alembic, modificaciones de DB, API, roles, cuentas, montos o transacciones.
Se ejecuta CI para contrato y compilación. Pruebas end-to-end, auditoría de dependencias y validaciones integrales siguen reservadas a la fase final.

## Actualización local (Windows CMD)
```cmd
cd C:\Users\jjcor\Documents\Github\HJStoreVP
git status --short
git pull --ff-only origin main
docker compose restart frontend-admin
docker compose ps frontend-admin
```

Antes de actualizar, conservar cualquier cambio local, incluido un posible `frontend-admin/package-lock.json`. No se requiere `npm install` nuevo ni migrar MariaDB.
