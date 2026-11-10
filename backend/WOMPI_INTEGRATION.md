# HJStoreVP · Integración Wompi Web Checkout

## Alcance de esta entrega

Implementación de la pasarela **Wompi Checkout Web** para los pedidos web ya creados en
HJStoreVP. La integración **no cambia el Super Administrador, sus permisos, tablas
de productos ni otros medios de pago**. El desarrollo integra:

1. URL de Web Checkout generada exclusivamente en FastAPI con firma de integridad SHA256.
2. Disponibilidad mostrada por `GET /api/v1/payments/methods`, cerrada por defecto.
3. Inicio autorizado de pago `POST /api/v1/payments/initiate` con pedido propio PENDING y bloqueo de fila.
4. Webhook `POST /api/v1/payments/webhook/wompi` con verificación del evento `transaction.updated`, firma de propiedades y ambiente.
5. Consulta posterior con llave privada `GET /v1/transactions/{id}` desde el backend.
6. Conciliación del retorno `POST /api/v1/payments/wompi/reconcile`; el cliente proporciona solo los IDs, **no define si el pago fue aprobado**.
7. Validación exacta de referencia, moneda e importe antes de marcar un pedido pagado.
8. Transiciones idempotentes y coherentes con las reservas de inventario del PR #4.
9. En producción, activación explícita adicional (`ENVIRONMENT=production` y `WOMPI_ALLOW_LIVE_PAYMENTS=true`).

## Configuración de secretos

Se configura **en el servidor backend**, nunca en React, repositorio ni capturas compartidas.
En Docker Compose de desarrollo el código `./backend` se monta en `/app` y
Pydantic lee `/app/.env`; así, las opciones específicas se pueden configurar
en `backend/.env` (archivo excluido de Git mediante `.gitignore`).

Ejemplo **solo de nombres**; colocar las llaves reales directamente en ese archivo:

```dotenv
WOMPI_ENV=sandbox
WOMPI_PUBLIC_KEY=pub_test_REEMPLAZAR
WOMPI_PRIVATE_KEY=prv_test_REEMPLAZAR
WOMPI_INTEGRITY_SECRET=test_integrity_REEMPLAZAR
WOMPI_EVENTS_SECRET=test_events_REEMPLAZAR
WOMPI_REDIRECT_URL=http://localhost:5173/pago-confirmado
WOMPI_ALLOW_LIVE_PAYMENTS=false
```

Cada secreto debe corresponder al **mismo ambiente**. La llave privada, el secreto
de integridad y el secreto de eventos **son diferentes**.
No pegar llaves en el chat. Comprobar configuración únicamente por el estado
`enabled`, nunca imprimiendo valores.

Para producción se requiere además un backend HTTPS público, dominio de retorno HTTPS,
secreto/llaves `prod_*` y aprobación comercial/operativa para habilitar cobros reales.
No habilitar `WOMPI_ALLOW_LIVE_PAYMENTS` hasta las pruebas integrales finales.

## Configurar URL de eventos en Wompi

En el portal de comercios, sección Desarrollo / Programadores, configurar
la URL HTTPS correspondiente al ambiente:

```text
https://TU-DOMINIO-API/api/v1/payments/webhook/wompi
```

Una instancia local `localhost` no recibe notificaciones de Wompi desde internet.
Sandbox y producción usan URL de eventos diferente. Nunca exponer
`/payments/confirm-demo` en producción.

## Flujo operativo

```text
Cliente /checkout
  -> crea pedido PENDING y reservas stock
  -> inicia método wompi (FastAPI calcula firma)
  -> Wompi Web Checkout
  -> Wompi envía transaction.updated con checksum
  -> backend verifica evento + consulta Wompi con clave privada
  -> compara order_number, monto COP, identidad de transacción
  -> APPROVED: marcar PAID y reservas COMMITTED, sin doble descuento
  -> DECLINED/ERROR/VOIDED: cancelar y liberar existencias solo una vez
  -> PENDING: mantener pedido pendiente
```

Cuando Wompi retorna al navegador, la pantalla de confirmación realiza una
conciliación autenticada (en caso de recibir `id`) y muestra el estado del
pedido desde la API. La redirección **no es evidencia de aprobación**.

## Restricciones de integridad

- Un resultado contradictorio (otra pasarela, ID distinto, monto distinto,
  pedido cancelado con pago tardío) genera error de conciliación; no se marca
  pagado ni se libera stock automáticamente.
- Un webhook antiguo repetido que corresponde a un pedido ya pagado no descuenta
  unidades ni reescribe una referencia de pago diferente.
- Las cancelaciones pendientes con método iniciado requieren resultado del
  proveedor; los pedidos antiguos sin reserva no se liberan por conjeturas.
- Esta entrega **no implementa reembolsos, pagos parciales, cuotas Addi/Sistecréditos,
  tarifas de despacho ni manejo automático de pagos tardíos cancelados**.

## Validación final antes de producción

Las pruebas integrales se realizarán al finalizar el proyecto, como acordado.
Durante el desarrollo se mantiene lint, compilación y controles unitarios.

La batería final deberá cubrir el checkout sandbox, HTTPS, webhooks auténticos y
rechazados, referencias alteradas, diferencias de monto, pagos concurrentes,
transacciones duplicadas, órdenes canceladas, fallos del proveedor y reconciliación
de inventario en MariaDB con supervisión de roles.

Fuentes oficiales:
- https://docs.wompi.co/docs/colombia/widget-checkout-web/
- https://docs.wompi.co/docs/colombia/eventos/
- https://docs.wompi.co/docs/colombia/seguimiento-de-transacciones/
- https://docs.wompi.co/docs/colombia/ambientes-y-llaves/
