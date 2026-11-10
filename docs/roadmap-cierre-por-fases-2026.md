# HJStoreVP — Hoja de ruta de cierre por fases (2026-11-09)

Estado: plan operativo derivado del código auditado y los PR integrados. El estado de una función en código **no implica** despliegue o habilitación en producción.

## Fase 1 — Consolidación GitHub (completada a nivel código)
- [x] Fusionar PR #13 (promociones/cupones) en main.
- [x] Cambiar base del PR #14 a main y fusionar fidelización/carritos.
- [ ] Verificar el estado del esquema y de alembic_version **en una copia** antes de migrar datos reales.
- [ ] Validar que el entorno local esté usando el código actualizado, no una revisión anterior del ZIP/texto.

## Fase 2 — Seguridad e integridad (siguiente)
- [ ] Retirar/aislar scripts de depuración que incluyen credenciales conocidas y cambios de contraseñas.
- [ ] Reemplazar valores débiles por defecto de DB/SECRET_KEY por configuración obligatoria segura en producción.
- [ ] Reforzar carga de imágenes (verificar contenido real, extensión derivada del contenido, limpieza consistente, límites).
- [ ] Auditar permisos backend en inventario, usuarios, ventas físicas, pedidos, notificaciones y reportes.
- [ ] Revisar atomicidad de transferencias y ajustes de inventario; validar transacciones concurrentes al final.
- [ ] Revisar bootstrap/admin seed sin truncamientos y sin credenciales predeterminadas productivas.
- [ ] Revisar exposición de Redis/MariaDB y mounts de desarrollo en Compose; preparar archivo de despliegue endurecido.
Criterio de cierre: cambios aditivos y auditables, CI verde, sin alteración de operaciones existentes.

## Fase 3 — Omnicanal
- [ ] Revisar ventas por sede, apertura/cierre de caja, arqueo y auditoría de anulaciones.
- [ ] Conciliar stock web y físico, entradas, ajustes y transferencias.
- [ ] Mejorar gestión administrativa de sedes/vendedores sin ampliar permisos.

## Fase 4 — Experiencia de tienda
- [ ] Búsqueda, filtrado, ordenación, fichas de producto, variantes y favoritos según alcance comercial.
- [ ] Optimizar imágenes, SEO, metadatos, accesibilidad y comportamiento responsive.
- [ ] Revalidar precio y disponibilidad en servidor antes de compra.

## Fase 5 — Automatización comercial
- [ ] Definir y desarrollar canje seguro de puntos, vigencia, reversión y reglas antifraude.
- [ ] Mejorar campañas de recuperación de carrito y su atribución sin enviar correos sin opt-in.
- [ ] Configuración administrable de políticas y métricas con control de presupuesto.

## Fase 6 — Logística y pagos
- [ ] Cotización/guías/seguimiento por API de transportadora cuando se contrate proveedor.
- [ ] Conciliación automática de pagos y reservaciones vencidas considerando pagos tardíos.
- [ ] Reembolsos por API solo con proveedor habilitado, idempotencia y evidencia verificable.

## Fase 7 — Atención
- [ ] Chatbot FAQ, catálogo y consulta autenticada de pedidos, escalamiento a humano y registro seguro.

## Fase 8 — Preparación productiva
- [ ] Inventario de secretos, despliegue sin --reload, TLS, dominios, seguridad Docker, monitoreo y respaldos/restauración.
- [ ] Configurar SMTP/SPF/DKIM/DMARC; mantener entrega real desactivada hasta autorización.
- [ ] Reconciliar Alembic y esquema histórico tras respaldo verificado, sin seeds destructivos.

## Fase 9 — Pruebas integrales y publicación
- [ ] Ejecutar pruebas E2E, regresión, concurrencia real MariaDB, sandbox Wompi, seguridad por roles y recuperación ante fallos.
- [ ] Ejecutar despliegue controlado y comprobar restauración de backups.

## Fase 10 — Facturación electrónica DIAN (última fase funcional)
- [ ] Confirmar RUT, obligación tributaria, régimen, impuestos y numeración con comercio/contador.
- [ ] Seleccionar y contratar proveedor habilitado o modalidad oficialmente permitida.
- [ ] Emitir, validar, conservar y entregar XML/documentos reales, incluyendo notas crédito, tras habilitación.
- [ ] No llamar factura electrónica a comprobantes internos actuales.

## Reglas invariables
- No ejecutar migraciones ni borrar datos productivos sin respaldo y revisión de alembic_version.
- No ejecutar seed_final.py, TRUNCATE ni docker compose down -v en ambientes con datos.
- Mantener deshabilitados pagos live y SMTP hasta habilitación explícita.
- Reservar pruebas integrales para el final; CI, compilaciones y análisis estático pueden correr durante el desarrollo.
- No inventar integración DIAN, transportadora o proveedor financiero sin conexión verificable.
