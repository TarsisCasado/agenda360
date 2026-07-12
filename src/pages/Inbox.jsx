import { useState } from 'react'
import { Inbox as InboxIcon, Send, Pencil, Trash2, Archive, ArchiveRestore, Check, X } from 'lucide-react'
import { PageHeader, EmptyState, ErrorState } from '../components/ui/Common'
import { TaskListSkeleton } from '../components/ui/Skeleton'
import { useInbox } from '../hooks/useInbox'
import { useAuth } from '../context/AuthContext'
import { useWorkspace } from '../context/WorkspaceContext'
import { useToast } from '../context/ToastContext'
import { inboxService } from '../services/inboxService'
import { cx } from '../lib/utils'

function timeLabel(iso) {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return ''
  }
}

// Cartao de nota com edicao inline (zero atrito).
function NoteCard({ note, archived, busy, onEdit, onArchive, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(note.content)

  const save = () => {
    const content = value.trim()
    if (!content) return
    onEdit(note, content)
    setEditing(false)
  }

  return (
    <div className="card p-4">
      {editing ? (
        <div>
          <textarea
            className="input min-h-[70px]"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label="Editar nota"
            autoFocus
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              onClick={() => { setEditing(false); setValue(note.content) }}
              className="btn-ghost press"
            >
              <X size={16} /> Cancelar
            </button>
            <button onClick={save} disabled={busy || !value.trim()} className="btn-primary press">
              <Check size={16} /> Salvar
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="whitespace-pre-wrap break-words text-sm text-slate-800 dark:text-slate-100">
            {note.content}
          </p>
          <div className="mt-2.5 flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-400">{timeLabel(note.updated_at)}</span>
            <div className="flex items-center gap-0.5">
              {!archived && (
                <button
                  onClick={() => setEditing(true)}
                  aria-label="Editar"
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600 dark:hover:bg-slate-800"
                >
                  <Pencil size={16} />
                </button>
              )}
              <button
                onClick={() => onArchive(note, !archived)}
                aria-label={archived ? 'Restaurar' : 'Arquivar'}
                disabled={busy}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-amber-600 dark:hover:bg-slate-800"
              >
                {archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
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
        </>
      )}
    </div>
  )
}

export default function Inbox() {
  const { user } = useAuth()
  const { workspaceId } = useWorkspace()
  const { toast } = useToast()
  const [tab, setTab] = useState('active') // 'active' | 'archived'
  const archived = tab === 'archived'
  const { notes, loading, error, reload } = useInbox({ archived })
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  const create = async () => {
    const content = draft.trim()
    if (!content || busy) return
    setBusy(true)
    try {
      await inboxService.create(workspaceId, user.id, { content })
      setDraft('')
      reload()
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

  const editNote = async (note, content) => {
    setBusy(true)
    try {
      await inboxService.update(note, { content })
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
      <PageHeader
        title="Caixa de Entrada"
        subtitle="Capture agora, organize depois."
      />

      {/* Composer — captura rapida (abrir, digitar, salvar) */}
      <div className="card mb-4 p-3">
        <textarea
          className="input min-h-[56px] resize-none border-0 bg-transparent p-2 focus:ring-0"
          placeholder="Capture algo... (Enter para salvar, Shift+Enter para nova linha)"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onComposerKey}
          aria-label="Nova nota"
          autoFocus
        />
        <div className="flex justify-end">
          <button onClick={create} disabled={busy || !draft.trim()} className="btn-primary press">
            <Send size={16} /> Salvar
          </button>
        </div>
      </div>

      {/* Alternar ativas / arquivadas */}
      <div className="mb-4 flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
        {[
          { key: 'active', label: 'Caixa' },
          { key: 'archived', label: 'Arquivadas' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cx(
              'press flex-1 rounded-lg py-1.5 text-sm font-semibold transition-colors',
              tab === t.key
                ? 'bg-white text-brand-600 shadow-sm dark:bg-slate-900 dark:text-brand-300'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300',
            )}
          >
            {t.label}
          </button>
        ))}
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
              archived={archived}
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
