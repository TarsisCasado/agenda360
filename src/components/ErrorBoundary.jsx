import { Component } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

// Captura erros de renderizacao e mostra um fallback elegante em vez de deixar
// a aplicacao com tela branca. Envolve as rotas no App.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    // Ponto de integracao futuro com um servico de monitoramento (Sentry etc.)
    console.error('[Agenda360] Erro capturado pelo ErrorBoundary:', error, info)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-500 dark:bg-red-950/40">
          <AlertTriangle size={26} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
            Algo deu errado
          </h2>
          <p className="mt-1 max-w-sm text-sm text-slate-500">
            Encontramos um problema ao exibir esta tela. Voce pode tentar recarregar
            — seus dados estao seguros.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={this.handleReset} className="btn-secondary">
            <RotateCcw size={16} /> Tentar novamente
          </button>
          <button onClick={() => window.location.reload()} className="btn-primary">
            Recarregar app
          </button>
        </div>
      </div>
    )
  }
}
