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
