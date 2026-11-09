import { Component } from 'react'
import { AlertTriangle } from 'lucide-react'

export default class StoreErrorBoundary extends Component {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    // No registrar credenciales ni estados completos de los formularios.
    if (import.meta.env.DEV) {
      console.error('Error de interfaz HJStoreVP:', error?.message, info?.componentStack)
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="store-container store-section">
          <div className="store-empty-state" role="alert">
            <AlertTriangle size={40} strokeWidth={1.4}/>
            <h1 className="text-2xl font-black mt-5 uppercase">Algo salió mal</h1>
            <p>No pudimos mostrar esta pantalla. Vuelve a cargar la página para continuar.</p>
            <button type="button" className="store-button store-button-dark" onClick={() => window.location.reload()}>
              RECARGAR PÁGINA
            </button>
          </div>
        </main>
      )
    }
    return this.props.children
  }
}
