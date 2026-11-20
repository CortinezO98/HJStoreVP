# HJStoreVP · Centro de calidad comercial

## Propósito

Herramienta **administrativa y editorial** para priorizar correcciones y revisar
fichas del catálogo. No altera automáticamente disponibilidad, precios, pedidos,
inventario, reglas de checkout ni la publicación de productos.

Se reutiliza la auditoría técnica previa de fotografías y descripciones.

## Controles

- Puntuación orientativa sobre 100; **no implica aprobación humana**.
- Productos sin fotos o imagen principal, sin categoría, con descripción corta,
  texto alternativo insuficiente, fotos con URL repetida o una sola foto.
- Revisión por superadministrador: `pending`, `needs_changes`, `approved`.
- Historial de cada decisión, observaciones, revisor y fecha.
- La aprobación se invalida visualmente (`stale`) cuando cambian nombre,
  descripción, categoría, imágenes, orden o textos alternativos.
- Aprobación con confirmación humana explícita de que las fotos corresponden
  al producto. Se bloquea si faltan fotos, imagen principal única o categoría.
- Revisión y aprobación **no** activan ni desactivan productos.

Las URLs de fotografías compartidas solo indican *posibles* duplicados.
La herramienta **no** comprueba visualmente si la imagen corresponde al artículo.

## Base de datos

Revisión Alembic **`20261120_16`**, depende de `20261120_15`.

Se crean, sin alterar tablas comerciales previas:

- `product_quality_reviews`: decisión editorial más reciente por producto.
- `product_quality_review_events`: historial inmutable de decisiones.

Ambas tienen claves foráneas a productos y usuarios; se conservan hasta
25 entradas recientes en la consulta de historial, sin borrar el historial almacenado.

## Despliegue en Docker local (Windows CMD)

1. `git status --short`
2. `git pull --ff-only origin main`
3. Respaldar y verificar MariaDB antes de migrar.
4. `docker compose up -d --build backend frontend-admin`
5. `docker compose exec backend alembic heads --verbose`
6. `docker compose exec backend alembic current`
7. `docker compose exec backend alembic upgrade head`
8. `docker compose exec backend alembic current`
9. `docker compose ps`

El entorno de desarrollo puede ejecutar `Base.metadata.create_all()` antes
de Alembic. Esta migración tolera tablas preexistentes, pero nunca renombra
revisiones aplicadas ni realiza `stamp` automáticamente.

## Endpoints

- `GET /api/v1/products/admin/catalog-quality`: auditoría protegida
  para administradores.
- `PUT /api/v1/products/admin/catalog-quality/{product_id}/review`:
  decisión exclusiva de superadministrador.
- `GET /api/v1/products/admin/catalog-quality/{product_id}/history`:
  últimas decisiones, solo administradores.

## Validaciones pendientes

La implementación del repositorio requiere compilación de Vite y pruebas reales
en Docker del usuario. Verificar permisos, auditoría con catálogo vacío,
aprobación y rechazo, historial, invalidación por cambios de fotos y
preservación de checkout, stock y productos públicos.

No utilizar una puntuación alta como fundamento automático para destacar
productos sin revisión humana.
