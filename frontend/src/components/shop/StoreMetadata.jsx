import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const TITLES = {
  '/': 'Tienda de moda y accesorios',
  '/catalogo': 'Catálogo de productos',
  '/carrito': 'Mi carrito',
  '/favoritos': 'Mis favoritos',
  '/checkout': 'Finalizar compra',
  '/login': 'Iniciar sesión',
  '/registro': 'Crear cuenta',
  '/mi-cuenta': 'Mi cuenta y pedidos',
  '/pago-confirmado': 'Estado de mi pago',
}
export const DEFAULT_DESCRIPTION = 'Descubre gorras, perfumes, relojes, bolsos y accesorios en HJStoreVP. Explora el catálogo y compra en Colombia.'
const PRIVATE_ROUTES = new Set(['/carrito', '/favoritos', '/checkout', '/login', '/registro', '/mi-cuenta', '/pago-confirmado'])

export function updateMeta(attribute, name, value) {
  const selector = `meta[${attribute}="${name}"]`
  let element = document.head.querySelector(selector)
  if (!element) {
    element = document.createElement('meta')
    element.setAttribute(attribute, name)
    document.head.appendChild(element)
  }
  element.setAttribute('content', String(value))
}

export function updateCanonical(url) {
  let link = document.head.querySelector('link[rel="canonical"]')
  if (!link) {
    link = document.createElement('link')
    link.setAttribute('rel', 'canonical')
    document.head.appendChild(link)
  }
  link.setAttribute('href', url)
}

export function updateStructuredData(value) {
  const id = 'hjstore-seo-structured-data'
  let node = document.getElementById(id)
  if (!value) {
    node?.remove()
    return
  }
  if (!node) {
    node = document.createElement('script')
    node.id = id
    node.type = 'application/ld+json'
    document.head.appendChild(node)
  }
  node.textContent = JSON.stringify(value).replace(/</g, '\\u003c')
}

export default function StoreMetadata() {
  const { pathname, search } = useLocation()
  useEffect(() => {
    const product = pathname.startsWith('/producto/')
    const description = DEFAULT_DESCRIPTION
    const title = product ? 'Detalle de producto' : TITLES[pathname] || 'Moda y accesorios'
    document.title = `${title} | HJStoreVP`
    updateMeta('name', 'description', description)
    updateMeta('name', 'robots', PRIVATE_ROUTES.has(pathname) || pathname === '/catalogo' && !!search
      ? 'noindex,follow' : 'index,follow')
    updateMeta('property', 'og:type', 'website')
    updateMeta('property', 'og:title', document.title)
    updateMeta('property', 'og:description', description)
    updateMeta('property', 'og:url', window.location.origin + pathname)
    updateMeta('name', 'twitter:title', document.title)
    updateMeta('name', 'twitter:description', description)
    const ogImage = document.head.querySelector('meta[property="og:image"]')
    ogImage?.remove()
    updateCanonical(window.location.origin + pathname)
    updateStructuredData(null)
  }, [pathname, search])
  return null
}
