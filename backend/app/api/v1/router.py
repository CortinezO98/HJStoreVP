from fastapi import APIRouter
from app.api.v1.endpoints import ( auth, products, inventory, analytics, images, physical_sales, locations, users, orders)

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(auth.router)
api_router.include_router(products.router)
api_router.include_router(images.router)
api_router.include_router(inventory.router)
api_router.include_router(analytics.router)
api_router.include_router(physical_sales.router)
api_router.include_router(locations.router)
api_router.include_router(users.router)
api_router.include_router(orders.router)
