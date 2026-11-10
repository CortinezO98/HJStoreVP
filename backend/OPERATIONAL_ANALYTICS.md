# HJStoreVP — Reportería gerencial y analítica operativa

## Objetivo y alcance

Agregar una vista de indicadores gerenciales al módulo existente
**Reportes contables** sin eliminar ni reescribir sus filtros, exportaciones,
componentes o cálculos. La nueva sección consulta un endpoint de solo
lectura del backend (`GET /api/v1/operational-analytics/overview`)
protegido para ADMIN y SUPER_ADMIN. No se alteran productos, ventas,
stock, usuarios, permisos, pagos, reportes históricos ni facturación.

**Facturación electrónica y DIAN quedan aplazadas a la última fase.**
Esta entrega no introduce cambios nuevos en ese componente.

## Datos presentados

- **Ventas cobradas** por canal web/físico, número de pedidos y valor
  bruto: solo órdenes con `paid_at` y estado de pago confirmado.
  Las órdenes `PENDING` o `CANCELLED` no figuran como ingresos.
- **Costo histórico registrado y margen bruto indicativo**: diferencia
  de importes y `orders.total_cost`, sin incluir comisiones, impuestos,
  gastos logísticos ni otros costos no registrados. **No es utilidad neta**.
- **Envíos cobrados**: campo `orders.shipping_amount`, que no equivale
  al costo de transportadora.
- **Reembolsos externos documentados**: total y recuento de casos
  `refund_status=externally_recorded`, fechados por
  `refund_recorded_at`. Son acciones administrativas que no han sido
  conciliadas contra Wompi/bancos; no afirmar que el dinero llegó.
- **Pedidos web pendientes**: contados por fecha de creación.
- **Posventa y despacho**: casos registrados por fecha de creación,
  despachos por fecha de despacho, distribuidos según estado actual.
- **Stock bajo**: inventario agregado por producto **en el momento
  de consulta**, comparado con su alerta mínima; sin pretender reconstruir
  existencias a una fecha pasada. Muestra hasta 30 productos críticos.
- **Top productos**: los 10 principales por unidades en pedidos cobrados
  del período, con datos de línea de pedido históricos.

## Fechas

- `date_from` y `date_to` opcionales, ISO `YYYY-MM-DD`, inclusivos.
- Se rechaza fecha final menor a inicial y rango superior a 730 días
  cuando ambos extremos se proporcionan.
- Para ventas se usa `paid_at`. Para reembolsos `refund_recorded_at`.
  Para casos `created_at`, despachos `dispatched_at`.
- El inventario siempre es **foto actual**, independiente del rango.
- Las fechas almacenadas por el proyecto son naive en UTC en los
  módulos transaccionales; antes de reportes fiscales o auditoría
  formal se requiere definir explícitamente conversión a Colombia.
- Los totales por períodos de pago y reembolso son **cohortes distintas**:
  restarlos produce un dato orientativo, no conciliación contable.

## Interfaz y exportación

La sección **Indicadores operativos** se añade al final del panel
`/reportes`, **después** del contenido original, conservando
todos los módulos del Super Administrador. Incluye:
- Dos fechas de consulta independientes de los filtros contables heredados
- KPIs de ventas cobradas, costo, margen, reembolsos y canales
- Despachos, pedidos pendientes y casos posventa
- Top productos, alertas de inventario y descargas CSV
- Estado de carga y errores de red sin borrar datos existentes

Las exportaciones CSV de la nueva sección incluyen protección básica
contra celdas de fórmula de hojas de cálculo. Las exportaciones antiguas
no se modificaron en esta entrega.

## Seguridad y rendimiento

- Endpoint con autenticación administrativa (`require_admin`).
- Solo lectura, sin mutaciones, credenciales de pago o direcciones privadas.
- Agregaciones de ventas sobre datos históricos del servidor, no
  sobre subconjuntos paginados de pedidos del navegador.
- La versión actual computa agregados y stock al solicitar la página;
  en una base de gran tamaño debe evaluarse paginación, índices,
  tablas materializadas o cache, sin inventar resultados.
- Los indicadores no equivalen a estados financieros, impuestos,
  certificación de pago de reembolsos ni reportes DIAN.

## Validación y despliegue

- No requiere nuevas tablas ni migración de MariaDB.
- Publicado como PR independiente, sin fusionar `main`.
- No se realizaron cambios locales ni se desplegó en producción.
- Comprobaciones automáticas de backend y compilación de frontend
  durante desarrollo; pruebas integrales al finalizar el proyecto.

## Próximas etapas

1. Fidelización y promociones: cupones/campañas con límites de uso,
   presupuesto y validaciones desde servidor.
2. Atención al cliente: chatbot FAQ/catálogo/seguimiento con
   autenticación segura para datos personales.
3. Optimización de experiencia, accesibilidad y rendimiento.
4. Pruebas completas, seguridad, respaldo, migraciones y publicación.
5. Facturación DIAN **como última fase funcional**, cuando se definan
   responsables tributarios y modalidad oficial.
