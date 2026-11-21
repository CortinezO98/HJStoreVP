# Fase E — Auditoría funcional integral de HJStoreVP

## Objetivo y estado

Iniciada el 21 de noviembre de 2026. La primera entrega incorpora
una comprobación HTTP **pasiva y de solo lectura** para el despliegue
Docker local: backend (8000), tienda (5173), panel (5174).
No equivale a certificación funcional de pagos, stock ni roles.

## Instrumentación integrada

- `scripts/phase_e_smoke.py`: 11 comprobaciones GET sobre
  health, catálogo, restricciones anónimas de usuarios e integraciones,
  cabeceras, portada, catálogo, checkout, confirmación, login y
  Diseñador de inicio.
- `scripts/test_phase_e_smoke.py`: 5 pruebas aisladas de seguridad
  del propio checker (solo loopback, orígenes válidos, errores,
  sin escritura). La CI ejecuta estas pruebas **sin contactar
  el equipo del operador** ni servicios comerciales.
- Se rechazan orígenes no locales, credenciales en URL y redirecciones;
  las salidas no guardan datos de clientes, tokens ni respuestas
  completas. No envía POST/PATCH/DELETE y no autentica usuarios.
- Se reutilizan `scripts/blackbox_local.py`, la suite del
  backend aislada en SQLite y los verificadores estáticos
  de ambas aplicaciones. Estos controles son complementarios.

### Comandos de ejecución local — CMD, desde el repositorio

```bat
git status --short
git pull --ff-only origin main
docker compose ps
python -m unittest discover -s scripts -p "test_phase_e_smoke.py" -v
python scripts/phase_e_smoke.py
python scripts/blackbox_local.py
```

Opcional para archivar un informe estructurado sin respuestas sensibles:

```bat
python scripts/phase_e_smoke.py --json > fase-e-smoke-local.json
```

El JSON debe inspeccionarse antes de compartirse aunque solo contenga
nombre, estado y código HTTP. El checker nunca modifica productos,
pedidos, precios, usuarios ni inventario.

## Matriz de auditoría pendiente (manual y automatización E2E)

| Flujo | Verificación requerida | Estado |
|---|---|---|
| Cliente | Registro, login, recuperación, cierre de sesión, redirección y expiración | Pendiente E2E |
| Catálogo | Categorías, búsqueda, variantes, disponibilidad, fotografías | Pendiente E2E |
| Carrito y checkout | Precios, descuentos, impuestos, direcciones, agotados, cantidades inválidas | Pendiente E2E |
| Pagos | Sandbox; firmas, webhooks duplicados, rechazados, timeout, idempotencia | Pendiente E2E |
| Inventario | Dos compradores simultáneos, reserva/confirmación/reversión, POS | Pendiente E2E |
| Pedidos/despachos | Transiciones de estado, guías, eventos, visibilidad por rol | Pendiente E2E |
| Notificaciones | Envío de prueba, destinatario correcto, reintentos, supresión de duplicados | Pendiente E2E |
| Posventa | Devolución, reembolso, incidencia, notas de crédito según alcance | Pendiente E2E |
| Fidelización | Puntos, promociones, recuperación de carritos, consentimiento | Pendiente E2E |
| Diseñador de inicio | Primer borrador, secciones, orden, imágenes, previsualización, publicación | Pendiente E2E |
| Superadmin | CRUD, roles/IDOR, auditoría de cambios, privilegios | Pendiente E2E |
| Resiliencia | Respaldos, recuperación, migraciones, errores y observabilidad | Pendiente E2E |

**Seguridad:** no ejecutar flujos que generen cobros reales, correos
reales, pedidos, cambios de stock o publicaciones sin preparar un
entorno de pruebas aislado con fixtures etiquetados y pagos sandbox.
No insertar campañas o fotos ficticias en la portada pública.

### Criterios de cierre

1. Ejecutar smoke local y registrar resultado.
2. Confirmar CI en verde y los tests existentes del backend.
3. Crear ambiente E2E aislado y datos de prueba explícitos,
   sin tocar la base comercial.
