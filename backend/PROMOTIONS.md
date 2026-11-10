# HJStoreVP — Promociones y cupones comerciales

## Alcance

Implementación de **cupones de descuento para checkout web**, con gestión
en Super Administrador → **Promociones y cupones** (`/promociones`).
No sustituye ninguno de los módulos existentes, no modifica
`products.sale_price` ni reescribe pedidos históricos.

La **facturación DIAN permanece pospuesta a la última fase**. Esta entrega
no modifica su lógica ni habilita emisión de documentos tributarios.

## Configuración de campañas

- Código único normalizado en mayúsculas (3 a 32 caracteres, alfanumérico,
  guion o guion bajo).
- Descuento porcentual entre más de 0 y 100%, o valor fijo en COP.
- Tope opcional en COP para campañas porcentuales.
- Subtotal mínimo requerido antes del envío.
- Límites opcionales de pedidos que pueden usar la promoción y
  límite por cliente (valor predeterminado: 1).
- Inicio y final opcionales; la primera implementación administra las fechas
  en **UTC**. No confundir con hora Colombia al programar campañas.
- Activación/desactivación desde el panel sin borrar históricos.
- Una sola promoción por pedido; no se acumulan cupones.

## Checkout y pagos

1. El comprador agrega productos al carrito y recibe la cotización de envío.
2. Introduce el código y presiona **Aplicar cupón**.
3. El backend calcula el subtotal desde la BD, aplica la promoción y devuelve
   una **cotización informativa**, sin reservar el cupón.
4. Al crear el pedido, FastAPI vuelve a validar precios, cantidad, vigencia,
   mínimo, cupos y cotización confirmada. El servidor fija:
   `total_amount = subtotal - discount_amount + shipping_amount`.
5. El valor de descuento se guarda en `orders.discount_amount`, campo
   existente; la aplicación específica se conserva en
   `coupon_redemptions` (código y monto históricos).
6. Wompi usa `orders.total_amount` fijado por el backend; nunca el total
   enviado o manipulado desde el navegador.
7. Mientras una orden está `PENDING`, su redención consume cupo; al pasar
   a `CANCELLED`, deja de consumirlo. Pedidos pagados permanecen contados.
8. La lógica de serialización usa bloqueo de la fila del cupón en
   MariaDB/InnoDB antes de contar/aplicar. La comprobación SQLite de CI
   no garantiza la misma concurrencia que InnoDB.

## Reglas y limitaciones importantes

- El descuento se aplica **solo al subtotal de artículos**, nunca al envío.
- El monto descontado no puede superar el subtotal.
- No se generan pedidos con descuento negativo ni por encima del precio.
- Cambiar el valor, código o vigencia de un cupón **no modifica** pedidos
  existentes. Las redenciones usan snapshot persistido.
- Las ventas físicas están fuera del alcance actual.
- No se implementan descuentos por categoría, producto específico, cliente
  VIP, puntos de lealtad, envío gratis automático ni campañas masivas.
- Los cupos ocupados por pedidos abandonados se liberan cuando esos pedidos
  pasan a cancelados mediante el mecanismo de vencimiento de reservas
  existente. Si ese mecanismo no está en ejecución, los cupos pueden
  aparecer agotados temporalmente hasta que se procese la cancelación.
- La API `POST /promotions/quote` requiere usuario autenticado y no
  reserva recursos ni garantiza disponibilidad futura.

## API

- `GET /api/v1/promotions/admin`: listado protegido.
- `POST /api/v1/promotions/admin`: crear (Super Admin/Admin).
- `PUT /api/v1/promotions/admin/{id}`: editar/activar/desactivar.
- `POST /api/v1/promotions/quote`: cotizar con productos/cantidades.

## Migración

Nuevas tablas `promotion_coupons` y `coupon_redemptions`,
migración aditiva `backend/alembic/versions/20261109_08_coupons.py`.
Depende de la revisión `20261109_07_tax_readiness.py` ya versionada en main.

**No instalar la migración sobre MariaDB real por ahora** sin respaldar y
verificar el historial Alembic actual. No se han ejecutado despliegues,
reinicios Docker ni alteraciones de base local.

## Validación

En desarrollo: comprobaciones automatizadas de seguridad, precios, cupos,
cancelación y compilación de tienda y panel administrativo. Las pruebas
integrales de pasarela, concurrencia MariaDB real, pagos y campañas siguen
para la etapa final, como acordado.
