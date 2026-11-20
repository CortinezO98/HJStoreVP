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
