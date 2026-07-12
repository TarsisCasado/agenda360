import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Inbox as InboxIcon, Send, Trash2, Archive, ArchiveRestore, Lightbulb,
  ListChecks, FileText, Eye, EyeOff, Plus, X,
} from 'lucide-react'
import { PageHeader, EmptyState, ErrorState } from '../components/ui/Common'
import { TaskListSkeleton } from '../components/ui/Skeleton'
import { useInbox } from '../hooks/useInbox'
import { useAuth } from '../context/AuthContext'
import { useWorkspace } from '../context/WorkspaceContext'
import { useToast } from '../context/ToastContext'
import { inboxService } from '../services/inboxService'
import { cx } from '../lib/utils'

// Filtros simples (tudo dentro da Caixa de Entrada — uma unica tela).
const FILTERS = [
  { key: 'all', label: 'Todos', status: null },
  { key: 'inbox', label: 'Caixa de Entrada', status: 'inbox' },
  { key: 'to_think', label: 'Para pensar', status: 'to_think' },
  { key: 'archived', label: 'Arquivadas', status: 'archived' },
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

// --- Titulo com edicao inline (clica, edita, sai) ---------------------------
function InlineTitle({ note, editable, onSave }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(note.title || '')
  const commit = () => {
    setEditing(false)
    const v = value.trim()
    if (v !== (note.title || '')) onSave(v)
  }
  if (editing) {
    return (
      <input
        className="input mb-0.5 border-0 bg-transparent p-0 text-sm font-bold focus:ring-0"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit() }
          if (e.key === 'Escape') { setValue(note.title || ''); setEditing(false) }
        }}
        aria-label="Titulo da nota"
        autoFocus
      />
    )
  }
  if (!note.title && !editable) return null
  return (
    <p
      role={editable ? 'button' : undefined}
      tabIndex={editable ? 0 : undefined}
      onClick={() => editable && setEditing(true)}
      onKeyDown={(e) => { if (editable && e.key === 'Enter') setEditing(true) }}
      className={cx(
        'mb-0.5 break-words text-sm font-bold text-slate-800 dark:text-slate-100',
        editable && 'cursor-text',
        !note.title && 'italic text-slate-400',
      )}
    >
      {note.title || 'Sem titulo'}
    </p>
  )
}

// --- Corpo de nota de texto (title+content) edicao inline -------------------
function NoteBody({ note, editable, onSave }) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(note.title || '')
  const [content, setContent] = useState(note.content || '')

  const start = () => {
    if (!editable) return
    setTitle(note.title || ''); setContent(note.content || ''); setEditing(true)
  }
  const cancel = () => { setEditing(false) }
  const commit = () => {
    setEditing(false)
    const t = title.trim(); const c = content.trim()
    if (!t && !c) return
    if (t === (note.title || '') && c === (note.content || '')) return
    onSave({ title: t, content: c })
  }
  const onBlurContainer = (e) => { if (!e.currentTarget.contains(e.relatedTarget)) commit() }

  if (editing) {
    return (
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
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.preventDefault(); cancel() }
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit() }
          }}
          placeholder="Conteudo"
          aria-label="Conteudo da nota"
          autoFocus
        />
      </div>
    )
  }
  return (
    <div
      role={editable ? 'button' : undefined}
      tabIndex={editable ? 0 : undefined}
      onClick={start}
      onKeyDown={(e) => { if (editable && e.key === 'Enter') start() }}
      className={cx('min-w-0', editable && 'cursor-text')}
    >
      {note.title && (
        <p className="mb-0.5 break-words text-sm font-bold text-slate-800 dark:text-slate-100">{note.title}</p>
      )}
      {note.content && (
        <p className="whitespace-pre-wrap break-words text-sm text-slate-700 dark:text-slate-200">{note.content}</p>
      )}
      {!note.title && !note.content && <p className="text-sm italic text-slate-400">(vazia)</p>}
    </div>
  )
}

