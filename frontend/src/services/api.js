import axios from 'axios'

// Eliminar tokens antiguos guardados de forma persistente por versiones previas.
// Los nuevos tokens solo permanecen durante la sesión de la pestaña.
localStorage.removeItem('access_token')
localStorage.removeItem('refresh_token')

const API_URL = import.meta.env.VITE_API_URL || ''

export const apiClient = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
})

// Inyectar token en cada request
apiClient.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})


// Renovación única compartida: evita canjear el mismo refresh token dos veces
// cuando varias peticiones reciben 401 simultáneamente.
let refreshPromise = null

// Manejar expiración de token
apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    const isAuthRoute = original?.url?.includes('/auth/login') || original?.url?.includes('/auth/refresh')
    if (error.response?.status === 401 && original && !original._retry && !isAuthRoute) {
      original._retry = true
      const refresh = sessionStorage.getItem('refresh_token')
      if (refresh) {
        try {
          if (!refreshPromise) {
            refreshPromise = axios.post(`${API_URL}/api/v1/auth/refresh`, {
              refresh_token: refresh,
            }).then(({ data }) => {
              sessionStorage.setItem('access_token', data.access_token)
              sessionStorage.setItem('refresh_token', data.refresh_token)
              return data.access_token
            }).finally(() => {
              refreshPromise = null
            })
          }
          const accessToken = await refreshPromise
          original.headers.Authorization = `Bearer ${accessToken}`
          return apiClient(original)
        } catch {
          sessionStorage.removeItem('access_token')
          sessionStorage.removeItem('refresh_token')
          localStorage.removeItem('access_token')
          localStorage.removeItem('refresh_token')
          localStorage.removeItem('hjstore-auth')
          window.location.assign('/login')
        }
      }
    }

    return Promise.reject(error)
  }
)

// ── PRODUCTOS ────────────────────────────────────────────────────────────────
export const productsApi = {
  list: (params) => apiClient.get('/products', { params }),
  get: (slugOrId) => apiClient.get(`/products/${slugOrId}`),
  create: (data) => apiClient.post('/products', data),
  update: (id, data) => apiClient.put(`/products/${id}`, data),
  delete: (id) => apiClient.delete(`/products/${id}`),
}

// ── CATEGORÍAS ───────────────────────────────────────────────────────────────
export const categoriesApi = {
  list: () => apiClient.get('/categories'),
  create: (data) => apiClient.post('/categories', data),
  update: (id, data) => apiClient.put(`/categories/${id}`, data),
}

// ── AUTH ─────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (data) => apiClient.post('/auth/login', data),
  refresh: (data) => apiClient.post('/auth/refresh', data),
  me: () => apiClient.get('/auth/me'),
  register: (data) => apiClient.post('/auth/register', data),
}

// ── INVENTARIO ───────────────────────────────────────────────────────────────
export const inventoryApi = {
  byProduct: (productId) => apiClient.get(`/inventory/product/${productId}`),
  byLocation: (locId) => apiClient.get(`/inventory/location/${locId}`),
  replenish: (data) => apiClient.post('/inventory/replenish', data),
  transfer: (data) => apiClient.post('/inventory/transfer', data),
  lowStock: () => apiClient.get('/inventory/alerts/low-stock'),
}

// ── ÓRDENES ──────────────────────────────────────────────────────────────────
export const ordersApi = {
  createWeb: (data) => apiClient.post('/orders/web', data),
  myOrders: () => apiClient.get('/orders/my-orders'),
  list: (params) => apiClient.get('/orders', { params }),
  updateStatus: (id, status) =>
    apiClient.patch(`/orders/${id}/status`, null, { params: { status } }),
}

// ── PAGOS ────────────────────────────────────────────────────────────────────
export const paymentsApi = {
  methods: () => apiClient.get('/payments/methods'),
  createCheckout: (data) => apiClient.post('/payments/create-checkout', data),
  confirmDemo: (data) => apiClient.post('/payments/confirm-demo', data),
}

// ── ANALYTICS ────────────────────────────────────────────────────────────────
export const analyticsApi = {
  salesByMonth: (year) =>
    apiClient.get('/analytics/sales-by-month', { params: { year } }),

  topProducts: (params) =>
    apiClient.get('/analytics/top-products', { params }),

  lowRotation: (days) =>
    apiClient.get('/analytics/low-rotation-products', {
      params: { days_without_sales: days },
    }),

  salesByLocation: (params) =>
    apiClient.get('/analytics/sales-by-location', { params }),

  dashboard: () =>
    apiClient.get('/analytics/dashboard-summary'),
}