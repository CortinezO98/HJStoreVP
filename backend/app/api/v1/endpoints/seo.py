"""SEO público: URLs canónicas, sitemap real y páginas OG legibles sin JavaScript."""
import html
import json
from urllib.parse import quote, urlsplit, urlunsplit
from xml.etree.ElementTree import Element, SubElement, tostring

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse, Response
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.models.models import Category, Product, ProductImage, Inventory
from app.api.v1.endpoints.variants import variant_snapshot

router = APIRouter(tags=["SEO"])


def store_origin() -> str:
    """Origen público explícito. Nunca confiar en Host/X-Forwarded-Host."""
    parsed = urlsplit(settings.STORE_PUBLIC_URL.rstrip("/"))
    if parsed.scheme not in ("http", "https") or not parsed.netloc or parsed.username or parsed.password:
        raise ValueError("STORE_PUBLIC_URL debe ser una URL pública absoluta")
    if settings.ENVIRONMENT.lower() == "production" and (
        parsed.scheme != "https" or parsed.hostname in ("localhost", "127.0.0.1")
    ):
        raise ValueError("Configura STORE_PUBLIC_URL con el dominio HTTPS público")
    return urlunsplit((parsed.scheme, parsed.netloc, "", "", "")).rstrip("/")


def canonical(path: str) -> str:
    return store_origin() + path


def product_path(slug: str) -> str:
    return "/producto/" + quote(slug, safe="")


def _stock(db: Session, product: Product) -> int:
    if product.variants:
        active_ids = [p.id for p in product.variants if p.active]
        if not active_ids:
            return 0
        return int(sum(
            quantity for (quantity,) in db.query(Inventory.qty_available).filter(
                Inventory.product_id.in_(active_ids)
            ).all()
        ))
    return int(sum(
        qty for (qty,) in db.query(Inventory.qty_available).filter(
            Inventory.product_id == product.id
        ).all()
    ))


def _primary_image(db: Session, product: Product) -> str | None:
    photo = db.query(ProductImage.url).filter(
        ProductImage.product_id == product.id,
        ProductImage.is_primary.is_(True),
    ).order_by(ProductImage.sort_order, ProductImage.id).first()
    if not photo:
        photo = db.query(ProductImage.url).filter(
            ProductImage.product_id == product.id,
        ).order_by(ProductImage.sort_order, ProductImage.id).first()
    if photo:
        url = photo[0]
        if url.startswith("https://"):
            return url
        if url.startswith("/"):
            # Imágenes servidas desde el origen configurado con /uploads proxy.
            return canonical(url)
    return None


@router.get("/sitemap.xml", include_in_schema=False)
def sitemap(db: Session = Depends(get_db)):
    root = Element("urlset", xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
    urls = [("/", None), ("/catalogo", None)]
    cats = db.query(Category.slug, Category.updated_at).filter(Category.active.is_(True)).all()
    urls.extend(("/catalogo?categoria=" + quote(row.slug, safe=""), row.updated_at) for row in cats)
    products = db.query(Product.slug, Product.updated_at).filter(
        Product.active.is_(True), Product.parent_product_id.is_(None)
    ).all()
    urls.extend((product_path(row.slug), row.updated_at) for row in products)
    for path, updated in urls:
        node = SubElement(root, "url")
        SubElement(node, "loc").text = canonical(path)
        if updated:
            SubElement(node, "lastmod").text = updated.date().isoformat()
    payload = b'<?xml version="1.0" encoding="UTF-8"?>\n' + tostring(root, encoding="utf-8")
    return Response(content=payload, media_type="application/xml", headers={"Cache-Control": "public, max-age=300"})


@router.get("/robots.txt", include_in_schema=False)
def robots():
    if settings.ENVIRONMENT.lower() != "production":
        body = "User-agent: *\nDisallow: /\n"
    else:
        body = (
            "User-agent: *\n"
            "Disallow: /carrito\nDisallow: /checkout\n"
            "Disallow: /mi-cuenta\nDisallow: /favoritos\n"
            "Disallow: /login\nDisallow: /registro\n"
            "Disallow: /pago-confirmado\n"
            "Disallow: /api/\n"
            f"Sitemap: {canonical('/sitemap.xml')}\n"
        )
    return Response(content=body, media_type="text/plain; charset=utf-8",
                    headers={"Cache-Control": "public, max-age=300"})


@router.get("/share/product/{slug}", response_class=HTMLResponse, include_in_schema=False)
def share_product(slug: str, db: Session = Depends(get_db)):
    product = db.query(Product).filter(
        Product.slug == slug, Product.active.is_(True),
        Product.parent_product_id.is_(None)
    ).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no disponible")
    origin = store_origin()
    url = canonical(product_path(product.slug))
    share_url = canonical("/share/product/" + quote(slug, safe=""))
    description = " ".join((product.description or f"Descubre {product.name} en HJStoreVP.").split())[:160]
    title = f"{product.name} | HJStoreVP"
    img = _primary_image(db, product)
    variants = [v for v in product.variants if v.active]
    stock = _stock(db, product)
    price = min((v.sale_price for v in variants), default=product.sale_price)
    product_json = {
        "@context": "https://schema.org", "@type": "Product", "name": product.name,
        "description": description, "sku": product.sku, "url": url,
        "offers": {
            "@type": "Offer", "priceCurrency": "COP", "price": str(price),
            "availability": ("https://schema.org/InStock" if stock > 0 else "https://schema.org/OutOfStock"),
            "url": url,
        }
    }
    if img:
        product_json["image"] = [img]
    # Escapar contenido en HTML y JSON para que los nombres no inyecten scripts.
    structured = json.dumps(product_json, ensure_ascii=False).replace("<", "\\u003c")
    image_tag = f'<meta property="og:image" content="{html.escape(img, quote=True)}">' if img else ""
    result = f"""<!doctype html>
<html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(description, quote=True)}">
<meta property="og:type" content="product">
<meta property="og:title" content="{html.escape(title, quote=True)}">
<meta property="og:description" content="{html.escape(description, quote=True)}">
<meta property="og:url" content="{html.escape(share_url, quote=True)}">
{image_tag}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{html.escape(title, quote=True)}">
<link rel="canonical" href="{html.escape(url, quote=True)}">
<meta name="robots" content="{"noindex,nofollow" if settings.ENVIRONMENT.lower() != "production" else "index,follow"}">
<script type="application/ld+json">{structured}</script>
</head><body>
<main><h1>{html.escape(product.name)}</h1><p>{html.escape(description)}</p>
<p><a href="{html.escape(url, quote=True)}">Ver producto en HJStoreVP</a></p></main>
<script>window.location.replace({json.dumps(url)});</script>
</body></html>"""
    return HTMLResponse(result, headers={"Cache-Control": "public, max-age=300"})
