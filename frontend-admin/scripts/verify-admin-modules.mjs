import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Baseline safety contract: layout must preserve every module/role.
// This is a static regression gate; full CRUD still needs end-to-end testing.
const read = (path) => readFileSync(resolve(process.cwd(), path), 'utf8')
const app = read('src/App.jsx')
const layout = read('src/components/layout/AdminLayout.jsx')

const routes = [
  ['Dashboard', 'DashboardPage', '/'],
  ['Productos', 'ProductsPage', 'productos'],
  ['Categorías', 'CategoriesPage', 'categorias'],
  ['Inventario', 'InventoryPage', 'inventario'],
  ['Ventas físicas', 'OrdersPage', 'pedidos'],
  ['Pedidos web', 'WebOrdersPage', 'pedidos-web'],
  ['Puntos físicos', 'LocationsPage', 'puntos'],
  ['Usuarios', 'UsersPage', 'usuarios'],
  ['Reportes', 'ReportsPage', 'reportes'],
]
const requiredRoles = ["'super_admin'", "'admin'", "'seller'"]
const missing = []
if (/<Navigation\\b/.test(layout)) {
  missing.push('Menú: referencia <Navigation> global (provoca Illegal constructor y pantalla blanca)')
}
if (!layout.includes('function AdminNavigation(') || !layout.includes('<AdminNavigation ')) {
  missing.push('Menú: falta montar AdminNavigation')
}


for (const [label, component, route] of routes) {
  if (!app.includes(`<${component}`)) missing.push(`Componente ${component}`)
  if (route !== '/' && !app.includes(`path="${route}"`)) missing.push(`Ruta ${route}`)
  if (!layout.includes(`label: '${label}'`)) missing.push(`Menú ${label}`)
}
for (const role of requiredRoles) {
  if (!app.includes(role) || !layout.includes(role)) missing.push(`Rol ${role}`)
}
for (const name of ['ProtectedAdmin', 'NAV_ITEMS', 'logout', 'Outlet']) {
  if (!layout.includes(name) && !app.includes(name)) missing.push(`Acceso ${name}`)
}

for (const [file, required] of [
  ['src/pages/ProductsPage.jsx', ['productsApi', 'categoriesApi', 'useMutation']],
  ['src/pages/InventoryPage.jsx', ['inventoryApi', 'locationsApi', 'useMutation']],
  ['src/pages/UsersPage.jsx', ['usersApi', 'useMutation']],
  ['src/pages/OrdersPage.jsx', ['physicalSalesApi', 'useMutation']],
  ['src/pages/WebOrdersPage.jsx', ['ordersApi']],
  ['src/pages/LocationsPage.jsx', ['locationsApi']],
  ['src/pages/ReportsPage.jsx', ['analyticsApi']],
]) {
  const code = read(file)
  for (const text of required) {
    if (!code.includes(text)) missing.push(`${file}: ${text}`)
  }
}

// Comprobar que la navegación de catálogo preserve componentes y funciones clave.
for (const [path, required] of [
  ['src/pages/ProductsPage.jsx', [
    'ProductImagesManager', 'ProductVariantsManager', 'ProductFormModal',
    'productsApi.create', 'productsApi.update', 'productsApi.delete',
    'admin-products', 'pageProducts', 'setPerPage', 'setSortBy',
    'aria-label={`Editar producto',
  ]],
  ['src/pages/CategoriesPage.jsx', [
    'CategoryModal', 'include_inactive: true', '/toggle',
    'setSearch', 'setStatus', 'mutation.mutate(form)',
  ]],
]) {
  const code = read(path)
  for (const symbol of required) {
    if (!code.includes(symbol)) missing.push(`${path}: falta ${symbol}`)
  }
}

if (missing.length) {
  console.error('Contrato administrativo incompleto:\n' + missing.join('\n'))
  process.exit(1)
}
console.log('OK: módulos, rutas, roles y puntos de acceso originales preservados')
