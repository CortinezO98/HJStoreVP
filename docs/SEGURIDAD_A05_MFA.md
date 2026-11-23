# A-05 — MFA administrativo obligatorio

Por defecto ADMIN_MFA_REQUIRED=true. Solo desarrollo y pruebas permiten desactivarlo explícitamente; staging y producción rechazan el opt-out. Los tests históricos de negocio usan configuración explícita sin MFA y A-05 ejercita la política activa.
Administradores y superadministradores sin MFA reciben un JWT mfa_enrollment de 15 minutos, sin refresh. Solo estado, setup y confirmación de MFA aceptan esa credencial. Tokens anteriores sin MFA quedan bloqueados en dependencias privadas y no adquieren privilegios en dependencias opcionales. El header X-MFA-Setup-Required se expone por CORS. Tras confirmar TOTP, guardar códigos y volver a iniciar sesión. No se permite desactivar MFA bajo la política obligatoria.
Panel: flujo independiente de enrolamiento; tienda: redirige personal al panel sin persistir tokens administrativos. No se requieren migraciones. Validar navegación real y códigos de recuperación en cuentas ficticias antes de producción.
