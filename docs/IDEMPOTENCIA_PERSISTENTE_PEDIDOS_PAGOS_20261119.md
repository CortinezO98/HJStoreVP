# HJStoreVP — Idempotencia persistente de pedidos y barrera segura de pagos

Fecha de implementación: 2026-11-19 · Rama `main`.

## Problema y alcance

Un doble clic protegido por React no evita dos solicitudes desde pestañas distintas ni el reintento después de que el servidor confirma el pedido pero el navegador pierde la respuesta. Tampoco puede asegurar que una segunda llamada al proveedor no genere una nueva solicitud externa.

La mejora incorpora garantía transaccional en **MariaDB/InnoDB**, sin cambiar las reglas de descuentos, tarifas, reservas, stock, webhooks o reembolsos ya existentes.

## 1. Migración aditiva obligatoria

Revisión Alembic `20261119_14` después de `20261118_13`.

En `orders`:
- `idempotency_key VARCHAR(80) NULL`;
- `idempotency_hash VARCHAR(64) NULL`;
- índice único `uq_orders_customer_idempotency (customer_id, idempotency_key)`.

Los pedidos históricos y físicos mantienen ambos campos NULL y no se reescriben. No se habilitan eliminaciones ni downgrade automático.

**Advertencia:** antes de iniciar el nuevo backend se debe aplicar esta migración; las consultas al modelo `Order` esperan las columnas nuevas.

## 2. Creación web con reintentos seguros

`POST /api/v1/orders/web` ahora exige la cabecera `Idempotency-Key` de 16 a 80 caracteres alfanuméricos, `-` o `_`. Una petición sin ella devuelve HTTP 422 y debe actualizarse su cliente.

- La clave se asocia al usuario autenticado. El hash SHA-256 del contenido normalizado del checkout impide reutilizarla con otra dirección, productos, tarifa, descuento o cupón.
- Si la clave corresponde a un pedido previamente confirmado, retorna su número, líneas, importes y estado originales. No vuelve a reservar stock ni consumir cupón ni enviar notificaciones.
- Si la clave se repite con distinto contenido, responde 409.
- La inserción inicial de la orden toma el índice único **antes** de consultar cupones o reservar existencias. Bajo concurrencia, el segundo INSERT espera el resultado del primero; si el primero se confirma, el segundo recupera el pedido original tras hacer rollback. Si el primero falla, sus cambios de stock y pedido se revierten en la misma transacción.
- El frontend conserva clave y huella del borrador en `sessionStorage` para reintentos del mismo contenido, incluso tras una respuesta perdida. Al confirmar o cancelar ese pedido desde la página de retorno se retira el borrador asociado. No se almacena ningún token ni dato de tarjeta en dicho registro.

**Alcance:** una clave protege una intención de compra; una clave nueva representa una operación nueva. El índice no puede deduplicar dos compras deliberadamente enviadas con claves diferentes. El checkout sigue requiriendo autenticación.

## 3. Iniciación de pagos: Wompi, Sistecréditos y Addi

- Wompi genera una URL firmada asociada al número de orden; el servidor continúa verificando firma, moneda, importe y referencia de las transacciones confirmadas mediante API del proveedor.
- Sistecréditos genera la URL de pago por orden; no se introdujo un nuevo intento externo en este flujo.
- **Addi:** la creación de una aplicación sí tiene efecto remoto. Se guarda en la fila bloqueada del pedido el marcador `INITIATING-<uuid>`, y se hace commit **antes** de llamar al proveedor. Una petición concurrente o posterior con referencia guardada recibe 409 y no vuelve a crear la aplicación.
- Si Addi responde correctamente, se sustituye el marcador por `applicationId` tras volver a bloquear la orden.
- Si llega antes un webhook firmado válido y confirma el pago, se respeta la referencia definitiva; la respuesta tardía de iniciación no sobrescribe ese cambio.
- Si el proceso muere, hay timeout o el proveedor devuelve un resultado ambiguo, el marcador se conserva hasta que una persona concilie el estado externo. No se reintenta automáticamente: **esto es deliberado para evitar duplicar aplicaciones o cobros**.
- El marcador no se expone al cliente en `GET /payments/status/{order_number}`; los informes internos lo identifican como un caso que requiere revisión.

## 4. Validación de retorno

`PaymentConfirmationPage` ahora reconoce `paid`, `preparing`, `shipped` y `delivered` como estados que reflejan un pago ya confirmado. El borrador local se limpia únicamente cuando coincide el número de pedido al confirmarse o cancelarse.

## Despliegue seguro (Windows CMD / Docker)

**Hacer respaldo de MariaDB antes de migrar.** En el desarrollo local, detener servicios web antes del pull evita el autoreload del backend con columnas todavía inexistentes.

```cmd
cd C:\Users\jjcor\Documents\Github\HJStoreVP
git status --short
docker compose stop backend frontend frontend-admin
git pull --ff-only origin main
docker compose build backend frontend
docker compose run --rm backend alembic upgrade head
docker compose up -d --no-build backend frontend frontend-admin
docker compose exec backend alembic current
docker compose ps
docker compose logs --tail=80 backend frontend
git log -1 --oneline
```

Si la migración falla, **no** ejecutar el nuevo backend ni usar `alembic stamp` para fingir que se aplicó; conservar respaldos y compartir el error. No usar `docker compose down -v` ni borrar datos.

## Verificaciones indispensables antes de cobrar de verdad

- Enviar dos solicitudes con la misma clave y payload, incluso concurrentes: un solo `order_number`, una sola reserva y una sola notificación.
- Misma clave con payload distinto: HTTP 409 sin nuevas existencias reservadas.
- Solicitud sin cabecera: HTTP 422; clientes legacy deben actualizarse.
- Provocar error de cupón/stock y confirmar rollback íntegro y posibilidad de reintentar misma clave tras corregir condiciones sin cambiar payload.
- Repetir webhooks aprobados/rechazados, fuera de orden, bajo concurrencia; verificar una sola confirmación del pago y no liberar stock de un pedido pagado.
- Addi: solicitud creada con éxito, webhook adelantado, corte antes/después de respuesta externa y conciliación manual del marcador en casos ambiguos.
- Considerar contrato de idempotencia propia del proveedor para eliminar también la ambigüedad del corte entre su creación remota y almacenamiento del identificador.
- Validar que la migración quedó aplicada y que las rutas de administración, ventas físicas y posventa siguen operativas.

**Estado:** revisión de código y commits publicados en GitHub. No se han ejecutado pruebas de transacciones reales ni certificación con pasarelas; conservar pagos reales deshabilitados hasta completar las verificaciones y conciliación de proveedores.
