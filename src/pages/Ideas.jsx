import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Page, PageHeader } from '../components/layout/Page'
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
import { pluralize } from '../lib/plural'

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
    <Page width="content">
      {/* CP5.7 — mesmo cabecalho das outras telas. O botao de nova ideia e a
          acao DESTA pagina: fica na linha do titulo, nao solto no canto. */}
      <PageHeader
        title="Ideias"
        subtitle={ideas.length > 0 ? pluralize(ideas.length, 'anotação', 'anotações') : 'Escreva sem fricção'}
        actions={
          <button
            onClick={novaIdeia}
            disabled={creating}
            aria-label="Nova ideia"
            className="btn-primary press !px-3"
          >
            {creating ? <Loader2 size={17} className="animate-spin" /> : <Plus size={18} />}
            <span className="hidden sm:inline">Nova ideia</span>
          </button>
        }
      />

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
          // Sem acao aqui: "Nova ideia" ja esta ao lado do titulo, a 200px
          // daqui. Dois botoes primarios para a mesma coisa na mesma tela e o
          // tipo de repeticao que faz o produto parecer inseguro.
          description="Capture um pensamento, um rascunho, uma lista — sem formulário."
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
    </Page>
  )
}
