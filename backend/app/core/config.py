from pydantic_settings import BaseSettings
from pydantic import validator, model_validator
from typing import List, Literal, Optional
import secrets
from urllib.parse import urlsplit


# La clave generada automáticamente es útil solo en desarrollo local.
_DEFAULT_DEV_SECRET_KEY = secrets.token_urlsafe(32)


def require_https_provider_url(value: str) -> str:
    """Solo URL HTTPS explícita, sin credenciales ni caracteres ambiguos."""
    if not isinstance(value, str) or not value.isascii() or any(ord(c) <= 32 or ord(c) == 127 for c in value) or "\\" in value:
        raise ValueError("URL de proveedor inválida")
    parsed = urlsplit(value)
    if (parsed.scheme != "https" or not parsed.hostname or
            parsed.username is not None or parsed.password is not None or
            "%" in parsed.netloc or parsed.fragment or
            any(not (c.isalnum() or c in ".-") for c in parsed.hostname)):
        raise ValueError("URL HTTPS de proveedor sin credenciales requerida")
    _ = parsed.port
    return value


class Settings(BaseSettings):
    # ─── App ───────────────────────────────────────────────────
    APP_NAME: str = "HJStoreVP API"
    APP_VERSION: str = "1.0.0"
    ENVIRONMENT: Literal["development", "test", "staging", "production"] = "production"
    DEBUG: bool = False
    ALLOW_DEMO_PAYMENTS: bool = False
    API_V1_STR: str = "/api/v1"
    API_BASE_URL: str = "http://localhost:8000"

    # ─── Seguridad ─────────────────────────────────────────────
    SECRET_KEY: str = _DEFAULT_DEV_SECRET_KEY
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    # Rate limiting global por cuenta e IP mediante Redis. Activado por defecto.
    AUTH_RATE_LIMIT_ENABLED: bool = True
    AUTH_LOGIN_ACCOUNT_MAX_FAILURES: int = 5
    AUTH_LOGIN_IP_MAX_FAILURES: int = 30
    AUTH_LOGIN_WINDOW_SECONDS: int = 900
    # Evita canjear dos veces el mismo refresh token.
    AUTH_REFRESH_REPLAY_PROTECTION_ENABLED: bool = True

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
    STORAGE_BACKEND: str = "local"
    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_SIZE_MB: int = 10
    DO_SPACES_KEY: Optional[str] = None
    DO_SPACES_SECRET: Optional[str] = None
    DO_SPACES_REGION: Optional[str] = "nyc3"
    DO_SPACES_BUCKET: Optional[str] = None
    DO_SPACES_ENDPOINT: Optional[str] = None

    # ─── Wompi ─────────────────────────────────────────────────
    # Sandbox: https://developers.wompi.co
    # Producción: https://comercios.wompi.co
    WOMPI_PUBLIC_KEY: Optional[str] = None
    WOMPI_PRIVATE_KEY: Optional[str] = None
    WOMPI_INTEGRITY_SECRET: Optional[str] = None
    WOMPI_EVENTS_SECRET: Optional[str] = None
    WOMPI_ENV: str = "sandbox"  # sandbox | production
    WOMPI_ALLOW_LIVE_PAYMENTS: bool = False  # opt-in independiente
    WOMPI_REDIRECT_URL: Optional[str] = "http://localhost:5173/pago-confirmado"

    # ─── Sistecréditos ─────────────────────────────────────────
    # Solicitar credenciales en: https://www.sistecréditos.com/aliados
    # Variables que te pasarán:
    #   SISTECREDITOS_API_KEY  → Llave de API
    #   SISTECREDITOS_STORE_ID → ID de tu tienda
    #   SISTECREDITOS_SECRET   → Secreto para verificar webhooks
    SISTECREDITO_BASE_URL: Optional[str] = None
    SISTECREDITO_INTEGRATION_VERIFIED: bool = False
    SISTECREDITOS_API_KEY: Optional[str] = None
    SISTECREDITOS_STORE_ID: Optional[str] = None
    SISTECREDITOS_SECRET: Optional[str] = None
    SISTECREDITOS_ENV: str = "sandbox"   # "sandbox" o "production"
    SISTECREDITOS_REDIRECT_URL: Optional[str] = "http://localhost:5173/pago-confirmado"

    # ─── Addi ──────────────────────────────────────────────────
    # Solicitar credenciales en: https://www.addi.com/colombia/aliados
    # Variables que te pasarán:
    #   ADDI_CLIENT_ID     → Client ID de OAuth2
    #   ADDI_CLIENT_SECRET → Client Secret de OAuth2
    ADDI_BASE_URL: Optional[str] = None
    ADDI_INTEGRATION_VERIFIED: bool = False
    ADDI_CLIENT_ID: Optional[str] = None
    ADDI_CLIENT_SECRET: Optional[str] = None
    ADDI_WEBHOOK_SECRET: Optional[str] = None
    ADDI_ENV: str = "sandbox"   # "sandbox" o "production"
    ADDI_REDIRECT_URL: Optional[str] = "http://localhost:5173/pago-confirmado"

    # ─── Reservas de pedidos web ──────────────────────────────
    # La expiración NO cancela automáticamente pagos: requiere conciliación.
    ORDER_RESERVATION_MINUTES: int = 30

    # ─── Email ─────────────────────────────────────────────────
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    EMAILS_FROM: str = "noreply@hjstorevp.com"
    STORE_PUBLIC_URL: str = "http://localhost:5173"
    EMAIL_NOTIFICATIONS_ENABLED: bool = False
    EMAIL_LIVE_DELIVERY_ALLOWED: bool = False
    CART_RECOVERY_DELIVERY_ENABLED: bool = False
    CART_RECOVERY_LIVE_ALLOWED: bool = False

    # ─── Primer admin ──────────────────────────────────────────
    FIRST_ADMIN_EMAIL: str = "admin@hjstorevp.com"
    FIRST_ADMIN_PASSWORD: str = "Admin123!"

    @validator("SISTECREDITO_BASE_URL", "ADDI_BASE_URL")
    def validate_provider_url(cls, value):
        if value is None:
            return value
        value = require_https_provider_url(value)
        if urlsplit(value).query:
            raise ValueError("La URL base no admite parámetros")
        return value.rstrip("/")

    @model_validator(mode="after")
    def require_safe_production_settings(self):
        if self.ALLOW_DEMO_PAYMENTS and self.ENVIRONMENT not in ("development", "test"):
            raise ValueError("ALLOW_DEMO_PAYMENTS solo se permite en desarrollo y pruebas")
        if self.ENVIRONMENT in ("staging", "production"):
            if self.DEBUG:
                raise ValueError("DEBUG debe ser false en producción")
            if not self.AUTH_RATE_LIMIT_ENABLED or not self.AUTH_REFRESH_REPLAY_PROTECTION_ENABLED:
                raise ValueError("Protecciones Redis de autenticación obligatorias en producción")
            if len(self.SECRET_KEY) < 32 or self.SECRET_KEY == _DEFAULT_DEV_SECRET_KEY or self.SECRET_KEY in ("changeme_in_production_use_long_random_string",):
                raise ValueError("SECRET_KEY insegura para producción")
            if self.FIRST_ADMIN_PASSWORD in ("Admin123!", "Vendedor123!"):
                raise ValueError("Configura FIRST_ADMIN_PASSWORD segura antes de producción")
            if "hjstore123" in self.DATABASE_URL or "rootpass" in self.DATABASE_URL:
                raise ValueError("Credenciales de base de datos de desarrollo prohibidas en producción")
            if not self.ALLOWED_ORIGINS or any(
                not origin.startswith("https://") or
                origin.startswith(("https://localhost", "https://127.0.0.1"))
                for origin in self.ALLOWED_ORIGINS
            ):
                raise ValueError("ALLOWED_ORIGINS debe contener únicamente orígenes HTTPS públicos en producción")
            if not self.API_BASE_URL.startswith("https://"):
                raise ValueError("API_BASE_URL debe usar HTTPS en producción")
            if not self.STORE_PUBLIC_URL.startswith("https://"):
                raise ValueError("STORE_PUBLIC_URL debe usar HTTPS en producción")
            if self.WOMPI_ENV == "production" and not self.WOMPI_ALLOW_LIVE_PAYMENTS:
                raise ValueError("WOMPI_ENV=production requiere opt-in de pagos reales")
        return self

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
