# HJStoreVP — Fase D, primera entrega: calidad, rendimiento y seguridad

Fecha: 2026-11-20. Rama de trabajo: `main`.

## Cambios entregados

### Rendimiento del panel administrativo

`frontend-admin/src/App.jsx` importa los 24 módulos de páginas con
`React.lazy` en lugar de cargarlos todos durante el primer acceso.
`Suspense` presenta un estado de carga accesible. No se cambiaron las
rutas, los roles, las API ni los formularios. El panel necesita un
servidor HTTP que devuelva correctamente los fragmentos `dist/assets`.

**Métricas de referencia**: el último build local anterior producía un
bundle JS de aproximadamente 799 kB sin dividir páginas. Debe
repetirse `npm run build` y compararse el número de chunks, el peso
del archivo de entrada y la carga del dashboard. No prometer un ahorro
sin las cifras de la nueva compilación.

### Contratos de regresión

`frontend-admin/scripts/verify-admin-modules.mjs` fue alineado con
los nombres actuales de inventario, estados manuales válidos y reportes
calculados en backend. No se recuperaron transiciones prohibidas de
pedidos desde la interfaz.

En `backend/tests/test_main.py` un adaptador **solo de pruebas**
agrega una `Idempotency-Key` aleatoria por intención de compra de
los casos antiguos. El backend sigue exigiendo la cabecera y existe
un test explícito con `TestClient` sin adaptador que espera HTTP 422.
Esto no modifica clientes reales, endpoints ni reglas de stock.

`backend/tests/test_security_hardening.py` comprueba imágenes con
contenido no uniforme, salida WEBP y rechazo de imágenes vacías de
contenido. No se relajó el filtro de seguridad de imágenes.

### Pipeline

`.github/workflows/phase-d-quality.yml` ejecuta:

- Pruebas completas del backend y validación de contratos administrativos.
- Compilación Vite, con confirmación de más de un bundle JavaScript.
- Inventarios de vulnerabilidades en formato JSON de npm y Python,
  retenidos como artefactos durante 14 días.

La etapa de inventario no bloquea por hallazgos conocidos: deben ser
clasificados, priorizados y corregidos individualmente antes de
producción; esto **no supone** que el software esté libre de
vulnerabilidades. No ejecutar actualizaciones forzadas sin pruebas
de compatibilidad.

## Validación en equipo de desarrollo

```bat
cd /d C:\Users\jjcor\Documents\Github\HJStoreVP
git switch main
git status --short
git pull --ff-only origin main
docker compose up -d --build backend frontend-admin
docker compose exec frontend-admin node scripts/verify-admin-modules.mjs
docker compose exec frontend-admin npm run build
docker compose exec backend python -m pytest tests/ -q
docker compose exec backend alembic current
docker compose ps
```

También realizar una prueba manual: login y 2FA, dashboard, productos,
inventario, pedidos, reportes, caja, estudio visual, auditorías y
logout, en dispositivos escritorio y móvil. No hacer compras
reales por una prueba de regresión. Conservar intacto
`frontend-admin/package-lock.json` no rastreado: cualquier limpieza
o incorporación se decidirá después de revisar su contenido.

## Criterios de cierre posteriores

La Fase D completa requiere que los pipelines generales estén verdes,
clasificar y solucionar vulnerabilidades de npm/Python según exposición
y severidad, medir rendimiento real, cubrir pruebas de pagos/webhooks,
concurrencia y restauración, y disponer de almacenamiento externo
protegido para evidencias y respaldos. La primera entrega **no**
cambia versión Alembic (`20261120_18`), ni altera datos operativos,
ni reinicializa contenedores.

Los problemas distintos a los corregidos de CI deben tratarse según
los registros completos más recientes, sin asumir que han desaparecido.


## Contención de incidente — suite local conectada a MariaDB (20/11/2026)

La ejecución de `docker compose exec backend python -m pytest tests/ -q`
reveló conexiones SQL contra la base comercial `hjstorevp`, seguidas
de logins de pruebas HTTP 401 y 429. La suite **no estaba aislada**.
No ejecutar nuevamente tests sin la protección de esta entrega.

