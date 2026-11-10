# Auditoría ofensiva controlada — HJStoreVP

## Alcance y condiciones

**Autorización:** sólo la instancia local de HJStoreVP controlada por su propietario (127.0.0.1 / localhost). No se realizan escaneos a terceros ni servicios de Wompi/Addi/Sistecréditos. Este documento y el script NO prueban ni certifican un despliegue externo.

**Restricciones:** no fuzzing volumétrico, fuerza bruta, denegación de servicio, cambios reales en stock/pedidos, pagos de prueba contra credenciales productivas, correos reales, borrado de usuarios ni cargas maliciosas en un entorno con datos comerciales. Las pruebas integrales, de concurrencia y autorización con cuentas segregadas se ejecutarán en un entorno de staging al cierre.

## Evidencia de auditoría de código (revisión de rutas)

| ID | Hallazgo basado en código | Riesgo | Tratamiento |
| --- | --- | --- | --- |
| HJSEC-01 | GET /api/v1/products/ devuelve cost_price y margin_pct sin autorización | Alto, exposición de información comercial | Respuesta pública separada por rol validado; campos internos solo para admin |
| HJSEC-02 | GET /api/v1/products/?include_inactive=true accede a productos no publicados | Medio | Requiere admin/super_admin en el backend |
| HJSEC-03 | GET /api/v1/categories?include_inactive=true expone categorías retiradas | Bajo/medio | Requiere admin/super_admin |
| HJSEC-04 | /docs, /redoc y /openapi.json son accesibles también en producción | Bajo/medio, facilitación de enumeración | Desactivar documentación interactiva en ENVIRONMENT=production |
| HJSEC-05 | Falta política de cabeceras HTTP mínimas | Bajo/medio, defensa en profundidad | nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy; no-store para Auth |
| HJSEC-06 | Inicio de sesión y registro carecen de limitación de frecuencia persistente | Alto potencial; requiere validación | Pendiente: rate limiting en Redis + alertas sin afectar clientes |
| HJSEC-07 | SECRET_KEY generada aleatoriamente si la variable no está definida | Medio/alto operativo | Pendiente: secreto obligatorio fijo en prod, rotación planificada |
| HJSEC-08 | Publicación de puertos y --reload en Compose de desarrollo | Alto si se despliega en Internet | No usar Compose de desarrollo en producción; construir perfil productivo |
| HJSEC-09 | Autorización IDOR, cookies, XSS, CSRF y validación de pagos | Por determinar | Requiere staging y dos cuentas de prueba; no declarar seguro sin evidencias |
| HJSEC-10 | Validación de subidas y concurrencia del stock | Alto potencial | Protecciones implementadas en PR #18; prueba real de concurrencia pendiente |

Los niveles son **estimaciones preliminares basadas en código**, no CVSS ni hallazgos explotados por red.

## Caja negra pasiva — ejecución

1. Levantar el backend local de forma normal y comprobar que /health responde.
2. Ejecutar desde la raíz del repositorio:
   `python scripts/blackbox_local.py`
3. Guardar salida con fecha y commit de Git, ocultando cualquier dato de autenticación.
4. Corregir hallazgos y repetir en el mismo entorno de desarrollo.
5. No tratar 0 hallazgos en este script como pentest completo.

La rutina usa únicamente GET/HEAD con timeout corto y sólo localhost; NO solicita tokens, no edita productos, no carga archivos y no ejecuta transacciones.

## Caja gris (fase final en staging)

- Dos usuarios cliente A/B, un vendedor de sede, un admin y un super_admin.
- IDOR: acceso entre clientes a pedidos, facturas internas, carritos, direcciones y devoluciones.
- Permisos: comprobación de 401/403 en todos los endpoints con mutación.
- Validaciones: payloads de tamaños extremos y formatos inesperados con rate control.
- Redirección/cabeceras, exposición de archivos y comprobación de rutas de subida.
- Pagos y webhooks: firmas inválidas, duplicados e idempotencia sólo con datos simulados.
- Concurrencia real: transferencias de stock simultáneas en una copia aislada de MariaDB.

## Caja blanca (auditoría y SAST)

- Revisión de endpoints, auth, dependencia JWT, acceso a BD y storage.
- Dependencias/SBOM y escaneo de secretos mediante herramientas de CI con salidas saneadas.
- Revisar matrices de permisos y todo flujo que acepte IDs provenientes del navegador.
- Revisión de TLS, proxy, logs, respaldos y prácticas de despliegue.

**Criterio de cierre:** alto/crítico mitigado y demostrado en staging; medios con plan y fecha; pruebas integrales completas con evidencias. No publicar conclusiones de seguridad definitiva desde este análisis.
