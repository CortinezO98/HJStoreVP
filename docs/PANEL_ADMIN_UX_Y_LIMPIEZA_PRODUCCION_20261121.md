# Panel administrativo: rediseño UX y limpieza para producción (2026-11-21)

Cambios de presentación y de empaquetado. **No modifican reglas de negocio, endpoints ni permisos.**

## 1. Panel administrativo

### Identidad y sistema visual
- `src/admin-theme.css` (nuevo, se carga al final): tokens de marca HJ (negro `#0A0A0A`, blanco, rojo `#E1141E`), unifica Tailwind + Bootstrap + `admin-bootstrap.css`: botones (incluidos `btn-outline-*` de Bootstrap), formularios, insignias de estado, tablas con encabezado fijo, modales, foco visible.
- Paleta `brand-*` de Tailwind pasa de índigo a neutros de marca; utilidades `indigo/violet/purple` → `zinc`. Los tonos índigo fijos de `index.css` y `admin-bootstrap.css` se convirtieron a neutros conservando la luminosidad; verdes, ámbar y rojos (semánticos) se conservan.
- Fuentes alojadas con `@fontsource` (Inter variable; Anton solo para la marca). Sin dependencia de Google Fonts. `index.html` con `noindex, nofollow`.

### Layout (`components/layout/AdminLayout.jsx`)
- **Bug corregido:** el contenido del menú se definía dentro del render y se volvía a montar en cada tecla; el filtro del menú perdía el foco. Ahora `AdminNavigation` es un componente estable.
- Menú agrupado por tareas (General, Catálogo, Ventas, Marketing, Tienda en línea, Facturación, Administración); los grupos recuerdan su estado y se abre siempre el del módulo actual.
- Menú contraíble a íconos en escritorio (preferencia guardada).
- Barra superior con migas (Grupo › Módulo), búsqueda Ctrl K, campana con **conteo real** de productos con stock bajo (`inventoryApi.lowStock`, refresco cada 5 min) y menú de usuario (Mi perfil y seguridad, Ver tienda, Cerrar sesión). Se eliminó el título duplicado y la tarjeta de usuario del lateral.
- Indicador de alertas en «Inventario».
- `document.title` por módulo.

### Resiliencia y confirmaciones
- `components/ui/ModuleErrorBoundary.jsx`: si un módulo falla, se muestra un aviso con «Reintentar» / «Ir al dashboard» en vez de una pantalla en blanco; el menú y la sesión siguen disponibles. Se reinicia al cambiar de ruta.
- `Suspense` dentro del área de contenido: la carga diferida de módulos ya no oculta todo el panel.
- `components/ui/ConfirmDialog.jsx` (`confirmAction()`): reemplaza los 9 `window.confirm` (caja, estudio de inicio, 2FA, productos, imágenes). Accesible (`alertdialog`, foco atrapado, Escape cancela, en acciones destructivas el foco inicial va a «Cancelar»), con textos que explican la consecuencia.
- Login: etiquetas asociadas, botón mostrar/ocultar contraseña con nombre accesible, errores en línea (`role="alert"`) en vez de solo notificaciones, campo 2FA numérico.

### Contratos y pruebas actualizados
- `scripts/verify-admin-modules.mjs`: exige `ModuleErrorBoundary`, `ConfirmHost`, `Suspense`, `confirmAction(` en Caja y **prohíbe `confirm()` nativo** en todo `src/`.
- `tests/e2e/test_admin_browser.py`: el login localiza campos por su etiqueta.
- `tests/e2e/test_admin_visual_accessibility.py`: la eliminación de secciones usa el diálogo propio y verifica el foco en «Cancelar».

## 2. Limpieza para producción

| Cambio | Motivo |
|---|---|
| Eliminados `debug_login.py`, `seed_final.py` (raíz y `backend/`) y `backend/seed.py` (duplicado) | Depuración y semillas destructivas sin uso en producción. |
| `scripts/seed.py` bloqueado salvo `ENVIRONMENT=development` y `HJSTORE_ALLOW_DEMO_SEED=yes` | Crea vendedores con contraseña conocida. |
| `backend/Dockerfile.production.dockerignore` (nuevo) | Antes la imagen de producción copiaba **39** archivos indebidos (todas las pruebas, `e2e_seed.py`, semillas, depuración, documentación interna). Ahora solo código, migraciones y scripts operativos. Requiere BuildKit (por defecto en Docker moderno). |
| `scripts/ci/verify_production_context.py` (nuevo) | Falla si el contexto de la imagen incluiría pruebas, semillas, depuración, secretos o documentos, o si faltan archivos necesarios. |
| `frontend*/scripts/verify-production-bundle.mjs` (nuevo, `npm run verify:bundle`) | Falla si `dist/` contiene source maps, fuentes sin compilar, carpetas de prueba, `.env`, URLs `localhost:puerto`, el flujo `confirm-demo` o credenciales de desarrollo. Se ejecuta dentro de `Dockerfile.production`. |
| `VITE_ENABLE_DEMO_PAYMENTS=false` forzado en ambos `Dockerfile.production` | El pago demo nunca puede quedar en un bundle productivo. |
| **Bug corregido:** `VITE_ADMIN_URL` no se pasaba a la tienda en producción | El login de la tienda redirigía al personal a `http://localhost:5174`. Ahora es obligatorio (`PROD_ADMIN_URL`). |
| `.github/workflows/production-artifacts.yml` (nuevo) | Ejecuta ambos verificadores en cada PR. |

### Verificación local
```bash
python scripts/ci/verify_production_context.py
cd frontend && VITE_API_URL=https://api.example.com VITE_ADMIN_URL=https://admin.example.com npm run build && npm run verify:bundle
cd frontend-admin && VITE_API_URL=https://api.example.com VITE_STORE_URL=https://tienda.example.com npm run build && npm run verify:bundle
cd frontend-admin && node scripts/verify-admin-modules.mjs
```

### Rollback
Todos los cambios son de presentación o empaquetado: revertir el commit restaura el estado anterior sin migraciones ni cambios de datos.
