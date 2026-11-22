import { useEffect, useRef } from 'react'
import { create } from 'zustand'
import { AlertTriangle, HelpCircle } from 'lucide-react'

const useConfirmStore = create((set) => ({ request: null, set }))

/**
 * Reemplazo accesible de window.confirm. Devuelve una promesa con true/false.
 * Uso: if (!(await confirmAction('¿Eliminar…?', { danger: true }))) return
 */
export function confirmAction(message, { title, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', danger = false } = {}) {
  return new Promise((resolve) => {
    useConfirmStore.setState({ request: { message, title, confirmLabel, cancelLabel, danger, resolve } })
  })
}

export function ConfirmHost() {
  const request = useConfirmStore((s) => s.request)
  const confirmRef = useRef(null)
  const cancelRef = useRef(null)

  const close = (value) => {
    request?.resolve(value)
    useConfirmStore.setState({ request: null })
  }

  useEffect(() => {
    if (!request) return undefined
    const previous = document.activeElement
    // En acciones destructivas el foco inicial va a «Cancelar».
    const target = request.danger ? cancelRef.current : confirmRef.current
    requestAnimationFrame(() => target?.focus())
    const onKey = (event) => {
      if (event.key === 'Escape') close(false)
      if (event.key === 'Tab') {
        const nodes = [cancelRef.current, confirmRef.current].filter(Boolean)
        const index = nodes.indexOf(document.activeElement)
        event.preventDefault()
        nodes[(index + (event.shiftKey ? nodes.length - 1 : 1)) % nodes.length]?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); previous?.focus?.() }
  }, [request])

  if (!request) return null
  const Icon = request.danger ? AlertTriangle : HelpCircle
  return (
    <div className="hj-confirm-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) close(false) }}>
      <div className="hj-confirm" role="alertdialog" aria-modal="true" aria-labelledby="hj-confirm-title" aria-describedby="hj-confirm-text">
        <span className={`hj-confirm-icon ${request.danger ? 'is-danger' : ''}`}><Icon size={20} /></span>
        <h2 id="hj-confirm-title">{request.title || (request.danger ? 'Confirma esta acción' : 'Confirmar')}</h2>
        <p id="hj-confirm-text">{request.message}</p>
        <div className="hj-confirm-actions">
          <button ref={cancelRef} type="button" className="btn btn-outline-secondary" onClick={() => close(false)}>{request.cancelLabel}</button>
          <button ref={confirmRef} type="button" className={`btn ${request.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => close(true)}>{request.confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
