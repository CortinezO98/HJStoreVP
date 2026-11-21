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


## Fase E.4.3 — Panel administrativo real con Chromium (entrega inicial)

**Implementado, ejecución pendiente**. Se añade
`frontend-admin-e2e` a `docker-compose.e2e.yml`, limitado a
`127.0.0.1:25174`, con frontend independiente de la instancia normal
`127.0.0.1:5174`, API sintética `127.0.0.1:18000`, base
`db-e2e` en tmpfs y Redis exclusivo. La política CORS de pruebas
incluye solo los orígenes de los dos frontends E2E.

El sembrado `backend/e2e_seed.py` crea usuarios sintéticos
`e2e-superadmin@example.com` y `e2e-seller@example.com`
con contraseña exclusivamente local de ensayo
`E2E-Admin-Only-123!`; su guardia exige host `db-e2e`,
esquema `hjstore_e2e` y banderas sin entregas/cobros reales.

`tests/e2e/test_admin_browser.py` agrega **cuatro escenarios**
en Chromium headless:

- Superadministrador inicia sesión, entra al estudio visual,
  crea una sección sintética y **guarda únicamente borrador**;
  confirma que la respuesta pública de la portada es idéntica.
- Vendedor intenta entrar al estudio en viewport móvil (390x844)
  y tablet (820x1180): redirección de frontend y HTTP 403 de API.
- Visitante sin sesión intenta entrar al estudio: login obligatorio.

Controles explícitos del navegador: abortar conexiones fuera de
`127.0.0.1:25174` y `127.0.0.1:18000`, bloquear cualquier
solicitud de publicación de portada y nunca usar las instancias
habituales `:5174`, `:5173` o `:8000`.

### Ejecución desde CMD Windows

```bat
cd /d C:\Users\jjcor\Documents\Github\HJStoreVP
git status --short
git pull --ff-only origin main
docker compose -f docker-compose.e2e.yml config --quiet
docker compose -f docker-compose.e2e.yml up -d --build
docker compose -f docker-compose.e2e.yml ps
docker compose -f docker-compose.e2e.yml exec -T backend-e2e python e2e_seed.py
.venv-e2e\Scripts\python.exe -m pytest tests\e2e\test_admin_browser.py -q
```

No ejecutar `up` sin `-f docker-compose.e2e.yml` para esta fase.
Es preciso construir las imágenes porque se añadió el panel E2E.
La instalación de Chromium y la venv anteriores pueden reutilizarse.
**Esperado si funciona:** `4 passed`; el resultado debe confirmarse
con ejecución real y no se afirma aquí.

Para limpiar **solo** el proyecto sintético al terminar:

```bat
docker compose -f docker-compose.e2e.yml down --remove-orphans
docker compose ps
git status --short
```

No usar `docker compose down -v` sobre la instancia habitual.
No ejecutar esta batería contra el panel en `localhost:5174`.
Las pruebas modifican exclusivamente el borrador de la BD temporal:
no hacen clic en «Publicar portada», ni crean pedidos, ni contactan
pasarelas. Las cuentas se descartan al eliminar los contenedores E2E.

**Pendiente posterior:** ampliar validaciones visuales de captura,
navegación completa y accesibilidad responsive si las primeras
pruebas del navegador confirman la configuración.


## Fase E.4.4 — Auditoría visual, responsive y accesibilidad básica

Se añade `tests/e2e/test_admin_visual_accessibility.py` con
**6 escenarios** (3 viewports + 3 recorridos especializados).
Reutiliza las defensas de red y el inicio de sesión sintético
de `test_admin_browser.py`. Nunca accede a los puertos
comerciales `5174`/`8000`, ni publica contenido real.

Cobertura:

- Chromium: escritorio 1440x900, tableta 820x1180 y móvil 390x844.
- Navegación a Dashboard, Productos, Inventario y Estudio visual:
  espera contenido visible y verifica URL, errores JavaScript
  no controlados y ancho de `documentElement`/`body`.
