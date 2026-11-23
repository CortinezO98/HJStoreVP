# A-03 — Protección de autenticación e IP

Límites por ventana fija de 900 segundos: par cuenta/IP 5, cuenta 50, IP 30.
Los tres contadores de fallos se actualizan atómicamente en Redis. Una autenticación válida solo limpia el par, nunca los contadores globales. La verificación previa y el registro posterior no reservan cupos de solicitudes en vuelo: validar concurrencia real en Redis antes de producción.

Uvicorn no interpreta encabezados en la imagen de producción. La aplicación solo acepta un único X-Forwarded-For de un peer autorizado individualmente; el proxy candidato tiene IP fija 172.30.83.10 en la red edge 172.30.83.0/24 y sobrescribe encabezados recibidos.

El proxy HTTP candidato está limitado a loopback. Antes de publicar, integrar TLS en ese proxy o diseñar explícitamente la cadena de confianza con el terminador TLS; un proxy externo delante de api-edge hará que este vea su IP, no la del visitante. No confiar en la puerta de enlace Docker ni en redes completas. No publicar directamente el backend. Validar conflictos de subred y pruebas de extremo a extremo en infraestructura aislada.

Redis indisponible bloquea autenticación en staging y producción. No activar el compose de producción durante pruebas locales.
