# HJStoreVP — guía de validación del frontend público

## Alcance

Este rediseño aplica solo a `frontend/`. Los cambios no modifican la estructura de tablas, el backend, el inventario ni el panel administrativo. Las rutas existentes se mantienen: `/`, `/catalogo`, `/producto/:slug`, `/carrito`, `/checkout`, `/login`, `/registro`, `/mi-cuenta`, `/pago-confirmado`.

### Fundamentos de diseño

- Sistema consistente de espacios, tipografía, bordes, controles y estados.
- Componentes reutilizables: `PageHeading`, `EmptyState`, `ErrorState`, `LoadingGrid`, `QuantityStepper`, `AuthShell`.
- Breakpoints de Tailwind y media queries específicas para pantallas pequeñas, medianas y grandes.
- `focus-visible`, navegación por teclado, enlace «Saltar al contenido», atributos ARIA donde corresponden, etiquetas de formulario y targets táctiles.
- Preferencia `prefers-reduced-motion`, imágenes con texto alternativo y carga diferida donde corresponde.
- Los precios y productos se reciben del backend; no usar precios tachados inventados ni testimonios ficticios.
- Los errores de datos y red deben ofrecer recuperación visible; no ocultar fallos como «sin productos».
- La protección real del checkout e inventario sigue residiendo en el backend. Las validaciones del cliente son solo una capa adicional.

## Matriz de pantallas (verificar manualmente)

| Viewport | Perfil | Comprobaciones |
| --- | --- | --- |
| 320×568 | móvil estrecho | Header sin cortes, buscador, producto y botones táctiles, cero scroll horizontal |
| 375×812 | móvil | Menú, portada, catálogo de dos columnas, formularios y carrito |
| 390×844 | móvil | Login, registro, checkout y teclado virtual |
| 768×1024 | tableta vertical | Cuadrícula de tres columnas, filtros móviles, menú |
| 1024×768 | tableta horizontal | Layout de detalle y resumen del pedido, navegación |
| 1280×800 | portátil | Tarjetas de catálogo, cuenta, checkout y cabecera |
| 1440×900 | escritorio | Hero, contenido editorial y espaciados |
| 1920×1080 | escritorio amplio | Anchos máximos y densidad de tarjetas |

También validar zoom de navegador al 200 %, movimiento reducido, navegación solo con Tab/Enter/Escape y conexiones lentas.

## Recorridos funcionales

1. Inicio: portada con o sin productos; verificar que las fotos vienen del catálogo HJStoreVP.
2. Categorías: navegar por cada categoría, búsqueda con Enter, filtros de precio, solo disponibles, orden y página siguiente.
3. Producto: galería, disponibilidad, cantidad positiva, agregar al carrito y recomendaciones.
4. Carrito: sumar/restar cantidades, eliminar, vaciar, no superar stock, preservar el total.
5. Login: contraseña oculta y auto-completado apropiado, errores de credenciales, retorno a la ruta pedida.
6. Registro: validación, confirmación de contraseña, sin tokens duplicados ni contraseñas en logs.
7. Cuenta: pedidos, estados, montos, salida segura, error de red y reintento.
8. Checkout: validación de dirección, selección de método realmente habilitado y mensaje de error.
9. Confirmación: pendiente, pagado, cancelado, error de red, reconsulta sin duplicar orden.

## Comandos

```bash
cd frontend
npm install
npm run lint
npm run build
npm run dev
```

CI: `.github/workflows/frontend-store-ci.yml` ejecuta lint y compilación.

## Limitaciones explícitas

Un build satisfactorio **no** sustituye pruebas manuales de navegación ni pruebas E2E conectadas a la API. El proceso de pago debe conservarse deshabilitado para cobro real hasta resolver expiración/liberación de stock, reconciliación de pagos, idempotencia de webhooks y cookies HttpOnly/Secure/SameSite con CSRF. No se han realizado pruebas reales de pasarela ni desplegado esta rama a producción.
