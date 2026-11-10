# HJStoreVP — Preparación tributaria y arquitectura DIAN

## Alcance real de esta entrega

La fase configura información tributaria del negocio y clasificaciones de
productos, sin cambiar pedidos, precios, pagos, comprobantes internos, ventas
físicas ni el panel original. **No existe emisión DIAN en este módulo.**

El Super Administrador incorpora la pantalla `/configuracion-dian`.
Solo ADMIN / SUPER_ADMIN puede consultar/editar estos datos; el vendedor y
el cliente carecen de permisos. Todo se almacena en la misma MariaDB mediante
las nuevas tablas `tax_issuer_profiles` y `product_tax_profiles`.

### Perfil del emisor

- Razón social, identificación tributaria, dígito verificador (si aplica)
- Persona natural/jurídica, régimen y responsabilidades fiscales según RUT
- Actividades económicas, dirección/municipio/departamento y correo fiscal
- Modalidad deseada: pendiente, Facturación Gratuita DIAN, software propio,
  proveedor tecnológico habilitado
- Nombre del proveedor previsto (no significa que esté autorizado)
- El estado de configuración siempre es `draft`: no certifica habilitación
  tributaria

### Catálogo fiscal de productos

- Tratamiento: por clasificar, gravado, exento, excluido o no sujeto
- Tasa porcentual solo cuando el tratamiento se establece como gravado
- Código de clasificación opcional y comentario contable
- Marca declarativa de revisión por contador; **no equivale a una
  certificación de la DIAN**
- Ninguna tarifa se establece por defecto: el tipo de producto NO permite
  inferir el impuesto aplicable. Esta fase no liquida IVA/INC ni los incluye
  en el precio o en los comprobantes existentes.

### Diagnóstico de preparación

`GET /api/v1/tax-readiness/readiness` compara productos activos con
clasificaciones revisadas, y presenta pendientes de operación.

El endpoint mantiene siempre:

```json
{
  "status": "preparation_only",
  "can_issue_electronic_invoices": false
}
```

No se puede cambiar este estado desde el navegador. Las condiciones
de habilitación real DIAN, firma, numeración y proveedor se marcan como NO
verificadas, hasta crear una integración con evidencia real.

## Arquitectura prevista

```text
Venta confirmada → Documento comercial interno ya existente (PR #10)
                  ↓
          [Clasificación fiscal validada]
                  ↓
          [Adaptador fiscal seleccionado]
                  ↓
    [Proveedor tecnológico / Software propio]
                  ↓
       [Validación/aceptación DIAN]
                  ↓
 [XML auténtico + representación gráfica + CUFE/CUDE]
                  ↓
       [Entrega privada al comprador]
                  ↓
[Devolución → Nota crédito oficial relacionada y auditada]
```

En `app.services.dian_adapter` se definen interfaces tipadas
`FiscalSubmission`, `FiscalResult`, `FiscalAdapter`.
**El único adaptador actual es `DisabledFiscalAdapter`**: intentar emitir o
consultar una factura externa genera `FiscalIssuanceDisabled`.
No hay HTTP saliente, almacenamiento de certificados, rangos de numeración,
XML UBL, firma, CUFE ni endpoints para emitir documentos oficiales.

## Decisión de modalidad

Según información pública oficial, la DIAN contempla:

1. Facturación Gratuita DIAN: operación gratuita y su propio flujo de
   habilitación, con limitaciones para integración automática aún por evaluar.
2. Software propio: implementación y habilitación técnica con el anexo
   vigente, certificado, firma, XML, requisitos y set de pruebas.
3. Proveedor Tecnológico habilitado: integración contractual/API de un
   proveedor que figure vigente en el catálogo DIAN. Confirmar el contrato,
   costes y capacidades reales de notas crédito/débito, consulta de estado
   y entrega.

Para este proyecto se recomienda **estudiar primero un proveedor tecnológico
habilitado**, por menor carga de mantenimiento fiscal, pero la selección
requiere una comparación comercial y técnica antes de vincularse.

## Prerrequisitos que NO deben suponerse

- RUT real de la persona o empresa que factura y responsabilidades tributarias
- Obligación o excepción legal de facturar, validada con contador
- Tratamiento tributario de cada categoría/producto
- Modalidad de operación oficialmente habilitada
- Certificado, rango autorizado y datos de producción, cuando correspondan
- Identificación fiscal de comprador, impuestos y descuentos detallados
- Mecanismos de idempotencia del proveedor, tratamiento de eventos fuera
  de orden, almacenamiento privado XML/PDF y soportes de aceptación DIAN
- Flujo de nota crédito oficial vinculada a factura electrónica real
- Reglas de contingencia y retención de documentos

**No añadir datos tributarios inventados, NIT ficticio, CUFE, numeración,
IVA, XML o firma de pruebas a una factura que se presente como real.**

## Seguridad y continuidad

- El formulario no admite tokens API, certificados, contraseñas ni llaves
  privadas. Estas deberán almacenarse en secretos de backend cuando se
  seleccione un proveedor.
- No hay conexión externa ni envío de datos a DIAN.
- Las clasificaciones no modifican `products.sale_price`, `orders`,
  `order_items`, inventario ni `commercial_documents`.
- La revisión técnica y el respaldo de MariaDB son obligatorios antes de
  aplicar la migración aditiva
  `backend/alembic/versions/20261109_07_tax_readiness.py` (depende de
  `20261109_06_commercial_documents.py`).
- **No ejecutar ahora migraciones ni reiniciar Docker con datos reales.**
- Las pruebas de integración completas con proveedor/DIAN se harán al final
  del proyecto, como se acordó; durante el desarrollo se conservan los
  chequeos automáticos de compilación y regresiones básicas.

## Fuentes DIAN consultadas (noviembre de 2026)

- https://micrositios.dian.gov.co/sistema-de-facturacion-electronica/que-requieres-para-factura-electronicamente/
- https://micrositios.dian.gov.co/sistema-de-facturacion-electronica/como-puedes-facturar-electronicamente/
- https://micrositios.dian.gov.co/sistema-de-facturacion-electronica/requerimientos-para-ser-facturador-electronico/
- https://micrositios.dian.gov.co/sistema-de-facturacion-electronica/documentacion-tecnica/
- https://micrositios.dian.gov.co/sistema-de-facturacion-electronica/proveedores-tecnologicos/
