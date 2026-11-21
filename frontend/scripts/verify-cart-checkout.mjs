// Fase E.2: contrato estático de seguridad del carrito y checkout.
// Las compras reales requieren pruebas de navegador y backend aislado.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const file = (path) => readFileSync(resolve(process.cwd(), path), 'utf8')
const store = file('src/store/index.js')
const checkout = file('src/pages/shop/CheckoutPage.jsx')
const app = file('src/App.jsx')
const failures = []

const expected = [
  [store, 'Carrito: cantidades enteras', 'Number.isSafeInteger'],
  [store, 'Carrito: rechaza cantidades no positivas', 'isPositiveInteger'],
  [store, 'Carrito: valida el precio', 'validPrice'],
  [store, 'Carrito: considera inventario', 'getAvailableStock'],
  [store, 'Carrito: rechaza sobreventa local', 'nextQty > available'],
  [store, 'Carrito: suma calculada', 'total: () =>'],
  [store, 'Carrito: vaciado', 'clearCart: ()'],
  [checkout, 'Checkout: misma clave para reintentos', 'checkoutIdempotencyKey'],
  [checkout, 'Checkout: persiste clave de intento', 'sessionStorage.setItem(CHECKOUT_KEY_STORAGE'],
  [checkout, 'Checkout: bloqueo de doble envío', 'submitLock'],
  [app, 'Checkout: ruta autenticada', '<ProtectedRoute><CheckoutPage /></ProtectedRoute>'],
]
for (const [source, label, fragment] of expected) {
  if (!source.includes(fragment)) failures.push(label)
}
if (failures.length) {
  console.error('Fase E.2: contrato carrito/checkout incompleto:\n' + failures.join('\n'))
  process.exit(1)
}
console.log('OK: contrato estático del carrito, checkout e idempotencia preservado')
