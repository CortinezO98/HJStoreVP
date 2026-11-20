# HJStoreVP — Fase B: perfil y 2FA

## Alcance

- Mi perfil: nombre, teléfono, cambio de correo y contraseña con comprobación de contraseña actual.
- TOTP para Super Admin y Admin: activación voluntaria, desafío de login previo a JWT y 10 códigos de recuperación de un solo uso.
- Los secretos TOTP se cifran en la base con una clave derivada del SECRET_KEY del backend. No cambiar esa clave sin migrar secretos.
- Enrolamiento con verificación del código; al activarlo, tokens anteriores sin la versión MFA dejan de tener acceso.
- El 2FA obligatorio **no está activado automáticamente** en esta fase. Establecer un plan de enrolamiento y recuperación verificado antes de hacerlo obligatorio.
- No hay correos de recuperación, ni eliminación de factores desde el panel administrativo. Recuperación de cuenta bloqueada: requiere procedimiento de soporte fuera de banda.
- El login de clientes y las ventas no cambian.

## Migración

Revisión aditiva `20261120_17`, posterior a `20261120_16`. En desarrollo, el startup crea tablas faltantes. **No aplicar migraciones indiscriminadamente a una base con datos existentes**: inspeccionar `alembic_version`, respaldo verificado y ejecutar la revisión controlada.

## Pasos manuales

1. Iniciar sesión normalmente.
2. Ir a **Mi perfil**. Actualizar datos o contraseña con la clave actual.
3. Iniciar enrolamiento 2FA validando la contraseña. Añadir la clave a una aplicación TOTP mediante el URI otpauth; confirmarlo con un código de seis dígitos.
4. Guardar los 10 códigos de recuperación en un lugar privado. Se muestran una sola vez.
5. Iniciar sesión nuevamente e introducir el TOTP o un código de recuperación.
6. Tras rotar contraseña se cierra la sesión del panel y se exige un nuevo inicio de sesión.

## Seguridad y pruebas

No incluir claves TOTP ni códigos de recuperación en logs, respuestas posteriores ni repositorio. Verificar el login con credencial correcta e incorrecta; evitar reuso del mismo intervalo TOTP y del mismo código de recuperación; asegurar que los tokens `mfa_pending` no acceden a rutas ni refresh; y que un token anterior a la activación no continúa autorizado.

Se requiere habilitar protección Redis en producción. Esta fase no modifica pagos, stock ni DIAN.