// --- Item de checklist -------------------------------------------------------
function ChecklistItemRow({ item, editable, onToggle, onSave, onRemove }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(item.text)
  const commit = () => {
    setEditing(false)
    const v = value.trim()
    if (v && v !== item.text) onSave(v)
    else setValue(item.text)
  }
  return (
    <div className="group flex items-center gap-2 py-0.5">
      <input
        type="checkbox"
        checked={item.checked}
        onChange={(e) => onToggle(e.target.checked)}
        disabled={!editable}
        aria-label={item.text || 'Item'}
        className="h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
      />
      {editing ? (
        <input
          className="input flex-1 border-0 bg-transparent p-0 text-sm focus:ring-0"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit() }
            if (e.key === 'Escape') { setValue(item.text); setEditing(false) }
          }}
          aria-label="Editar item"
          autoFocus
        />
      ) : (
        <span
          role={editable ? 'button' : undefined}
          tabIndex={editable ? 0 : undefined}
          onClick={() => editable && setEditing(true)}
          onKeyDown={(e) => { if (editable && e.key === 'Enter') setEditing(true) }}
          className={cx(
            'min-w-0 flex-1 break-words text-sm',
            item.checked ? 'text-slate-400 line-through' : 'text-slate-700 dark:text-slate-200',
            editable && 'cursor-text',
          )}
        >
          {item.text}
        </span>
      )}
      {editable && (
        <button
          onClick={() => onRemove()}
          aria-label="Remover item"
          className="shrink-0 rounded p-1 text-slate-300 hover:text-red-500 lg:opacity-0 lg:group-hover:opacity-100"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}

// --- Corpo de checklist ------------------------------------------------------
function ChecklistBody({ items, editable, onAdd, onToggle, onSaveItem, onRemoveItem }) {
  const [text, setText] = useState('')
  const add = () => {
    const t = text.trim()
    if (!t) return
    onAdd(t)
    setText('')
  }
  return (
    <div>
      <div className="space-y-0.5">
        {items.map((item) => (
          <ChecklistItemRow
            key={item.id}
            item={item}
            editable={editable}
            onToggle={(checked) => onToggle(item, checked)}
            onSave={(newText) => onSaveItem(item, newText)}
            onRemove={() => onRemoveItem(item)}
          />
        ))}
      </div>
      {editable && (
        <div className="mt-1.5 flex items-center gap-2">
          <Plus size={14} className="shrink-0 text-slate-300" />
          <input
            className="input flex-1 border-0 bg-transparent p-0 text-sm focus:ring-0"
            placeholder="Adicionar item..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
            aria-label="Adicionar item ao checklist"
          />
        </div>
      )}
    </div>
  )
}

// --- Botao de acao compacto --------------------------------------------------
function Action({ icon: Icon, label, onClick, disabled, tone = 'slate' }) {
  const tones = {
    slate: 'text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800',
    amber: 'text-slate-400 hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-950/40',
    violet: 'text-slate-400 hover:bg-violet-50 hover:text-violet-600 dark:hover:bg-violet-950/40',
    red: 'text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40',
  }
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label} title={label}
      className={cx('rounded-lg p-1.5', tones[tone])}>
      <Icon size={16} />
    </button>
  )
}

