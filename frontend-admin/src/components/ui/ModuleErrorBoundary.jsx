import { Component } from 'react'
import { AlertTriangle, RotateCcw, LayoutDashboard } from 'lucide-react'

/**
 * Aísla los errores de cada módulo: si una pantalla falla (respuesta inesperada
 * de la API, dato faltante), se muestra un aviso con opciones de recuperación en
 * lugar de dejar todo el panel en blanco. El menú y la sesión siguen disponibles.
 */
export default class ModuleErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="hj-state" role="alert">
        <span className="hj-confirm-icon is-danger"><AlertTriangle size={20} /></span>
        <h2>Este módulo no pudo mostrarse</h2>
        <p>Ocurrió un error al preparar la información. El resto del panel sigue funcionando. Intenta de nuevo; si se repite, avisa a soporte con la hora y el módulo.</p>
        {import.meta.env.DEV && <code>{String(error?.message || error)}</code>}
        <div className="d-flex flex-wrap gap-2 justify-content-center mt-2">
          <button type="button" className="btn btn-primary" onClick={() => this.setState({ error: null })}>
            <RotateCcw size={16} /> Reintentar
          </button>
          <a href="/" className="btn btn-outline-secondary"><LayoutDashboard size={16} /> Ir al dashboard</a>
        </div>
      </div>
    )
  }
}
