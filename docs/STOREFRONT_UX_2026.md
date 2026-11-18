# HJStoreVP — modernización incremental de la tienda pública

Fecha: 18 de noviembre de 2026.

## Identidad preservada

No se cambió el nombre HJStoreVP, el logotipo configurado desde el panel, los colores editorial blanco/negro, las imágenes ni los textos configurables de la portada. Los cambios son aditivos y visuales, sin modificaciones en pagos, stock, rutas del backend, carrito ni esquema de base de datos.

## Cambios incluidos

- Encabezado más claro: acceso visible a Catálogo, categorías principales (máximo cuatro para evitar saturación) y enlace a todas las categorías por catálogo; estados activos en navegación, menú móvil con cierre por Escape y búsqueda accesible.
- Portada: franja de exploración inmediata por hasta cinco categorías reales, con desplazamiento horizontal en móviles, sin introducir categorías ficticias. Preguntas frecuentes con relaciones accesibles entre pregunta y respuesta.
- Catálogo: filtros móviles con cierre y botón Ver resultados, búsqueda con formulario real, labels accesibles y resultados expresados como cantidad mostrada **por página**, no como total de todo el catálogo.
- Tarjetas: jerarquía clara (categoría, nombre, precio), texto `Desde` cuando hay variantes, enlaces visibles a información/selección de opciones y acciones de favoritos preservadas. Carga diferida de imágenes con decodificación asíncrona.
- CSS nuevo `frontend/src/storefront-polish.css`, importado después de los estilos originales para mantener la identidad y minimizar regresiones. Mejoras responsive y estados de foco.
- No se cambió el frontend-admin ni el checkout de pagos de esta fase.

## Instalación en Windows/Docker

```cmd
cd C:\Users\jjcor\Documents\Github\HJStoreVP
git status --short
git pull --ff-only origin main
docker compose up -d --build frontend
docker compose ps
docker compose logs --tail=80 frontend
git log -1 --oneline
```

La tienda pública se encuentra en http://localhost:5173, el administrador se mantiene en http://localhost:5174. No se necesitan migraciones. No usar `docker compose down -v` ni ejecutar semillas.

## Alcance pendiente

- Revisión posterior de páginas de producto, carrito, checkout y cuenta con cambios incrementales.
- Pruebas integrales al terminar las fases, según lo acordado. Ninguna modificación visual se considera certificada en navegador hasta verificarse localmente.
