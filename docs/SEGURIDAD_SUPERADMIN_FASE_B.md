# HJStoreVP — Fase B: perfil, segundo factor y sesiones

## Estado y despliegue

Este desarrollo se mantiene en el PR #43 en borrador. No fusionar ni usar con la única cuenta
Super Admin hasta superar pruebas aisladas, validación de restauración y recorrido en el navegador.
No se modifica el checkout, inventario ni el motor de facturación.

## Alcance implementado

- **Mi perfil** para personal del panel: nombre y teléfono; cambio de correo y contraseña
  reautenticando con contraseña actual y, cuando está activo, segundo factor.
- **TOTP voluntario** para Admin y Super Admin, estándar de seis dígitos/30 segundos:
  el secreto se cifra con Fernet en la base; se verifica un código antes de activarlo.
- **Desafío MFA previo a JWT**: la contraseña válida solo devuelve un desafío temporal
  de cinco minutos. No es un token de acceso o refresh y cada desafío se canjea una sola vez
  (Redis). Solo la verificación genera tokens de sesión normal.
- **Recuperación**: diez códigos generados aleatoriamente, almacenados exclusivamente como
  hashes HMAC. Se muestran una única vez; cada uno se consume de forma atómica.
  Permite regenerarlos presentando contraseña actual + segundo factor válido.
- **Desactivar 2FA** requiere contraseña actual + TOTP/recuperación. Se borran secreto,
  enrolamiento pendiente, códigos de recuperación y se revocan todas las sesiones.
- **Cerrar todas mis sesiones** requiere contraseña actual + segundo factor si está activo;
  invalida inmediatamente access y refresh tokens previos incrementando la versión persistente.
- Cambios de **correo** también revocan sesiones; cambios de **contraseña** invalidan las
  versiones de credenciales anteriores. Los cambios de rol administrativo revocan tokens antiguos.
- El 2FA **no se vuelve obligatorio automáticamente** para evitar pérdida de acceso.
  Definir obligatoriedad solo después de probar recuperación y disponer de al menos
  un procedimiento seguro fuera de banda.

## Persistencia y secretos

Migración aditiva `backend/alembic/versions/20261120_17_user_mfa.py`:
`revision=20261120_17`, `down_revision=20261120_16` comprobada contra
`20261120_16_product_quality_reviews.py`. Crea una tabla de usuario, sin
eliminar ni cambiar registros previos. La reversión destructiva está bloqueada.

La clave de cifrado TOTP se deriva del `SECRET_KEY` de la API. **No cambiar SECRET_KEY
sin plan de migración o recuperación de secretos**; debe ser fuerte, estable y
protegida en un gestor de secretos. Redis es obligatorio en producción para
protección de intentos y consumición de desafíos.

Antes de operar una base persistente: comprobar `alembic current` y `alembic heads`,
crear respaldo probado, comparar tablas y aplicar únicamente la migración autorizada.
El arranque de desarrollo puede crear tablas con `create_all`, lo que NO sustituye
un control de versión Alembic. Nunca usar `down -v`, seeds ni reinicializar MariaDB.

## Recorrido funcional de aceptación

1. Iniciar sesión normal; entrar a `/mi-perfil`; cambiar nombre y teléfono.
2. Comprobar que el cambio de correo exige la contraseña y fuerza un nuevo login.
3. Cambiar contraseña; verificar que los tokens previos ya no funcionen.
4. Iniciar enrolamiento TOTP con la contraseña; copiar clave secreta manualmente
   a una aplicación autenticadora; verificar el código.
5. Guardar los diez códigos de recuperación en un medio seguro; cerrar sesión.
6. Iniciar sesión: debe solicitar segundo factor antes de obtener access/refresh.
7. Probar error de código, TOTP repetido y un código de recuperación utilizado dos veces.
8. Regenerar códigos con contraseña + TOTP; comprobar que los anteriores dejan de servir.
9. Revocar todas las sesiones y verificar rechazo del token antiguo, incluido refresh.
10. Desactivar 2FA con reautenticación completa; comprobar que vuelve a pedir login
    y no persisten códigos ni secretos activos.

## Validación automatizada

`cd backend && python -m pytest tests/test_user_lifecycle.py tests/test_profile_mfa.py -v`
y `cd frontend-admin && npm run build`. El workflow separado
`Fase B Security CI` ejecuta estas verificaciones para aislarlas de los
fallos heredados del CI integral de pedidos, imágenes y contrato administrativo.

**No usar un pase verde de Fase B como sustituto de CI integral**: clasificar y
resolver por separado las pruebas de `Idempotency-Key`, calidad de imágenes y
contrato del frontend. Mantener las validaciones reales de negocio.

## Recuperación excepcional

En ausencia tanto de autenticador como de códigos de recuperación, **no se ofrece
un bypass** automático, por correo ni por un botón Super Admin. Requiere proceso
administrativo fuera de banda, validación de identidad, respaldos y evidencia de
auditoría por un operador autorizado; prohibido eliminar o editar secretos de
la base directamente como supuesto procedimiento habitual.

La aplicación muestra la clave TOTP manualmente; el QR es mejora opcional
posterior, pero **no enviar el otpauth URI a un servicio externo** para generarlo.