- Accesibilidad básica: enlace «Saltar al contenido»,
  buscador Ctrl+K y cierre con Escape.
- Menú móvil: abrir, `aria-expanded`, cerrar con Escape.
- Diseñador: crear mosaico, aceptar eliminación por diálogo y
  comprobar que no se guarda un borrador ni cambia `/public`.

Estas comprobaciones pueden revelar errores responsive reales.
No sustituyen revisión manual, axe/WCAG, contraste ni lectores
de pantalla. Un desbordamiento debe analizarse, no silenciarse.
Sin cambios funcionales a la tienda o administración en esta entrega.

### CMD: ejecución aislada

```bat
cd /d C:\Users\jjcor\Documents\Github\HJStoreVP
git status --short
git pull --ff-only origin main
docker compose -f docker-compose.e2e.yml up -d --build
docker compose -f docker-compose.e2e.yml ps
docker compose -f docker-compose.e2e.yml exec -T backend-e2e python e2e_seed.py
.venv-e2e\Scripts\python.exe -m pytest tests\e2e\test_admin_visual_accessibility.py -q
.venv-e2e\Scripts\python.exe -m pytest tests\e2e\test_admin_browser.py -q
docker compose -f docker-compose.e2e.yml down --remove-orphans
docker compose ps
git status --short
```

Se esperan **6 tests** en la nueva batería y **4** en la E.4.3,
pendientes de confirmación. La última validación recibida
para E.4.3 fue 4/4 y la suite backend previa 270/270.
La fase E.4.4 no está aún validada localmente.


### E.4.4 — Ajuste de sincronización en Chromium (21-11-2026)

La primera ejecución del usuario detectó **5/6** pruebas en
`test_admin_visual_accessibility.py` y **3/4** en
`test_admin_browser.py`. Los fallos fueron:

- `get_by_role("link", name="Saltar al contenido")` no localizó
  el enlace oculto visualmente hasta recibir foco. Se cambió a
  selector específico `a.admin-skip-link`, se espera su
  existencia y atributo href, y se prueba el foco con Tab.
- `is_visible()` se evaluaba inmediatamente después del cambio
  de URL `/login`, sin esperar el montaje del formulario React.
  Se cambió por `expect(...).to_be_visible(timeout=10000)`.

No se modificaron CSS, permisos, frontend comercial ni políticas
de aislamiento. Los ajustes se limitan a pruebas automatizadas.
La aprobación requiere repetir ambas baterías y observar
sus resultados reales.

```bat
cd /d C:\Users\jjcor\Documents\Github\HJStoreVP
git pull --ff-only origin main
.venv-e2e\Scripts\python.exe -m pytest tests\e2e\test_admin_visual_accessibility.py -q
.venv-e2e\Scripts\python.exe -m pytest tests\e2e\test_admin_browser.py -q
docker compose -f docker-compose.e2e.yml down --remove-orphans
docker compose ps
git status --short
```


## Fase E.5.1 — Preflight de preparación para producción (no destructivo)

Se incorporó `scripts/production_readiness.py`, un auditor
**estático y exclusivamente de lectura** que no importa la app,
no accede a Docker, MariaDB, Redis o Internet, no carga `.env`
y no muestra contraseñas ni valores de variables.

La auditoría identifica condiciones de desarrollo incompatibles
con producción (Compose con `ENVIRONMENT=development`,
`--reload`, credenciales de respaldo conocidas, volumen del código
fuente); revisa defensas existentes del backend para secretos,
CORS, DEBUG y autenticación; verifica disponibilidad de Alembic
y registra validaciones **MANUAL** obligatorias:
migraciones staging, restauración de backups, TLS y proveedores.
La ejecución NO es una habilitación para desplegar.

**Código de salida:** `2` si detecta BLOCKER;
`1` cuando no hay bloqueos estáticos pero aún falta aprobación
manual. Por diseño nunca devuelve `0` en esta fase.
Un estado de fallo es ESPERADO y NO significa que el entorno
de desarrollo esté averiado.

