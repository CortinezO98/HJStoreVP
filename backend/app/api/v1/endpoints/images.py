"""
Endpoints de imágenes para productos.
Soporta subida múltiple, eliminación y reordenamiento.
"""
import os
import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.core.deps import require_admin
from app.core.config import settings
from app.models.models import Product, ProductImage, User
from pydantic import BaseModel

router = APIRouter(prefix="/products", tags=["Imágenes de Productos"])

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_SIZE_BYTES = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024


class ImageOut(BaseModel):
    id: int
    url: str
    alt_text: str | None
    is_primary: bool
    sort_order: int

    model_config = {"from_attributes": True}


class SetPrimaryRequest(BaseModel):
    image_id: int


def save_file_local(file_content: bytes, filename: str) -> str:
    """Guarda el archivo en disco y retorna la URL relativa."""
    upload_dir = os.path.join(settings.UPLOAD_DIR, "products")
    os.makedirs(upload_dir, exist_ok=True)

    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "jpg"
    unique_name = f"{uuid.uuid4().hex}.{ext}"
    file_path = os.path.join(upload_dir, unique_name)

    with open(file_path, "wb") as f:
        f.write(file_content)

    return f"/uploads/products/{unique_name}"


@router.post("/{product_id}/images", response_model=List[ImageOut], status_code=status.HTTP_201_CREATED)
async def upload_images(
    product_id: int,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Sube múltiples imágenes a un producto."""
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    if len(files) > 10:
        raise HTTPException(status_code=400, detail="Máximo 10 imágenes por subida")

    # Determinar el siguiente sort_order
    existing_count = db.query(ProductImage).filter(
        ProductImage.product_id == product_id
    ).count()

    # ¿Ya tiene imágenes? Si no, la primera será la principal
    has_images = existing_count > 0

    saved_images = []

    for i, file in enumerate(files):
        # Validar tipo
        if file.content_type not in ALLOWED_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"Tipo de archivo no permitido: {file.content_type}. Solo JPG, PNG, WEBP."
            )

        # Leer contenido y validar tamaño
        content = await file.read()
        if len(content) > MAX_SIZE_BYTES:
            raise HTTPException(
                status_code=400,
                detail=f"La imagen {file.filename} supera el límite de {settings.MAX_UPLOAD_SIZE_MB}MB"
            )

        # Guardar archivo
        url = save_file_local(content, file.filename or "image.jpg")

        # Crear registro en BD
        is_primary = not has_images and i == 0
        image = ProductImage(
            product_id=product_id,
            url=url,
            alt_text=product.name,
            is_primary=is_primary,
            sort_order=existing_count + i,
        )
        db.add(image)
        saved_images.append(image)

    db.commit()
    for img in saved_images:
        db.refresh(img)

    return saved_images


@router.get("/{product_id}/images", response_model=List[ImageOut])
def get_product_images(
    product_id: int,
    db: Session = Depends(get_db),
):
    """Lista todas las imágenes de un producto."""
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
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
    """Establece una imagen como principal."""
    # Quitar is_primary de todas
    db.query(ProductImage).filter(
        ProductImage.product_id == product_id
    ).update({"is_primary": False})

    # Poner is_primary en la seleccionada
    image = db.query(ProductImage).filter(
        ProductImage.id == data.image_id,
        ProductImage.product_id == product_id,
    ).first()

    if not image:
        raise HTTPException(status_code=404, detail="Imagen no encontrada")

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
    """Elimina una imagen del producto."""
    image = db.query(ProductImage).filter(
        ProductImage.id == image_id,
        ProductImage.product_id == product_id,
    ).first()

    if not image:
        raise HTTPException(status_code=404, detail="Imagen no encontrada")

    # Eliminar archivo físico
    if image.url and image.url.startswith("/uploads/"):
        file_path = os.path.join(
            settings.UPLOAD_DIR,
            image.url.replace("/uploads/", "")
        )
        if os.path.exists(file_path):
            os.remove(file_path)

    was_primary = image.is_primary
    db.delete(image)
    db.flush()

    # Si era la principal, asignar la siguiente como principal
    if was_primary:
        next_image = db.query(ProductImage).filter(
            ProductImage.product_id == product_id
        ).order_by(ProductImage.sort_order).first()
        if next_image:
            next_image.is_primary = True

    db.commit()
