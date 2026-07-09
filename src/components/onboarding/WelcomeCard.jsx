import { useState } from 'react'
import { Sparkles, X, Plus, KanbanSquare, Command } from 'lucide-react'

const KEY = 'agenda360.onboarding.dismissed'

// Card de primeiro acesso: guia o usuario sem sobrecarregar a tela.
// Aparece so uma vez (armazenado no localStorage) e pode ser dispensado.
export default function WelcomeCard({ onCreateTask }) {
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(KEY) === '1',
  )
  if (dismissed) return null

  const close = () => {
    localStorage.setItem(KEY, '1')
    setDismissed(true)
  }

  const steps = [
    { icon: Plus, text: 'Toque em Nova atividade para criar sua primeira tarefa.' },
    { icon: KanbanSquare, text: 'Organize a semana arrastando no Kanban.' },
    { icon: Command, text: 'Pressione ⌘K a qualquer momento para buscar e agir rapido.' },
  ]

  return (
    <div className="relative overflow-hidden rounded-xl border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-5 dark:border-brand-900/60 dark:from-brand-900/20 dark:to-slate-900 animate-in">
      <button
        onClick={close}
        aria-label="Dispensar"
        className="absolute right-3 top-3 rounded-lg p-1 text-slate-400 hover:bg-black/5 dark:hover:bg-white/10"
      >
        <X size={16} />
      </button>
      <div className="flex items-center gap-2 text-brand-600 dark:text-brand-300">
        <Sparkles size={18} />
        <h2 className="font-bold">Bem-vindo a Agenda 360</h2>
      </div>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
        Seu assistente pessoal de produtividade. Em 3 passos voce ja domina:
      </p>
      <ul className="mt-3 space-y-2">
        {steps.map((s, i) => (
          <li key={i} className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-200">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-brand-600 shadow-sm dark:bg-slate-800 dark:text-brand-300">
              <s.icon size={15} />
            </span>
            {s.text}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex gap-2">
        <button onClick={onCreateTask} className="btn-primary press">
          <Plus size={16} /> Criar primeira tarefa
        </button>
        <button onClick={close} className="btn-ghost">
          Explorar sozinho
        </button>
      </div>
    </div>
  )
}