`backend/tests/conftest.py` establece SQLite en directorio temporal
**antes de cargar la aplicación**, apunta Redis a un puerto inactivo
y deshabilita las entregas de email y pagos reales en todo pytest.
Además, `pytest_sessionstart` aborta si el motor no es SQLite.
La fixture de `tests/test_main.py` reinstala `get_db` en cada test y
restaura los overrides previos al terminar. Esto también protege
consultas que usan accidentalmente `SessionLocal` en lugar de la
dependencia de FastAPI.

El aislamiento de pruebas no sustituye la revisión de permisos de
BD Docker ni garantiza que no exista algún script externo que lea
configuración propia; inspeccionar los logs más recientes y los
registros de negocio si la suite previa alcanzó MariaDB.

### Validación segura tras actualizar código

```bat
git pull --ff-only origin main
docker compose up -d --build backend frontend-admin
docker compose exec backend python -m pytest tests/ -q
```

Estos comandos de pytest solo son seguros **después de confirmar**
que `backend/tests/conftest.py` forma parte de la imagen reconstruida.
En caso de dudas, primero ejecutar
`docker compose exec backend python -m pytest --collect-only tests/ -q`
y revisar que el motor de prueba use SQLite.

No ejecutar `docker compose down -v`, no eliminar ni reiniciar
MariaDB/Redis y no limpiar claves de producción por este fallo.


## Ajuste de regresiones posteriores al aislamiento (20/11/2026)

Última ejecución local reportada: **171 correctas, 30 fallidas**.
Los fallos se concentran en pruebas antiguas que invocan
`/api/v1/payments/confirm-demo`: el endpoint devuelve HTTP 404 en
`ENVIRONMENT=testing` como protección intencional. En el fixture
`setup_db` de `tests/test_main.py`, el entorno se cambia
**solo para la ejecución pytest** mediante `monkeypatch` a
`development`. La conexión y archivos siguen en SQLite temporal;
ninguna ruta demo se habilita en producción con esta corrección.

Las pruebas de carga de imágenes de variantes y branding ahora
construyen imágenes sintéticas con detalle para respetar la política
que rechaza fotografías planas. La prueba de permisos del
Superadministrador se actualiza para exigir HTTP 401 en token
**revocado por cambio de rol**, después nuevo login como Admin
y HTTP 403 al intentar editar la portada; al devolver el rol de
Superadministrador se obtiene un token nuevo. No se relajan
validaciones ni permisos del sistema.

### Comandos de validación

```bat
cd /d C:\Users\jjcor\Documents\Github\HJStoreVP
git switch main
git pull --ff-only origin main
docker compose up -d --build backend frontend-admin
docker compose exec backend python -m pytest tests/ -q
docker compose exec frontend-admin node scripts/verify-admin-modules.mjs
docker compose exec frontend-admin npm run build
docker compose exec backend alembic current
docker compose ps
```

**Nunca** ejecutar `docker compose down -v` ni aplicar tests
contra la BD de la tienda; `conftest.py` debe seguir bloqueando
motores distintos de SQLite y los pagos reales durante pytest.


## Segunda entrega de la Fase D — CI y auditoría de dependencias

La ejecución local del 20/11/2026 reportada por el desarrollador
terminó con **201 pruebas aprobadas, 0 fallidas**; panel compilado,
verificador de contratos OK, Alembic `20261120_18 (head)`,
servicios operativos. Esto es una validación local, no una afirmación
de que los nuevos pipelines GitHub hayan finalizado.

Se ampliaron las verificaciones de seguridad para cubrir:

- Backend Python: `pip-audit` en el archivo de requisitos y
  `pip check` tras instalación en los workflows.
- Panel administrativo: `npm audit --json` y verificación de compilación.
- Tienda pública: `npm audit --json` y compilación independiente.
- Analizador de hallazgos versionado en
  `scripts/ci/summarize_dependency_audit.py`, con pruebas
  `scripts/ci/test_summarize_dependency_audit.py`.

