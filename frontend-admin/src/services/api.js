import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || ''

export const apiClient = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
})

// ─────────────────────────────────────────────────────────
// 🔐 INTERCEPTORS
// ─────────────────────────────────────────────────────────

// Token automático
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Refresh automático
apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401) {
      const refresh = localStorage.getItem('refresh_token')

      if (refresh) {
        try {
          const { data } = await axios.post(
            `${API_URL}/api/v1/auth/refresh`,
            { refresh_token: refresh }
          )

          localStorage.setItem('access_token', data.access_token)
          localStorage.setItem('refresh_token', data.refresh_token)

          error.config.headers.Authorization = `Bearer ${data.access_token}`
          return apiClient(error.config)
        } catch {
          localStorage.clear()
          window.location.href = '/login'
        }
      }
    }

    return Promise.reject(error)
  }
)

// ─────────────────────────────────────────────────────────
// 🛍️ PRODUCTOS
// ─────────────────────────────────────────────────────────
export const productsApi = {
  list: (params) => apiClient.get('/products', { params }),
  get: (id) => apiClient.get(`/products/${id}`),
  create: (data) => apiClient.post('/products', data),
  update: (id, data) => apiClient.put(`/products/${id}`, data),
  delete: (id) => apiClient.delete(`/products/${id}`),
}

// ─────────────────────────────────────────────────────────
// 🧩 CATEGORÍAS
// ─────────────────────────────────────────────────────────
export const categoriesApi = {
  list: () => apiClient.get('/categories'),
  create: (data) => apiClient.post('/categories', data),
  update: (id, data) => apiClient.put(`/categories/${id}`, data),
}

// ─────────────────────────────────────────────────────────
// 📦 INVENTARIO
// ─────────────────────────────────────────────────────────
export const inventoryApi = {
  byProduct: (productId) => apiClient.get(`/inventory/product/${productId}`),
  byLocation: (locId) => apiClient.get(`/inventory/location/${locId}`),

  replenish: (data) =>
    apiClient.post('/inventory/replenish', data),

  transfer: (data) =>
    apiClient.post('/inventory/transfer', data),

  lowStock: () =>
    apiClient.get('/inventory/alerts/low-stock'),
}

// ─────────────────────────────────────────────────────────
// 🌐 PEDIDOS WEB
// ─────────────────────────────────────────────────────────
export const ordersApi = {
  list: (params) => apiClient.get('/orders', { params }),

  updateStatus: (id, status) =>
    apiClient.patch(`/orders/${id}/status`, null, {
      params: { status },
    }),
}

// ─────────────────────────────────────────────────────────
// 🏪 VENTAS FÍSICAS (CRÍTICO)
// ─────────────────────────────────────────────────────────
export const physicalSalesApi = {
  create: (data) =>
    apiClient.post('/physical-sales', data),

  list: (params) =>
    apiClient.get('/physical-sales', { params }),

  myStock: () =>
    apiClient.get('/physical-sales/my-stock'),
}

// ─────────────────────────────────────────────────────────
// 📊 ANALYTICS (DASHBOARD)
// ─────────────────────────────────────────────────────────
export const analyticsApi = {
  dashboard: () =>
    apiClient.get('/analytics/dashboard-summary'),

  salesByMonth: (year) =>
    apiClient.get('/analytics/sales-by-month', {
      params: { year },
    }),

  topProducts: (params) =>
    apiClient.get('/analytics/top-products', { params }),

  lowRotation: (days) =>
    apiClient.get('/analytics/low-rotation-products', {
      params: { days_without_sales: days },
    }),

  salesByLocation: (params) =>
    apiClient.get('/analytics/sales-by-location', { params }),
}

// ─────────────────────────────────────────────────────────
// 👤 USUARIOS
// ─────────────────────────────────────────────────────────
export const usersApi = {
  list: () => apiClient.get('/users'),
  create: (data) => apiClient.post('/users', data),
  update: (id, data) => apiClient.put(`/users/${id}`, data),
}

// ─────────────────────────────────────────────────────────
// 📍 UBICACIONES (PUNTOS FÍSICOS)
// ─────────────────────────────────────────────────────────
export const locationsApi = {
  list: () => apiClient.get('/locations'),
  create: (data) => apiClient.post('/locations', data),
  update: (id, data) => apiClient.put(`/locations/${id}`, data),
}