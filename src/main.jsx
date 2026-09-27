import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { ThemeProvider } from './context/ThemeContext'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import ErrorBoundary from './components/ErrorBoundary'

// Carimbo do build no proprio documento. Nao e debug visual: e um atributo e
// uma variavel. Existe porque o CP5.5.1 provou que "qual versao esta na tela"
// nao pode ser respondido olhando a tela — precisa ser lido.
if (typeof document !== 'undefined') {
  document.documentElement.dataset.build = import.meta.env.VITE_BUILD_ID || 'dev'
  window.__AGENDA360_BUILD__ = import.meta.env.VITE_BUILD_ID || 'dev'
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {/* Error Boundary GLOBAL: captura falhas inesperadas em qualquer parte da
          UI, inclusive Login e os providers (o boundary interno em App.jsx
          continua isolando erros por rota). */}
      <ErrorBoundary>
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>,
)
