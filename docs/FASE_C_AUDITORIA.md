# HJStoreVP — Fase C: auditoría administrativa (primera entrega en main)

## Alcance implementado

Bitácora central `security_audit_events` con firma HMAC individual, actor ID,
acción, entidad, identificador, fecha UTC y metadatos **estrictamente permitidos**.
No guarda encabezados, cuerpos HTTP, correos, teléfonos, contraseñas, tokens, QR,
secretos TOTP ni códigos de recuperación. Los intentos de login desconocidos
se referencian por una huella HMAC irreversible del correo, no por el correo.

Instrumentación en login, verificación MFA, cambios de correo/contraseña/perfil,
activación/desactivación MFA, rotación de códigos y revocación de sesiones.
Los endpoints de usuarios registran creación, edición, suspensión/reactivación,
reseteo administrativo de contraseña y baja lógica. Las mutaciones se auditan
en la misma transacción que el cambio; los accesos fallidos se registran en
una transacción aparte sin persistir contraseñas.

Ruta `GET /api/v1/security-audit` solo SUPER_ADMIN en backend, paginación
hasta 100 filas, filtros actor/acción/recurso/resultado/fechas; además resumen
`GET /api/v1/security-audit/summary`. En el panel, sección
`/auditoria-seguridad` protegida para superadministradores.

Se conservan las bitácoras de inventario, despachos, posventa y documentos
comerciales existentes. Esta primera entrega **no integra aún todos sus eventos
en la tabla central**; no debe afirmarse cobertura comercial total.

## Integridad y límites

HMAC por fila detecta alteraciones cuando el atacante no conoce la SECRET_KEY.
No es un registro WORM, encadenado criptográficamente ni externo a la misma BD.
Un administrador con privilegios de borrar filas podría eliminarlas sin que
la firma individual lo detectara. Para producción, replicar fuera de banda
a almacenamiento inmutable y revisar permisos SELECT/INSERT separados; implantar
retención y restauración verificadas. Si se cambia SECRET_KEY, se requiere plan de
migración de firmas para conservar la verificación histórica. La baja física de un
actor referenciado puede convertir actor_id en NULL por la FK y romper su firma:
usar bajas lógicas y diseñar retención histórica antes de depurar usuarios.

## Migración y aceptación

`revision=20261120_18`, `down_revision=20261120_17`.
Crear respaldo consistente y comprobar `alembic current` y `alembic heads`.
No ejecutar en bases compartidas sin respaldo probado. En desarrollo,
`create_all` puede crear la tabla antes que Alembic.

Verificar `python -m pytest tests/test_user_lifecycle.py
tests/test_profile_mfa.py tests/test_security_audit.py -v` y
`npm run build` en frontend-admin. Probar acceso de Super Admin y rechazo
403 para Admin/Seller. Los tests del CI global permanecen independientes y
deben abordarse para aprobación productiva.

## Exportación

`GET /api/v1/security-audit/export` acepta los filtros de búsqueda,
exporta solo 500 entradas recientes y exige SUPER_ADMIN. Las celdas de texto
se neutralizan para evitar fórmulas al abrir en hojas de cálculo. No incluye
firmas HMAC ni secretos; los permisos y límites se aplican en el backend.


## Ampliación de la Fase C — consulta comercial unificada

Ruta privada `GET /api/v1/commercial-audit` y exportación
`GET /api/v1/commercial-audit/export`, únicamente para SUPER_ADMIN.
Vista `/auditoria-comercial`. Consultas de solo lectura y sin duplicar
ni alterar tablas comerciales. Paginación hasta 100 eventos por solicitud
y CSV limitado a 500 eventos filtrados; mitigación contra fórmulas CSV.

La vista combina mediante UNION ALL los historiales que realmente
existen: `stock_movements`, `shipment_events`, `post_sale_events`,
`commercial_document_events` y `product_quality_review_events`.
Solo expone IDs, actor, acción, módulo y fecha. No muestra notas,
identificadores de pago, cliente ni contacto. Las filas del origen se
marcan `source_history_unverified`, pues no poseen firma central retroactiva.
Esta consulta **no es un historial completo de transiciones de pedidos**:
no todos los módulos tienen evento histórico para cada cambio. Esa
instrumentación requiere una fase posterior específica por proceso.

## Comprobación de integridad central

`GET /api/v1/security-audit/integrity` (SUPER_ADMIN) verifica hasta
5.000 firmas existentes por solicitud (1.000 por defecto). Acepta fechas
desde/hasta, indica resultado parcial y muestra IDs con firmas inválidas.
**No detecta registros eliminados** ni demuestra que todo el historial exista.

## Conservación y evidencias externas

Política: **conservar por defecto; no purgar automáticamente registros**.
Cualquier plazo de retención debe aprobarse según obligaciones legales,
contables y de privacidad en Colombia, después de clasificar cada tipo
de evidencia; no asumir que existe un único plazo universal.

Herramientas voluntarias, solo lectura:

