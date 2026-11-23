/** Rangos oficiales que comparten los chips, la URL y el filtro lateral. */
export const PRICE_OPTIONS = [
  { value: ':', title: 'Todos los precios', min: '', max: '' },
  { value: ':40000', title: 'Hasta $40.000', min: '', max: '40000' },
  { value: '40000:100000', title: '$40.000 a $100.000', min: '40000', max: '100000' },
  { value: '100000:200000', title: '$100.000 a $200.000', min: '100000', max: '200000' },
  { value: '200000:', title: 'Más de $200.000', min: '200000', max: '' },
]
export function canonicalPriceRange(min = '', max = '') {
  const requested = `${min || ''}:${max || ''}`
  const exact = PRICE_OPTIONS.find(option => option.value === requested)
  if (exact) return exact
  // Enlaces antiguos con solo el límite superior de los rangos intermedios.
  if (!min && max) {
    const byMax = PRICE_OPTIONS.find(option => option.max === String(max))
    if (byMax) return byMax
  }
  // No presentar un rango personalizado como si fuera una opción inexistente.
  return PRICE_OPTIONS[0]
}
