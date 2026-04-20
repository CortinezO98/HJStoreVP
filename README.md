# HJStoreVP 🛍️

Plataforma de e-commerce multi-canal con gestión de puntos físicos, inteligencia de negocio y panel de administración.

## Estructura del Monorepo

```
hjstorevp/
├── backend/          # FastAPI (Python 3.12) — API REST principal
├── frontend/         # React 18 — Tienda pública para clientes
├── frontend-admin/   # React 18 — Panel de administración
├── docs/             # Documentación técnica
├── scripts/          # Scripts de utilidad (seed, backup, etc.)
└── docker-compose.yml
```

## Stack

| Capa | Tecnología |
|------|-----------|
| Backend | FastAPI + Python 3.12 |
| Base de datos | MySQL 8 / MariaDB 10.11 |
| ORM | SQLAlchemy 2.0 + Alembic |
| Frontend tienda | React 18 + Vite + TailwindCSS |
| Frontend admin | React 18 + Vite + Recharts |
| Auth | JWT (python-jose) |
| Cache | Redis |
| Contenedores | Docker Compose |

## Levantar en local

```bash
# 1. Clonar e instalar
git clone <repo>
cd hjstorevp

# 2. Levantar servicios (MySQL + Redis)
docker-compose up -d db redis

# 3. Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000

# 4. Frontend tienda
cd ../frontend
npm install && npm run dev   # http://localhost:5173

# 5. Frontend admin
cd ../frontend-admin
npm install && npm run dev   # http://localhost:5174
```

## Fases de Desarrollo

- [x] **Fase 1** — Fundación (estructura, BD, auth, productos)
- [ ] **Fase 2** — Tienda & pagos (carrito, checkout, Wompi)
- [ ] **Fase 3** — Puntos físicos
- [ ] **Fase 4** — BI & Analytics
- [ ] **Fase 5** — Optimización
- [ ] **Fase 6** — Chatbot + Facturación electrónica DIAN
