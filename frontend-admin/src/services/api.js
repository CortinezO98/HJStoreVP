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

// ─────────────────────────────────────────────────────────
// 🔐 INTERCEPTORS
// ─────────────────────────────────────────────────────────

// Token automático
apiClient.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})


// Renovación única compartida: evita canjear el mismo refresh token dos veces
// cuando varias peticiones reciben 401 simultáneamente.
let refreshPromise = null

// Refresh automático
apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config
    const isAuthRequest = originalRequest?.url?.includes('/auth/login') ||
      originalRequest?.url?.includes('/auth/refresh')

    const status = error.response?.status
    // El catálogo es público para lecturas normales. Una credencial expirada
    // en una solicitud include_inactive se interpreta como anónima y devuelve
    // 403; para el administrador, renovar una sola vez evita un falso bloqueo.
    const privilegedCatalogRequest = status === 403 &&
      /\/\b(products|categories)(?:\/|$)/.test(originalRequest?.url || '') &&
      (originalRequest?.params?.include_inactive === true ||
       originalRequest?.params?.include_inactive === 'true')
    if ((status === 401 || privilegedCatalogRequest) && originalRequest && !originalRequest._retry && !isAuthRequest) {
      originalRequest._retry = true
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
          error.config.headers.Authorization = `Bearer ${accessToken}`
          return apiClient(error.config)
        } catch {
          sessionStorage.removeItem('access_token')
          sessionStorage.removeItem('refresh_token')
          localStorage.removeItem('access_token')
          localStorage.removeItem('refresh_token')
          localStorage.removeItem('hjstore-auth')
          if (window.location.pathname !== '/login') window.location.replace('/login')
          return Promise.reject(error)
        }
      } else if (status === 401) {
        sessionStorage.removeItem('access_token')
        sessionStorage.removeItem('refresh_token')
        localStorage.removeItem('hjstore-auth')
        if (window.location.pathname !== '/login') window.location.replace('/login')
      }
    }

    return Promise.reject(error)
  }
)

// ─────────────────────────────────────────────────────────
// 🔐 AUTENTICACIÓN
// ─────────────────────────────────────────────────────────
export const authApi = {
  login: (data) => apiClient.post('/auth/login', data),
  refresh: (refreshToken) => apiClient.post('/auth/refresh', { refresh_token: refreshToken }),
  me: () => apiClient.get('/auth/me'),
}

