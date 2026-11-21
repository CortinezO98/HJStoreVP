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


## Fase E.2.2 — Navegador real y concurrencia MariaDB (entrega preparada)

**Seguridad / aislamiento:** `docker-compose.e2e.yml` define
un proyecto independiente `hjstorevp-e2e` con MariaDB sobre tmpfs,
Redis temporal, backend exclusivo y frontend de prueba. Sus puertos
localhost son **18000** (API) y **25173** (tienda); NO usa ni se
conecta a los volúmenes `db_data`, `redis_data` o `uploads_data`
de la aplicación normal. Los servicios existentes en 8000, 5173,
5174, 3306 y 6379 no deben detenerse ni modificarse.

El sembrador `backend/e2e_seed.py` rechaza ejecutarse si el
host de BD no es `db-e2e` y la base no se llama `hjstore_e2e`.
Crea solamente dos productos sintéticos (stock 6 y 1) y una
tarifa de envío E2E. Se niega a restablecer existencias cuando
hay pedidos existentes. Todos los envíos de correo y cobros reales
están desactivados; la prueba de navegador **nunca pulsa
el botón de confirmar compra**.

### 1. Levantar ambiente independiente (CMD)

```bat
cd /d C:\Users\jjcor\Documents\Github\HJStoreVP
git status --short
git pull --ff-only origin main
docker compose -f docker-compose.e2e.yml config --quiet
docker compose -f docker-compose.e2e.yml up -d --build
docker compose -f docker-compose.e2e.yml ps
```

**No ejecutar `docker compose down -v` sin `-f
docker-compose.e2e.yml`**. El proyecto comercial debe permanecer
funcionando. Antes del sembrado, confirmar en `ps` que
`backend-e2e` y `db-e2e` pertenecen a este stack y que
`http://127.0.0.1:18000/health` responde correctamente.

```bat
docker compose -f docker-compose.e2e.yml exec -T backend-e2e python e2e_seed.py
```

### 2. Preparar Playwright para Windows (una sola vez)

```bat
python -m venv .venv-e2e
.venv-e2e\Scripts\python.exe -m pip install -r tests\e2e\requirements.txt
.venv-e2e\Scripts\python.exe -m playwright install chromium
```

### 3. Ejecutar los recorridos

```bat
.venv-e2e\Scripts\python.exe -m pytest tests\e2e\test_store_browser.py -q
.venv-e2e\Scripts\python.exe -m pytest tests\e2e\test_mariadb_concurrency.py -q
```

Pruebas implementadas:

- **Navegador Chromium**: registro con email sintético,
  sesión válida, carrito local con artículo ficticio, continuación
  al checkout, visualización de la tarifa configurada, consulta
  de cero pedidos y login desde una segunda sesión independiente.
  No crea un pedido en esta prueba.
- **MariaDB InnoDB**: registra dos clientes sintéticos e intenta
  comprar al mismo tiempo la **última unidad** de otro producto
  E2E. Debe retornar exactamente una respuesta 201 y una 409,
  con stock final cero y un solo pedido en total.
  Ambos pedidos son sintéticos y permanecen en la base temporal.
- **CI**: comprueba sintaxis de scripts E2E y validez del archivo
  Compose. No arranca ni ejecuta los tests con navegador en CI
  hasta verificar primero su funcionamiento controlado en Windows.

**Orden:** ejecutar navegador antes de concurrencia y no repetir
la prueba de concurrencia en el mismo stack: consume la única unidad.
Si se necesita repetir, destruir solo la composición de pruebas
y crearla de nuevo.

### 4. Limpieza SEGURA (solo proyecto E2E)

```bat
docker compose -f docker-compose.e2e.yml down --remove-orphans
docker compose ps
```

La base y Redis E2E están en tmpfs, por lo que al eliminar sus
contenedores desaparecen los registros sintéticos. **Jamás**
usar `docker compose down` sin el `-f` indicado ni
`docker system prune --volumes`. La aplicación comercial debe
seguir activa.

### Criterios de aceptación

Ambos tests deben aprobar. Si se detecta un error, conservar
salida de pruebas y logs de `backend-e2e` sin publicar tokens,
correos de clientes, contraseñas ni datos sensibles.
No se afirma aún que esta entrega esté validada:
es necesario revisar la ejecución local y el resultado
de GitHub Actions.

La concurrencia comprueba un caso de compra de la última unidad,
no certifica cargas masivas, aislamiento de todas las operaciones
ni funcionamiento de pagos y reembolsos en producción.


