import { Component } from 'react'
import { AlertTriangle, RotateCcw, Home } from 'lucide-react'

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

  handleHome = () => {
    // Volta para o inicio de forma resiliente (funciona mesmo fora do Router).
    window.location.assign('/')
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div
        role="alert"
        className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center"
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-500 dark:bg-red-950/40">
          <AlertTriangle size={26} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
            Algo deu errado
          </h2>
          <p className="mt-1 max-w-sm text-sm text-slate-500">
            Encontramos um problema ao exibir esta tela. Voce pode tentar novamente
            — seus dados estao seguros.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={this.handleReset} className="btn-secondary press">
            <RotateCcw size={16} /> Tentar novamente
          </button>
          <button onClick={this.handleHome} className="btn-primary press">
            <Home size={16} /> Voltar para inicio
          </button>
        </div>
      </div>
    )
  }
}
