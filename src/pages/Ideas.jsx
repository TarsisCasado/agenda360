import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lightbulb, Plus, Loader2 } from 'lucide-react'
import { EmptyState, ErrorState } from '../components/ui/Common'
import { useInbox } from '../hooks/useInbox'
import { useAuth } from '../context/AuthContext'
import { useWorkspace } from '../context/WorkspaceContext'
import { useData } from '../context/DataContext'
import { useToast } from '../context/ToastContext'
import { inboxService } from '../services/inboxService'
import { ideaTitle, ideaSnippet, sortIdeasByRecent } from '../lib/ideas'
import { formatTimestamp } from '../lib/date'

// ---------------------------------------------------------------------------
// IDEIAS — lista enxuta (estilo Apple Notes). Reutiliza inbox_items (title +
// content livre) e o inboxService. A criacao NAO abre um modal/formulario:
// cria uma nota em branco e leva direto ao editor em tela cheia (/ideias/:id).
// ---------------------------------------------------------------------------

export default function Ideas() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { workspaceId } = useWorkspace()
  const { reload: reloadData } = useData()
  const { toast } = useToast()
  const { notes, loading, error, reload } = useInbox()
  const [creating, setCreating] = useState(false)

  const ideas = useMemo(() => sortIdeasByRecent(notes), [notes])

  const novaIdeia = async () => {
    if (creating) return
    setCreating(true)
    try {
      const saved = await inboxService.create(workspaceId, user.id, { title: '', content: '' })
      reloadData()
      // Vai direto para a escrita — sem modal. Passa a nota criada por state
      // para o editor abrir instantaneo (sem esperar a lista recarregar).
      navigate(`/ideias/${saved.id}`, { state: { note: saved } })
    } catch (err) {
      toast('Erro ao criar ideia: ' + err.message, 'error')
      setCreating(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-5 flex items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-amber-500">
            <Lightbulb size={18} />
            <span className="text-sm font-semibold">Escreva sem fricção</span>
          </div>
          <h1 className="mt-0.5 text-2xl font-extrabold text-slate-800 dark:text-slate-100">Ideias</h1>
        </div>
        <button onClick={novaIdeia} disabled={creating} className="btn-primary press shrink-0">
          {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          Nova ideia
        </button>
      </header>

      {error ? (
        <ErrorState onRetry={reload} />
      ) : loading && ideas.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800/60" />
          ))}
        </div>
      ) : ideas.length === 0 ? (
        <EmptyState
          icon={Lightbulb}
          title="Nenhuma ideia ainda"
          description="Capture um pensamento, um rascunho, uma lista — sem formulário. Toque em Nova ideia e comece a escrever."
          action={
            <button onClick={novaIdeia} className="btn-primary press">
              <Plus size={16} /> Nova ideia
            </button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {ideas.map((note) => {
            const title = ideaTitle(note)
            const sub = ideaSnippet(note)
            // updated_at/created_at sao TIMESTAMPS, nao datas puras.
            const stamp = formatTimestamp(note.updated_at || note.created_at)
            return (
              <li key={note.id}>
                <button
                  onClick={() => navigate(`/ideias/${note.id}`, { state: { note } })}
                  className="interactive card block w-full px-4 py-3.5 text-left hover:-translate-y-0.5 hover:shadow-md"
                >
                  <p className="truncate text-[15px] font-bold text-slate-800 dark:text-slate-100">{title}</p>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
                    {stamp && <span className="shrink-0">{stamp}</span>}
                    {sub && <span className="truncate text-slate-500 dark:text-slate-400">{sub}</span>}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