### CMD — ejecutarlo sin modificar nada

```bat
cd /d C:\Users\jjcor\Documents\Github\HJStoreVP
git status --short
git pull --ff-only origin main
py -3 scripts\production_readiness.py
echo Codigo de salida: %ERRORLEVEL%
py -3 -m pytest scripts\test_production_readiness.py -q
git status --short
```

Si Python del host no tiene pytest, usar la venv E2E existente:
`.venv-e2e\Scripts\python.exe -m pytest scripts\test_production_readiness.py -q`.
Otra alternativa es `docker compose exec -T backend python
../scripts/production_readiness.py` sólo si se monta /scripts,
lo que no hace el Compose actual; **no usar esa alternativa**.
Se añadieron **5 casos** de pruebas del auditor:
detección de Compose de desarrollo, ausencia de archivos,
protección de secretos, aprobación manual pendiente y
verificación del repositorio real. No se ha confirmado aún
la ejecución en Windows.

### Bloqueos conocidos que E.5.1 no debe cambiar automáticamente

- `docker-compose.yml` sirve para desarrollo y no debe
  reconfigurarse como producción silenciosamente.
- `backend/Dockerfile` todavía arranca Uvicorn con `--reload`.
- Las variables de desarrollo contienen fallbacks inseguros;
  **no introducir contraseñas reales en Git ni en logs**.
- El despliegue productivo requerirá imagen inmutable,
  usuario no privilegiado, secretos fuera del repositorio,
  HTTPS/proxy, controles de acceso, respaldos restaurables
  y migraciones validadas en staging.

**Fase siguiente E.5.2:** definir Compose/Dockerfile
separados para producción sin afectar Docker Compose local,
con secretos obligatorios, red adecuada, sin puertos de base
expuestos y plan de migración y recuperación. No desplegar
ni encender pagos/correo reales hasta aprobación.


## Fase E.5.2 — Infraestructura candidata productiva (sin despliegue)

La auditoría E.5.1 confirmó en el entorno de desarrollo **6 BLOCKER,
1 WARNING, 4 MANUAL, 9 PASS**; exit 2 esperado. Estos bloqueos
siguen perteneciendo al Compose *de desarrollo* y **no se elimina ni
se reemplaza** dicho Compose: continuar usándolo localmente.

Se añadieron estos archivos totalmente separados:

- `docker-compose.production.yml`: proyecto independiente
  `hjstorevp-prod-candidate`, MariaDB/Redis en red interna sin puertos
  publicados, backend y dos sitios estáticos enlazados **sólo a
  127.0.0.1** por los puertos 28000/28080/28081.
- `backend/Dockerfile.production`: imagen sin `--reload`, con usuario
  `appuser` no privilegiado y volumen persistente de imágenes.
- `frontend/Dockerfile.production` y
  `frontend-admin/Dockerfile.production`: compilación Vite multietapa
  y Nginx no privilegiado para servir archivos estáticos.
- `frontend/nginx.production.conf` y
  `frontend-admin/nginx.production.conf`: rutas SPA y cabeceras
  defensivas. HTTPS deberá terminar en proxy externo validado.
- `scripts/test_production_candidate.py`: cinco controles de
  arquitectura que no leen secretos, no abren sockets ni arrancan
  contenedores.

**NO APTO PARA ACTIVACIÓN AÚN.** No se incluyen dominios, credenciales,
certificados ni infraestructura real. Las variables requeridas se
suministrarán por un medio seguro (nunca por Git ni en capturas).
En particular, `PROD_DB_PASSWORD` debe ser robusta y **URL-safe**
(letras, números, guion y guion bajo) por usarse tanto en la cuenta
MariaDB como dentro de `DATABASE_URL`. Si se requieren símbolos
reservados de URL, antes deberá cambiarse la construcción de DSN
para codificar correctamente la contraseña. `VITE_*` contiene sólo
direcciones públicas HTTPS; **nunca poner claves en argumentos de
compilación**. Validación CORS usa `PROD_STORE_URL` y
`PROD_ADMIN_URL` como orígenes exactos, sin barra final.

