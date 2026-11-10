// Contracto de superficie pública y de navegación administrativa.
// Comprueba rutas y presencia de elementos clave; NO sustituye pruebas E2E.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const files = {
  adminRoutes: '../frontend-admin/src/App.jsx',
  adminNav: '../frontend-admin/src/components/layout/AdminLayout.jsx',
  storefrontRoutes: 'src/App.jsx',
  shopLogin: 'src/pages/shop/LoginPage.jsx',
}
const read = (file) => readFileSync(resolve(process.cwd(), file), 'utf8')

const cases = [
  [files.adminRoutes, [
    'ProtectedAdmin', "['super_admin', 'admin', 'seller']",
    'DashboardPage', 'ProductsPage', 'CategoriesPage', 'InventoryPage',
    'OrdersPage', 'WebOrdersPage', 'LocationsPage', 'UsersPage', 'ReportsPage',
  ]],
  [files.adminNav, [
    'Dashboard', 'Productos', 'Categorías', 'Inventario',
    'Ventas físicas', 'Pedidos web', 'Puntos físicos', 'Usuarios', 'Reportes',
  ]],
  [files.storefrontRoutes, [
    '/catalogo', '/producto/:slug', '/carrito', '/checkout',
    '/login', '/registro', '/mi-cuenta', '/pago-confirmado',
  ]],
  [files.shopLogin, [
    "'super_admin'", "'admin'", "'seller'",
    'VITE_ADMIN_URL', 'window.location.assign',
  ]],
]

let hasFailures = false
for (const [path, fragments] of cases) {
  const code = read(path)
  for (const fragment of fragments) {
    if (!code.includes(fragment)) {
      console.error(`Falta contrato: ${fragment} en ${path}`)
      hasFailures = true
    }
  }
}
if (hasFailures) {
  console.error('El diseño no puede eliminar rutas o accesos originales.')
  process.exitCode = 1
} else {
  console.log('OK: superficie de navegación pública y administrativa preservada.')
}
