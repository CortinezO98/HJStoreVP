import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { authApi } from '../services/api'

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      accessToken: sessionStorage.getItem('access_token'),
      refreshToken: sessionStorage.getItem('refresh_token'),
      isAuthenticated: !!sessionStorage.getItem('access_token'),

      login: async (email, password) => {
        const { data } = await authApi.login({ email, password })
        if (!['super_admin', 'admin', 'seller'].includes(data.user_role)) {
          throw new Error('No tienes acceso al panel de administración')
        }
        sessionStorage.setItem('access_token', data.access_token)
        sessionStorage.setItem('refresh_token', data.refresh_token)
        set({
          user: {
            id: data.user_id,
            fullName: data.full_name,
            role: data.user_role,
          },
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          isAuthenticated: true,
        })
        return data
      },

      logout: () => {
        sessionStorage.removeItem('access_token')
        sessionStorage.removeItem('refresh_token')
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false })
      },

      isAdmin: () => {
        const role = get().user?.role
        return role === 'super_admin' || role === 'admin'
      },

      isSeller: () => get().user?.role === 'seller',
    }),
    {
      name: 'hjstore-auth',
      partialize: (s) => ({ user: s.user }),
      // No confiar en un isAuthenticated antiguo persistido en localStorage.
      merge: (persisted, current) => ({
        ...current,
        user: persisted?.user ?? null,
      }),
    }
  )
)

// ── Cart store ───────────────────────────────────────────────────────────────
export const useCartStore = create(
  persist(
    (set, get) => ({
      items: [],   // [{ product, qty }]

      addItem: (product, qty = 1) => {
        const items = get().items
        const existing = items.find((i) => i.product.id === product.id)
        if (existing) {
          set({ items: items.map((i) => i.product.id === product.id ? { ...i, qty: i.qty + qty } : i) })
        } else {
          set({ items: [...items, { product, qty }] })
        }
      },

      removeItem: (productId) =>
        set({ items: get().items.filter((i) => i.product.id !== productId) }),

      updateQty: (productId, qty) => {
        if (qty <= 0) return get().removeItem(productId)
        set({ items: get().items.map((i) => i.product.id === productId ? { ...i, qty } : i) })
      },

      clearCart: () => set({ items: [] }),

      total: () => get().items.reduce((acc, i) => acc + Number(i.product.sale_price) * i.qty, 0),

      count: () => get().items.reduce((acc, i) => acc + i.qty, 0),
    }),
    { name: 'hjstore-cart' }
  )
)