### Interpretación correcta del CI

Un resultado de escáner distinto de 0 puede representar
vulnerabilidades; errores de ejecución del escáner (código > 1),
reportes JSON incompletos o malformados hacen **fallar el job**.
Los hallazgos reales se registran y se muestran como advertencias;
**todavía NO bloquean automáticamente despliegues** hasta clasificar
las vulnerabilidades existentes y definir excepciones aprobadas.
El informe completo se conserva 14 días como artifact
`fase-d-dependency-audits` en Actions.

El pipeline mantiene cambios comerciales fuera de alcance. No ejecuta
`npm audit fix --force`, no hace upgrade automático de paquetes ni
introduce nuevas migraciones. Las versiones a corregir se decidirán
solo al inspeccionar hallazgos reales, versiones corregidas,
impacto y compatibilidad con las 201 pruebas.

### Instalaciones reproducibles pendientes

Ninguno de los dos frontends dispone actualmente de
`package-lock.json` **versionado**. El archivo
`frontend-admin/package-lock.json` que existe localmente
sin rastrear debe revisarse antes de agregarlo a Git, verificando
que corresponda al `package.json` actual. Los workflows usan
`npm ci` cuando hay lockfile; mientras falta, usan `npm install`
y advierten expresamente que la instalación no es reproducible.
No publicar producción como lista hasta cerrar este punto.

Plan de adopción: inspeccionar primero el diff y dependencias
transitivas, validar `npm ci` y build de ambos frontends con
locks propuestos, añadir cada lock a `main` y convertir los
fallbacks de `npm install` a errores en CI.

### Priorización de hallazgos

1. Críticos/altos alcanzables desde producción: corregir primero;
   activar bloqueo una vez confirmado el baseline.
2. Vulnerabilidades transitivas o solo herramientas de desarrollo:
   verificar realmente su exposición, ruta de explotación y solución.
3. Cambios mayores: probar integración de pagos, reservas concurrentes,
   MFA, archivos, webhooks, devoluciones y frontends antes de integrar.
4. Documentar riesgos aceptados, responsable y fecha de revisión.
   No confundir un resultado de auditoría sin errores con ausencia
   total de vulnerabilidades.

Para revisar resultados ir a
`GitHub > Actions > Fase D - estabilidad y rendimiento` y descargar
`fase-d-dependency-audits`. Los archivos son
`admin-dependency-audit.json`, `store-dependency-audit.json`
y `backend-dependency-audit.json`. No contienen contraseñas
volcadas por la aplicación; de todas formas controlar su acceso.


## Tercera entrega — reporte accionable de vulnerabilidades

Tras `git pull`, los tres escáneres del workflow
`Fase D - estabilidad y rendimiento` generan adicionalmente:

- `admin-audit-triage.md`: vulnerabilidades del panel; severidad,
  dependencia directa/transitiva, rango afectado, corrección propuesta
  y referencias a avisos.
- `store-audit-triage.md`: mismo informe para la tienda pública.
- `backend-audit-triage.md`: dependencias Python, versiones instaladas,
  identificador de aviso y versiones reparadas informadas por pip-audit.

Los informes se publican también en el **resumen del job** de GitHub
Actions. El analizador incluye siete pruebas de contrato, valida que el
JSON sea real y no da por seguro ningún paquete solo porque el escáner
falló. Las correcciones se muestran como **candidatas**, jamás se aplican
automáticamente, porque incluso actualizaciones no mayores pueden
alterar comportamiento del sistema.

**Estado de auditorías del último código**: no se ha recibido ni
verificado una ejecución con artefactos JSON de la Fase D. No se han
confirmado vulnerabilidades específicas, ni se ha justificado el cambio
de versiones. No clasificar como resuelto hasta revisar los reportes
reales y ejecutar regresión de los componentes afectados.

### Recuperar resultados reales

