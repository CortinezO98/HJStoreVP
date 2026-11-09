import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const TITLES = {
  '/': 'Tienda de moda y accesorios',
  '/catalogo': 'Catálogo de productos',
  '/carrito': 'Mi carrito',
  '/checkout': 'Finalizar compra',
  '/login': 'Iniciar sesión',
  '/registro': 'Crear cuenta',
  '/mi-cuenta': 'Mi cuenta y pedidos',
  '/pago-confirmado': 'Estado de mi pago',
}
const DESCRIPTION = 'Descubre gorras, perfumes, relojes, bolsos y accesorios en HJStoreVP. Explora el catálogo y compra en Colombia.'

export default function StoreMetadata() {
  const { pathname } = useLocation()
  useEffect(() => {
    const title = pathname.startsWith('/producto/')
      ? 'Detalle de producto'
      : TITLES[pathname] || 'Moda y accesorios'
    document.title = `${title} | HJStoreVP`
    const description = document.querySelector('meta[name="description"]')
    if (description) description.setAttribute('content', DESCRIPTION)
  }, [pathname])
  return null
}
