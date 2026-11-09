# HJStoreVP — Módulo de envíos (Fase 2)

## Alcance implementado

**Tarifario comercial manual**, configurable por Super Administrador y Administrador.
No es una cotización en tiempo real de Servientrega, Coordinadora,
Inter Rapidísimo, Envía ni ninguna otra transportadora. Los nombres son
configurables; para integrar cotizaciones y guías automáticas se necesitarán
credenciales/API y un acuerdo con cada proveedor.

- Nuevo módulo **Envíos y tarifas** en el panel administrativo, sin quitar
  ninguno de los nueve módulos anteriores.
- Tarifas por departamento, opcionalmente por ciudad, transportadora,
  servicio, importe y rango estimado de días. Activar/desactivar sin borrar
  históricos. Tarifa de ciudad sobrescribe tarifa departamental del mismo
  operador/servicio.
- API de cotización pública: `GET /api/v1/shipping/quote?department=...&city=...`.
  No muestra opciones si el administrador aún no ha cargado tarifas.
- CRUD administrativo protegido: `GET/POST /api/v1/shipping/rates` y
  `PUT /api/v1/shipping/rates/{id}`.
- Checkout responsive: el comprador introduce destino, consulta tarifas,
  selecciona transportadora y ve subtotal + envío = total **antes del pago**.
- La petición de orden contiene `shipping_rate_id` y
  `shipping_price_confirmed`; nunca se confía en el importe del cliente.
  Si tarifa, ciudad o precio cambiaron, se devuelve 409 para recotizar.
- Se utiliza `orders.shipping_amount` y `orders.total_amount` existentes,
  y se preserva en `shipping_address` el snapshot de transportadora,
  servicio, ID de tarifa y días estimados; no se cambian pedidos anteriores.
- Wompi consume el total del pedido ya calculado en el servidor, incluyendo
  el envío. Al editar la tarifa NO cambian pedidos existentes.
- El historial del cliente y el detalle del pedido del Admin muestran
  transportadora y costo.

## Preparación de la base de datos

**No aplicar todavía en el entorno local con datos reales**, hasta planificar
el respaldo y el despliegue coordinado. Esta rama deriva de Wompi y de
reservas de inventario, por lo que no debe instalarse parcialmente.

La revisión `20261109_02_shipping_rates.py` crea exclusivamente una tabla;
su revisión previa es `20261109_01_order_stock_reservations.py`.
En desarrollo, FastAPI `Base.metadata.create_all()` crea tablas nuevas
en el arranque, sin crear tarifas predeterminadas. En producción, usar
migraciones Alembic con copia de seguridad y revisión de `alembic_version`.
El repositorio anterior carecía de historial de Alembic, por lo que es
necesario reconciliar el esquema antes de ejecutar `alembic upgrade head`.

## Configuración inicial administrativa

1. Abrir `http://localhost:5174/envios` **después** de aplicar el código
   y la migración en una copia de desarrollo.
2. Crear cada tarifa con datos comerciales reales de la tienda. Ejemplo de
   estructura, sin valores inventados: Departamento, Ciudad (opcional),
   Transportadora, Servicio, Costo COP y días mínimo/máximo.
3. Definir una tarifa departamental donde se atiendan varias ciudades,
   o tarifas específicas para ciudades con distinto precio.
4. Desactivar cualquier ruta no disponible para evitar cobros incorrectos.
5. Sin tarifa coincidente, el checkout muestra que el destino no está
   cubierto y **no habilita el pago**. Una tarifa de 0 COP solo se acepta
   si el administrador la configura expresamente.

## Limitaciones comerciales

- No hay integración con la API de una transportadora, creación de guías,
  etiquetas PDF, recolección, costo según peso/volumen ni seguimiento en
  tiempo real; se implementarán en fases posteriores.
- No hay reglas de envío gratis por monto ni tarifas escalonadas por peso.
- No se modifica ni factura automáticamente impuestos; validar la
  estrategia tributaria junto con la factura DIAN posteriormente.
- La entrega estimada depende de la configuración del negocio y no es una
  promesa contractual de la transportadora.
- No habilitar Wompi en producción antes de la revisión integrada final
  de pedidos, stock, pagos, dirección, devoluciones y costos de transporte.

## Validación final

Las pruebas integrales se harán al final del proyecto, como acordado. La
CI durante el desarrollo comprueba compilación y regresiones básicas.
En la batería final revisar: destinos con/sin cobertura, ediciones de tarifa
entre cotización y pedido, precios alterados, importes de envío cero y mayor
a cero, concurrencia, pagos y cancelaciones, distintos tamaños de pantalla
y permisos del panel administrativo.
