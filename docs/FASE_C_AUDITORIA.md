# HJStoreVP — Fase C: auditoría administrativa (primera entrega en main)

## Alcance implementado

Bitácora central `security_audit_events` con firma HMAC individual, actor ID,
acción, entidad, identificador, fecha UTC y metadatos **estrictamente permitidos**.
No guarda encabezados, cuerpos HTTP, correos, teléfonos, contraseñas, tokens, QR,
secretos TOTP ni códigos de recuperación. Los intentos de login desconocidos
se referencian por una huella HMAC irreversible del correo, no por el correo.

Instrumentación en login, verificación MFA, cambios de correo/contraseña/perfil,
activación/desactivación MFA, rotación de códigos y revocación de sesiones.
Los endpoints de usuarios registran creación, edición, suspensión/reactivación,
reseteo administrativo de contraseña y baja lógica. Las mutaciones se auditan
en la misma transacción que el cambio; los accesos fallidos se registran en
una transacción aparte sin persistir contraseñas.

Ruta `GET /api/v1/security-audit` solo SUPER_ADMIN en backend, paginación
hasta 100 filas, filtros actor/acción/recurso/resultado/fechas; además resumen
`GET /api/v1/security-audit/summary`. En el panel, sección
`/auditoria-seguridad` protegida para superadministradores.

Se conservan las bitácoras de inventario, despachos, posventa y documentos
comerciales existentes. Esta primera entrega **no integra aún todos sus eventos
en la tabla central**; no debe afirmarse cobertura comercial total.

## Integridad y límites

HMAC por fila detecta alteraciones cuando el atacante no conoce la SECRET_KEY.
No es un registro WORM, encadenado criptográficamente ni externo a la misma BD.
Un administrador con privilegios de borrar filas podría eliminarlas sin que
la firma individual lo detectara. Para producción, replicar fuera de banda
a almacenamiento inmutable y revisar permisos SELECT/INSERT separados; implantar
retención y restauración verificadas. Si se cambia SECRET_KEY, se requiere plan de
migración de firmas para conservar la verificación histórica. La baja física de un
actor referenciado puede convertir actor_id en NULL por la FK y romper su firma:
usar bajas lógicas y diseñar retención histórica antes de depurar usuarios.

## Migración y aceptación

`revision=20261120_18`, `down_revision=20261120_17`.
Crear respaldo consistente y comprobar `alembic current` y `alembic heads`.
No ejecutar en bases compartidas sin respaldo probado. En desarrollo,
`create_all` puede crear la tabla antes que Alembic.

Verificar `python -m pytest tests/test_user_lifecycle.py
tests/test_profile_mfa.py tests/test_security_audit.py -v` y
`npm run build` en frontend-admin. Probar acceso de Super Admin y rechazo
403 para Admin/Seller. Los tests del CI global permanecen independientes y
deben abordarse para aprobación productiva.

## Exportación

`GET /api/v1/security-audit/export` acepta los filtros de búsqueda,
exporta solo 500 entradas recientes y exige SUPER_ADMIN. Las celdas de texto
se neutralizan para evitar fórmulas al abrir en hojas de cálculo. No incluye
firmas HMAC ni secretos; los permisos y límites se aplican en el backend.