// --- Cartao de nota ----------------------------------------------------------
function NoteCard({ note, items, busy, handlers }) {
  const isChecklist = note.type === 'checklist'
  const archived = note.status === 'archived'
  const toThink = note.status === 'to_think'
  const editable = !archived
  const done = items.filter((i) => i.checked).length

  return (
    <div className={cx('card p-4', toThink && 'border-l-2 border-l-violet-300 dark:border-l-violet-700')}>
      {/* Cabecalho: titulo + progresso + Novo */}
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {isChecklist
            ? <InlineTitle note={note} editable={editable} onSave={(t) => handlers.saveNote(note, { title: t })} />
            : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {isChecklist && (
            <span className="chip bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
              {done}/{items.length}
            </span>
          )}
          {!note.seen && !archived && (
            <span className="chip bg-brand-50 text-brand-600 dark:bg-brand-900/30">Novo</span>
          )}
        </div>
      </div>

      {/* Corpo */}
      {isChecklist ? (
        <ChecklistBody
          items={items}
          editable={editable}
          onAdd={(text) => handlers.addItem(note, text, items.length)}
          onToggle={(item, checked) => handlers.toggleItem(item, checked)}
          onSaveItem={(item, text) => handlers.saveItem(item, text)}
          onRemoveItem={(item) => handlers.removeItem(item)}
        />
      ) : (
        <NoteBody note={note} editable={editable} onSave={(patch) => handlers.saveNote(note, patch)} />
      )}

      {/* Acoes */}
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="text-[11px] text-slate-400">{timeLabel(note.updated_at)}</span>
        <div className="flex items-center gap-0.5">
          {archived ? (
            <>
              <Action icon={ArchiveRestore} label="Restaurar" tone="amber" disabled={busy}
                onClick={() => handlers.restore(note)} />
              <Action icon={Trash2} label="Excluir" tone="red" disabled={busy}
                onClick={() => handlers.remove(note)} />
            </>
          ) : (
            <>
              <Action icon={note.seen ? EyeOff : Eye} label={note.seen ? 'Marcar como novo' : 'Marcar como visto'}
                disabled={busy} onClick={() => handlers.setSeen(note, !note.seen)} />
              {toThink ? (
                <Action icon={InboxIcon} label="Mover para a Caixa" disabled={busy}
                  onClick={() => handlers.move(note, 'inbox')} />
              ) : (
                <Action icon={Lightbulb} label="Mover para Para pensar" tone="violet" disabled={busy}
                  onClick={() => handlers.move(note, 'to_think')} />
              )}
              <Action
                icon={isChecklist ? FileText : ListChecks}
                label={isChecklist ? 'Transformar em nota' : 'Transformar em checklist'}
                disabled={busy}
                onClick={() => handlers.convert(note, isChecklist ? 'note' : 'checklist')}
              />
              <Action icon={Archive} label="Arquivar" tone="amber" disabled={busy}
                onClick={() => handlers.archive(note)} />
              <Action icon={Trash2} label="Excluir" tone="red" disabled={busy}
                onClick={() => handlers.remove(note)} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Inbox() {
  const { user } = useAuth()
  const { workspaceId } = useWorkspace()
  const { toast } = useToast()
  const [filter, setFilter] = useState('inbox')
  const status = FILTERS.find((f) => f.key === filter)?.status ?? null
  const { notes, loading, error, reload } = useInbox({ status })

  const [checklist, setChecklist] = useState({})
  const loadChecklists = useCallback(async () => {
    if (!workspaceId) return
    try {
      const all = await inboxService.listChecklistItems(workspaceId)
      const map = {}
      for (const it of all) (map[it.inbox_item_id] ||= []).push(it)
      setChecklist(map)
    } catch (err) {
      console.error('[Inbox] falha ao carregar checklists:', err?.message || err)
    }
  }, [workspaceId])
  useEffect(() => { loadChecklists() }, [loadChecklists, notes])

  const [composerType, setComposerType] = useState('note')
  const [title, setTitle] = useState('')
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const contentRef = useRef(null)

  const create = async () => {
    const content = draft.trim()
    const t = title.trim()
    if ((!content && !t) || busy) return
    setBusy(true)
    try {
      if (composerType === 'checklist') {
        const note = await inboxService.create(workspaceId, user.id, { type: 'checklist', title: t })
        const lines = content.split('\n').map((s) => s.trim()).filter(Boolean)
        let position = 0
        for (const line of lines) {
          await inboxService.addChecklistItem(workspaceId, note.id, { text: line, position: position++ })
        }
      } else {
        await inboxService.create(workspaceId, user.id, { type: 'note', title: t, content })
      }
      setTitle(''); setDraft(''); contentRef.current?.focus()
      if (filter !== 'inbox' && filter !== 'all') setFilter('inbox')
      else { reload(); loadChecklists() }
    } catch (err) {
      toast('Erro ao salvar: ' + (err?.message || 'erro'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const onComposerKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); create() }
  }

  // Handlers de nota / checklist ---------------------------------------------
  const wrap = (fn, opts = {}) => async (...args) => {
    setBusy(true)
    try {
      await fn(...args)
      if (opts.toast) toast(opts.toast)
      reload()
      loadChecklists()
    } catch (err) {
      toast('Erro: ' + (err?.message || 'erro'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const handlers = {
    saveNote: wrap((note, patch) => inboxService.update(note, patch)),
    move: wrap((note, s) => inboxService.update(note, { status: s }),
      { toast: 'Nota movida' }),
    setSeen: wrap((note, v) => inboxService.setSeen(note, v)),
    convert: wrap((note, type) => inboxService.setType(workspaceId, note, type)),
    archive: wrap((note) => inboxService.archive(note), { toast: 'Nota arquivada' }),
    restore: wrap((note) => inboxService.restore(note), { toast: 'Nota restaurada' }),
    remove: async (note) => {
      if (!window.confirm('Excluir esta nota?')) return
      await wrap((n) => inboxService.remove(n), { toast: 'Nota excluida' })(note)
    },
    addItem: wrap((note, text, position) => inboxService.addChecklistItem(workspaceId, note.id, { text, position })),
    toggleItem: wrap((item, checked) => inboxService.toggleChecklistItem(item, checked)),
    saveItem: wrap((item, text) => inboxService.updateChecklistItem(item, { text })),
    removeItem: wrap((item) => inboxService.removeChecklistItem(item)),
  }

  const isToThink = filter === 'to_think'

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Caixa de Entrada" subtitle="Capture agora, organize depois." />

      {/* Composer PROTAGONISTA — fixo no topo mesmo com scroll. */}
      <div className="sticky top-0 z-10 -mt-1 bg-slate-50 pb-3 pt-1 dark:bg-slate-950">
        <div className="card p-3 shadow-sm">
          {/* Tipo (Nota / Checklist) */}
          <div className="mb-2 inline-flex gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
            {[
              { key: 'note', label: 'Nota', icon: FileText },
              { key: 'checklist', label: 'Checklist', icon: ListChecks },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setComposerType(t.key)}
                className={cx(
                  'press flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold',
                  composerType === t.key
                    ? 'bg-white text-brand-600 shadow-sm dark:bg-slate-900 dark:text-brand-300'
                    : 'text-slate-500',
                )}
              >
                <t.icon size={13} /> {t.label}
              </button>
            ))}
          </div>
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
            placeholder={
              composerType === 'checklist'
                ? 'Um item por linha... (Enter para salvar)'
                : 'Capture algo... (Enter para salvar, Shift+Enter para nova linha)'
            }
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onComposerKey}
            aria-label="Conteudo da nova nota"
            autoFocus
          />
          <div className="flex justify-end">
            <button onClick={create} disabled={busy || (!draft.trim() && !title.trim())} className="btn-primary press">
              <Send size={16} /> Salvar
            </button>
          </div>
        </div>
      </div>

      {/* Filtros simples */}
      <div className="mb-4 flex gap-1.5 overflow-x-auto no-scrollbar">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cx(
              'press shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors',
              filter === f.key
                ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Banner criativo do "Para pensar" (espaco separado, visual distinto) */}
      {isToThink && (
        <div className="mb-4 rounded-2xl border border-violet-100 bg-gradient-to-br from-amber-50 via-violet-50 to-white p-5 dark:border-violet-900/40 dark:from-amber-950/20 dark:via-violet-950/20 dark:to-slate-900">
          <div className="flex items-center gap-2 text-violet-600 dark:text-violet-300">
            <Lightbulb size={18} />
            <h2 className="font-bold">Para pensar</h2>
          </div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Um espaco para ideias, projetos, negocios, viagens, melhorias e sonhos. Deixe a mente respirar.
          </p>
        </div>
      )}

      {loading ? (
        <TaskListSkeleton count={3} />
      ) : error ? (
        <ErrorState onRetry={reload} />
      ) : notes.length === 0 ? (
        <EmptyState
          icon={isToThink ? Lightbulb : InboxIcon}
          title={
            filter === 'archived' ? 'Nada arquivado'
              : isToThink ? 'Nenhuma ideia aqui ainda'
                : 'Caixa de entrada vazia'
          }
          description={
            filter === 'archived' ? 'Notas arquivadas aparecem aqui.'
              : isToThink ? 'Mova notas para ca quando quiser incubar uma ideia. Sem pressa.'
                : 'Capture uma ideia, um lembrete ou uma lista acima. Sem data, sem prioridade.'
          }
        />
      ) : (
        <div className="space-y-2.5">
          {notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              items={checklist[note.id] || []}
              busy={busy}
              handlers={handlers}
            />
          ))}
        </div>
      )}
    </div>
  )
}