// ─────────────────────────────────────────────────────────
// 🛍️ PRODUCTOS
// ─────────────────────────────────────────────────────────
export const productsApi = {
  list: (params) => apiClient.get('/products', { params }),
  catalogQuality: (params) => apiClient.get('/products/admin/catalog-quality', { params }),
  reviewCatalogQuality: (productId, payload) => apiClient.put(`/products/admin/catalog-quality/${productId}/review`, payload),
  catalogQualityHistory: (productId) => apiClient.get(`/products/admin/catalog-quality/${productId}/history`),
  get: (id) => apiClient.get(`/products/${id}`),
  create: (data) => apiClient.post('/products', data),
  update: (id, data) => apiClient.put(`/products/${id}`, data),
  delete: (id) => apiClient.delete(`/products/${id}`),
  variants: (id) => apiClient.get(`/products/${id}/variants`),
  createVariant: (id, payload) => apiClient.post(`/products/${id}/variants`, payload),
  updateVariant: (id, variantId, payload) => apiClient.patch(`/products/${id}/variants/${variantId}`, payload),
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
  overview: (params = {}) => apiClient.get('/inventory/overview', { params }),

  replenish: (data) =>
    apiClient.post('/inventory/replenish', data),

  transfer: (data) =>
    apiClient.post('/inventory/transfer', data),

  lowStock: () =>
    apiClient.get('/inventory/alerts/low-stock'),
  lowStockByLocation: (params = {}) => apiClient.get('/inventory/alerts/by-location', { params }),
  movementHistory: (params = {}) => apiClient.get('/inventory/audit/movements', { params }),
  anomalies: (params = {}) => apiClient.get('/inventory/audit/anomalies', { params }),
  reservationIntegrity: (params = {}) => apiClient.get('/inventory/audit/reservation-integrity', { params }),
  physicalSaleIntegrity: (params = {}) => apiClient.get('/inventory/audit/physical-sale-integrity', { params }),
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
  accountingSummary: (params = {}) => apiClient.get('/analytics/accounting-summary', { params }),
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


export const commerceOperationsApi = {
  overview: (params = {}) => apiClient.get('/commerce-operations/overview', { params }),
  paymentIntegrity: (params = {}) => apiClient.get('/commerce-operations/payment-integrity', { params }),
  verifyWompi: (orderId) => apiClient.get(`/commerce-operations/wompi-verify/${orderId}`),
  paymentRecoveryQueue: (params = {}) => apiClient.get('/commerce-operations/payment-recovery-queue', { params }),
}

export const financialReportsApi = {
  overview: (params = {}) => apiClient.get('/financial-reports/overview', { params }),
  downloadExcel: (params = {}) => apiClient.get('/financial-reports/excel', {
    params,
    responseType: 'blob',
    timeout: 120000,
  }),
}

// ─────────────────────────────────────────────────────────
// 👤 USUARIOS
// ─────────────────────────────────────────────────────────
export const usersApi = {
  list: () => apiClient.get('/users'),
  create: (data) => apiClient.post('/users', data),
  update: (id, data) => apiClient.put(`/users/${id}`, data),
  setStatus: (id, active) => apiClient.patch(`/users/${id}/status`, { active }),
  resetPassword: (id, password) => apiClient.post(`/users/${id}/reset-password`, { password }),
  remove: (id) => apiClient.delete(`/users/${id}`),
}

// ─────────────────────────────────────────────────────────
// 📍 UBICACIONES (PUNTOS FÍSICOS)
// ─────────────────────────────────────────────────────────
export const locationsApi = {
  list: () => apiClient.get('/locations'),
  create: (data) => apiClient.post('/locations', data),
  update: (id, data) => apiClient.put(`/locations/${id}`, data),
}

// ─────────────────────────────────────────────────────────
// 🚚 TARIFAS DE ENVÍO — solo usuarios administrativos
// ─────────────────────────────────────────────────────────
export const shippingApi = {
  list: () => apiClient.get('/shipping/rates'),
  create: (data) => apiClient.post('/shipping/rates', data),
  update: (id, data) => apiClient.put(`/shipping/rates/${id}`, data),
}


// ─────────────────────────────────────────────────────────
// 🚚 DESPACHOS Y SEGUIMIENTO DE PEDIDOS WEB
// ─────────────────────────────────────────────────────────
export const shipmentsApi = {
  get: (orderId) => apiClient.get(`/shipments/orders/${orderId}`),
  dispatch: (orderId, payload) => apiClient.post(`/shipments/orders/${orderId}/dispatch`, payload),
  correctGuide: (orderId, payload) => apiClient.patch(`/shipments/orders/${orderId}/guide`, payload),
  addEvent: (orderId, payload) => apiClient.post(`/shipments/orders/${orderId}/events`, payload),
}


// ─────────────────────────────────────────────────────────
// ✉️ COLA DE NOTIFICACIONES TRANSACCIONALES (ADMIN)
 // ─────────────────────────────────────────────────────────
export const notificationsApi = {
  list: (params = {}) => apiClient.get('/notifications/admin', { params }),
  stats: () => apiClient.get('/notifications/admin/stats'),
  retry: (id) => apiClient.post(`/notifications/admin/${id}/retry`),
}


// ─────────────────────────────────────────────────────────
// ♻️ POSVENTA — CASOS, RECEPCIÓN Y REEMBOLSOS EXTERNOS
// ─────────────────────────────────────────────────────────
export const postSaleApi = {
  list: (params = {}) => apiClient.get('/post-sale/admin', { params }),
  review: (id, data) => apiClient.post(`/post-sale/${id}/review`, data),
  receive: (id, data) => apiClient.post(`/post-sale/${id}/receive`, data),
  requestRefund: (id, data) => apiClient.post(`/post-sale/${id}/request-refund`, data),
  recordRefund: (id, data) => apiClient.post(`/post-sale/${id}/record-refund`, data),
}


// ─────────────────────────────────────────────────────────
// 🧾 COMPROBANTES COMERCIALES INTERNOS (NO DIAN)
 // ─────────────────────────────────────────────────────────
export const billingApi = {
  list: () => apiClient.get('/billing/admin'),
  receipt: (orderId) => apiClient.post(`/billing/receipt/${orderId}`),
  creditDraft: (caseId) => apiClient.post(`/billing/credit-note-draft/${caseId}`),
  detail: (id) => apiClient.get(`/billing/${id}`),
  print: (id) => apiClient.get(`/billing/${id}/print`, { responseType: 'blob' }),
}


// ─────────────────────────────────────────────────────────
// CONFIGURACIÓN TRIBUTARIA PREPARATORIA — SIN EMISIÓN DIAN
// ─────────────────────────────────────────────────────────
export const taxReadinessApi = {
  issuer: () => apiClient.get('/tax-readiness/issuer'),
  saveIssuer: (data) => apiClient.put('/tax-readiness/issuer', data),
  products: () => apiClient.get('/tax-readiness/products'),
  saveProductTax: (id, data) => apiClient.put(`/tax-readiness/products/${id}`, data),
  readiness: () => apiClient.get('/tax-readiness/readiness'),
}

// Centro de integraciones (solo estados, no secretos)
export const integrationsApi = {
  overview: () => apiClient.get('/integrations/overview'),
}


// Caja de puntos físicos y arqueos
export const cashApi = {
  sessions: (params = {}) => apiClient.get('/cash/sessions', { params }),
  open: (data) => apiClient.post('/cash/sessions', data),
  detail: (id) => apiClient.get(`/cash/sessions/${id}`),
  movements: (id) => apiClient.get(`/cash/sessions/${id}/movements`),
  movement: (id, data) => apiClient.post(`/cash/sessions/${id}/movements`, data),
  close: (id, data) => apiClient.post(`/cash/sessions/${id}/close`, data),
}


// ── IDENTIDAD Y CONTENIDO COMERCIAL (SOLO SUPERADMIN) ────────────────────────
export const storefrontSettingsApi = {
  read: () => apiClient.get('/storefront-settings/admin'),
  readHomepageDraft: () => apiClient.get('/storefront-settings/admin/homepage-draft'),
  homepageStorageHealth: () => apiClient.get('/storefront-settings/admin/homepage-storage-health'),
  saveHomepageDraft: (draft) => apiClient.put('/storefront-settings/admin/homepage-draft', { draft }),
  publishHomepageDraft: () => apiClient.post('/storefront-settings/admin/homepage-publish'),
  discardHomepageDraft: () => apiClient.delete('/storefront-settings/admin/homepage-draft'),
  homepageVersions: () => apiClient.get('/storefront-settings/admin/homepage-versions'),
  restoreHomepageVersion: (versionId) =>
    apiClient.post(`/storefront-settings/admin/homepage-versions/${encodeURIComponent(versionId)}/restore-draft`),
  save: (data) => apiClient.put('/storefront-settings/admin', data),
  upload: (file) => {
    const form = new FormData()
    form.append('file', file)
    return apiClient.post('/storefront-settings/admin/upload-image', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
}
