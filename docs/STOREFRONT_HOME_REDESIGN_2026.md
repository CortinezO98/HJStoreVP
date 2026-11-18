# HJStoreVP — Rediseño de la portada editorial (2026-11-18)

## Evidencia visual que motivó el cambio

Las capturas locales de la tienda en localhost:5173 mostraban (1) un diagrama técnico ajeno al catálogo como imagen de portada y como fondo de otra sección, (2) referencias sin fotografía, (3) dos secciones de personalización con amplio espacio vacío sin datos y (4) gran cantidad de desplazamiento antes de llegar a las categorías, información de servicio y footer.

## Implementación

- Se conserva la identidad blanco/negro, logo y el texto promocional personalizado desde la configuración de tienda.
- La portada ya no usa automáticamente `hero_image_url` ni la imagen del primer producto como banner. Presenta una composición editorial tipográfica de marca, segura para cualquier catálogo; se evita reproducir el diagrama técnico incorrecto. **La imagen configurada permanece en la base de datos, pero deliberadamente no se muestra en esta portada**. Para recuperar banners con fotos, desarrollar una opción explícita de campaña y cargar una fotografía real aprobada.
- Segunda sección editorial limpia en lugar de reutilizar la imagen técnica.
- Espaciados verticales más compactos y responsive. La lista de destacados en portada se limita a cuatro tarjetas; el catálogo sigue mostrando todo.
- Personalización se muestra solo cuando hay recomendaciones o historial; sin datos se mantiene una invitación reducida que conserva el control voluntario del historial del navegador.
- Las referencias sin fotografía muestran un fallback gráfico tipográfico HJVP. Esto NO genera ni suplanta fotografías del producto, y **no soluciona que el catálogo tenga imágenes incorrectas**. La imagen de la gorra que aparecía como un diagrama necesita ser reemplazada desde la gestión de productos.
- Se mantienen solicitudes de productos, categorías, favoritos, carrito, descuentos, reservas, checkout, navegación, y el footer existente.

## Cómo actualizar

Desde CMD en el directorio del repositorio:

```cmd
git status --short
git pull --ff-only origin main
docker compose up -d --build frontend
docker compose logs --tail=50 frontend
git log -1 --oneline
```

No se requieren migraciones. No usar `docker compose down -v`.

## Revisión visual recomendada antes de producción

Comprobar escritorio y celular: portada, carga dinámica de productos, búsqueda, preferencias, categorías, menú, acceso a fichas, botones de carrito, balance de blancos, textos comerciales personalizados. Sustituir las fotografías incorrectas desde el administrador y completar imágenes faltantes para mejorar la credibilidad comercial.

El código se publicó en GitHub, pero no se ejecutó sobre el navegador o la base local del usuario. Las pruebas integrales se mantienen para la fase de cierre.
