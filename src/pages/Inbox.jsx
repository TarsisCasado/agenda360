import { useRef, useState } from 'react'
import { Inbox as InboxIcon, Send, Trash2, Archive, ArchiveRestore, ChevronDown } from 'lucide-react'
import { PageHeader, EmptyState, ErrorState } from '../components/ui/Common'
import { TaskListSkeleton } from '../components/ui/Skeleton'
import { useInbox } from '../hooks/useInbox'
import { useAuth } from '../context/AuthContext'
import { useWorkspace } from '../context/WorkspaceContext'
import { useToast } from '../context/ToastContext'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { inboxService } from '../services/inboxService'
import { cx } from '../lib/utils'

// Visao primaria (Caixa) + secundarias sob o menu "Mais". A estrutura permite
// adicionar no futuro (Para pensar, Compartilhadas, Delegadas, Processadas)
// SEM alterar a navegacao — basta acrescentar itens aqui.
const SECONDARY_VIEWS = [
  { key: 'archived', label: 'Arquivadas' },
  // futuro: { key: 'to_think', label: 'Para pensar' },
  // futuro: { key: 'shared', label: 'Compartilhadas' },
  // futuro: { key: 'delegated', label: 'Delegadas' },
  // futuro: { key: 'processed', label: 'Processadas' },
]

function timeLabel(iso) {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return ''
  }
}

