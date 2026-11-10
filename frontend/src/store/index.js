import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { authApi } from '../services/api'

const isPositiveInteger = (value) => Number.isSafeInteger(value) && value > 0
const validPrice = (value) => Number.isFinite(Number(value)) && Number(value) >= 0

const getAvailableStock = (product) => {
  const raw = product?.total_stock ?? product?.stock ?? null
  return raw === null || raw === undefined ? null : Number(raw)
}

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      accessToken: sessionStorage.getItem('access_token'),
      refreshToken: sessionStorage.getItem('refresh_token'),
      isAuthenticated: !!sessionStorage.getItem('access_token'),

      login: async (email, password) => {
        const { data } = await authApi.login({ email, password })

        sessionStorage.setItem('access_token', data.access_token)
        sessionStorage.setItem('refresh_token', data.refresh_token)

        set({
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          isAuthenticated: true,
          user: {
            id: data.user_id,
            fullName: data.full_name,
            role: data.user_role,
          },
        })

        return data
      },

      register: async (payload) => {
        const { data } = await authApi.register(payload)

        sessionStorage.setItem('access_token', data.access_token)
        sessionStorage.setItem('refresh_token', data.refresh_token)

        set({
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          isAuthenticated: true,
          user: {
            id: data.user_id,
            fullName: data.full_name,
            role: data.user_role,
          },
        })

        return data
      },

      loadMe: async () => {
        try {
          const { data } = await authApi.me()
          set({
            user: {
              id: data.id,
              fullName: data.full_name,
              role: data.role,
              email: data.email,
              phone: data.phone,
            },
            isAuthenticated: true,
          })
          return data
        } catch (error) {
          get().logout()
          throw error
        }
      },

      logout: () => {
        sessionStorage.removeItem('access_token')
        sessionStorage.removeItem('refresh_token')
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
      partialize: (state) => ({
        user: state.user,
      }),
      // Ignorar estados de autenticación antiguos del almacenamiento persistente.
      merge: (persisted, current) => ({
        ...current,
        user: persisted?.user ?? null,
      }),
    }
  )
)

export const useCartStore = create(
  persist(
    (set, get) => ({
      items: [],

      getItemQty: (productId) => {
        const item = get().items.find((i) => i.product.id === productId)
        return item ? item.qty : 0
      },

      canAdd: (product, qtyToAdd = 1) => {
        if (!isPositiveInteger(qtyToAdd) || !validPrice(product?.sale_price)) return false
        const available = getAvailableStock(product)
        if (available === null) return true

        const currentQty = get().getItemQty(product.id)
        return currentQty + qtyToAdd <= available
      },

      addItem: (product, qty = 1) => {
        if (!isPositiveInteger(qty) || !validPrice(product?.sale_price)) return false
        const items = get().items
        const existing = items.find((i) => i.product.id === product.id)
        const available = getAvailableStock(product)

        if (available !== null) {
          if (!Number.isSafeInteger(available) || available < 0) return false
          const currentQty = existing ? existing.qty : 0
          const nextQty = currentQty + qty
          if (nextQty > available) return false
        }

        if (existing) {
          set({
            items: items.map((i) =>
              i.product.id === product.id
                ? {
                    ...i,
                    qty: i.qty + qty,
                    product: { ...i.product, ...product },
                  }
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

      removeItem: (productId) => {
        set({
          items: get().items.filter((i) => i.product.id !== productId),
        })
      },

      updateQty: (productId, qty) => {
        if (!Number.isSafeInteger(qty)) return false
        const item = get().items.find((i) => i.product.id === productId)
        if (!item) return true

        if (qty <= 0) {
          get().removeItem(productId)
          return true
        }

        const available = getAvailableStock(item.product)
        if (available !== null && (!Number.isSafeInteger(available) || qty > available)) {
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
              ? {
                  ...i,
                  product: { ...i.product, ...product },
                }
              : i
          ),
        })
      },

      total: () =>
        get().items.reduce(
          (acc, i) => acc + (validPrice(i.product.sale_price) && isPositiveInteger(i.qty) ? Number(i.product.sale_price) * i.qty : 0),
          0
        ),

      count: () =>
        get().items.reduce((acc, i) => acc + (isPositiveInteger(i.qty) ? i.qty : 0), 0),
    }),
    {
      name: 'hjstore-cart',
    }
  )
)

// Favoritos locales por navegador. No modifica inventario, precios ni pedidos.
// El backend sigue siendo la fuente de verdad al añadir productos al carrito.
export const useWishlistStore = create(
  persist(
    (set, get) => ({
      items: [],
      has: (productId) => get().items.some((item) => item.id === productId),
      toggle: (product) => {
        const { id, name, slug, primary_image, sale_price } = product || {}
        if (!isPositiveInteger(Number(id)) || !slug) return
        const items = get().items
        if (items.some((item) => item.id === id)) {
          set({ items: items.filter((item) => item.id !== id) })
        } else {
          set({ items: [...items, { id, name, slug, primary_image, sale_price }].slice(-100) })
        }
      },
      remove: (productId) => set({
        items: get().items.filter((item) => item.id !== productId),
      }),
      clear: () => set({ items: [] }),
    }),
    { name: 'hjstore-wishlist-v1' }
  )
)


// Historial opcional, solo en el navegador. Nunca se envía al backend por
// sincronización ni a servicios externos. Hasta 12 IDs/slugs recientes.
export const useBrowsingStore = create(
  persist(
    (set, get) => ({
      enabled: false,
      viewed: [],
      setEnabled: (enabled) => set({
        enabled: Boolean(enabled),
        ...(!enabled ? { viewed: [] } : {}),
      }),
      recordView: (product) => {
        if (!get().enabled) return
        const id = Number(product?.id)
        const slug = product?.slug
        if (!isPositiveInteger(id) || typeof slug !== 'string' || !slug) return
        set({
          viewed: [{ id, slug }, ...get().viewed.filter((item) => item.id !== id)].slice(0, 12),
        })
      },
      clear: () => set({ viewed: [] }),
    }),
    {
      name: 'hjstore-browsing-history-v1',
      partialize: ({ enabled, viewed }) => ({ enabled, viewed }),
    }
  )
)
