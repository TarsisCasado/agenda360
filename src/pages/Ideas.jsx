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
      <header className="mb-5 flex items-end justify-between gap-3 px-2">
        <div>
          <h1 className="text-display">Ideias</h1>
          <p className="text-caption mt-1">
            {ideas.length > 0 ? `${ideas.length} anotação${ideas.length > 1 ? 'ões' : ''}` : 'Escreva sem fricção'}
          </p>
        </div>
        {/* Acao contextual, nao botao permanente com rotulo longo. */}
        <button
          onClick={novaIdeia}
          disabled={creating}
          aria-label="Nova ideia"
          className="press flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-white"
        >
          {creating ? <Loader2 size={17} className="animate-spin" /> : <Plus size={19} />}
        </button>
      </header>

      {error ? (
        <ErrorState onRetry={reload} />
      ) : loading && ideas.length === 0 ? (
        <div className="space-y-2 px-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-16" />
          ))}
        </div>
      ) : ideas.length === 0 ? (
        <EmptyState
          icon={Lightbulb}
          title="Nenhuma ideia ainda"
          description="Capture um pensamento, um rascunho, uma lista — sem formulário. Toque em Nova ideia e comece a escrever."
          action={
            <button onClick={novaIdeia} className="btn-secondary press">
              <Plus size={15} /> Nova ideia
            </button>
          }
        />
      ) : (
        // Lista estilo Notes: o conteudo manda, a moldura some.
        <ul className="list">
          {ideas.map((note) => {
            const title = ideaTitle(note)
            const sub = ideaSnippet(note)
            // updated_at/created_at sao TIMESTAMPS, nao datas puras.
            const stamp = formatTimestamp(note.updated_at || note.created_at)
            return (
              <li key={note.id}>
                <button
                  onClick={() => navigate(`/ideias/${note.id}`, { state: { note } })}
                  className="block w-full bg-surface px-3 py-3 text-left transition-colors active:bg-surface-2"
                >
                  <p className="truncate text-[15px] font-semibold text-primary">{title}</p>
                  <div className="mt-0.5 flex items-center gap-2">
                    {stamp && <span className="text-caption shrink-0 tabular-nums">{stamp}</span>}
                    {sub && <span className="truncate text-[13px] text-muted">{sub}</span>}
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
