import { createContext, useContext, useState, useCallback } from 'react'
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react'
import { cx } from '../lib/utils'

const ToastContext = createContext(null)

const ICONS = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback(
    (message, type = 'success') => {
      const id = Date.now() + Math.random()
      setToasts((prev) => [...prev, { id, message, type }])
      setTimeout(() => dismiss(id), 3500)
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        {toasts.map((t) => {
          const Icon = ICONS[t.type] || Info
          return (
            <div
              key={t.id}
              className={cx(
                'flex items-center gap-3 rounded-lg border px-4 py-3 shadow-lg animate-in',
                'bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100',
                t.type === 'success' && 'border-emerald-300 dark:border-emerald-700',
                t.type === 'error' && 'border-red-300 dark:border-red-700',
                t.type === 'info' && 'border-slate-200 dark:border-slate-700',
              )}
            >
              <Icon
                size={18}
                className={cx(
                  t.type === 'success' && 'text-emerald-500',
                  t.type === 'error' && 'text-red-500',
                  t.type === 'info' && 'text-brand-500',
                )}
              />
              <span className="text-sm font-medium">{t.message}</span>
              <button
                onClick={() => dismiss(t.id)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X size={16} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast deve ser usado dentro de ToastProvider')
  return ctx
}
