import { useEffect, useState, useCallback } from 'react'
import { Plus, Trash2, Palette, History, Database, Users } from 'lucide-react'
import { PageHeader } from '../components/ui/Common'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import { useToast } from '../context/ToastContext'
import { categoryService } from '../services/categoryService'
import { logService } from '../services/logService'
import { localStore } from '../services/localStore'
import { LOG_ACTION_LABELS, ROLE_LABELS } from '../lib/constants'

const PRESET_COLORS = [
  '#6366f1', '#0ea5e9', '#8b5cf6', '#f59e0b', '#10b981',
  '#ec4899', '#ef4444', '#14b8a6', '#84cc16', '#f97316',
]

export default function Settings() {
  const { user, isDemo } = useAuth()
  const { categories, loadCategories } = useData()
  const { toast } = useToast()
  const [newCat, setNewCat] = useState({ name: '', color: PRESET_COLORS[0] })
  const [logs, setLogs] = useState([])

  const loadLogs = useCallback(async () => {
    const data = await logService.list(user.id, { limit: 20 })
    setLogs(data)
  }, [user.id])

  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  const addCategory = async (e) => {
    e.preventDefault()
    if (!newCat.name.trim()) return
    await categoryService.create(user.id, newCat)
    setNewCat({ name: '', color: PRESET_COLORS[0] })
    await loadCategories()
    toast('Categoria criada')
  }

  const removeCategory = async (id) => {
    await categoryService.remove(id)
    await loadCategories()
    toast('Categoria removida')
  }

  const resetDemo = () => {
    if (!window.confirm('Isso apaga todos os dados locais e recria o seed. Continuar?'))
      return
    localStore.reset()
    window.location.reload()
  }

  return (
    <div>
      <PageHeader title="Configuracoes" subtitle="Categorias, conta e historico" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Conta */}
        <div className="card p-5">
          <div className="mb-4 flex items-center gap-2 text-brand-600">
            <Users size={18} />
            <h2 className="font-bold">Conta</h2>
          </div>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Nome</dt>
              <dd className="font-medium">{user?.full_name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">E-mail</dt>
              <dd className="font-medium">{user?.email}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Perfil</dt>
              <dd>
                <span className="chip bg-brand-50 text-brand-600 dark:bg-brand-900/30">
                  {ROLE_LABELS[user?.role] || user?.role}
                </span>
              </dd>
            </div>
          </dl>
          <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800/60">
            A estrutura ja suporta os perfis <strong>Administrador</strong>,{' '}
            <strong>Gestor</strong> e <strong>Colaborador</strong>, alem de
            delegacao de atividades entre usuarios da equipe.
          </p>
        </div>

        {/* Categorias */}
        <div className="card p-5">
          <div className="mb-4 flex items-center gap-2 text-brand-600">
            <Palette size={18} />
            <h2 className="font-bold">Categorias</h2>
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            {categories.map((c) => (
              <span
                key={c.id}
                className="chip group border border-slate-200 dark:border-slate-700"
                style={{ color: c.color }}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: c.color }}
                />
                {c.name}
                <button
                  onClick={() => removeCategory(c.id)}
                  className="ml-1 text-slate-300 hover:text-red-500"
                >
                  <Trash2 size={11} />
                </button>
              </span>
            ))}
          </div>
          <form onSubmit={addCategory} className="flex items-end gap-2">
            <div className="flex-1">
              <label className="label">Nova categoria</label>
              <input
                className="input"
                value={newCat.name}
                onChange={(e) => setNewCat((c) => ({ ...c, name: e.target.value }))}
                placeholder="Nome"
              />
            </div>
            <div className="flex gap-1">
              {PRESET_COLORS.slice(0, 5).map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setNewCat((c) => ({ ...c, color }))}
                  className="h-6 w-6 rounded-full ring-2 ring-offset-1 dark:ring-offset-slate-900"
                  style={{
                    backgroundColor: color,
                    '--tw-ring-color':
                      newCat.color === color ? color : 'transparent',
                  }}
                />
              ))}
            </div>
            <button type="submit" className="btn-primary">
              <Plus size={16} />
            </button>
          </form>
        </div>

        {/* Historico */}
        <div className="card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center gap-2 text-brand-600">
            <History size={18} />
            <h2 className="font-bold">Historico de atividades</h2>
          </div>
          {logs.length === 0 ? (
            <p className="text-sm text-slate-400">Sem registros ainda.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {logs.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="chip bg-slate-100 text-slate-500 dark:bg-slate-800">
                      {LOG_ACTION_LABELS[l.action] || l.action}
                    </span>
                    <span className="text-slate-600 dark:text-slate-300">
                      {l.description}
                    </span>
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">
                    {new Date(l.created_at).toLocaleString('pt-BR')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Modo demo */}
        {isDemo && (
          <div className="card border-amber-200 p-5 dark:border-amber-800 lg:col-span-2">
            <div className="mb-2 flex items-center gap-2 text-amber-600">
              <Database size={18} />
              <h2 className="font-bold">Dados locais (modo demo)</h2>
            </div>
            <p className="mb-3 text-sm text-slate-500">
              Voce esta rodando sem Supabase. Os dados ficam apenas neste navegador.
              Configure as variaveis <code>VITE_SUPABASE_URL</code> e{' '}
              <code>VITE_SUPABASE_ANON_KEY</code> para persistir na nuvem.
            </p>
            <button onClick={resetDemo} className="btn-danger">
              <Trash2 size={16} /> Resetar dados locais
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
