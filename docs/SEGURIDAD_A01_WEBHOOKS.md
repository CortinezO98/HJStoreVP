# A-01 — Conciliación de webhooks de crédito

La firma no autoriza por sí sola una transición comercial.
Se consulta la API del proveedor y se comprueban identificador, pedido, moneda,
monto exacto y estado coincidente. Las discrepancias conservan la reserva.
Addi requiere ADDI_WEBHOOK_SECRET independiente del secreto OAuth.
Los estados provisionales de prueba DISBURSED (Sistecréditos) y PAID (Addi)
son los únicos estados de éxito admitidos; ACTIVE y APPROVED no prueban desembolso.
Los contratos de API, campos, firmas y estados deben verificarse oficialmente
antes de habilitar integraciones. Producción y staging siguen bloqueados por C-02.
Pruebas exclusivamente simuladas; sin cobros reales.