### Ajuste Windows: puerto ocupado y launcher Python ausente

La primera ejecución del stack construyó ambas imágenes y levantó
MariaDB, Redis y backend aislados, pero `15173` estaba ocupado;
no se inició `frontend-e2e`. El sembrado E2E sí finalizó
correctamente con 2 productos y la tarifa sintética. Se cambió
la tienda E2E al **puerto 25173** y su origen CORS asociado.
El equipo Windows no dispone del launcher `py`, por lo que
las instrucciones usan el ejecutable disponible `python -m venv`.
No se requiere volver a ejecutar `e2e_seed.py` mientras se
mantenga la misma BD temporal sin pedidos.

Para retomar tras actualizar `main`:

```bat
docker compose -f docker-compose.e2e.yml up -d --no-build
 docker compose -f docker-compose.e2e.yml ps
python --version
python -m venv .venv-e2e
.venv-e2e\Scripts\python.exe -m pip install -r tests\e2e\requirements.txt
.venv-e2e\Scripts\python.exe -m playwright install chromium
```

Si el nuevo puerto tampoco está disponible, inspeccionar su
ocupación y resolver el conflicto antes de correr las pruebas;
no detener servicios desconocidos ni los de HJStoreVP comercial.


### Resultados de primera ejecución E.2.2 (21/11/2026)

- Entorno Docker E2E aislado y puertos 25173/18000 iniciados.
- Python 3.12.10, venv, Playwright 1.56.0 y Chromium instalados.
- Concurrencia MariaDB: **1 passed**. La prueba consumió el stock
  sintético de `E2E-RACE-001`; no debe repetirse en ese mismo stack.
- Navegador: el registro llegó exitosamente a
  `http://127.0.0.1:25173/mi-cuenta`. Una aserción de Playwright
  interpretó `**/mi-cuenta` como un patrón que exige otra barra,
  de modo que rechazó la URL correcta. Se sustituyeron tres
  aserciones por URLs exactas `STORE + ruta` sin cambiar la app.
- Pendiente: ejecutar nuevamente **solo** el test de navegador
  y confirmar el recorrido restante: carrito, checkout, tarifa
  y segundo inicio de sesión. No se afirma todavía que haya pasado.


## Fase E.3 — Pagos, conciliación y operaciones (entrega 1)

Se incorpora `backend/tests/test_phase_e3_payment_operations.py`:
**9 escenarios** automatizados (incluidas cuatro variantes de datos
inconsistentes). Se ejecutan con SQLite temporal según
`backend/tests/conftest.py`, sin contactar proveedores ni
modificar la base MariaDB de la tienda.

Matriz de regresión nueva:

- Confirmación Wompi aprobada simulada: pedido PENDING → PAID,
  reserva HELD → COMMITTED sin segundo descuento de stock.
- Reentrega de confirmación idéntica: sin repetir operaciones.
- Rechazo simulado: pedido CANCELLED y liberación exacta de reserva;
  reentrega sin reponer dos veces.
- Datos de proveedor falsos: referencia, importe, moneda o ID
  inconsistentes bloqueados con HTTP 409 sin alterar pedido.
- Estado contradictorio (declinado tras pagado) y pago tardío
  tras cancelación: rechazo para conciliación manual.
- Pedido pendiente: ni despacho ni solicitud de devolución; sin
  crear movimientos de esos módulos.

**Límite de cobertura**: estas pruebas ejercitan la función
`apply_wompi_transaction` con objetos de proveedor simulados,
no realizan una llamada remota, validación integral del endpoint
webhook ni reembolso monetario. La suite ya existente cubre
firma de eventos Wompi, seguimiento de despachos y registro
de reembolsos externos; se seguirá ampliando su integración.

### Ejecución segura desde CMD

```bat
cd /d C:\Users\jjcor\Documents\Github\HJStoreVP
git status --short
git pull --ff-only origin main
docker compose exec -T backend python -m pytest tests/test_phase_e3_payment_operations.py -q --disable-warnings
docker compose exec -T backend python -m pytest tests/ -q --disable-warnings
```

El contenedor backend monta `./backend:/app`; por eso no se requiere
reconstrucción Docker para archivos de pruebas Python.
No ejecutar `e2e_seed.py` ni reconstruir un ambiente de pagos
para esta batería. Los tests con SQLite efímera no usan credenciales
de Wompi ni servicios externos.

