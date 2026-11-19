"""Imágenes de catálogo: validación real, escritura segura y cambios consistentes."""
import io
import uuid
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import require_admin
from app.db.session import get_db
from app.models.models import Product, ProductImage, User

router = APIRouter(prefix="/products", tags=["Imágenes de Productos"])
MAX_SIZE_BYTES = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
MAX_IMAGE_PIXELS = 20_000_000
# Extensión y tipo derivan del decodificador, nunca de un nombre enviado por cliente.
FORMATS = {
    "JPEG": ("jpg", "JPEG", "image/jpeg"),
    "PNG": ("png", "PNG", "image/png"),
    "WEBP": ("webp", "WEBP", "image/webp"),
    "GIF": ("gif", "GIF", "image/gif"),
}


class ImageOut(BaseModel):
    id: int
    url: str
    alt_text: str | None
    is_primary: bool
    sort_order: int
    model_config = {"from_attributes": True}


class SetPrimaryRequest(BaseModel):
    image_id: int

class ReorderProductImagesRequest(BaseModel):
    """Orden completo: evita pérdidas, duplicados y asignaciones cruzadas."""
    image_ids: list[int] = Field(min_length=1, max_length=100)

class UpdateProductImageAltRequest(BaseModel):
    alt_text: str = Field(min_length=3, max_length=180)




def product_upload_dir() -> Path:
    folder = Path(settings.UPLOAD_DIR).resolve() / "products"
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def normalize_image(content: bytes) -> tuple[bytes, str]:
    """Normalizar fotos a WEBP optimizado manteniendo detalle y transparencia.

    Límite de decodificación y redimensionado seguro para no publicar originales
    enormes. Los archivos existentes no se reprocesan ni se alteran.
    """
    if not content or len(content) > MAX_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="Archivo vacío o superior al límite permitido")
    try:
        with Image.open(io.BytesIO(content)) as inspection:
            if inspection.format not in FORMATS:
                raise HTTPException(status_code=415, detail="Formato de imagen no permitido")
            if inspection.width * inspection.height > MAX_IMAGE_PIXELS:
                raise HTTPException(status_code=413, detail="Resolución de imagen demasiado alta")
            inspection.verify()
        with Image.open(io.BytesIO(content)) as original:
            original.seek(0)
            corrected = ImageOps.exif_transpose(original)
            # 2400 px protege detalle en pantallas HiDPI sin enviar enormes originales.
            corrected.thumbnail((2400, 2400), Image.Resampling.LANCZOS)
            has_alpha = corrected.mode in ("RGBA", "LA", "PA") or (
                corrected.mode == "P" and "transparency" in corrected.info
            )
            corrected = corrected.convert("RGBA" if has_alpha else "RGB")
            # Inspección sobre una miniatura: impide publicar archivos vacíos,
            # transparentes o de color uniforme sin procesar todo de nuevo.
            check = corrected.copy()
            check.thumbnail((128, 128), Image.Resampling.LANCZOS)
            extrema = check.getextrema()
            if has_alpha and extrema[3][1] < 16:
                raise HTTPException(status_code=422, detail="La imagen no contiene píxeles visibles")
            # Siluetas negras sobre fondo transparente son imágenes válidas.
            # Su RGB puede ser uniforme, pero la máscara alfa contiene la figura.
            variations = [top - bottom for bottom, top in extrema[:3]]
            if has_alpha:
                variations.append(extrema[3][1] - extrema[3][0])
            if max(variations) < 4:
                raise HTTPException(status_code=422, detail="La imagen parece vacía o de un solo color. Revisa el encuadre.")
            buffer = io.BytesIO()
            corrected.save(buffer, format="WEBP", quality=88, method=5, exact=has_alpha)
            normalized = buffer.getvalue()
            if len(normalized) < 500:
                raise HTTPException(status_code=422, detail="El archivo de imagen generado está vacío")
            if len(normalized) > MAX_SIZE_BYTES:
                raise HTTPException(status_code=413, detail="Imagen optimizada supera el límite")
            return normalized, "webp"
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError, Image.DecompressionBombError):
        raise HTTPException(status_code=415, detail="El contenido no corresponde a una imagen válida")


def save_file_local(content: bytes, extension: str) -> tuple[str, Path]:
    folder = product_upload_dir()
    name = f"{uuid.uuid4().hex}.{extension}"
    target = folder / name
    # Creación exclusiva impide colisiones o seguir enlaces preexistentes.
    with target.open("xb") as output:
        output.write(content)
    return f"/uploads/products/{name}", target


def safe_product_file(url: str) -> Path | None:
    prefix = "/uploads/products/"
    if not url or not url.startswith(prefix):
        return None
    name = url[len(prefix):]
    if not name or name != Path(name).name or "/" in name or "\\" in name:
        return None
    folder = product_upload_dir()
    target = folder / name
    if not target.is_symlink() and target.resolve().parent == folder:
        return target
    return None