El Compose candidato no inicia migraciones y **la app en modo
producción no crea tablas automáticamente**. Al iniciar sin staging
migrado puede responder errores; por eso **no ejecutar `up`
ni aplicar `alembic upgrade` todavía**. Tampoco habilitar SMTP,
Wompi, Sistecréditos o Addi reales. El proxy TLS, restauración
integral, migraciones, permisos de almacenamiento y pruebas HTTPS
se validarán en fases E.5.3–E.5.4.

### CMD — validar sin arrancar nada

```bat
cd /d C:\Users\jjcor\Documents\Github\HJStoreVP
git status --short
git pull --ff-only origin main
.venv-e2e\Scripts\python.exe -m pytest scripts\test_production_readiness.py scripts\test_production_candidate.py -q
git status --short
```

Se esperan **10 casos** en total (5 de E.5.1 más 5 de E.5.2).
No ejecutar `docker compose -f docker-compose.production.yml config`
con secretos verdaderos si va a compartirse la salida: Docker puede
mostrar variables y credenciales resueltas. De momento la validación
estática es suficiente; los archivos candidatos aún no han sido
construidos ni arrancados.

**Siguiente E.5.3:** preparar escenario staging con base y volúmenes
exclusivos, migraciones controladas, copia verificable y restauración
probada, registro de versiones y rollback. Todo antes de promover
la configuración candidata.


## Fase E.5.3 — Auditoría Alembic y recuperación SINTÉTICA aislada

Los mecanismos existentes `scripts/backup_full_local.py` y
`scripts/verify_backup_pair.py` ya producen y verifican copias
de MariaDB + uploads con SHA-256. **No se invocan aquí** porque
usan el proyecto Docker de desarrollo y podrían contener datos
comerciales. No debe mezclarse el ensayo sintético con un respaldo real.

Archivos añadidos:

- `scripts/staging_recovery.py`: auditoría del grafo de revisiones
  Alembic leyendo los archivos como AST **sin ejecutarlos**;
  generación de SQL y TAR con marcadores sintéticos, SHA-256, validación
  completa y ensayo explícito de importación en base aislada.
- `docker-compose.staging-recovery.yml`: proyecto
  `hjstorevp-staging-recovery` con **una única MariaDB** sobre
  `tmpfs`, sin puertos ni volúmenes de producción/desarrollo.
- `scripts/test_staging_recovery.py`: **7 pruebas offline** de
  cadena Alembic, detección de errores, no sobrescritura,
  manipulación de SQL/manifiesto, ruta no canónica y aislamiento
  declarado.

### CMD Windows — validaciones sin Docker

```bat
cd /d C:\Users\jjcor\Documents\Github\HJStoreVP
git status --short
git pull --ff-only origin main
.venv-e2e\Scripts\python.exe -m pytest scripts\test_staging_recovery.py -q
.venv-e2e\Scripts\python.exe scripts\staging_recovery.py audit
.venv-e2e\Scripts\python.exe scripts\staging_recovery.py create-fixture
.venv-e2e\Scripts\python.exe scripts\staging_recovery.py verify
git status --short
```

Los fixtures se guardan en `backups/staging-fixtures/` (excluidos
del control de versiones); **no se sobrescriben**. Si ya existen,
`create-fixture` se niega a reemplazarlos. `audit` certifica
sólo que las dependencias de revisiones son coherentes y reporta
una única cabeza; **no verifica el estado real de la base**.

### Ensayo de restauración en MariaDB efímera (opcional, explícito)

Tras obtener los resultados offline, ejecutar **solamente** lo
siguiente; usa el Compose explícito y no involucra ninguna tienda
ni aplicación:

```bat
docker compose -f docker-compose.staging-recovery.yml up -d
docker compose -f docker-compose.staging-recovery.yml ps
.venv-e2e\Scripts\python.exe scripts\staging_recovery.py rehearse
docker compose -f docker-compose.staging-recovery.yml down --remove-orphans
docker compose ps
git status --short
```

`rehearse` requiere que el contenedor `db-recovery` ya esté
en ejecución, valida el SQL y manifiesto canónicos y ejecuta
únicamente el marcador sintético. Confirma lectura posterior
`E53-RESTORE-VERIFIED`; el TAR de prueba se valida byte a byte,
**pero no se extrae/restaura** en este paso. La base es temporal y se
pierde al destruir el contenedor. No ejecutar este ensayo en Docker
remoto, ni suministrar archivos SQL comerciales.

### Límites, riesgo y rollback

La validación del grafo Alembic no implica que una base existente
esté en `head`. Varias migraciones tienen `downgrade` expresamente
bloqueado por riesgo de pérdida de datos: **no intentar bajar Alembic
automáticamente**. El rollback de una actualización real exigirá:
ventana de mantenimiento, respaldo previo consistente y probado,
reponer versiones de imágenes/código, restaurar una copia de la base
en infraestructura controlada y reconciliar operaciones posteriores
al punto de corte. Para lograr consistencia de DB+uploads es necesario
congelar escrituras o usar un procedimiento transaccional coordinado.

**No aprobado aún para producción:** falta ensayar la restauración
realista de un respaldo de staging completo (sin datos sensibles),
comprobar estado de Alembic contra ese staging, validar uploads y
definir RPO/RTO, capacidad, retención y recuperación documentada.
Nunca aplicar estas pruebas a la base comercial.

Última referencia: E.5.2 confirmó 10/10 pruebas; E.5.3 añadida
al repositorio, pendiente de ejecución por el usuario.


### E.5.3 — Ajuste de arranque saludable MariaDB (21-11-2026)

El usuario confirmó **7/7 pruebas**, grafo Alembic
`18 revisiones` / `20261120_18`, manifiesto y SHA256 verificados.
El primer ensayo de restauración falló con `RuntimeError`:
el comando `docker compose ps` inmediatamente anterior mostraba
`health: starting`, por lo que es probable que MariaDB aún
estuviera inicializando. El error genérico no permite atribuirlo
con total certeza a esa causa.

Se agregó comprobación explícita `healthcheck.sh --connect
--innodb_initialized` antes de enviar SQL y una prueba offline
que verifica que un contenedor no saludable **nunca recibe SQL**.
La suite ahora tiene **8 casos**. El operador debe usar la bandera
`--wait` y no ejecutar `create-fixture` nuevamente, ya que el
fixture está creado e íntegro y se niega a sobrescribirlo.

```bat
cd /d C:\Users\jjcor\Documents\Github\HJStoreVP
git status --short
git pull --ff-only origin main
.venv-e2e\Scripts\python.exe -m pytest scripts\test_staging_recovery.py -q
.venv-e2e\Scripts\python.exe scripts\staging_recovery.py verify
docker compose -f docker-compose.staging-recovery.yml up -d --wait --wait-timeout 120
docker compose -f docker-compose.staging-recovery.yml ps
.venv-e2e\Scripts\python.exe scripts\staging_recovery.py rehearse
docker compose -f docker-compose.staging-recovery.yml down --remove-orphans
docker compose ps
git status --short
```

No se modifica el archivo Compose E2E, producción ni desarrollo.
Un `health: healthy` comprueba disponibilidad del motor; la
integridad de restauración requiere además respuesta
`E53-RESTORE-VERIFIED`. Fase pendiente de revalidación real.


### E.5.3 — Diagnóstico específico tras fallo con MariaDB healthy