En `https://github.com/CortinezO98/HJStoreVP/actions`, abrir la
última ejecución de `Fase D - estabilidad y rendimiento`, identificar
el job `Dependencias - informe sin actualizacion automatica`,
consultar su resumen y descargar `fase-d-dependency-audits`.
Si el job falla, revisar los archivos `*-audit-errors.txt` para
separar errores de red o resolución de los hallazgos de seguridad.
No compartir credenciales, archivos `.env` ni JWT en reportes.

### Incorporar lockfiles sin sobrescribir archivos locales

En Windows, `frontend-admin/package-lock.json` todavía figura como
`??` (untracked). No ejecutar `git clean -fd` ni borrar el archivo.
Se debe comparar primero con el `package.json`, validar
`npm ci` y `npm run build` de forma controlada antes de confirmar
el lockfile en GitHub. `frontend/package-lock.json` tampoco está
versionado; generar uno de manera reproducible y validarlo por separado.
Mientras no estén confirmados, los workflows siguen avisando de
instalaciones npm no reproducibles.

No es necesaria migración Alembic: permanece `20261120_18`. No se
modificaron los contenedores en ejecución, la base MariaDB, el
inventario ni el procesamiento de pagos para estas comprobaciones.


## Auditoría verificada de GitHub Actions #21 — 20/11/2026

Ejecución: https://github.com/CortinezO98/HJStoreVP/actions/runs/44840960404
(HEAD `79683e5`; los cuatro jobs terminaron en success).
Se descargó el artefacto `fase-d-dependency-audits` y se analizaron
los JSON originales, no solamente la página de configuración.

### Riesgos identificados

- Frontend administrativo y tienda pública: cuatro paquetes con
  vulnerabilidades en cada uno (Vite: alto; esbuild, react-router,
  react-router-dom: moderados). Son los mismos cuatro nombres en
  ambos, pero provienen de dos árboles de instalación distintos.
  El escáner propone `vite@8.3.8` y
  `react-router-dom@7.18.6`; cambios mayores pendientes de pruebas.
- Backend: ocho paquetes afectados, con 81 identificadores de aviso
  únicos al agrupar registros duplicados:
  `pillow` (53), `starlette` (7),
  `python-multipart` (7), `cryptography` (6),
  `python-jose` (4), `aiosmtplib` (2),
  `pytest` (1), `ecdsa` (1). Las 120 filas crudas no
  corresponden a 120 problemas independientes.
- Autenticación JWT: `python-jose` 3.3.0 tiene avisos sin
  versión reparada informada por el escáner. Su actualización aislada
  a 3.4.0 **no resuelve todos los avisos**. Evaluar reemplazo de
  biblioteca y contrato JWT con tests de MFA, refresh, algoritmos,
  claves y revocación, manteniendo `algorithms=[HS256]` explícito.
- HTTP y carga de archivos: actualizar FastAPI, Starlette y
  python-multipart **en una sola rama de compatibilidad**:
  FastAPI 0.115.0 es antiguo y la reorganización de imports
  multipart puede impedir su arranque si cambia solamente el parser.
  Revalidar formularios, archivos de producto y branding, errores
  413/422 y límites de tamaño.
- Pillow 10.4.0 tiene numerosos avisos. Probar normalización
  WEBP, límites de píxeles y manejo de archivos inválidos antes
  de sustituirlo por una versión nueva.
- Cryptography y aiosmtplib requieren pruebas de autenticación,
  certificados y envío real bajo entorno controlado, no producción.
  Pytest es dependencia de desarrollo, clasificarla por exposición.

### Control aplicado sobre GitHub Actions

Se migraron `actions/checkout@v5`,
`actions/setup-node@v5`, `actions/setup-python@v6` y
`actions/upload-artifact@v6` en los workflows de Fase D,
backend, frontend-admin y auditoría Fase C, para dejar de usar
versiones de acciones cuyo runtime Node 20 genera advertencias
de obsolescencia. Esto **no actualiza** la versión de Node usada
para compilar la aplicación, ni corrige las vulnerabilidades npm.

### No declarado resuelto

