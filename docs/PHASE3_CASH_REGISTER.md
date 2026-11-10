# Fase 3 — Caja por punto físico (HJStoreVP)

## Alcance funcional

- Apertura de un turno de caja por punto físico (una caja abierta por sede).
- Registro inmutable de ingresos, gastos y retiros, con motivo y usuario.
- Las ventas físicas actuales **se mantienen**. Cuando hay una caja abierta en la
  misma sede, las ventas con método `efectivo` generan un movimiento `sale`
  en la **misma transacción** de la venta y descuento de inventario.
- Consulta de turnos y movimientos; arqueo al cierre (dinero contado, esperado
  y diferencia), con usuario responsable.
- El vendedor solo accede a su sede; administrador y superadministrador pueden
  supervisar todas las sedes. Egresos y retiros requieren rol administrativo.
- Historial de ventas anteriores a esta entrega no se recalcula ni modifica.

## Consideraciones operativas

El módulo **no obliga** a abrir caja para vender, por compatibilidad con
ventas físicas existentes; las ventas realizadas sin turno abierto no se
asocian retroactivamente a un arqueo. Antes de utilizar el cierre como
conciliación contable, se recomienda adoptar una política de apertura al
inicio del turno.

El arqueo incluye únicamente efectivo. Las ventas físicas que hoy se registran
tienen `payment_method='efectivo'`. Los medios de pago mixtos y la
conciliación con datáfonos o bancos son funcionalidades posteriores.

No se automatiza la entrega física de dinero ni se generan comprobantes fiscales.

## Datos y despliegue

Tablas nuevas: `cash_sessions`, `cash_movements`.
Migración aditiva `20261109_10` (depende de `20261109_09`).
No modifica columnas existentes ni elimina filas de pedidos.

En desarrollo, el startup actual de FastAPI ejecuta `Base.metadata.create_all`,
por lo que crea tablas faltantes de acuerdo con los modelos. En producción
se debe usar Alembic con revisión de backup y mantenimiento programado.
**No ejecutar migraciones ni crear ventas reales durante pruebas de interfaz**.

Panel: `http://localhost:5174/caja` una vez integrada la rama y actualizado
el backend local. Seleccionar sede (admin), abrir caja, registrar movimientos
y cerrar con arqueo.

## Limitaciones de esta primera entrega

- Un turno por sede, no varias cajas simultáneas por sede.
- Sin importación de transacciones históricas.
- Sin conciliación bancaria ni retiros de bancos.
- Sin múltiples medios de pago por venta.
- Pruebas completas de concurrencia, cierres y ventas en ambiente aislado
  reservadas para la fase final acordada.
