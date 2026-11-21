// Security regression baseline for React Router 7 migration.
// Static checks complement Vite's compile; no live payments or API required.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (path) => readFileSync(resolve(process.cwd(), path), 'utf8')
const app = read('src/App.jsx')
const entry = read('src/main.jsx')
const packageJson = JSON.parse(read('package.json'))

const neededRoutes = [
  '/', '/catalogo', '/producto/:slug', '/carrito', '/favoritos',
  '/politicas/:policy', '/pago-confirmado', '/checkout', '/mi-cuenta',
  '/login', '/registro',
]
const missing = neededRoutes.filter((route) => !app.includes(`path="${route}"`))
if (!app.includes('ProtectedRoute') || !app.includes('isAuthenticated') ||
    !app.includes('useLocation') || !app.includes('<Navigate')) {
  missing.push('Guard de compra / autenticación / redirección')
}
if (!entry.includes('BrowserRouter') || !entry.includes('QueryClientProvider')) {
  missing.push('Enrutamiento o estado de peticiones')
}
for (const component of [
  'HomePage', 'CatalogPage', 'ProductPage', 'CartPage', 'CheckoutPage',
  'AccountPage', 'PaymentConfirmationPage', 'StorePolicyPage',
]) {
  if (!app.includes(`<${component}`)) missing.push(`Página ${component}`)
}
if (packageJson.dependencies['react-router-dom'] !== '7.18.6') {
  missing.push('react-router-dom 7.18.6')
}
if (missing.length) {
  console.error('Contrato storefront incompleto:\n' + missing.join('\n'))
  process.exit(1)
}
console.log('OK: rutas, guard de checkout/cuenta y navegación preservados')