Los cambios de acciones están integrados en main pero deben
validarse en la siguiente ejecución de CI. No se han actualizado
todavía dependencias de producción sin pruebas de compatibilidad.
Las 201 pruebas se aprobaron en el último baseline anterior,
no se presentan como ejecutadas de nuevo con los próximos cambios.


## Cuarta entrega — sustitución de python-jose en autenticación

Se reemplazó `python-jose[cryptography]==3.3.0` por
`PyJWT==2.15.1` en `backend/requirements.txt`, cambiando
exclusivamente el uso de JWT en `app/core/security.py`,
`app/api/v1/endpoints/auth.py` y sus pruebas. Se conserva
el algoritmo HS256 explícito y la misma firma HMAC; los tokens
anteriores con `exp`, `sub` y `type` válidos siguen siendo
compatibles. La función `decode_token` ahora exige esos tres claims
y devuelve `None` ante errores de validación de PyJWT. No se
cambiaron claves, contraseñas, roles, permisos, ni versiones MFA.

`backend/tests/test_jwt_migration.py` incorpora pruebas de token
histórico HS256 generado mediante HMAC sin python-jose, expiración,
ausencia de claims, token alterado, algoritmo none, algoritmo
distinto y contratos de acceso/refresh. Las otras pruebas existentes
de perfil y MFA también usan PyJWT.

**Validación obligatoria tras actualizar el backend:**

```bat
git pull --ff-only origin main
docker compose up -d --build backend
docker compose exec backend python -m pip check
docker compose exec backend python -m pytest tests/test_jwt_migration.py tests/test_profile_mfa.py tests/test_auth_protection.py -q
docker compose exec backend python -m pytest tests/ -q
docker compose exec backend alembic current
```

**Estado**: código integrado en `main`; no se dispone todavía de
resultado de estas nuevas pruebas. No marcar como remediadas las CVE
de autenticación hasta comprobar el paquete realmente instalado,
la batería completa y un nuevo `pip-audit`. La implementación
no elimina necesariamente `ecdsa` si otra dependencia lo requiere.
No se añadió migración de esquema.

Las actualizaciones de FastAPI, Starlette, multipart, Pillow y
frontends permanecen pendientes, y se realizarán en entregas
separadas para localizar regresiones con precisión.


## Quinta entrega — actualización HTTP, multipart y formularios

Se fijaron de manera coordinada estas versiones en `backend/requirements.txt`:

| Dependencia | Anterior | Nueva |
|---|---|---|
| FastAPI | 0.115.0 | 0.165.0 |
| Starlette (transitiva) | 0.38.6 | 1.10.0 (pin explícito) |
| python-multipart | 0.0.12 | 0.0.34 |

Es una actualización de framework y parser, **no** una actualización
de modelos comerciales ni de tablas. La fijación explícita de Starlette
protege contra una resolución inesperada del grafo HTTP; se debe validar
la compatibilidad real con `pip check`, la creación de rutas y los tests.
No modificar las credenciales, el esquema ni el contenido de la BD
para esta entrega.

`backend/tests/test_http_stack_migration.py` añade siete verificaciones:
versiones instaladas, multipart con fichero y campo de texto, campo
obligatorio ausente (422), archivo vacío o superior al límite (413),
múltiples archivos sin reordenar, formulario urlencoded y multipart
malformado rechazado. Estas pruebas utilizan una aplicación FastAPI
efímera y no requieren base de datos; además, las pruebas históricas
`tests/test_main.py` siguen verificando autorización, persistencia
y publicación de imágenes reales.

### Procedimiento de validación

```bat
cd /d C:\Users\jjcor\Documents\Github\HJStoreVP
git switch main
git status --short
git pull --ff-only origin main
docker compose up -d --build backend
docker compose exec backend python -m pip check
docker compose exec backend python -m pytest tests/test_http_stack_migration.py tests/test_security_hardening.py tests/test_main.py -q
docker compose exec backend python -m pytest tests/ -q
docker compose exec backend alembic current
docker compose ps
```

