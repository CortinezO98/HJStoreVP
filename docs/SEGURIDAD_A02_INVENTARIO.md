# A-02 — Protección de inventario

Checkout: máximo 20 unidades por referencia vendible, 50 líneas y tres pedidos web pendientes por cliente. El bloqueo de fila de usuario y lecturas actuales serializan altas en MariaDB; los reintentos idempotentes se resuelven antes del límite.
El worker independiente procesa hasta 200 pedidos por lote con transacciones por pedido. Solo cancela si todas las reservas están vencidas y retenidas, el pedido sigue pendiente y no hay método ni referencia de pago. No consulta pasarelas ni cancela pagos inciertos.
Por defecto está deshabilitado. Tras validar y autorizar sobre el entorno apropiado, configurar ORDER_EXPIRATION_WORKER_ENABLED=true y ejecutar docker compose --profile reservations up -d reservation-worker. No activar sobre datos comerciales sin autorización.
Las pruebas SQLite validan reglas funcionales, no reproducen bloqueos concurrentes de InnoDB: verificar concurrencia en MariaDB aislada antes de producción.
