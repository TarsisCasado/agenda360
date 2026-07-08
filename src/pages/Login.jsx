import { useState } from 'react'
import { CalendarDays, Sparkles, KanbanSquare, BarChart3 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

export default function Login() {
  const { signIn, signUp, isDemo } = useAuth()
  const { toast } = useToast()
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const { error } =
        mode === 'signin'
          ? await signIn(email, password)
          : await signUp(email, password, fullName)
      if (error) {
        toast(error, 'error')
      } else if (mode === 'signup') {
        toast('Conta criada! Verifique seu e-mail se necessario.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Lado ilustrativo */}
      <div className="hidden flex-1 flex-col justify-between bg-gradient-to-br from-brand-600 to-brand-800 p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15">
            <CalendarDays size={24} />
          </div>
          <span className="text-xl font-extrabold">Agenda Inteligente 360</span>
        </div>
        <div>
          <h1 className="text-4xl font-extrabold leading-tight">
            Organize sua rotina
            <br />
            de ponta a ponta.
          </h1>
          <p className="mt-4 max-w-md text-brand-100">
            Calendario, kanban semanal, gestor de tarefas, central de links e um
            assistente de produtividade com IA — tudo em um so lugar.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-4">
            {[
              { icon: CalendarDays, label: 'Agenda diaria' },
              { icon: KanbanSquare, label: 'Kanban semanal' },
              { icon: Sparkles, label: 'Assistente IA' },
              { icon: BarChart3, label: 'Relatorios' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2 text-brand-50">
                <Icon size={18} /> {label}
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-brand-200">React + Vite + Supabase + Tailwind</p>
      </div>

      {/* Formulario */}
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center lg:hidden">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white">
              <CalendarDays size={24} />
            </div>
            <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-100">
              Agenda Inteligente 360
            </h1>
          </div>

          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
            {mode === 'signin' ? 'Bem-vindo de volta' : 'Criar conta'}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {mode === 'signin'
              ? 'Entre para acessar sua agenda.'
              : 'Cadastre-se para comecar.'}
          </p>

          {isDemo && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
              <strong>Modo demo ativo.</strong> O Supabase nao esta configurado —
              qualquer e-mail/senha entra e os dados ficam salvos localmente neste
              navegador.
            </div>
          )}

          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="label">Nome completo</label>
                <input
                  className="input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Seu nome"
                  required
                />
              </div>
            )}
            <div>
              <label className="label">E-mail</label>
              <input
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@email.com"
                required
              />
            </div>
            <div>
              <label className="label">Senha</label>
              <input
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? 'Aguarde...' : mode === 'signin' ? 'Entrar' : 'Criar conta'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            {mode === 'signin' ? 'Ainda nao tem conta?' : 'Ja tem conta?'}{' '}
            <button
              onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
              className="font-semibold text-brand-600 hover:underline"
            >
              {mode === 'signin' ? 'Criar agora' : 'Fazer login'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