**Meta:** 206 pruebas anteriores + 7 nuevas = **213**.
No dar esa cifra por aprobada hasta disponer de una ejecución real.
Un fallo de resolución de dependencias, `pip check` o tests es
bloqueante: registrar el error y ajustar el conjunto de versiones,
nunca forzar la instalación con `--no-deps` ni retirar pruebas.

Se mantienen pruebas con aislamiento en SQLite temporal. Evitar
`docker compose down -v`, `git clean` y operaciones sobre tablas
de negocio. Tras validar se repetirá `pip-audit` para medir la
disminución real de los avisos del parser y Starlette.

**Pendiente de esta entrega:** optimización de Pillow, cryptography,
frontend, dependencias transitivas y pruebas de despliegue seguro.


## Sexta entrega — resolución de dependencias bloqueada por fastapi-mail

Durante la reconstrucción Docker del bloque HTTP, `pip` falló con
`ResolutionImpossible` por la incompatibilidad entre
`starlette==1.10.0` y `fastapi-mail==1.4.1`
(`fastapi-mail` antigua exige `starlette<1.0`). El contenedor
anterior siguió activo y la batería reportó **212 pasadas y una
fallida**, exactamente la verificación de versiones nuevas:
`fastapi` instalado seguía siendo `0.115.0`. Por tanto,
esa ejecución **NO valida** las nuevas versiones y tampoco
representa una regresión funcional de FastAPI 0.165.0.

Se revisaron los trabajadores reales de correo:
`app/services/notification_worker.py` y
`app/services/cart_recovery_worker.py`. Ambos utilizan
`smtplib`, `ssl` y `email.message` de la biblioteca estándar
con controles de consentimiento y opt-in; no usan FastMail.
Se retiró `fastapi-mail` de `requirements.txt` en lugar de
actualizar sus dependencias cruzadas (Pydantic, cryptography,
httpx, aiosmtplib) innecesariamente en este mismo bloque.
El test `test_mail_workers_do_not_depend_on_removed_fastapi_mail`
busca imports activos de la biblioteca retirada en todo
`backend/app`, protegiendo el contrato del proyecto.

Nuevos objetivos: **214 pruebas** (206 baseline JWT + siete
HTTP iniciales + guard de correo). El resultado queda
pendiente de ejecutar sobre una imagen nueva y coherente.
Las pruebas de notificaciones, colas, recuperación de carritos
y posventa forman parte del suite completo; los procesos SMTP
con envío externo siguen deshabilitados por defecto.

### Validación obligatoria de recuperación

```bat
cd /d C:\Users\jjcor\Documents\Github\HJStoreVP
git switch main
git status --short
git pull --ff-only origin main
docker compose build backend
docker compose up -d --no-build backend
docker compose exec backend python -m pip check
docker compose exec backend python -c "from importlib.metadata import version; print('FastAPI',version('fastapi'),'Starlette',version('starlette'),'multipart',version('python-multipart'))"
docker compose exec backend python -m pytest tests/test_http_stack_migration.py tests/test_security_hardening.py tests/test_notifications.py tests/test_engagement.py -q
docker compose exec backend python -m pytest tests/ -q
docker compose exec backend alembic current
docker compose ps
```

**Importante:** no ejecutar `docker compose down -v`, no borrar
MariaDB ni asumir que `pip check` y pytest de un contenedor
anterior prueban el cambio. El procedimiento separa `build`
de `up --no-build` para impedir que se reinicie el backend
si la imagen nueva falla al instalarse.


## Séptima entrega — ajuste de contrato HTTPBearer en FastAPI 0.165.0

La validación local aportada tras quitar `fastapi-mail` confirma
`docker compose build backend` correcto, `pip check` limpio,
FastAPI 0.165.0, Starlette 1.10.0, python-multipart 0.0.34,
42 pruebas dirigidas aprobadas, contenedores saludables y
Alembic `20261120_18 (head)`.

La ejecución de regresión completa obtuvo **212 aprobadas y dos
fallidas**, exclusivamente:
`TestAuth.test_me_unauthenticated` y
`TestProducts.test_create_product_unauthorized`. Ambas exigían
403 ante la ausencia total de cabecera de autenticación.
HTTPBearer del framework nuevo responde correctamente **401**
y el challenge `WWW-Authenticate: Bearer` bajo este escenario.
Esto es un cambio de contrato del framework, no evidencia de
pérdida de autorización ni error comercial.

