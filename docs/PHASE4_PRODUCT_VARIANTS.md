# Fase 4 — Variantes de productos (SKU, precio y stock por referencia)

## Diseño adoptado

Cada variante es un registro `products` vendible con un `id`, `sku`,
`sale_price`, `cost_price` e inventario `inventory` independientes.
`parent_product_id` une esa referencia al producto principal y
`variant_options` registra color, talla, presentación u otras opciones.
El producto padre continúa siendo la ficha comercial con imágenes y categoría.

Esta estrategia permite reutilizar los mecanismos existentes de:
- movimientos de inventario por ubicación;
- reservas atómicas y liberaciones por pedido web;
- ventas físicas y caja;
- snapshots del SKU y precio en líneas de pedido.

No se modifican las tablas históricas de órdenes, inventarios y reservas.

## Operación

1. Crear el producto principal normalmente desde Productos.
2. Si hay stock de ese producto, conciliarlo primero. No se permite activar
   variantes mientras el producto base tenga existencias, porque esa
   conversión debe ser auditada y no debe inventar cantidades.
3. Abrir el editor del producto > Gestionar variantes.
4. Crear cada variante con un SKU único, nombre, color/talla/presentación,
   costo y precio de venta propios.
5. Ingresar stock por ubicación desde la misma pantalla, usando el
   mecanismo existente de reposición de inventario.
6. La ficha pública muestra las opciones con su precio y stock. El cliente
   debe elegir una antes de añadir al carrito o comprar.
7. El checkout, el POS y las reservas usan siempre el ID de la variante.
   Se rechaza la venta del producto padre si tiene referencias hijas.
8. Para retirar una referencia, desactivarla, no eliminar registros históricos.

## Migración requerida: NO basta con reiniciar Docker

`20261110_11` agrega dos columnas a `products`: `parent_product_id`
y `variant_options`; se añade índice y FK. Los contenedores que ya
tienen la base inicializada NO reciben automáticamente las columnas con
`Base.metadata.create_all`. Se debe revisar el estado de Alembic y
aplicar la migración antes de iniciar el backend actualizado.

En desarrollo: después de actualizar Git, inspeccionar primero:

```cmd
docker compose exec backend alembic current
docker compose exec backend alembic heads
```

En una ventana de mantenimiento y con respaldo verificado, aplicar
`docker compose exec backend alembic upgrade head` y reiniciar backend
solo si se completó correctamente. Si el historial de Alembic no está
alineado con la base existente, NO ejecutar comandos de `stamp` ni
`drop/create` sin inspección previa.

## Restricciones

- Esta versión hereda las imágenes del producto principal. No ofrece aún
  una imagen independiente por variante.
- El precio de catálogo se muestra desde la variante activa más económica.
  Los rangos de filtro aplican al precio inicial del producto.
- El stock público agregado considera variantes activas. La disponibilidad
  definitiva se valida en la API al crear el pedido.
- El catálogo sólo lista productos principales (no duplica cada variante).
- No se ejecutan pruebas integrales ni auditoría ofensiva en esta fase;
  se reservan para el final, como acordado.
- La integración de DIAN permanece en la fase última.
