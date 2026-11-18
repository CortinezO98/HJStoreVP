# HJStoreVP — Tienda pública, experiencia de compra y cuenta

Fecha: 18 de noviembre de 2026. Implementación incremental en la rama main.

## Objetivo
Conservar el estilo editorial blanco y negro de HJStoreVP, con el logo y configuraciones existentes, y mejorar la comprensión de la compra en pantallas grandes y pequeñas.

## Cambios entregados

- **Producto**: navegación contextual (Inicio / Catálogo / categoría / producto), selector de variantes con ayuda contextual y disponibilidad en texto vivo, área de compra más ordenada en escritorio y botones de compra visibles; avisos sobre la validación de existencia y total final.
- **Carrito**: indicación de etapas de compra, total de unidades además del número de referencias, resumen más claro y botón de avance con etiqueta accesible.
- **Checkout**: etapas visuales, subtítulos descriptivos para datos de entrega, envío y método de pago, explicación del orden de operaciones, y deshabilitación de avance cuando el medio elegido no está habilitado fuera del modo demo configurado. Se mantienen los controles originales del servidor sobre tarifas, stock, cupones y la reutilización de pedidos pendientes.
- **Mi cuenta**: accesos rápidos a pedidos, favoritos y catálogo; contador de pedidos en curso y pedidos ordenados por fecha descendente. Se preservaron las vistas de seguimiento, posventa, comprobantes y fidelización.
- **Estilos**: se amplió `frontend/src/storefront-polish.css` sin reemplazar las reglas de diseño existentes ni modificar el panel administrativo.

## Delimitaciones
No se cambiaron endpoints de backend, esquemas de BD, confirmaciones de cobros, stock, privacidad ni autenticación. Los componentes no deben anunciar métodos de pago como disponibles sin consulta al backend. El panel de checkout aún necesita comprobación visual en móviles y validación de estados realistas.

## Actualizar Windows / Docker

```cmd
cd C:\Users\jjcor\Documents\Github\HJStoreVP
git status --short
git pull --ff-only origin main
docker compose up -d --build frontend
docker compose ps
docker compose logs --tail=80 frontend
git log -1 --oneline
```

La tienda pública corre en http://localhost:5173/. No ejecutar migraciones, semillas ni `docker compose down -v`. Las pruebas integrales de flujos de compra continúan previstas para la fase final acordada.
