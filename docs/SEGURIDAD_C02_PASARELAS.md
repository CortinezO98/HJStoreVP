# C-02 — Integraciones de crédito

SISTECREDITO_BASE_URL y ADDI_BASE_URL no tienen valores predeterminados.
SISTECREDITO_INTEGRATION_VERIFIED y ADDI_INTEGRATION_VERIFIED son false por defecto.
Solo se permite ensayo explícito de sandbox en development/test.
Las rutas y esquemas provisionales deben contrastarse con documentación oficial antes de activar.
No habilitar estos indicadores en despliegues; producción y staging permanecen bloqueados.
Las llaves se transmiten únicamente servidor a servidor. No se crean sesiones demo alternativas.
A-01 cubrirá la conciliación de webhooks y el secreto independiente de Addi.