- `backend/scripts/export_audit_snapshot.py`: exporta hasta 50.000
  eventos centrales a JSONL con sus firmas, un SHA-256 y un manifiesto
  firmado HMAC. Se niega a exportar si detecta firmas inválidas o si
  el volumen supera el límite para impedir que una muestra se anuncie
  como evidencia completa.
- `backend/scripts/verify_audit_snapshot.py`: verifica fuera de banda
  HMAC del manifiesto, SHA-256 del contenido, conteo, rango de IDs y
  firmas de cada evento. No modifica ni el archivo ni la base de datos.

**Procedimiento de producción**: respaldar primero la base; montar un
volumen privado de almacenamiento independiente (no público), con
cuenta de servicio limitada; ejecutar la exportación en ventana controlada;
copiar el resultado a almacenamiento inmutable con versiones y retención
aprobada; probar la verificación en otro entorno. No guardar `SECRET_KEY`
en archivos ni entregar la clave junto con evidencias. Rotar la clave
solo con estrategia que preserve la verificabilidad de históricos.

La herramienta NO crea ni configura almacenamiento remoto, WORM,
programación periódica ni eliminación: su automatización queda bloqueada
hasta definir proveedor de almacenamiento, políticas y credenciales.
Tampoco transforma los historiales comerciales existentes en evidencias
criptográficamente inmutables.

## Verificaciones para actualizar main

Después de `git pull --ff-only origin main`:

```bat
docker compose up -d --build backend frontend-admin
docker compose exec backend python -m pytest tests/test_user_lifecycle.py tests/test_profile_mfa.py tests/test_security_audit.py tests/test_commercial_audit.py -v
docker compose exec frontend-admin npm run build
docker compose exec backend alembic current
docker compose exec backend alembic heads
```

Si `current` continúa en `20261120_17` y `heads` en `20261120_18`,
verificar primero respaldo de MariaDB y tabla `security_audit_events`;
solo después aplicar `docker compose exec backend alembic upgrade head`.
Es una migración aditiva que no cambia tablas comerciales.


## Refinamiento final — cambios de precios y transiciones de pedidos

La captura se ejecuta en `Session.before_flush`, en la misma transacción
que la modificación original de modelos ORM. Se registran:

- `catalog.prices.changed` para `Product.cost_price`, `margin_pct` y
  `sale_price`, incluyendo variantes. Solo se guardan valores anteriores
  y posteriores de los campos efectivamente cambiados, como cadenas
  decimales (sin floats).
- `orders.status.changed` para cambios efectivos de `Order.status`
  (por ejemplo pago, cancelación, preparación, despacho y entrega),
  incluidos flujos de webhooks y servicios de reservas/despachos.

El listener no altera lógica comercial, estado, inventario, pago,
referencias, notificaciones ni devoluciones. No registra operaciones
sin cambios de valores ni nuevos pedidos/productos como si fuesen
transiciones históricas. Un rollback descarta negocio **y** bitácora.
`active_history` hace recuperar valores anteriores de columnas
monetarias y estado al asignar nuevos valores a instancias expiradas.

Los metadatos quedan en listas blancas, el campo `origin` diferencia
`authenticated` de `system` y el actor se asocia mediante
`db.info["audit_actor_id"]` solo después de validar el JWT. Webhooks
y procesos sin usuario autenticado indican actor nulo y origen sistema;
la ausencia de actor no demuestra qué proveedor originó el evento.

La API `/api/v1/security-audit` y la exportación CSV aceptan ahora
`target_id`, que permite investigar un ID de pedido o producto;
el panel permite filtrar recurso `orders` o `catalog`.
No se añaden tablas ni migraciones: **permanece Alembic
`20261120_18`**. La auditoría solo cubre cambios a través de
instancias SQLAlchemy ORM con seguimiento de atributos; una sentencia
SQL nativa o `query.update()` directa no disparará este listener.
No se recuperan eventos de modificaciones históricas anteriores
a la instalación. El destino de evidencia externa sigue siendo
configurable manualmente, no existe un proveedor WORM habilitado.

### Comprobación de aceptación

```bat
git switch main
git pull --ff-only origin main
docker compose up -d --build backend frontend-admin
docker compose exec backend python -m pytest tests/test_user_lifecycle.py tests/test_profile_mfa.py tests/test_security_audit.py tests/test_commercial_audit.py tests/test_commercial_change_audit.py -v
docker compose exec frontend-admin npm run build
docker compose exec backend alembic current
docker compose ps
```

Comprobar que modificar un precio real desde Admin genera un evento
`catalog.prices.changed` con valores antes/después y actor, y que
el cambio de estado de un pedido válido genera `orders.status.changed`
sin duplicados. Probar rollback y estado sin cambios con las pruebas
automatizadas. No realizar transacciones monetarias reales solo para
probar eventos. La batería general del proyecto y seguridad de
dependencias siguen como pendientes transversales antes de producción.
