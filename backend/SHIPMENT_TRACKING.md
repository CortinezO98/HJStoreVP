# HJStoreVP — Seguimiento de pedidos y despachos (Fase 2)

## Alcance de la entrega

Este módulo añade **seguimiento interno manual** de pedidos web, sin borrar,
ocultar ni sustituir ninguna función de la tienda o Super Administrador.

- En **Panel Administrativo → Pedidos web → Ver**, registrar una guía, transportadora
  y servicio, y actualizar novedades del envío. El acceso conserva los roles
  SUPER_ADMIN y ADMIN originales de pedidos web.
- La transportadora/servicio deben coincidir con los seleccionados y guardados
  en el checkout cuando hay snapshot de envío; pedidos históricos sin
  transportadora conservan la posibilidad de registrar estos datos.
- El registro de guía exige pedido **pagado o en preparación**; crea
  un registro único de despacho y su primer evento; actualiza el pedido
  a SHIPPED.
- Los estados manuales de seguimiento son:
  `dispatched`, `in_transit`, `out_for_delivery`, `delivered`,
  `exception`. Se impiden retrocesos incompatibles (p. ej. después de
  la entrega). Una incidencia puede resolverse regresando a tránsito,
  reparto o entrega. El estado de pedido permanece SHIPPED durante el
  transporte y cambia a DELIVERED al registrar entrega.
- La corrección del número de guía requiere motivo y crea un evento
  auditado con el número anterior; no se permite después de la entrega.
- **Cliente → Mi cuenta → Seguimiento del envío**: transportadora, guía,
  estado e historial cronológico de eventos. Solo el dueño del pedido
  o un usuario administrativo puede consultar la API; un tercero recibe 404.
- Los mensajes de eventos son **públicos para el cliente**. No escribir
  información confidencial, datos de terceros o credenciales.
- No hay URL arbitraria de tracking para prevenir redirecciones no verificadas.

## API

- `GET /api/v1/shipments/orders/{order_id}`: dueño del pedido o Admin.
- `POST /api/v1/shipments/orders/{order_id}/dispatch`: Admin, registra guía.
- `PATCH /api/v1/shipments/orders/{order_id}/guide`: Admin, corrige guía con motivo.
- `POST /api/v1/shipments/orders/{order_id}/events`: Admin, agrega novedad.

La actualización tradicional `PATCH /orders/{id}/status` sigue disponible
para los estados que correspondan, pero **no puede marcar un pedido SHIPPED
o DELIVERED sin pasar por el registro del despacho**. Los cambios de pago
solo pueden llegar desde la pasarela, como antes.

## Migración de datos

Dos nuevas tablas: `shipments` y `shipment_events`.
Migración aditiva `20261109_03_shipments.py`, con dependencia de
`20261109_02_shipping_rates.py`, que a su vez depende de
`20261109_01_order_stock_reservations.py`.

**No ejecutar migraciones aún en la base de datos real**: se requiere
un respaldo revisado, inspección del esquema/alembic_version y aplicación
coordinada. No ejecutar `down -v`, seeds destructivos ni truncamientos.
En desarrollo `create_all` puede crear tablas nuevas, pero no crea
despachos históricos automáticamente.

Los pedidos anteriores pueden existir con estado SHIPPED/DELIVERED sin
una fila de Shipment: el sistema no inventa números de guía ni eventos
históricos. Requieren un proceso de conciliación/manual para poblar datos
de seguimiento si se necesitan.

## Aclaración al cliente

Los eventos se registran por personal de HJStoreVP; **no son confirmación
automática de la transportadora**. Para seguimiento externo real habría que
integrar la API de un proveedor autorizado y validar sus eventos/firmas.

## Pendientes del plan

1. Notificaciones al cliente por correo cuando cambia el pedido.
2. Integración externa de guías PDF, etiquetas y seguimiento de transportadoras.
3. Reembolsos, devoluciones y gestión completa de incidencias operativas.
4. Automatización y métricas de SLA/despachos.
5. Auditoría y pruebas integrales de extremo a extremo al finalizar el proyecto.

Durante desarrollo únicamente se mantiene la validación automática de código,
compilación y regresiones básicas, según el acuerdo del proyecto.
