# HJStoreVP · Fidelización y recuperación de carritos abandonados

## Alcance

Esta fase agrega un **programa inicial de fidelización de puntos** y un
**carrito sincronizado por usuario**, con recordatorios de recuperación
opcionales y sujetos a consentimiento expreso.

No modifica productos, precios, cupones, reservas, pasarelas ni DIAN.
No hay descuentos automáticos por puntos ni canje: el balance se muestra
como indicador de fidelidad, no como dinero, monedero o crédito.

## 1. Puntos HJStoreVP

- El saldo se calcula desde filas de `loyalty_ledger`:
  `SUM(points_delta)`; no existe un saldo editable por administrador.
- Regla inicial **1 punto por cada $1.000 COP completos de productos pagados**,
  después del descuento del cupón y **sin incluir el envío**.
- Solo para clientes registrados (rol `customer`), con pago confirmado.
- Registro en la misma transacción de `mark_paid` (checkout y webhooks).
- `event_key` único por orden impide doble acreditación si el webhook
  del proveedor se repite.
- Reembolsos documentados externamente generan ajustes negativos de puntos
  en un registro separado; no se ejecutan reembolsos monetarios.
- Los ajustes no dejan el saldo de puntos ganados de una misma orden en
  negativo. El cálculo se basa en el importe histórico registrado; el
  prorrateo fino con descuentos por línea queda pendiente.
- Niveles informativos: **Bronce** (<150 puntos), **Plata** (150–499),
  **Oro** (500+).
- `redeem_enabled=false`: los puntos **no pueden canjearse** por artículos,
  dinero, cupones ni créditos. Reglas de beneficios/caducidad pendientes
  de definir comercialmente antes de habilitar redenciones.

## 2. Carritos sincronizados

El carrito habitual sigue existiendo en Zustand y en el navegador; el
módulo añade almacenamiento por cliente autenticado:
`saved_customer_carts` (clave: `user_id`).

- Se guardan únicamente **IDs de producto y cantidades**; no precios,
  direcciones, datos bancarios ni otros campos del carrito local.
- La tienda sincroniza cambios con debounce ~900ms, cuando existe una
  sesión autenticada con rol cliente. Los visitantes pueden usar
  el carrito local normalmente sin sincronización al backend.
- En Mi cuenta se puede ver, **restaurar** o **eliminar** el carrito guardado.
- Al restaurar se consulta cada producto del catálogo y se vuelven
  a validar precios y existencias; no se reserva inventario por guardar.
- Si el pago se confirma para la misma combinación exacta de productos y
  cantidades, se limpia el carrito almacenado y se cancelan sus avisos
  pendientes. No se borra un carrito distinto creado después de la compra.
- El navegador no envía ni fija montos económicos en los registros de carrito.

## 3. Consentimiento

Cada cliente dispone de preferencias independientes en
`customer_engagement_preferences`:

- `recovery_email_opt_in`: recordatorios de carrito
- `marketing_email_opt_in`: futuras ofertas generales

**Ambas se inicializan en falso.** Ninguna se activa automáticamente
al registrarse, crear un pedido o navegar la tienda.

El cliente puede activar/desactivar cada permiso en **Mi cuenta**. Al
retirar consentimiento de recuperación se cancelan avisos programados.
La API solo permite a un cliente consultar/editar sus propias preferencias
y su carrito. El Super Admin solo tiene KPIs agregados, sin exponer
direcciones ni carritos individuales.

La aceptación de marketing no implica envío de correos en esta etapa:
no existe motor de campañas de marketing masivo.

## 4. Recuperación automatizable

Cuando un cliente con consentimiento activo guarda un carrito no vacío,
el backend crea una fila en `cart_recovery_notices` con
`due_at = now + 24 horas` y revisión de carrito.

Al cambiar, vaciar o comprar el carrito, las notificaciones obsoletas se
cancelan. Un worker separado (`cart_recovery_worker.py`) puede examinar
avisos vencidos, siempre que:

1. El cliente continúa activo y ha optado por recibir recordatorios.
2. El carrito sigue no vacío y con la **misma revisión**.
3. Han transcurrido 24h desde la última modificación.
4. No existe correo de recuperación enviado en los últimos 7 días.
5. Las credenciales SMTP y el dominio/base URL son seguros.
6. Se habilitó **explícitamente** la función, incluso en producción.

Un recordatorio solo invita a visitar `/carrito` después de iniciar
sesión, sin incluir productos, importes ni tokens personales en el
mensaje. No se garantizan precios ni existencias.

Los correos se envían con semántica **al menos una vez**: un corte entre
aceptación SMTP y persistencia del estado puede provocar duplicados.
Después de 3 fallos se marca `failed`, sin exponer la respuesta SMTP.

### Apagado por defecto

```dotenv
EMAIL_NOTIFICATIONS_ENABLED=false
EMAIL_LIVE_DELIVERY_ALLOWED=false
CART_RECOVERY_DELIVERY_ENABLED=false
CART_RECOVERY_LIVE_ALLOWED=false
STORE_PUBLIC_URL=http://localhost:5173
```

En el código incluido, la cola no se envía ni activa por sí sola.
El proceso Docker opcional se define bajo perfil `cart-recovery`;
**no se inicia** con `docker compose up` normal.

Solo tras pruebas integrales, consentimiento documentado y una
configuración SMTP verificada se evaluará encender el trabajador.
También deben revisarse requisitos de protección de datos personales,
política de tratamiento, revocación y legitimidad de uso de correo.

## 5. API

- `GET/PUT /api/v1/engagement/preferences` — permisos del cliente
- `GET/PUT /api/v1/engagement/cart` — lectura/guardado privado del carrito
- `GET /api/v1/engagement/loyalty` — saldo y últimos movimientos
- `GET /api/v1/engagement/admin/overview` — métricas agregadas, Admin/Super Admin

### Restricciones expresas

No existe aún atribución real de conversiones recuperadas, campañas de
WhatsApp/SMS, cupones por nivel, canje de puntos, sincronización
multidispositivo bidireccional automática ni integración fiscal.
Los puntos se cuentan como fidelidad informativa; no son gasto,
pasivo o reconocimiento contable calculado por esta fase.

## 6. Datos y despliegue

Nueva migración **aditiva** `20261109_09_loyalty_cart.py` dependiente de
`20261109_08_coupons.py`, creada después del PR #13.

Tablas nuevas:
- `customer_engagement_preferences`
- `saved_customer_carts`
- `cart_recovery_notices`
- `loyalty_ledger`

No se ha ejecutado Alembic, ni cambiado la base local, ni desplegado
Docker. No ejecutar `docker compose down -v` ni aplicar migraciones
sin respaldo y revisión del historial.

CI: compilación de frontends y regresiones backend básicas durante
desarrollo. **Las pruebas integrales con MariaDB, pagos reales, correo,
concurrencia y roles siguen para la etapa final**, según lo acordado.

La facturación electrónica DIAN permanece reservada para la última fase.
