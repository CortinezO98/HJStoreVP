# HJStoreVP · Fase 2: control de reservas de inventario

## Objetivo y alcance

La versión anterior descontaba `inventory.qty_available` al crear un pedido web
PENDING, pero no registraba la ubicación desde la que descontó ni permitía
liberar las unidades de forma fiable. Este cambio es **aditivo** y mantiene
todos los módulos existentes del Super Administrador y de la tienda.

Nuevos pedidos web:

1. Se valida cantidad entera positiva, producto activo y stock suficiente.
2. El descuento condicional y atómico se realiza en la ubicación elegida.
3. Se guarda una fila `order_stock_reservations` por ítem: pedido,
   producto, ubicación, cantidad, vencimiento UTC y estado HELD.
4. Tras una confirmación de pago válida, cambia a COMMITTED. **No se
   descuenta inventario por segunda vez**.
5. Tras una cancelación PENDING sin pago iniciado, o rechazo confirmado
   por la pasarela, se devuelven unidades a la **misma ubicación** y se registra
   un `stock_movements` de auditoría. Cambia a RELEASED.
6. Una cancelación repetida no devuelve existencias dos veces. Un pago tardío
   de un pedido cancelado se remite a conciliación manual.

## Despliegue seguro y migración

**No desplegar sin respaldo verificado y ventana de pruebas.** La nueva rama
incorpora una tabla que debe existir antes de exponer el nuevo endpoint de
creación de pedidos.

- Desarrollo: `app.main` utiliza `Base.metadata.create_all()` al arrancar
  y crea la tabla nueva, conservando tablas anteriores. Aun así, respaldar
  la base si contiene datos útiles.
- Producción: revisar la cadena de revisiones Alembic que tenga el servidor,
  ejecutar una copia de seguridad y aplicar la revisión
  `backend/alembic/versions/20261109_01_order_stock_reservations.py`.
  El proyecto no tenía revisiones versionadas previas: la nueva revisión
  inicia la cadena, pero **no constituye una migración de toda la base**.
  Conciliar antes cualquier `alembic_version` existente.
- No hacer `docker compose down -v`, `seed_final.py` ni truncamientos.
- No convertir automáticamente pedidos antiguos a reservas nuevas.
  Las órdenes PENDING anteriores no guardan ubicación de descuento y solo
  pueden liberarse después de conciliación manual.

## Expiración

`ORDER_RESERVATION_MINUTES=30` (configurable) define una **fecha informativa
de vencimiento**, no una cancelación automática.

Ejecutar en modo SOLO LECTURA:
```bash
cd backend
python scripts/audit_expired_reservations.py
```

El comando lista candidatos sin modificar datos. **No programar un cron
que cancele automáticamente** sin verificar cada estado en Wompi/Addi/
Sistecréditos: la confirmación puede llegar tarde. El siguiente desarrollo
debe incorporar conciliación con el proveedor, reintentos, límites de
vencimiento e idempotencia con eventos de pasarela verificables.

## Pruebas de aceptación

- Crear pedido de 2 unidades con 5 disponibles: quedan 3 HELD.
- Cancelar pedido sin pago iniciado: vuelve a 5 RELEASED.
- Repetir cancelación: sigue en 5.
- Confirmar pago: sigue en 3 COMMITTED (nunca descuenta 2 veces).
- Intentar cancelar pedido pagado: error 409.
- Intentar cancelar con pago iniciado: error 409; se requiere respuesta
  verificada del proveedor.
- Rechazo confirmado: devuelve al punto exacto una vez.
- Pedido histórico sin reserva: rechazo de liberación automática y
  conciliación manual.
- Compras simultáneas: nunca deben producir `qty_available < 0`.

## Limitaciones actuales

- La firma de Wompi y las integraciones de crédito requieren auditoría
  contra documentación oficial antes de activar cobros reales.
- El control de expiración y la conciliación automática siguen pendientes.
- No están resueltas tarifas de envío, impuestos, devoluciones ni reembolsos.
- Los escenarios concurrentes MariaDB/InnoDB requieren prueba de carga real;
  los tests SQLite no la sustituyen.
- La verificación de monto/currency está implementada para eventos Wompi
  aprobados que incluyan estos campos. Todavía falta verificación oficial de
  protocolo, referencia, identidad de transacción e idempotencia de
  proveedores, y validar webhooks duplicados o fuera de orden con sandbox.
