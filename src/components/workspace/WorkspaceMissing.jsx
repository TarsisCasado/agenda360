import { useState } from 'react'
import { Building2, RotateCcw, Plus, LogOut } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useWorkspace } from '../../context/WorkspaceContext'
import { useToast } from '../../context/ToastContext'
import { workspaceService } from '../../services/workspaceService'

// Estado elegante para quando o usuario esta autenticado mas nao possui nenhum
// workspace utilizavel (perfil mal provisionado ou falha ao carregar a lista).
// Nunca lanca excecao e nunca deixa a tela em loading eterno: oferece recuperar.
export default function WorkspaceMissing() {
  const { user, signOut } = useAuth()
  const { reloadWorkspaces } = useWorkspace()
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)

  const retry = async () => {
    setBusy(true)
    try {
      await reloadWorkspaces()
    } finally {
      setBusy(false)
    }
  }

  const createPersonal = async () => {
    if (!user?.id) return
    setBusy(true)
    try {
      await workspaceService.create(user.id, { name: 'Pessoal' })
      await reloadWorkspaces()
      toast('Espaço criado')
    } catch (err) {
      toast('Nao foi possivel criar agora: ' + (err?.message || 'erro'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="card w-full max-w-md p-8 text-center" role="alert">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-900/30">
          <Building2 size={26} />
        </div>
        <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">
          Nenhum espaço encontrado
        </h1>
        <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
          Não encontramos um workspace para a sua conta. Você pode tentar
          recarregar ou criar seu espaço pessoal para começar.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button onClick={createPersonal} disabled={busy} className="btn-primary press">
            <Plus size={16} /> Criar meu espaço
          </button>
          <button onClick={retry} disabled={busy} className="btn-secondary press">
            <RotateCcw size={16} /> Tentar novamente
          </button>
        </div>
        <button
          onClick={signOut}
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        >
          <LogOut size={14} /> Sair da conta
        </button>
      </div>
    </div>
  )
}
