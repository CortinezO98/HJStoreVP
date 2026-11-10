# HJStoreVP · Notificaciones automáticas a clientes

## Alcance

Se incorporó un **outbox transaccional**: cada aviso se registra dentro de la misma
transacción del pedido, pago o despacho. El correo **no se envía dentro de la
petición HTTP ni del webhook**. Así, los fallos de SMTP no bloquean las ventas.

### Eventos cubiertos

| Momento | Tipo de correo |
| --- | --- |
| Creación del pedido | `order_created`: pedido registrado (pago pendiente) |
| Pago confirmado | `payment_confirmed`: pago registrado |
| Cancelación pendiente | `order_cancelled`: pedido cancelado |
| Preparación | `order_preparing`: preparando artículos |
| Registro de guía | `shipment_dispatched`: despachado con guía |
| En tránsito | `shipment_in_transit`: estado actualizado |
| En reparto | `shipment_out_for_delivery`: estado actualizado |
| Entregado | `shipment_delivered`: entrega registrada |
| Incidencia | `shipment_exception`: novedad de entrega |
| Corrección de guía | `shipment_guide_updated`: nueva guía |

Cada entrada tiene un `event_key` único y un estado de envío:
`pending`, `sending`, `sent`, `failed`.

### Super Administrador

La opción nueva **Notificaciones** (ruta `/notificaciones`) está disponible
exclusivamente para Super Admin y Administrador; mantiene los módulos anteriores.
Permite consultar hasta 100 registros recientes por estado, destinatario,
asunto y pedido, y **reintentar solo avisos fallidos**. Los permisos se aplican
en la API, no solo en React.

Los correos son *transaccionales*, no de campañas de marketing. No se añade
suscripción promocional ni se utilizan los datos de los clientes para publicidad.

## Configuración privada del servidor

Por defecto **NO se envían correos reales**. El trabajador es opcional y
requiere parámetros SMTP. Configurar valores reales en un archivo privado
`backend/.env` excluido de Git y no copiarlos a conversaciones o capturas.

```dotenv
EMAIL_NOTIFICATIONS_ENABLED=false
EMAIL_LIVE_DELIVERY_ALLOWED=false
STORE_PUBLIC_URL=http://localhost:5173
SMTP_HOST=SERVIDOR_SMTP
SMTP_PORT=587
SMTP_USER=USUARIO_SMTP
SMTP_PASSWORD=SECRETO_SMTP
EMAILS_FROM=cuenta-verificada@dominio-propio.example
```

- `EMAIL_NOTIFICATIONS_ENABLED=true` activa el envío para el proceso worker
  cuando SMTP y URL pública estén completos.
- `EMAIL_LIVE_DELIVERY_ALLOWED=true` se exige adicionalmente si
  `ENVIRONMENT=production`, después de las pruebas integrales.
- Para producción, `STORE_PUBLIC_URL` debe usar HTTPS; en desarrollo
  puede usar `http://localhost` o `http://127.0.0.1`.
- El remitente debe existir y estar autorizado por el proveedor SMTP.
  Las credenciales no se exponen mediante la API ni aparecen en correos.
- El worker requiere iniciar explícitamente el perfil Docker y configurar
  las variables de entorno en el backend; no se inicia automáticamente con
  el comando normal de Compose.

## Puesta en marcha futura (después de migraciones y aprobación)

La nueva tabla `customer_notifications` aparece en la migración
`backend/alembic/versions/20261109_04_customer_notifications.py`,
dependiente de `20261109_03_shipments.py`. Esta rama necesita aplicar las
migraciones anteriores **en orden**, con respaldo e inspección de
`alembic_version`. No correr `docker compose down -v`, no aplicar
`alembic upgrade head` indiscriminadamente a una base sin historial
previo y no arrancar el worker hasta crear la tabla.

**Modo de consulta manual de un solo aviso**, si está activado el SMTP:

```bash
docker compose --profile notifications run --rm notification-worker python -m app.services.notification_worker --once
```

**Modo continuo**, solo cuando esté habilitado y aprobado:

```bash
docker compose --profile notifications up -d notification-worker
```

No usar estos comandos todavía en la base local con pedidos históricos, ni
activar el correo sin haber completado las pruebas finales. La tabla de avisos
permite registrar eventos en modo deshabilitado, sin enviarlos.

## Seguridad y operación

- No se aceptan destinatarios ni asuntos arbitrarios desde peticiones del
  navegador. El destinatario se toma de `users.email` en el backend.
- Los templates HTML escapan los campos dinámicos, no incluyen dirección de
  residencia, identificación ni datos de pago.
- No se proporcionan enlaces externos de rastreo no verificados. El enlace
  dirige a la cuenta autenticada de la tienda.
- Los correos de seguimiento solo reflejan **actualizaciones manuales de
  HJStoreVP**, nunca un supuesto rastreo en tiempo real de la transportadora.
- Un evento duplicado no genera dos filas del outbox por tener clave única.
  La entrega SMTP es **al menos una vez**, no exactamente una vez; si el
  proveedor acepta un mensaje y el worker cae antes de guardar `sent`,
  puede producirse reenvío. El sistema usa intentos y leases para
  recuperarse.
- Hay hasta cinco intentos con esperas escalonadas. Tras agotar los intentos
  pasa a `failed`; el administrador puede reencolarlo expresamente.
- Registrar como enviado significa que el servidor SMTP aceptó el mensaje,
  **no que llegó a la bandeja del cliente**. Para confirmar entrega/rebote se
  necesitará integrar webhooks de un proveedor de correo especializado.
- No se almacenan contraseñas en logs, ni se muestra contenido confidencial
  de los errores SMTP.
- Por el momento no existe vista de previsualización ni personalización de
  plantillas en el panel; los templates están versionados en backend.

## Pendiente para etapas posteriores

Conexión y aprobación de SMTP / dominio (SPF, DKIM y DMARC), control de
rebotes, métricas de entrega, avisos por WhatsApp/SMS con consentimiento e
integración oficial, y pruebas integrales con proveedores reales al finalizar
el proyecto.