4. Automatizar flujos principales y casos negativos.
5. Revisión de UX, seguridad y registro de defectos corregidos.
6. Aprobar un checklist de salida con evidencia verificable.


## Entrega E.2 — Compra, autenticación, inventario e idempotencia

Se incorporó `backend/tests/test_phase_e2_purchase_auth.py` con
**10 casos de prueba (incluidas 4 variantes de cantidad inválida/excesiva)**.
Usa el aislamiento obligatorio de `backend/tests/conftest.py`:
SQLite temporal, notificaciones desactivadas, sin pasarela real y sin
datos de producción. Reutiliza las fixtures verificadas de
`tests/test_main.py`.

Comprobaciones nuevas:

1. Registro crea un cliente, almacena contraseña cifrada, devuelve
   sesión utilizable y no autoriza lectura de usuarios administrativos.
2. Rechaza contraseña de registro corta y segundo registro del mismo email.
3. Checkout anónimo no crea pedido ni reserva inventario.
4. Rechaza importes de envío y totales manipulados por el navegador:
   calcula subtotal, tarifa y total con valores del servidor.
5. Reintento idéntico con misma `Idempotency-Key` conserva
   identificador, número de orden y número de reservas.
6. Reusar la misma clave con cantidad cambiada devuelve HTTP 409
   sin nuevas reservas.
7. Cantidades 0, negativas, fraccionarias y mayores al stock
   se rechazan sin crear pedidos.
8. Cambio unilateral de cotización del envío devuelve HTTP 409
   sin afectar inventario.

Para el frontend, `frontend/scripts/verify-cart-checkout.mjs`
añade un **contrato estático** de cantidades, precios, stock,
doble envío e idempotencia. Este contrato no sustituye una
prueba real en navegador.

### Ejecución local controlada

```bat
cd /d C:\Users\jjcor\Documents\Github\HJStoreVP
git status --short
git pull --ff-only origin main
docker compose ps
docker compose exec -T backend python -m pytest tests/test_phase_e2_purchase_auth.py -q
docker compose exec -T backend python -m pytest tests/ -q
cd frontend
npm ci
npm run verify:routes
npm run verify:checkout
npm run build
cd ..
```

No reconstruir ni modificar la base de datos para ejecutar esta
suite. El fixture evita cualquier conexión a MariaDB comercial;
si el entorno falla antes del aislamiento, detenerse y revisar
la configuración. El pipeline existente ejecuta la suite completa
y la verificación estática del carrito.

**Evidencia pendiente:** el código está integrado en `main`,
pero la ejecución real de esos tests todavía debe validarse
localmente y en GitHub Actions antes de declararlos aprobados.

### Pendientes explícitos de E.2

- Automatizar carrito y sesión en navegador real (Playwright)
  en un entorno aislado, sin clientes reales.
- Probar concurrencia de dos conexiones simultáneas usando
  MariaDB de pruebas; SQLite no simula correctamente
  todos los bloqueos y niveles de aislamiento de InnoDB.
- Probar rotación y expiración de tokens con múltiples clientes
  sin alterar sesiones comerciales.
- Auditar el manejo de respuestas de error de pago y la
  recuperación tras cierre de navegador durante checkout.


### Incidencia corregida en E.2 — validación del correo sintético

La primera ejecución en Windows terminó con **17 aprobadas, 2 fallidas**.
Ambos fallos fueron de las pruebas nuevas de registro: el validador
Pydantic `EmailStr` rechazó el dominio reservado `example.test`
antes de que la lógica de contraseña/duplicado llegara a ejecutarse.
Se sustituyeron por identificadores sintéticos únicos bajo
`example.com`, manteniendo inalterada la validación productiva.
También se importó la clase heredada de fixtures bajo un alias
que no empieza con `Test`, para evitar que pytest recopile
sus métodos como pruebas de esta suite.

La tienda sí aprobó `npm ci`, `verify:routes`,
`verify:checkout` y `npm run build` (Vite 8.3.8).
Tras el cambio, repetir las pruebas E.2 y la suite completa
para confirmar resultado; no se ha declarado aprobado aún
el backend de esta fase.
