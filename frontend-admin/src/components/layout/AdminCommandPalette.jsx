import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ArrowRight, X } from 'lucide-react'

const normalize = (value = '') => value.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '')

/**
 * Keyboard-first navigation for authorized admin modules.
 * Receives only the links already filtered by the current user's role.
 * Does not alter authorization or access to backend endpoints.
 */
export default function AdminCommandPalette({ open, onClose, items }) {
  const navigate = useNavigate()
  const searchRef = useRef(null)
  const dialogRef = useRef(null)
  const previousFocus = useRef(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const results = useMemo(() => {
    const needle = normalize(query.trim())
    return needle ? items.filter((item) => normalize(item.label).includes(needle)) : items
  }, [items, query])

  useEffect(() => {
    if (!open) {
      setQuery('')
      setSelected(0)
      return undefined
    }
    previousFocus.current = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const frame = requestAnimationFrame(() => searchRef.current?.focus())
    const onEscape = (event) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onEscape)
    return () => {
      cancelAnimationFrame(frame)
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onEscape)
      previousFocus.current?.focus?.()
    }
  }, [open, onClose])

  const goTo = (item) => {
    if (!item) return
    onClose()
    navigate(item.to)
  }
  if (!open) return null

  return (
    <div className="admin-command-overlay" role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="admin-command-dialog" role="dialog" aria-modal="true"
        aria-label="Buscar módulo administrativo" ref={dialogRef}
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return
          const controls = Array.from(dialogRef.current?.querySelectorAll('input:not(:disabled), button:not(:disabled)') || [])
          if (!controls.length) return
          const first = controls[0], last = controls[controls.length - 1]
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault()
            last.focus()
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first.focus()
          }
        }}>
        <div className="admin-command-search-bar">
          <Search size={19} aria-hidden="true"/>
          <input ref={searchRef} type="search" autoComplete="off"
            placeholder="Buscar productos, pedidos, inventario…"
            aria-label="Buscar módulos del panel"
            role="combobox" aria-autocomplete="list"
            aria-controls="admin-command-results"
            aria-expanded={results.length > 0}
            aria-activedescendant={results[selected] ? `admin-command-item-${selected}` : undefined}
            value={query}
            onChange={(event) => { setQuery(event.target.value); setSelected(0) }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') { event.preventDefault(); setSelected((index) => Math.min(results.length - 1, index + 1)) }
              else if (event.key === 'ArrowUp') { event.preventDefault(); setSelected((index) => Math.max(0, index - 1)) }
              else if (event.key === 'Enter') { event.preventDefault(); goTo(results[selected]) }

            }}/>
          <button type="button" className="admin-command-close" onClick={onClose}
            aria-label="Cerrar buscador"><X size={19}/></button>
        </div>
        <div id="admin-command-results" className="admin-command-results" role="listbox"
          aria-label="Módulos disponibles para tu perfil">
          {results.length ? results.map((item, index) => {
            const Icon = item.icon
            return (
              <button key={item.to} type="button" role="option" id={`admin-command-item-${index}`}
                aria-selected={index === selected}
                className={`admin-command-result ${index === selected ? 'is-selected' : ''}`}
                onMouseMove={() => setSelected(index)}
                onClick={() => goTo(item)}>
                <span className="admin-command-result-icon"><Icon size={18} aria-hidden="true"/></span>
                <span>{item.label}</span>
                <ArrowRight size={16} className="admin-command-result-arrow" aria-hidden="true"/>
              </button>
            )
          }) : <p className="admin-command-empty">No hay módulos disponibles con ese nombre.</p>}
        </div>
        <div className="admin-command-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> Navegar</span>
          <span><kbd>Enter</kbd> Abrir</span>
          <span><kbd>Esc</kbd> Cerrar</span>
        </div>
      </section>
    </div>
  )
}