Se ajustaron **solo esas dos expectativas** en
`backend/tests/test_main.py`, incluyendo comprobación del
challenge de autenticación. No se modificaron endpoints, roles,
`HTTPBearer`, el modelo de datos ni el comportamiento de producción.
Se añadió un test explícito en `test_http_stack_migration.py`
que conserva **403 para usuarios autenticados sin rol suficiente**.

### Puerta de aceptación

```bat
git pull --ff-only origin main
docker compose exec backend python -m pytest tests/test_main.py::TestAuth::test_me_unauthenticated tests/test_main.py::TestProducts::test_create_product_unauthorized tests/test_http_stack_migration.py::test_authenticated_user_without_role_remains_forbidden -q
docker compose exec backend python -m pytest tests/ -q
docker compose exec backend alembic current
docker compose ps
```

**Meta:** 215 pruebas completas (214 del conjunto previo, más
una nueva prueba de control de roles). El número todavía no es
resultado certificado de CI ni de Docker local, hasta recibir
una ejecución posterior de la nueva revisión.

Como no se cambiaron `requirements.txt`, servicios ni imágenes
con esta corrección de pruebas, el contenedor backend en desarrollo
tiene el código nuevo por el bind mount `./backend:/app`; no
es necesario reconstruir la imagen para ejecutar estas pruebas.
No ejecutar `docker compose down -v`.


## Octava entrega — Pillow y cryptography (pendiente de validar)

La actualización HTTP precedente fue validada en Docker local:
215/215 pruebas aprobadas, cinco contenedores levantados, backend,
MariaDB y Redis saludables, Alembic `20261120_18 (head)`.
Las advertencias de obsolescencia permanecen como deuda técnica
separada y no deben silenciarse globalmente.

A partir del artefacto de auditoría Fase D #21, los avisos
agrupados requieren llegar, como mínimo, a Pillow 13.0.0
(53 identificadores distintos; varios solucionados en esa
versión) y cryptography 49.0.0 (6 identificadores distintos).
`requirements.txt` fija ahora ambas versiones. Son cambios
mayores que todavía no están validados sobre el backend de
desarrollo. No se deduce ausencia total de CVE sin una nueva
ejecución de `pip-audit`.

Las nueve pruebas nuevas en
`backend/tests/test_image_crypto_migration.py` verifican
la versión instalada, transformación a WEBP desde PNG/JPEG/WEBP/GIF,
conservación del canal alfa, rechazo de entrada inválida,
cifrado y descifrado Fernet MFA, rechazo de manipulación de
ciphertext y rechazo tras cambiar la clave. El código de
procesamiento de imágenes y el cifrado operativo no se
modificaron, y los archivos históricos no se reescriben.

### Validación segura en Windows + Docker

```bat
cd /d C:\Users\jjcor\Documents\Github\HJStoreVP
git switch main
git status --short
git pull --ff-only origin main
docker compose build backend
docker compose up -d --no-build backend
docker compose exec backend python -m pip check
docker compose exec backend python -m pytest tests/test_image_crypto_migration.py tests/test_security_hardening.py tests/test_profile_mfa.py -q
docker compose exec backend python -m pytest tests/ -q
docker compose exec backend alembic current
docker compose ps
```

Si `docker compose build backend` falla no ejecutar el
`up` siguiente: la imagen anterior se mantiene operativa.
La suite objetivo tiene **224 pruebas** (215 validadas
anteriormente + 9 nuevas). Si falla alguna, detener la
actualización, compartir el mensaje exacto y corregir la
incompatibilidad, no relajar los tests. No activar SMTP
real ni ejecutar `down -v`.

Tras validar, obtener un artefacto de auditoría fresco en
GitHub Actions. Los hallazgos de frontends, los lockfiles y las
advertencias de datetime/TestClient siguen pendientes.
