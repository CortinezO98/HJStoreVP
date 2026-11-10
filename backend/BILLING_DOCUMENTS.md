# HJStoreVP — Facturación, comprobantes y notas crédito (fase documental)

## Propósito

Esta entrega añade documentación comercial interna vinculada a ventas web,
ventas de punto físico y devoluciones de clientes. **NO es un facturador
electrónico habilitado ante la DIAN**. En ningún caso el archivo descargado
puede reemplazar factura de venta o nota crédito electrónica cuando se
requiera ese documento tributario.

El comercio debe conservar su procedimiento de facturación autorizado
mientras se prepara la integración fiscal. No se autoriza usar números
consecutivos internos como resolución DIAN.

## Componentes

- **Comprobantes internos de compra**: un registro por pedido pagado,
  importe de la venta original, desglose de productos y envío.
  Documentos idempotentes mediante referencia única `HJ-COMP-{order_id}`.
  Incluye ventas físicas registradas como PAID en el punto.
- **Borradores de ajuste por devolución**: disponibles únicamente para
  Super Admin/Admin después de un caso posventa de tipo devolución, recepción
  física y reembolso externo registrado. Se vinculan al comprobante interno
  original mediante `HJ-AJUSTE-{case_id}`. Nunca se presentan como una
  nota crédito validada.
- **Captura documental inmutable**: se guarda snapshot histórico de cantidades,
  productos, importes y referencias. Posteriores cambios en catálogo o precios
  no alteran el documento.
- **Bitácora de generación**: cada documento añade una fila de
  `commercial_document_events`. No hay editor que altere el snapshot.
- **Descarga HTML imprimible** desde el Super Administrador o el cliente
  propietario en `Mi cuenta`. El navegador puede imprimir/guardar como PDF.
  No se genera XML UBL, firma ni PDF tributario.
- Se muestran advertencias explícitas de no validez como factura DIAN tanto
  en interfaz como dentro del HTML.

## Permisos

| Función | Cliente web | Admin/Super Admin | Vendedor |
| --- | --- | --- | --- |
| Comprobante de pedido web propio pagado | Sí | Sí | No |
| Comprobante venta física del punto asignado | No | Sí | API del punto |
| Lista y detalle propios | Sí | Sí | Solo documento autorizado del punto |
| Listado global | No | Sí | No |
| Borrador de nota crédito | No | Sí | No |

La API comprueba permisos contra el pedido real, no contra el `order_id`
proporcionado por React. Los documentos borrador están restringidos
exclusivamente a roles administrativos.

## Endpoints

- `POST /api/v1/billing/receipt/{order_id}`: crear o devolver comprobante interno.
- `POST /api/v1/billing/credit-note-draft/{case_id}`: crear o devolver borrador.
- `GET /api/v1/billing/mine`: comprobantes del cliente autenticado.
- `GET /api/v1/billing/admin`: listado administrativo (200 más recientes).
- `GET /api/v1/billing/{id}`: detalle autorizado, con snapshot y eventos.
- `GET /api/v1/billing/{id}/print`: descarga HTML (no se envían tokens en URL).

El módulo del Super Administrador aparece en `/comprobantes`.
Los once módulos previos del menú no se eliminan ni cambian permisos.

## Migración

Se añaden las tablas `commercial_documents` y
`commercial_document_events` mediante la revisión Alembic
`20261109_06_commercial_documents.py`, sucesora de
`20261109_05_post_sale.py` del PR #9.

No aplicar migraciones sobre tu MariaDB actual hasta completar el resto del
desarrollo, respaldar la base y revisar el estado real de `alembic_version`.
No ejecutar semillas destructivas, `down -v` ni reconstrucción de volúmenes.
No se desplegó ni se tocaron datos de pedidos reales.

## Integración futura con DIAN

La DIAN regula generación, transmisión, validación previa y entrega de
facturas electrónicas y sus notas crédito; exige numeración autorizada y
los requisitos técnicos correspondientes.

Para habilitar emisión fiscal real deberá definirse con el comerciante:

1. RUT, identificación y responsabilidades tributarias, obligado a facturar
   y tratamiento de IVA/INC según sus productos (sin inferir tasas).
2. Modo de operación aprobado: proveedor tecnológico habilitado, software
   propio habilitado o servicio gratuito DIAN, según corresponda.
3. Certificado de firma, ambiente de habilitación y rango de numeración
   autorizado; autenticación/firmas y validaciones técnicas del proveedor.
4. Modelo fiscal: comprador, impuestos y descuentos detallados, identificación
   del emisor, XML UBL, CUFE/CUDE, representación gráfica y
   ApplicationResponse de validación.
5. Notas crédito/débito oficiales vinculadas a factura electrónica validada
   y devolución tributaria (puede diferir del flujo de reembolso bancario).
6. Almacenamiento privado de XML/PDF auténticos, eventos de proveedor,
   reintentos idempotentes, conciliación fiscal y entrega al comprador.
7. Contabilización e informes preservando los documentos originales.

**No se activa por defecto ninguna transmisión a DIAN, ni se crean CUFE,
CUDE, resolución, prefijos, XML o validaciones ficticias.**

Fuentes oficiales:
- https://micrositios.dian.gov.co/sistema-de-facturacion-electronica/validacion-previa/
- https://micrositios.dian.gov.co/sistema-de-facturacion-electronica/numeracion-de-facturacion-preguntas-frecuentes/
- https://micrositios.dian.gov.co/sistema-de-facturacion-electronica/que-requieres-para-factura-electronicamente/
- https://normograma.dian.gov.co/dian/compilacion/docs/resolucion_dian_0165_2023.htm

## Validaciones

En desarrollo se mantienen checks automáticos del backend y builds
de ambos frontends. La etapa de pruebas integrales, emisión real e
interoperabilidad DIAN se realizará al final, como acordado.
