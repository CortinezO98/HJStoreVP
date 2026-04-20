from pydantic_settings import BaseSettings
from pydantic import AnyHttpUrl, validator
from typing import List, Optional
import secrets


class Settings(BaseSettings):
    # ─── App ───────────────────────────────────────────────────
    APP_NAME: str = "HJStoreVP API"
    APP_VERSION: str = "1.0.0"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    API_V1_STR: str = "/api/v1"

    # ─── Seguridad ─────────────────────────────────────────────
    SECRET_KEY: str = secrets.token_urlsafe(32)
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ─── Base de datos ─────────────────────────────────────────
    DATABASE_URL: str = "mysql+pymysql://hjstore:hjstore123@localhost:3306/hjstorevp"

    # ─── Redis ─────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"

    # ─── CORS ──────────────────────────────────────────────────
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:5174",
    ]

    @validator("ALLOWED_ORIGINS", pre=True)
    def parse_origins(cls, v):
        if isinstance(v, str):
            return [i.strip() for i in v.split(",")]
        return v

    # ─── Almacenamiento ────────────────────────────────────────
    STORAGE_BACKEND: str = "local"  # local | s3
    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_SIZE_MB: int = 10

    # DO Spaces / S3
    DO_SPACES_KEY: Optional[str] = None
    DO_SPACES_SECRET: Optional[str] = None
    DO_SPACES_REGION: Optional[str] = "nyc3"
    DO_SPACES_BUCKET: Optional[str] = None
    DO_SPACES_ENDPOINT: Optional[str] = None

    # ─── Email ─────────────────────────────────────────────────
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    EMAILS_FROM: str = "noreply@hjstorevp.com"

    # ─── Pasarela de pago ──────────────────────────────────────
    WOMPI_PUBLIC_KEY: Optional[str] = None
    WOMPI_PRIVATE_KEY: Optional[str] = None
    WOMPI_EVENTS_SECRET: Optional[str] = None

    # ─── Primer admin ──────────────────────────────────────────
    FIRST_ADMIN_EMAIL: str = "admin@hjstorevp.com"
    FIRST_ADMIN_PASSWORD: str = "Admin123!"

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