@router.post("/{product_id}/images", response_model=List[ImageOut], status_code=status.HTTP_201_CREATED)
async def upload_images(
    product_id: int,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    if not files or len(files) > 10:
        raise HTTPException(status_code=400, detail="Debes enviar entre 1 y 10 imágenes")
    product = db.query(Product).filter(Product.id == product_id).with_for_update().first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    existing = db.query(ProductImage).filter(
        ProductImage.product_id == product_id
    ).order_by(ProductImage.sort_order.desc()).first()
    offset = existing.sort_order + 1 if existing else 0
    has_primary = db.query(ProductImage.id).filter(
        ProductImage.product_id == product_id, ProductImage.is_primary.is_(True)
    ).first() is not None

    # Primero validar todas las imágenes; un lote inválido no deja archivos parciales.
    prepared = []
    for upload in files:
        raw = await upload.read(MAX_SIZE_BYTES + 1)
        prepared.append(normalize_image(raw))

    saved_paths = []
    rows = []
    try:
        for index, (image_content, extension) in enumerate(prepared):
            url, path = save_file_local(image_content, extension)
            saved_paths.append(path)
            record = ProductImage(
                product_id=product_id, url=url, alt_text=product.name,
                is_primary=not has_primary and index == 0,
                sort_order=offset + index,
            )
            db.add(record)
            rows.append(record)
        db.commit()
    except Exception:
        db.rollback()
        for path in saved_paths:
            path.unlink(missing_ok=True)
        raise
    for row in rows:
        db.refresh(row)
    return rows


@router.get("/{product_id}/images", response_model=List[ImageOut])
def get_product_images(product_id: int, db: Session = Depends(get_db)):
    if not db.query(Product.id).filter(Product.id == product_id).first():
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return db.query(ProductImage).filter(
        ProductImage.product_id == product_id
    ).order_by(ProductImage.sort_order, ProductImage.id).all()


@router.patch("/{product_id}/images/order", response_model=List[ImageOut])
def reorder_product_images(
    product_id: int,
    data: ReorderProductImagesRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    if len(set(data.image_ids)) != len(data.image_ids):
        raise HTTPException(status_code=422, detail="La lista contiene imágenes repetidas")
    # Serializa cambios simultáneos a la galería del mismo producto.
    product = db.query(Product).filter(Product.id == product_id).with_for_update().first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    images = db.query(ProductImage).filter(
        ProductImage.product_id == product_id
    ).order_by(ProductImage.sort_order, ProductImage.id).all()
    current_ids = {image.id for image in images}
    if current_ids != set(data.image_ids) or len(images) != len(data.image_ids):
        raise HTTPException(status_code=409, detail="La galería cambió. Recarga las imágenes y vuelve a ordenar.")
    by_id = {image.id: image for image in images}
    for order, image_id in enumerate(data.image_ids):
        by_id[image_id].sort_order = order
        by_id[image_id].is_primary = order == 0
    db.commit()
    return [by_id[image_id] for image_id in data.image_ids]


@router.patch("/{product_id}/images/primary", response_model=ImageOut)
def set_primary_image(
    product_id: int,
    data: SetPrimaryRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    product = db.query(Product).filter(Product.id == product_id).with_for_update().first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    image = db.query(ProductImage).filter(
        ProductImage.id == data.image_id,
        ProductImage.product_id == product_id,
    ).first()
    if not image:
        raise HTTPException(status_code=404, detail="Imagen no encontrada")
    # La portada y la primera fotografía de la galería deben coincidir.
    ordered = db.query(ProductImage).filter(
        ProductImage.product_id == product_id
    ).order_by(ProductImage.sort_order, ProductImage.id).all()
    ordered = [image] + [entry for entry in ordered if entry.id != image.id]
    for position, entry in enumerate(ordered):
        entry.sort_order = position
        entry.is_primary = entry.id == image.id
    db.commit()
    db.refresh(image)
    return image


@router.patch("/{product_id}/images/{image_id}/alt", response_model=ImageOut)
def update_product_image_alt(
    product_id: int,
    image_id: int,
    data: UpdateProductImageAltRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    description = data.alt_text.strip()
    if len(description) < 3:
        raise HTTPException(status_code=422, detail="La descripción debe tener al menos 3 caracteres")
    product = db.query(Product).filter(Product.id == product_id).with_for_update().first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    image = db.query(ProductImage).filter(
        ProductImage.id == image_id, ProductImage.product_id == product_id
    ).first()
    if image is None:
        raise HTTPException(status_code=404, detail="Fotografía no encontrada")
    image.alt_text = description
    db.commit()
    db.refresh(image)
    return image


@router.delete("/{product_id}/images/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_image(
    product_id: int,
    image_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    product = db.query(Product).filter(Product.id == product_id).with_for_update().first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    image = db.query(ProductImage).filter(
        ProductImage.id == image_id, ProductImage.product_id == product_id
    ).first()
    if not image:
        raise HTTPException(status_code=404, detail="Imagen no encontrada")

    safe_path = safe_product_file(image.url)
    was_primary = image.is_primary
    db.delete(image)
    db.flush()
    if was_primary:
        next_image = db.query(ProductImage).filter(
            ProductImage.product_id == product_id
        ).order_by(ProductImage.sort_order, ProductImage.id).first()
        if next_image:
            next_image.is_primary = True
    db.commit()
    # Borrar físicamente después de confirmar BD; un fallo de unlink deja
    # un huérfano recuperable, nunca una referencia rota de BD.
    if safe_path:
        try:
            safe_path.unlink(missing_ok=True)
        except OSError:
            pass
