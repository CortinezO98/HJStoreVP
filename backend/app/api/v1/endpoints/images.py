"""Imágenes de catálogo: validación real, escritura segura y cambios consistentes."""
import io
import uuid
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel
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


def product_upload_dir() -> Path:
    folder = Path(settings.UPLOAD_DIR).resolve() / "products"
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def normalize_image(content: bytes) -> tuple[bytes, str]:
    """Decodificar y re-guardar: elimina bytes extra y metadatos heredados."""
    if not content or len(content) > MAX_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="Archivo vacío o superior al límite permitido")
    try:
        with Image.open(io.BytesIO(content)) as inspection:
            if inspection.format not in FORMATS:
                raise HTTPException(status_code=415, detail="Formato de imagen no permitido")
            if inspection.width * inspection.height > MAX_IMAGE_PIXELS:
                raise HTTPException(status_code=413, detail="Resolución de imagen demasiado alta")
            image_format = inspection.format
            inspection.verify()
        with Image.open(io.BytesIO(content)) as original:
            original.seek(0)
            corrected = ImageOps.exif_transpose(original)
            extension, pillow_format, _ = FORMATS[image_format]
            if image_format == "JPEG":
                corrected = corrected.convert("RGB")
            elif image_format == "GIF":
                # Fotos de catálogo estáticas; GIF animado se normaliza al primer frame.
                corrected = corrected.convert("P", palette=Image.Palette.ADAPTIVE)
            elif image_format == "PNG" and corrected.mode not in ("RGB", "RGBA", "P", "L", "LA"):
                corrected = corrected.convert("RGBA")
            elif image_format == "WEBP" and corrected.mode not in ("RGB", "RGBA"):
                corrected = corrected.convert("RGBA")
            buffer = io.BytesIO()
            corrected.save(buffer, format=pillow_format)
            normalized = buffer.getvalue()
            if len(normalized) > MAX_SIZE_BYTES:
                raise HTTPException(status_code=413, detail="Imagen normalizada supera el límite")
            return normalized, extension
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
    ).order_by(ProductImage.sort_order).all()


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
    db.query(ProductImage).filter(
        ProductImage.product_id == product_id
    ).update({"is_primary": False}, synchronize_session="fetch")
    image.is_primary = True
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
