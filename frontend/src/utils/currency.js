/** Precios comerciales uniformes en COP; sin espacio entre símbolo y cifra. */
const digits = new Intl.NumberFormat('es-CO', {
  style: 'decimal', maximumFractionDigits: 0, minimumFractionDigits: 0,
})
export function formatCOP(value) {
  const amount = Number(value)
  return `$${digits.format(Number.isFinite(amount) ? amount : 0)}`
}
