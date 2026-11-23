# C-01 — Pagos de demostración

El entorno por defecto es production, DEBUG=false y ALLOW_DEMO_PAYMENTS=false.
Solo development y test admiten habilitar pagos demo explícitamente.
En staging y production se rechaza el flag y se oculta la documentación API.
En desarrollo Docker habilita el flag en el backend; producción lo fija en false.
Ejemplo de variables (solo desarrollo local):

```dotenv
ENVIRONMENT=development
DEBUG=false
ALLOW_DEMO_PAYMENTS=true
```

No se activa Wompi real. Validar con pytest y builds antes de integrar a main.