**Validación pendiente:** confirmar la batería E.3 y la regresión
completa tras obtener sus resultados. No declarar aprobado el
módulo ni el pipeline sin evidencia real.

### Siguientes entregas E.3

1. Validar endpoint webhook completo con respuestas HTTP y firma
   simulada, errores de proveedor y eventos duplicados.
2. Pruebas integrales de conciliación y recuperación ante desconexión,
   usando proveedores falsos con controles de no-egreso.
3. Integrar despachos y devoluciones/reembolsos registrados, con
   inventario y trazabilidad de eventos en la misma matriz.
4. Confirmar transacciones concurrentes con MariaDB exclusiva
   de pruebas (sin simular reembolsos reales).


## Fase E.3.2 — Webhooks HTTP, conciliación y posventa integrada

Archivo: `backend/tests/test_phase_e32_http_operations.py`.

**Implementados seis tests de integración HTTP** que reutilizan las
fixtures aisladas de SQLite de `tests/conftest.py`. La pasarela
Wompi se sustituye por respuestas simuladas: se activa el endpoint
solo dentro del test, se simula la verificación de firma y se
reemplaza la consulta HTTP al proveedor. **No se envían solicitudes
a Wompi, no se cobra dinero y no se procesan reembolsos reales.**

Escenarios:

1. Webhook con firma inválida: HTTP 401 y pedido intacto.
2. Caída simulada del proveedor: HTTP 503 sin liberar ni confirmar stock.
3. Webhook de aprobación repetido: primera aprobación y segundo evento
   sin doble descuento ni segunda transición.
4. Importe del proveedor inconsistente: HTTP 409 e inventario intacto.
5. Conciliación sin autenticación rechazada; conciliación autenticada
   aprobada y repetida con resultado idempotente.
6. Recorrido **pedido → pago simulado → despacho → entrega →
   devolución aprobada → recepción de unidad revendible →
   solicitud y registro manual de reembolso externo**. Verifica
   una sola devolución al stock, eventos históricos y rechazo
   de confirmaciones duplicadas.

**Alcance preciso:** la verificación criptográfica Wompi real ya
cuenta con pruebas unitarias en `test_wompi.py`; en esta batería
la firma se simula deliberadamente para probar respuestas HTTP y
transiciones. El registro `externally_recorded` significa que un
administrador consignó una confirmación externa, **no** que esta
suite haya enviado o comprobado una devolución monetaria.

### Comandos de validación

```bat
cd /d C:\Users\jjcor\Documents\Github\HJStoreVP
git status --short
git pull --ff-only origin main
docker compose exec -T backend python -m pytest tests/test_phase_e32_http_operations.py -q --disable-warnings
docker compose exec -T backend python -m pytest tests/ -q --disable-warnings
```

No reconstruir Docker ni levantar otro entorno de pruebas: el
backend local monta el código y pytest obliga a SQLite efímera.
Si cualquier aserción falla, revisar el error exacto y corregir
el contrato sin flexibilizar permisos, firmas ni bloqueos comerciales.

**Estado:** código versionado, ejecución pendiente de confirmación.
No se declara E.3.2 aprobada hasta recibir los resultados.


### Corrección de prueba E.3.2 — contrato de transportadora

La ejecución local reportó 5/6 en el módulo E.3.2 y 248/249
en la suite completa. La prueba de flujo integrado enviaba
`carrier="E32 Transporte"` y `service="E32"`, distintos de
los confirmados por el cliente y guardados por el checkout.
El backend rechazó correctamente con HTTP 409
(`La transportadora no coincide con la elegida por el cliente`).

**Corrección exclusivamente en la prueba:** se recuperan
`carrier` y `shipping_service` desde
`Order.shipping_address` de la BD SQLite temporal. Se añaden
dos aserciones que exigen HTTP 409 para transportadora y servicio
no contratados; a continuación se despacha con los valores
auténticos del pedido.

No se cambiaron el endpoint de despachos, el cálculo de envío,
los permisos ni la lógica comercial. Se requiere volver a ejecutar
las 6 pruebas E.3.2 y la suite completa para confirmar el cierre.


## Fase E.4 — Auditoría de superadministrador (primera entrega)

Se incorpora `backend/tests/test_phase_e4_superadmin.py` con
**15 casos (incluidas variantes parametrizadas)** bajo SQLite temporal y aislada.
No se modifica la portada ni las fotos comerciales: cualquier
publicación del test solo afecta la base efímera.

Cobertura implementada:

1. RBAC para diseñador y configuración: administrador, vendedor y
   cliente (3 casos) reciben 403 en lectura/edición/publicación.
