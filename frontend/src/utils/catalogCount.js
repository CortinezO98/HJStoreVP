const CATEGORY_NAMES = {
  gorras: ['gorra', 'gorras'],
  perfumes: ['perfume', 'perfumes'],
  relojes: ['reloj', 'relojes'],
  bolsos: ['bolso', 'bolsos'],
  canguros: ['canguro', 'canguros'],
}
export function formatCatalogCount(value, category = '') {
  const count = Number(value) || 0
  const [singular, plural] = CATEGORY_NAMES[category] || ['producto', 'productos']
  return `${count} ${count === 1 ? singular : plural}`
}