El usuario confirmó 8/8 pruebas offline y SQL/TAR SHA256
válidos; arrancó `db-recovery` en estado `healthy`, pero
`rehearse` devolvió `RuntimeError` genérico. Ya no puede
atribuirse simplemente a falta de espera. Se añadió
`RecoveryStageError` con identificadores seguros y sin exponer
salida estándar de MariaDB, detalles SQL o contraseñas:

- `CONTAINER_NOT_RUNNING_OR_NOT_UNIQUE`: el proyecto aislado
  no tiene exactamente el servicio esperado.
- `DB_HEALTHCHECK_FAILED`: salud interna de MariaDB no disponible.
- `SQL_IMPORT_FAILED`: falló la carga del fixture sintético.
- `SQL_READBACK_FAILED`: la consulta del marcador falló.
- `SQL_MARKER_MISMATCH`: el marcador no coincide.

La ejecución de SQL sigue prohibida para bases distintas de
`hjstore_recovery_fixture`. Se agregó test adicional para
protección de información sensible; ahora hay 9 pruebas.

Como el usuario dejó el contenedor aislado running, **no**
hace falta recrear fixture ni reiniciar Docker para identificar
la etapa fallida:

```bat
cd /d C:\Users\jjcor\Documents\Github\HJStoreVP
git status --short
git pull --ff-only origin main
.venv-e2e\Scripts\python.exe -m pytest scripts\test_staging_recovery.py -q
docker compose -f docker-compose.staging-recovery.yml ps
.venv-e2e\Scripts\python.exe scripts\staging_recovery.py rehearse
```

Si muestra `SQL_IMPORT_FAILED` o `SQL_READBACK_FAILED`,
investigar únicamente `db-recovery` con consultas sintéticas;
no revelar credenciales ni tocar `hjstorevp_db`. Mantener
E.5.3 abierta hasta `restore: verified` y después limpiar
con `docker compose -f docker-compose.staging-recovery.yml down
--remove-orphans`.


### E.5.3 — Diagnóstico de `SQL_IMPORT_FAILED` con BD saludable

El usuario confirmó **9/9 pruebas** y que `db-recovery` sigue
`healthy`; la importación del SQL sintético falló con código
`SQL_IMPORT_FAILED`. Esto **descarta el arranque incompleto como
explicación suficiente** y requiere separar problemas de conexión
del cliente MariaDB de errores de sintaxis o datos del SQL.

Se añadió una consulta SQL previa de lectura `SELECT 1` a la base
`hjstore_recovery_fixture` antes de enviar bytes del fixture.
Los errores se informan por *categoría* segura, sin imprimir stderr:

- `SQL_CONNECTION_FAILED_AUTHENTICATION`
- `SQL_CONNECTION_FAILED_DATABASE_MISSING`
- `SQL_IMPORT_FAILED_DUPLICATE_SYNTHETIC_MARKER`
- `SQL_IMPORT_FAILED_SQL_SYNTAX`
- `SQL_IMPORT_FAILED_UNCLASSIFIED`

También hay categorías `CONNECTION`, `CLIENT_NOT_FOUND`
y `SQL_READBACK_FAILED` para otros fallos. En la nueva versión
las pruebas de `test_staging_recovery.py` suman **11 casos**,
pendientes de ejecución local. **No rehacer el fixture** y no
ejecutar limpieza hasta identificar la causa. Ejecutar:

```bat
cd /d C:\Users\jjcor\Documents\Github\HJStoreVP
git status --short
git pull --ff-only origin main
.venv-e2e\Scripts\python.exe -m pytest scripts\test_staging_recovery.py -q
docker compose -f docker-compose.staging-recovery.yml ps
.venv-e2e\Scripts\python.exe scripts\staging_recovery.py rehearse
```

No se cambió el esquema SQL sintético, el manifiesto SHA-256,
la configuración del contenedor, ni los servicios normales.
No utilizar salida de `docker compose config` con secretos
reales. La prueba sólo intenta importar el fixture verificado.