2. Visitante anónimo sin permisos de gestión.
3. Crear una sección personalizada **inactiva** en borrador;
   comprobar que /public no cambia; publicar explícitamente,
   comprobar orden y versión de historial y atribución del editor.
4. Descartar borrador y conservar portada pública.
5. Rechazar borradores con sección sin correspondencia en el
   orden, ID duplicado o URL de imagen peligrosa (3 casos).
6. Rechazar imágenes falsas sin crear registros asociados.
7. Vista de integraciones exige autorización y no revela llaves.
8. Inventario no acepta cantidades cero, negativas o decimales
   (3 casos) y no escribe movimientos.
9. Vendedor sin permiso de modificar inventario ni cargar fotos.

**Corrección localizada de backend:** `validated_homepage`
ahora convierte las excepciones de `SettingsPayload.model_validate`
en HTTP 422 controlado, sin exponer detalles internos ni
alterar validadores, permisos o flujo de publicación.

### Validación en Windows CMD

```bat
cd /d C:\Users\jjcor\Documents\Github\HJStoreVP
git status --short
git pull --ff-only origin main
docker compose exec -T backend python -m pytest tests/test_phase_e4_superadmin.py -q --disable-warnings
docker compose exec -T backend python -m pytest tests/ -q --disable-warnings
```

El backend comercial monta el código fuente, pero **pytest reemplaza
antes de importar la aplicación la conexión por SQLite efímera** en
`backend/tests/conftest.py`. No se deben realizar las pruebas E.4
contra API HTTP normal (`localhost:8000`) ni ejecutar
publicaciones reales desde el panel.

**Pendientes dentro de E.4:** pruebas de cargas válidas de imágenes
con archivo temporal, revertir y recuperar versiones anteriores,
cambios administrativos concurrentes, auditoría comercial detallada,
y pruebas de navegador del panel usando la composición E2E.
No declarar esta batería aprobada hasta revisar la ejecución.

### Estado consolidado anterior a E.4

La ejecución del 21 de noviembre de 2026 confirmó E.3.2 con
6/6 aprobadas y la suite completa con 249/249 aprobadas.
La entrega E.4 añade nuevos casos cuya ejecución aún falta.


## Fase E.4.2 — Archivos, recuperación de versiones y trazabilidad

Archivo nuevo: `backend/tests/test_phase_e42_admin_advanced.py`
(**6 pruebas**, pendientes de validar en el entorno local).

1. Subida de imagen PNG sintética, normalización a WEBP,
   persistencia en directorio temporal y eliminación coherente
   del archivo y registro.
2. Lote de imágenes mixto (correcta + inválida): rechazo
   de la operación completa sin archivos ni filas parciales.
3. Publicación de una nueva portada ficticia y recuperación
   de la versión anterior **solo como borrador**: /public permanece
   intacto mientras no se vuelva a publicar.
4. Publicación rechazada con HTTP 409 si el contenido publicado
   cambió desde que se guardó el borrador; preserva el borrador.
5. Ingreso de inventario válido con movimiento trazable,
   cantidades anterior/posterior y usuario responsable.
6. Acceso anónimo denegado a la auditoría comercial y acceso
   autorizado de superadministrador.

Todo se ejecuta contra SQLite temporal impuesta por
`backend/tests/conftest.py`. Las fotos se generan en memoria
y se guardan exclusivamente en `UPLOAD_DIR` temporal;
**no publicar fotos ni contenidos sintéticos en el sitio real**.
La prueba del conflicto simula una modificación concurrente
en la BD de pruebas; no sustituye un ensayo de carreras reales
con dos transacciones MariaDB.

### Validación Windows

```bat
cd /d C:\Users\jjcor\Documents\Github\HJStoreVP
git status --short
git pull --ff-only origin main
docker compose exec -T backend python -m pytest tests/test_phase_e42_admin_advanced.py -q --disable-warnings
docker compose exec -T backend python -m pytest tests/ -q --disable-warnings
```

Último resultado confirmado antes de E.4.2: **264 pruebas
aprobadas**. Con seis tests adicionales se esperan **270**,
si no se añaden otros casos. No se afirma que E.4.2
esté aprobada antes de recibir resultados.

**Siguiente bloque:** probar el panel administrativo con Chromium
en un frontend-admin E2E independiente (puerto libre dedicado),
con usuario sintético, configuración temporal y controles para
impedir conectar la UI a la API comercial.
