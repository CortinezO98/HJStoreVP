from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import os

from app.core.config import settings
from app.api.v1.router import api_router
from app.api.v1.endpoints.seo import router as seo_router
from app.db.session import engine, Base


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Acciones al arrancar y apagar la app."""
    # Crear carpeta de uploads si no existe
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    # Crear tablas (desarrollo) — en producción usar Alembic
    if settings.ENVIRONMENT == "development":
        Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="API REST para HJStoreVP — Tienda E-Commerce Multi-Canal",
    docs_url="/docs" if settings.ENVIRONMENT != "production" else None,
    redoc_url="/redoc" if settings.ENVIRONMENT != "production" else None,
    openapi_url="/openapi.json" if settings.ENVIRONMENT != "production" else None,
    lifespan=lifespan,
)

# ─── CORS ────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    # URLs de archivos nuevos usan UUID: cache larga sin invalidación manual.
    # No cachear respuestas JSON, sesiones ni endpoints privados.
    if request.url.path.startswith(("/uploads/products/", "/uploads/branding/")) and response.status_code == 200:
        # Some hosts classify WEBP as text/plain when MIME is inferred from
        # the operating system. Image decoding with nosniff then fails,
        # even though StaticFiles serves the correct bytes (HTTP 200).
        image_types = {
            ".webp": "image/webp",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".gif": "image/gif",
        }
        extension = os.path.splitext(request.url.path.lower())[1]
        if extension in image_types:
            response.headers["Content-Type"] = image_types[extension]
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if request.url.path.startswith("/api/v1/auth/"):
        response.headers["Cache-Control"] = "no-store"
    return response


# ─── ARCHIVOS ESTÁTICOS (uploads locales) ───────────────────────────────────
if settings.STORAGE_BACKEND == "local":
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

# ─── RUTAS ───────────────────────────────────────────────────────────────────
app.include_router(api_router)
app.include_router(seo_router)


@app.get("/", tags=["Health"])
def root():
    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "running",
        "docs": "/docs",
    }


@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok"}
