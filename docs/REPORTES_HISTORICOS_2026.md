# HJStoreVP — Reportería histórica (18-nov-2026)

## Alcance entregado

- `GET /api/v1/financial-reports/overview`: resumen por canal y agregados por categoría, producto y sede, más comparación de meses calendario.
- `GET /api/v1/financial-reports/excel`: archivo Excel real `.xlsx` con hojas Resumen, Canales, Categorias, Productos, Sedes, Comparativos y detalle de líneas de venta.
- Ambos endpoints exigen autorización de administrador mediante `require_admin`.
- Filtros opcionales: `date_from`, `date_to`, `location_id`, `category_id`. Sin fechas, consulta todo el histórico disponible. Si ambas fechas están definidas, el rango máximo permitido es 730 días.
- La UI administrativa incorpora el reporte histórico y botones de descarga en Reportes.

## Criterios y restricciones

- Solo considera pedidos con `paid_at` y estado pagado/preparación/despachado/entregado/reembolsado. Usa la fecha UTC de pago.
- Pedidos reembolsados conservan su venta bruta histórica; la devolución se informa por separado y **no se concilia** aquí.
- El desglose de categorías usa la categoría **actual** del producto (no un snapshot histórico).
- Por categoría/producto/sede se muestran importes de líneas. No distribuyen descuentos globales ni fletes; por tanto pueden diferir del total por pedido del resumen.
- La comparación del mes actual (parcial) con el mes previo y el mismo mes del año previo (completos) es orientativa.
- Los resultados no son estados financieros, conciliación tributaria ni facturas DIAN.
- Los detalles de pedidos que ya existían en la interfaz permanecen como vistas rápidas; **no** usarlos para cierres históricos.
- El Excel puede consumir memoria en períodos de muy alto volumen; monitorear antes de utilizarlo en operación masiva.

## Puesta al día en entorno Docker local

```cmd
git pull --ff-only origin main
docker compose up -d --build backend
docker compose restart frontend-admin
docker compose ps
docker compose logs --tail=80 backend frontend-admin
```

`openpyxl==3.1.5` es una dependencia nueva; un simple restart del backend **no la instala**. No hay migración de base de datos para este módulo. No ejecutar seeds ni eliminar volúmenes.

## Validación final pendiente

Revisar en fase de pruebas integrales las consultas con datos históricos reales, filtros, autorización por rol, exportación Excel con más de un período, pagos tardíos, reembolsos y carga de reportes grandes. No se ha verificado el funcionamiento contra la base de datos local del usuario.
