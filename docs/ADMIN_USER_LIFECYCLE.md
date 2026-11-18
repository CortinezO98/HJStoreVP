# HJStoreVP — Administración completa de usuarios

## Acciones disponibles

El panel administrativo `/usuarios` conserva el alta y la edición (nombre, correo, teléfono, rol y punto físico) e incorpora:

- **Suspender temporalmente:** `PATCH /api/v1/users/{id}/status` con `{"active": false}`. Impide login y acceso con sesiones existentes mientras esté suspendido.
- **Reactivar:** el mismo endpoint con `{"active": true}`. Conserva perfil, contraseña e historial de operaciones.
- **Cambiar contraseña:** `POST /api/v1/users/{id}/reset-password` con `{"password": "…"}`. Exige al menos 12 caracteres y guarda solo hash bcrypt. Cambiar el hash invalida inmediatamente los tokens de acceso y refresh anteriores.
- **Eliminar cuenta del panel (baja lógica):** `DELETE /api/v1/users/{id}`. Marca `deleted=true`, desactiva, libera el correo, reemplaza datos básicos de cuenta por identificadores anónimos y rota el hash. La cuenta deja de aparecer en el listado y no puede reactivarse desde el panel. **No elimina físicamente filas ni las relaciones con órdenes y caja**, y tampoco equivale a una eliminación integral de todos los datos personales presentes en documentos históricos.
- **Editar:** `PUT /api/v1/users/{id}` permite corregir nombre, correo, teléfono, rol y sede con validación de permisos y correos duplicados.

## Seguridad y permisos

- Administrador puede gestionar vendedores/clientes, nunca otras cuentas administrativas.
- Superadministrador puede administrar otras cuentas administrativas.
- Nadie puede suspender/eliminar su propia cuenta; no se puede quitar acceso al último superadministrador activo.
- La edición de roles/estado de la cuenta propia sigue restringida por backend.
- Se preservan las políticas de autenticación, la revocación por cambio de contraseña y las asociaciones históricas.
- Los cambios de estado son reversibles; **la baja lógica no es reversible desde el panel**.
- Los formularios de gestión confirman acciones importantes; eliminar solicita escribir el correo exacto de la cuenta.

## Actualización de base de datos

**Esta fase sí requiere migración Alembic** porque crea la columna `users.deleted`, con valor inicial `false`. Es aditiva, sin eliminar ni recrear tablas.

Antes de desplegar, hacer respaldo SQL del entorno existente. Comando de migración en el backend Docker (ajustar nombre del servicio a la instalación):

```cmd
docker compose exec backend alembic upgrade head
```

Recrear el servicio backend para recoger el modelo y los endpoints nuevos si el despliegue usa imagen construida:

```cmd
docker compose up -d --build backend
```

Luego actualizar y reiniciar frontend-admin (si ya no se ha hecho). No ejecutar operaciones de baja sobre cuentas reales antes de la fase de aceptación. Asegurar que la migración termine antes de utilizar el código del backend actualizado.

## Alcance pendiente de pruebas integrales

Compilación del administrador, suite automatizada backend y pruebas unitarias aisladas del ciclo de vida forman el control de regresión en CI. La revisión funcional integral con la base real permanece para la etapa final del proyecto.
