import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { authApi } from '../services/api'

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,

      login: async (email, password) => {
        const { data } = await authApi.login({ email, password })
        localStorage.setItem('access_token', data.access_token)
        localStorage.setItem('refresh_token', data.refresh_token)

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
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        })
      },

      isAdmin: () => {
        const role = get().user?.role
        return role === 'super_admin' || role === 'admin'
      },

      isSeller: () => get().user?.role === 'seller',
    }),
    {
      name: 'hjstore-auth',
      partialize: (s) => ({
        user: s.user,
        isAuthenticated: s.isAuthenticated,
      }),
    }
  )
)

const getAvailableStock = (product) => {
  const raw = product?.total_stock ?? product?.stock ?? null
  return raw === null || raw === undefined ? null : Number(raw)
}

export const useCartStore = create(
  persist(
    (set, get) => ({
      items: [],

      getItemQty: (productId) => {
        const found = get().items.find((i) => i.product.id === productId)
        return found ? found.qty : 0
      },

      canAdd: (product, qtyToAdd = 1) => {
        const available = getAvailableStock(product)
        if (available === null) return true

        const currentQty = get().getItemQty(product.id)
        return currentQty + qtyToAdd <= available
      },

      addItem: (product, qty = 1) => {
        const items = get().items
        const existing = items.find((i) => i.product.id === product.id)
        const available = getAvailableStock(product)

        if (available !== null) {
          const currentQty = existing ? existing.qty : 0
          const nextQty = currentQty + qty
          if (nextQty > available) return false
        }

        if (existing) {
          set({
            items: items.map((i) =>
              i.product.id === product.id
                ? { ...i, qty: i.qty + qty, product: { ...i.product, ...product } }
                : i
            ),
          })
        } else {
          set({
            items: [...items, { product, qty }],
          })
        }

        return true
      },

      removeItem: (productId) =>
        set({
          items: get().items.filter((i) => i.product.id !== productId),
        }),

      updateQty: (productId, qty) => {
        const item = get().items.find((i) => i.product.id === productId)
        if (!item) return true

        if (qty <= 0) {
          get().removeItem(productId)
          return true
        }

        const available = getAvailableStock(item.product)
        if (available !== null && qty > available) {
          return false
        }

        set({
          items: get().items.map((i) =>
            i.product.id === productId ? { ...i, qty } : i
          ),
        })

        return true
      },

      setQty: (productId, qty) => get().updateQty(productId, qty),

      clearCart: () => set({ items: [] }),

      syncProduct: (product) => {
        set({
          items: get().items.map((i) =>
            i.product.id === product.id
              ? { ...i, product: { ...i.product, ...product } }
              : i
          ),
        })
      },

      total: () =>
        get().items.reduce(
          (acc, i) => acc + Number(i.product.sale_price || 0) * i.qty,
          0
        ),

      count: () =>
        get().items.reduce((acc, i) => acc + i.qty, 0),
    }),
    {
      name: 'hjstore-cart',
    }
  )
)