// Cartao de nota com edicao INLINE (estilo Apple Notes): clica, edita, sai.
// Salva ao tirar o foco do cartao; Esc cancela. Sem modal, sem botao "Editar".
function NoteCard({ note, editable, busy, onEdit, onArchive, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(note.title || '')
  const [content, setContent] = useState(note.content || '')

  const start = () => {
    if (!editable) return
    setTitle(note.title || '')
    setContent(note.content || '')
    setEditing(true)
  }

  const cancel = () => {
    setTitle(note.title || '')
    setContent(note.content || '')
    setEditing(false)
  }

  const commit = () => {
    setEditing(false)
    const t = title.trim()
    const c = content.trim()
    if (!t && !c) return // nao salva vazio
    if (t === (note.title || '') && c === (note.content || '')) return // sem mudanca
    onEdit(note, { title: t, content: c })
  }

  // Salva quando o foco sai do cartao (clicou fora).
  const onBlurContainer = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) commit()
  }

  const onContentKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); cancel() }
    // Enter salva; Shift+Enter nova linha.
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit() }
  }

  return (
    <div className="card p-4">
      {editing ? (
        <div onBlur={onBlurContainer} tabIndex={-1}>
          <input
            className="input mb-2 border-0 bg-transparent p-0 text-sm font-bold focus:ring-0"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') cancel() }}
            placeholder="Titulo (opcional)"
            aria-label="Titulo da nota"
          />
          <textarea
            className="input min-h-[64px] resize-none border-0 bg-transparent p-0 text-sm focus:ring-0"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={onContentKey}
            placeholder="Conteudo"
            aria-label="Conteudo da nota"
            autoFocus
          />
        </div>
      ) : (
        <div
          role={editable ? 'button' : undefined}
          tabIndex={editable ? 0 : undefined}
          onClick={start}
          onKeyDown={(e) => { if (editable && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); start() } }}
          className={cx('min-w-0', editable && 'cursor-text')}
        >
          {note.title && (
            <p className="mb-0.5 break-words text-sm font-bold text-slate-800 dark:text-slate-100">
              {note.title}
            </p>
          )}
          {note.content && (
            <p className="whitespace-pre-wrap break-words text-sm text-slate-700 dark:text-slate-200">
              {note.content}
            </p>
          )}
          {!note.title && !note.content && (
            <p className="text-sm italic text-slate-400">(vazia)</p>
          )}
        </div>
      )}

      {!editing && (
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-400">{timeLabel(note.updated_at)}</span>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => onArchive(note, editable)}
              aria-label={editable ? 'Arquivar' : 'Restaurar'}
              disabled={busy}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-amber-600 dark:hover:bg-slate-800"
            >
              {editable ? <Archive size={16} /> : <ArchiveRestore size={16} />}
            </button>
            <button
              onClick={() => onDelete(note)}
              aria-label="Excluir"
              disabled={busy}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Inbox() {
  const { user } = useAuth()
  const { workspaceId } = useWorkspace()
  const { toast } = useToast()
  const [view, setView] = useState('active') // 'active' | 'archived' | (futuro)
  const [menuOpen, setMenuOpen] = useState(false)
  useEscapeKey(menuOpen, () => setMenuOpen(false))
  const archived = view === 'archived'
  const { notes, loading, error, reload } = useInbox({ archived })
  const [title, setTitle] = useState('')
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const contentRef = useRef(null)

  const activeSecondary = SECONDARY_VIEWS.find((v) => v.key === view)

  const create = async () => {
    const content = draft.trim()
    const t = title.trim()
    if ((!content && !t) || busy) return
    setBusy(true)
    try {
      await inboxService.create(workspaceId, user.id, { title: t, content })
      setTitle('')
      setDraft('')
      contentRef.current?.focus()
      if (view !== 'active') setView('active')
      else reload()
    } catch (err) {
      toast('Erro ao salvar: ' + (err?.message || 'erro'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const onComposerKey = (e) => {
    // Enter salva; Shift+Enter quebra linha (captura rapida).
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      create()
    }
  }

  const editNote = async (note, patch) => {
    setBusy(true)
    try {
      await inboxService.update(note, patch)
      reload()
    } catch (err) {
      toast('Erro ao editar: ' + (err?.message || 'erro'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const archiveNote = async (note, value) => {
    setBusy(true)
    try {
      await inboxService.update(note, { archived: value })
      toast(value ? 'Nota arquivada' : 'Nota restaurada')
      reload()
    } catch (err) {
      toast('Erro: ' + (err?.message || 'erro'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const deleteNote = async (note) => {
    if (!window.confirm('Excluir esta nota?')) return
    setBusy(true)
    try {
      await inboxService.remove(note)
      toast('Nota excluida')
      reload()
    } catch (err) {
      toast('Erro ao excluir: ' + (err?.message || 'erro'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Caixa de Entrada" subtitle="Capture agora, organize depois." />

      {/* Composer PROTAGONISTA — fixo no topo mesmo com scroll. */}
      <div className="sticky top-0 z-10 -mt-1 bg-slate-50 pb-3 pt-1 dark:bg-slate-950">
        <div className="card p-3 shadow-sm">
          <input
            className="input mb-1 border-0 bg-transparent p-2 pb-0 text-sm font-semibold focus:ring-0"
            placeholder="Titulo (opcional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={onComposerKey}
            aria-label="Titulo da nova nota"
          />
          <textarea
            ref={contentRef}
            className="input min-h-[52px] resize-none border-0 bg-transparent p-2 pt-0 focus:ring-0"
            placeholder="Capture algo... (Enter para salvar, Shift+Enter para nova linha)"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onComposerKey}
            aria-label="Conteudo da nova nota"
            autoFocus
          />
          <div className="flex justify-end">
            <button
              onClick={create}
              disabled={busy || (!draft.trim() && !title.trim())}
              className="btn-primary press"
            >
              <Send size={16} /> Salvar
            </button>
          </div>
        </div>
      </div>

      {/* Navegacao: Caixa (primaria) + "Mais" (secundarias, extensivel). */}
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={() => setView('active')}
          className={cx(
            'press rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors',
            view === 'active'
              ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
              : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800',
          )}
        >
          Caixa
        </button>

        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className={cx(
              'press flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors',
              activeSecondary
                ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800',
            )}
          >
            {activeSecondary ? activeSecondary.label : 'Mais'}
            <ChevronDown size={14} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div
                role="menu"
                className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-800"
              >
                {SECONDARY_VIEWS.map((v) => (
                  <button
                    key={v.key}
                    role="menuitem"
                    onClick={() => { setView(v.key); setMenuOpen(false) }}
                    className={cx(
                      'flex w-full items-center rounded px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700',
                      view === v.key && 'font-semibold text-brand-600 dark:text-brand-300',
                    )}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <TaskListSkeleton count={3} />
      ) : error ? (
        <ErrorState onRetry={reload} />
      ) : notes.length === 0 ? (
        <EmptyState
          icon={InboxIcon}
          title={archived ? 'Nada arquivado' : 'Caixa de entrada vazia'}
          description={
            archived
              ? 'Notas arquivadas aparecem aqui.'
              : 'Capture uma ideia, um lembrete ou qualquer coisa acima. Sem data, sem prioridade.'
          }
        />
      ) : (
        <div className="space-y-2.5">
          {notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              editable={!archived}
              busy={busy}
              onEdit={editNote}
              onArchive={archiveNote}
              onDelete={deleteNote}
            />
          ))}
        </div>
      )}
    </div>
  )
}
