# HJStoreVP — Gestión completa de usuarios

## Funcionalidades
- **Editar**: nombre, correo (se valida duplicado), teléfono, rol y sede para vendedores.
- **Pausar**: `active=false`, evita iniciar sesión y revoca acceso inmediatamente para las solicitudes posteriores.
- **Reactivar**: `active=true`, conserva datos e historial del usuario.
- **Cambiar contraseña**: diálogo independiente con confirmación y al menos 12 caracteres. Se guarda como hash (nunca se muestra al cliente); los tokens anteriores no son válidos gracias al fingerprint de credenciales presente en el sistema.
- **Eliminar**: confirmación escribiendo el correo exacto. Baja **lógica** con `deleted_at`; se desactiva el acceso y la cuenta deja de aparecer en el listado. Se conserva registro en la base para no perder pedidos, movimientos, arqueos ni auditoría. **No existe restauración automática para usuarios eliminados**.
- Todas las acciones se verifican en el backend. Un administrador normal no puede gestionar cuentas admin/super_admin; no es posible pausar ni eliminar la cuenta propia. La edición del rol/estado propio también está restringida.
- Las cuentas eliminadas **conservan su correo reservado**; no puede reutilizarse para crear otra cuenta sin un proceso adicional de revisión, evitando suplantación y duplicidad histórica.
- El formulario de alta crea cuentas activas. El usuario puede rotar su contraseña posteriormente desde su fila.

## Esquema de datos
Migración aditiva: `20261118_13_user_lifecycle.py`.
Agrega únicamente `users.deleted_at` (nullable) conservando todos los registros existentes.
Cabeza Alembic prevista: `20261118_13`.

## Despliegue local Windows + Docker
**Precaución**: esta fase modifica el backend y requiere aplicar la migración antes de reiniciar o recrear servicios.

1. Comprobar que `git status --short` esté limpio y conservar cualquier archivo local pendiente.
2. `git pull --ff-only origin main`
3. Respaldar MariaDB con el mecanismo habitual del proyecto.
4. Aplicar migraciones de manera controlada: `docker compose exec backend alembic upgrade head` (si el comando alembic está disponible en el servicio de backend).
5. Reiniciar `backend` y `frontend-admin`, verificando su estado.

**En entornos con código backend copiado en la imagen**, el simple reinicio no incorpora los cambios; reconstruir el backend con `docker compose up -d --build backend` después de migrar. Consultar primero la configuración Docker usada localmente.

## Seguridad
Las sesiones anteriores quedan sin privilegios al pausar o eliminar; el backend valida el indicador active en cada request. Rotar contraseña invalida tokens previos mediante `credential_version`.
No se realiza borrado físico de cuentas por sus referencias históricas.
Las pruebas manuales/e2e integrales siguen para la última etapa del proyecto; CI automatizada verifica la compilación y el contrato de seguridad.
