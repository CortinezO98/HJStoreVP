# HJStoreVP — Mini-carrito y checkout profesional

Fecha de entrega: 2026-11-19.

## Objetivo y alcance
Optimizar experiencia de compra sin cambiar esquema SQL, endpoints de pedidos, inventario o pagos. La rama `main` contiene una implementación frontend **pendiente de validar en Docker local**. No se han activado cobros reales.

### Mini-carrito lateral
- `frontend/src/components/shop/MiniCartDrawer.jsx` nuevo, accionado desde el botón de bolsa del encabezado.
- Muestra las referencias, cantidad por SKU, imagen del catálogo, precio unitario y subtotal, con controles de aumentar, reducir y quitar.
- Cantidad limitada por el inventario disponible en el carrito local (el servidor vuelve a comprobarlo al comprar).
- Incluye enlace al carrito completo y CTA directo hacia checkout, o inicio de sesión con retorno a checkout.
- Cierra con Escape, clic en superposición o botón; bloquea desplazamiento de fondo y devuelve el foco; contiene navegación por teclado para usuarios con accesibilidad.
- El subtotal no incluye envío ni descuentos, lo cual se comunica de forma explícita.
- No muta inventario, no crea pedidos y no ejecuta cobros al abrir el mini-carrito.

### Checkout
- Ref síncrono `submitLock` previene envíos repetidos antes de que cambie el estado React. El flujo existente sigue reutilizando un pedido pendiente al reintentar el inicio de la pasarela.
- El resumen separa **subtotal de productos**, envío, descuento y total estimado; avisa que la validación definitiva es del servidor.
- Se identifica un pedido ya creado, con su total y dirección fijados, sin ofrecer la falsa impresión de que un pago pendiente ya está confirmado.
- Si el backend informa todos los medios de pago deshabilitados, se explica que no es posible continuar en producción.
- No se modificaron validaciones de tarifa, stock, cupón, autenticación ni webhooks; el servidor continúa siendo la autoridad de los importes.

## Actualización en Windows
```cmd
cd C:\Users\jjcor\Documents\Github\HJStoreVP
git status --short
git pull --ff-only origin main
docker compose up -d --build frontend
docker compose ps
docker compose logs --tail=80 frontend
git log -1 --oneline
```

No necesita ejecutar `alembic upgrade` ni modificar el backend.

## Riesgos y pruebas finales pendientes
- Validar teclado, lector de pantalla, foco, móvil, cantidad y stock desactualizado (el backend sigue siendo autoridad).
- Verificar flujo de reintentos reales y callbacks del proveedor antes de habilitar cobros productivos.
- Revisión del diseño en móvil/desktop y pruebas de checkout con estados pendientes, vencidos y aprobados.
- El bloqueo de doble envío del frontend evita clics repetidos en una pestaña, pero **no constituye idempotencia transaccional entre dispositivos**; esta debe verificarse en backend.
- En modo desarrollo, las pruebas demo se permiten solo con configuración explícita. La entrega no certifica pagos reales.
