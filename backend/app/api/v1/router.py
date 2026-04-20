from fastapi import APIRouter
from app.api.v1.endpoints import auth, products, inventory, analytics

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(auth.router)
api_router.include_router(products.router)
api_router.include_router(inventory.router)
api_router.include_router(analytics.router)
