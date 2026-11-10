from fastapi import APIRouter
from app.api.v1.endpoints import ( auth, register, products, inventory, analytics, images, physical_sales, locations, users, orders, payments, categories, shipping, shipments, notifications, post_sale, billing, tax_readiness)

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(auth.router)
api_router.include_router(register.router)
api_router.include_router(products.router)
api_router.include_router(categories.router)
api_router.include_router(images.router)
api_router.include_router(inventory.router)
api_router.include_router(analytics.router)
api_router.include_router(physical_sales.router)
api_router.include_router(locations.router)
api_router.include_router(users.router)
api_router.include_router(orders.router)
api_router.include_router(payments.router)
api_router.include_router(shipping.router)
api_router.include_router(shipments.router)
api_router.include_router(notifications.router)

api_router.include_router(post_sale.router)

api_router.include_router(billing.router)

api_router.include_router(tax_readiness.router)
