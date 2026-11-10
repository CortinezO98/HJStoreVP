# Módulo de recomendaciones comerciales HJStoreVP

## Objetivo
Mostrar ventas cruzadas y productos relacionados sin alterar el cálculo de precios,
la reserva de inventario ni la autorización de pagos.

## Algoritmo de primera versión
- **Comprados juntos:** frecuencia de referencias en un mismo pedido
  con estado confirmado: `paid`, `preparing`, `shipped` o `delivered`.
  No cuenta pedidos pendientes, cancelados ni reembolsados.
- **Afinidad de catálogo:** productos en la misma categoría con existencias.
- **Complementarios:** en el carrito se incorporan destacados disponibles
  de otras categorías como alternativa si no hay coincidencias de ventas.
- Solo productos padre activos; variante vendible con SKU propio.
  Solo se exhiben los padres de variantes con una referencia activa y stock > 0.
- Cada resultado contiene nombre, SKU del padre, precio visible, imagen,
  stock, indicador de variantes y motivo comercial. **Nunca costos privados**.
- Hasta 4 sugerencias por defecto, límite API de 12.
- Exclusión del producto consultado y productos del carrito (también si
  se envían IDs de variantes).

## Endpoints públicos
- `GET /api/v1/recommendations/products/{product_id}?limit=4`
- `GET /api/v1/recommendations/cart?product_ids=1&product_ids=2&limit=4`

## Interfaz
- Ficha de producto: bloque «Recomendados para ti».
- Carrito: bloque «Completa tu compra» antes de finalizar.
- Los productos con variantes dirigen a selección de referencia.
- El carrito y el backend del pedido conservan su lógica actual.

## Operación
No requiere migración adicional sobre la revisión `20261110_11`.
Para desplegar se actualiza el código `main`; no hay trabajos en segundo
plano ni recomendaciones basadas en IA externa.
Las sugerencias se calculan de forma determinista con los datos existentes.

## Límites y trabajo posterior
- El ranking depende de datos históricos. Si no hay ventas, se respalda
  en afinidad por categoría y productos destacados.
- Sin precios promocionales o descuentos simulados, sin personalización
  invasiva, cookies de seguimiento ni datos personales de clientes.
- La configuración manual de pares complementarios por administradores,
  el análisis de conversión y algoritmos personalizados se pueden abordar
  como mejoras posteriores sin añadirlos prematuramente.
- Pruebas integrales de usuario, despliegue productivo y auditoría de seguridad:
  reservadas para cierre del proyecto.
