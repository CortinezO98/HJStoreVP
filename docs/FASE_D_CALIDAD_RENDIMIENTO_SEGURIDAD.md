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
