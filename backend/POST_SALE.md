# HJStoreVP — Gestión posventa, devoluciones y reembolsos

## Propósito

Esta entrega añade una **gestión trazable de casos** después de la compra,
sin suprimir funcionalidades del Super Administrador ni de la tienda. Permite
registrar solicitudes, adoptar decisiones, recibir artículos devueltos,
gestionar el inventario y documentar reembolsos realizados **fuera del sistema**.

**Importante:** el módulo NO ejecuta transferencias, devoluciones bancarias ni
reversos contra Wompi, Addi o Sistecréditos. Una operación `externally_recorded`
solo representa una afirmación y comprobante registrado por un administrador;
**no es verificación automática del proveedor ni garantía de abono al cliente**.

No se ha incluido una política de elegibilidad por días, causales o plazos
legales: esas reglas requieren definición comercial y asesoría legal colombiana
antes de producción. La apertura de un caso no equivale a su aprobación.

## Experiencia del cliente

En `Mi cuenta → pedido elegible → Devoluciones y atención posventa`:
- Crear devolución por producto, línea del pedido y cantidad.
- Abrir una incidencia general de entrega o atención.
- Ver estado del caso, información de reintegro externo e historial de eventos.
- No mostrar formularios para pedidos no pagados o cancelados.
- Ningún usuario puede consultar casos de otros clientes.

## Operación del Super Administrador

Ruta `/posventa`, roles SUPER_ADMIN y ADMIN:
1. Revisar solicitudes en `submitted` o `under_review`, aprobar o rechazar
   con observación obligatoria. Los vendedores no gestionan posventa web.
2. La aprobación NO aumenta stock y NO emite reembolso.
3. Para devoluciones aprobadas, registrar **recepción física** e inspeccionar
   la condición del producto:
   - `resellable`: aumenta una sola vez el inventario en la ubicación original
     trazada por el pedido, y registra `stock_movements`.
   - `damaged`: registra la recepción pero NO reincorpora mercancía dañada.
   - Pedidos heredados sin origen auditable no se reintegran automáticamente;
     requieren conciliación manual.
4. Tras recepción se puede solicitar el reembolso externo de la cantidad
   correspondiente a los productos devueltos, excluyendo envío y ajustes
   adicionales (pendientes de parametrizar).
5. `request-refund` registra `pending_external` sin llamar a ninguna pasarela.
6. `record-refund` requiere referencia externa única, explicación y declaración
   explícita de verificación manual. Guarda `externally_recorded`. No modifica
   estados de pedidos pagados ni el inventario. Evita duplicar la misma
   referencia en múltiples casos.
7. Se impide cerrar un caso con reembolso externo pendiente.
8. Historial de decisiones inmutable por inserciones sucesivas en
   `post_sale_events`, sin edición de eventos anteriores.

Los casos de incidencias generales no generan automáticamente devoluciones,
reingresos de inventario ni reembolsos.

## Cálculos e integridad

- El backend calcula `qty × order_items.unit_price` desde el precio
  histórico del pedido, nunca desde valores enviados por React.
- Para cada línea de pedido, no se puede pedir devolución de más unidades que
  las compradas al sumar casos no rechazados.
- Los cambios se serializan bloqueando la orden web y luego el caso en
  MariaDB/InnoDB, evitando duplicaciones concurrentes de reingreso.
- Se limita el importe de las solicitudes de reembolso del pedido al
  `orders.total_amount` existente.
- Los pedidos con reembolsos parciales no se marcan enteramente `refunded`.
- Aún no existen reembolsos parciales por un importe diferente al
  `qty × unit_price`, devolución de costos de envío, notas crédito,
  pagos mixtos ni integración automática con proveedores de pago.

## API

| Método | Ruta | Acceso |
| --- | --- | --- |
| POST | `/api/v1/post-sale` | Propietario del pedido |
| GET | `/api/v1/post-sale/mine` | Cliente autenticado |
| GET | `/api/v1/post-sale/{case_id}` | Propietario o Admin |
| GET | `/api/v1/post-sale/admin` | Super Admin / Admin |
| POST | `/api/v1/post-sale/{case_id}/review` | Super Admin / Admin |
| POST | `/api/v1/post-sale/{case_id}/receive` | Super Admin / Admin |
| POST | `/api/v1/post-sale/{case_id}/request-refund` | Super Admin / Admin |
| POST | `/api/v1/post-sale/{case_id}/record-refund` | Super Admin / Admin |

## Correos

La integración con el outbox del PR #8 registra avisos de solicitud, revisión,
aprobación, rechazo, recepción, cierre, petición de reembolso y comprobante
externo, dentro de la misma transacción. El worker SMTP sigue **deshabilitado
por defecto**. El correo no certifica que el dinero haya sido devuelto.

## Migración y despliegue

La nueva revisión es `backend/alembic/versions/20261109_05_post_sale.py`,
dependiente de `20261109_04_customer_notifications.py` del PR #8.

**No ejecutar migraciones ni reiniciar Docker en la base real todavía.**
Las cinco revisiones nuevas dependen de las anteriores y requieren respaldo,
revisión del historial `alembic_version` y ventana de implementación. No
ejecutar `docker compose down -v`, no recrear datos productivos ni ejecutar
semillas destructivas.

Esta rama únicamente incluye código y migraciones versionadas en GitHub.
Se mantienen las verificaciones automáticas de sintaxis/compilación durante
desarrollo; las pruebas integrales con MariaDB, pagos reales, documentos,
roles, incidencias, reembolsos y conciliación se realizarán al finalizar,
antes de la puesta en producción.

## Pendiente para madurez operativa

- Reversos y reembolsos oficiales por API, tras establecer mecanismos de
  verificación, idempotencia y conciliación de cada proveedor.
- Reglas comerciales y jurídicas de plazos, causas, derecho de retracto,
  reversión, garantías y costos logísticos en Colombia; validarlas con
  asesoría antes de operar.
- Evidencias privadas (imágenes, adjuntos, documentos), inspecciones
  parciales, guías de retorno y costos de devolución.
- Notas crédito electrónicas y enlace contable/DIAN, sin alterar históricos.
- Métricas de tiempo de atención, asignación de casos, SLA y reportes.
