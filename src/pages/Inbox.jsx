import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Inbox as InboxIcon, Send, Trash2, Archive, ArchiveRestore, Lightbulb,
  ListChecks, FileText, Eye, EyeOff, Plus, X, History,
  FilePlus, Pencil, ArrowRight, Check, Sparkles, CalendarPlus, CheckCircle2,
} from 'lucide-react'
import { EmptyState, ErrorState } from '../components/ui/Common'
import { TaskListSkeleton } from '../components/ui/Skeleton'
import TaskModal from '../components/tasks/TaskModal'
import { useInbox } from '../hooks/useInbox'
import { useAuth } from '../context/AuthContext'
import { useWorkspace } from '../context/WorkspaceContext'
import { useToast } from '../context/ToastContext'
import { inboxService } from '../services/inboxService'
import { taskService } from '../services/taskService'
import { conversionService } from '../services/conversionService'
import { inboxTaskLinkService } from '../services/inboxTaskLinkService'
import { cx, uid } from '../lib/utils'
import { createSyncQueue } from '../lib/sync/syncQueue'
import {
  upsertNote, patchNote, removeNote, replaceNote,
  setItems, addItem, patchItem, removeItem, replaceItem, moveItems, dropItems,
} from '../lib/sync/optimistic'

// Filtros simples (tudo dentro da Caixa de Entrada — uma unica tela).
const FILTERS = [
  { key: 'all', label: 'Todos', status: null },
  { key: 'inbox', label: 'Caixa de Entrada', status: 'inbox' },
  { key: 'to_think', label: 'Para pensar', status: 'to_think' },
  { key: 'archived', label: 'Arquivadas', status: 'archived' },
]

// Referencia estavel para notas sem itens (preserva o memo dos cards).
const EMPTY_ITEMS = []

function timeLabel(iso) {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return ''
  }
}

// Rotulos/icones da timeline (historico interno).
const EVENT_META = {
  created: { icon: FilePlus, label: 'Criada' },
  edited: { icon: Pencil, label: 'Editada' },
  archived: { icon: Archive, label: 'Arquivada' },
  restored: { icon: ArchiveRestore, label: 'Restaurada' },
  moved_to_think: { icon: Lightbulb, label: 'Movida para Para pensar' },
  moved_to_inbox: { icon: InboxIcon, label: 'Movida para a Caixa' },
  seen: { icon: Eye, label: 'Marcada como vista' },
  unseen: { icon: EyeOff, label: 'Desmarcada como vista' },
}

// Painel de historico (collapse inline — sem modal, sem tela nova).
function TimelinePanel({ note, loadEvents }) {
  const [events, setEvents] = useState(null)
  useEffect(() => {
    let alive = true
    loadEvents(note).then((data) => { if (alive) setEvents(data) }).catch(() => { if (alive) setEvents([]) })
    return () => { alive = false }
    // recarrega quando a nota muda (updated_at) para refletir novas acoes
  }, [note, loadEvents])

  return (
    <div
      role="region"
      aria-label="Historico da nota"
      className="mt-3 animate-in rounded-xl border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-800/40"
    >
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        <History size={12} /> Historico
      </p>
      {events === null ? (
        <p className="text-xs text-slate-400">Carregando...</p>
      ) : events.length === 0 ? (
        <p className="text-xs text-slate-400">Sem movimentacoes ainda.</p>
      ) : (
        <ul className="space-y-1.5">
          {events.map((e) => {
            const meta = EVENT_META[e.action] || { icon: ArrowRight, label: e.action }
            const Icon = meta.icon
            return (
              <li key={e.id} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <Icon size={13} className="shrink-0 text-slate-400" />
                <span className="flex-1">{meta.label}</span>
                <span className="shrink-0 text-slate-400">{timeLabel(e.created_at)}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
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
        className="h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 accent-brand-600 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 dark:border-slate-600"
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
            'min-w-0 flex-1 break-words text-sm transition-colors',
            item.checked ? 'text-slate-400 line-through decoration-slate-300' : 'text-slate-700 dark:text-slate-200',
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
      {items.length === 0 && (
        <p className="mb-1 text-xs italic text-slate-400">
          {editable ? 'Lista vazia — adicione o primeiro item abaixo.' : 'Lista vazia.'}
        </p>
      )}
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
      className={cx(
        'press rounded-lg p-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:opacity-40',
        tones[tone],
      )}>
      <Icon size={16} />
    </button>
  )
}

// --- Cartao de nota ----------------------------------------------------------
// memo + handlers/props estaveis: digitar no composer nao re-renderiza a lista.
// `syncing` = esta nota tem uma operacao pendente na fila (feedback discreto).
const NoteCard = memo(function NoteCard({ note, items, syncing, converted, highlight, handlers }) {
  const isChecklist = note.type === 'checklist'
  const archived = note.status === 'archived'
  const toThink = note.status === 'to_think'
  const editable = !archived
  const done = items.filter((i) => i.checked).length
  const complete = items.length > 0 && done === items.length // checklist concluido
  const [showHistory, setShowHistory] = useState(false)
  const cardRef = useRef(null)

  // Realce quando aberto a partir da Task (deep-link /caixa?item=<id>).
  useEffect(() => {
    if (highlight) cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlight])

  return (
    <div
      ref={cardRef}
      className={cx(
        'card animate-in p-4 transition-all duration-200 hover:shadow-md',
        // "Para pensar": identidade visual propria (mais criativa).
        toThink && 'border-l-2 border-l-violet-300 bg-gradient-to-br from-violet-50/60 to-white dark:border-l-violet-700 dark:from-violet-950/20 dark:to-slate-900',
        // Visto: opacidade discretamente reduzida (restaura no hover).
        note.seen && !archived && 'opacity-[0.62] hover:opacity-100',
        highlight && 'ring-2 ring-brand-400 ring-offset-2 dark:ring-offset-slate-950',
      )}
    >
      {/* Cabecalho: titulo + progresso + Novo + sincronizando */}
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {isChecklist
            ? <InlineTitle note={note} editable={editable} onSave={(t) => handlers.saveNote(note, { title: t })} />
            : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {/* Feedback discreto de sincronizacao (estado por item). */}
          {syncing && (
            <span
              className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse"
              title="Sincronizando..."
              aria-label="Sincronizando"
            />
          )}
          {isChecklist && (
            <span
              key={complete ? 'done' : 'wip'} // reinicia a microinteracao ao concluir
              className={cx(
                'chip transition-colors',
                complete
                  ? 'animate-pop bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300'
                  : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300',
              )}
            >
              {complete && <Check size={11} className="-ml-0.5" />}
              {done}/{items.length}
            </span>
          )}
          {converted && (
            <button
              type="button"
              onClick={() => handlers.openTask(note)}
              title="Abrir a atividade criada a partir desta captura"
              className="chip cursor-pointer bg-emerald-50 text-emerald-600 transition-colors hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300"
            >
              <CheckCircle2 size={11} /> Convertido
            </button>
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
          onAdd={(text) => handlers.addItem(note, text)}
          onToggle={(item, checked) => handlers.toggleItem(note, item, checked)}
          onSaveItem={(item, text) => handlers.saveItem(note, item, text)}
          onRemoveItem={(item) => handlers.removeItem(note, item)}
        />
      ) : (
        <NoteBody note={note} editable={editable} onSave={(patch) => handlers.saveNote(note, patch)} />
      )}

      {/* Acoes (nunca bloqueadas por sincronizacao — a fila serializa por item) */}
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="text-[11px] text-slate-400">{timeLabel(note.updated_at)}</span>
        <div className="flex items-center gap-0.5">
          <Action icon={History} label="Historico" onClick={() => setShowHistory((v) => !v)} />
          {archived ? (
            <>
              <Action icon={ArchiveRestore} label="Restaurar" tone="amber"
                onClick={() => handlers.restore(note)} />
              <Action icon={Trash2} label="Excluir" tone="red"
                onClick={() => handlers.remove(note)} />
            </>
          ) : (
            <>
              <Action icon={note.seen ? EyeOff : Eye} label={note.seen ? 'Marcar como novo' : 'Marcar como visto'}
                onClick={() => handlers.setSeen(note, !note.seen)} />
              {toThink ? (
                <Action icon={InboxIcon} label="Mover para a Caixa"
                  onClick={() => handlers.move(note, 'inbox')} />
              ) : (
                <Action icon={Lightbulb} label="Mover para Para pensar" tone="violet"
                  onClick={() => handlers.move(note, 'to_think')} />
              )}
              <Action
                icon={isChecklist ? FileText : ListChecks}
                label={isChecklist ? 'Transformar em nota' : 'Transformar em checklist'}
                onClick={() => handlers.convert(note, isChecklist ? 'note' : 'checklist')}
              />
              <Action icon={CalendarPlus} label="Converter em atividade" tone="violet"
                onClick={() => handlers.convertToTask(note)} />
              <Action icon={Archive} label="Arquivar" tone="amber"
                onClick={() => handlers.archive(note)} />
              <Action icon={Trash2} label="Excluir" tone="red"
                onClick={() => handlers.remove(note)} />
            </>
          )}
        </div>
      </div>

      {showHistory && <TimelinePanel note={note} loadEvents={handlers.loadEvents} />}
    </div>
  )
})

export default function Inbox() {
  const { user } = useAuth()
  const { workspaceId } = useWorkspace()
  const { toast } = useToast()

  // Deep-link vindo da Task ("Origem: Caixa de Entrada") -> realca a captura.
  const [searchParams] = useSearchParams()
  const highlightId = searchParams.get('item')

  // Ao chegar por deep-link, comeca em "Todos" para que a captura seja
  // localizavel mesmo se estiver arquivada ou em "Para pensar".
  const [filter, setFilter] = useState(highlightId ? 'all' : 'inbox')
  const filterStatus = FILTERS.find((f) => f.key === filter)?.status ?? null
  const { notes, setNotes, loading, error, reload } = useInbox({ status: filterStatus })
  const actor = user?.id

  // Conversao Inbox -> Task: mapa de convertidos (selo), modal de conversao e
  // modal de edicao da Task vinculada.
  const [convertedMap, setConvertedMap] = useState({})
  const [converting, setConverting] = useState(null)
  const [editingTask, setEditingTask] = useState(null)

  const loadConverted = useCallback(async () => {
    if (!workspaceId) return
    try {
      setConvertedMap(await inboxTaskLinkService.convertedMap(workspaceId))
    } catch (err) {
      console.error('[Inbox] falha ao carregar vinculos:', err?.message || err)
    }
  }, [workspaceId])
  useEffect(() => { loadConverted() }, [loadConverted])

  const [checklist, setChecklist] = useState({})
  const checklistRef = useRef(checklist)
  useEffect(() => { checklistRef.current = checklist }, [checklist])

  // Carrega os itens de checklist apenas quando o filtro muda (nao a cada
  // mutacao otimista) — elimina reloads completos.
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
  useEffect(() => { loadChecklists() }, [loadChecklists, filter])

  const [composerType, setComposerType] = useState('note')
  const [title, setTitle] = useState('')
  const [draft, setDraft] = useState('')
  const contentRef = useRef(null)

  // Estado de sincronizacao POR ITEM (idle/pending/failed/synced) — sem busy global.
  const [syncMap, setSyncMap] = useState({})

  // Fila de sincronizacao (camada unica isolada). Criada uma unica vez.
  const queueRef = useRef(null)
  if (!queueRef.current) {
    queueRef.current = createSyncQueue({
      onStatus: (op, statusName) => {
        setSyncMap((m) => {
          const next = { ...m }
          if (statusName === 'pending') next[op.key] = 'pending'
          else delete next[op.key] // synced/failed: some (feedback discreto + rollback)
          return next
        })
      },
    })
  }

  const loadEvents = useCallback((note) => inboxService.listEvents(workspaceId, note.id), [workspaceId])

  // Nucleo otimista: aplica a mudanca local AGORA, enfileira a persistencia em
  // segundo plano e reverte automaticamente em caso de falha definitiva.
  const mutate = useCallback(({ key, apply, revert, run, onOk }) => {
    apply()
    queueRef.current.enqueue({
      key,
      origin: 'inbox',
      run,
      onSuccess: (result) => { try { onOk?.(result) } catch { /* callback do chamador */ } },
      onError: () => {
        revert()
        toast('Nao foi possivel sincronizar. Alteracao desfeita.', 'error')
      },
    })
  }, [toast])

  const showsInbox = filter === 'inbox' || filter === 'all'

  // ----- Captura (composer): otimista e NUNCA bloqueia -----
  const createNote = (t, content) => {
    const id = 'tmp-' + uid()
    const now = new Date().toISOString()
    const temp = {
      id, workspace_id: workspaceId, created_by: actor, updated_by: actor,
      type: 'note', title: t, content, status: 'inbox', seen: false, origin: 'manual',
      created_at: now, updated_at: now,
    }
    mutate({
      key: id,
      apply: () => { if (showsInbox) setNotes((ns) => [temp, ...ns]) },
      revert: () => setNotes((ns) => removeNote(ns, id)),
      run: () => inboxService.create(workspaceId, actor, { type: 'note', title: t, content }),
      onOk: (saved) => (showsInbox ? setNotes((ns) => replaceNote(ns, id, saved)) : reload()),
    })
  }

  const createChecklist = (t, lines) => {
    const id = 'tmp-' + uid()
    const now = new Date().toISOString()
    const temp = {
      id, workspace_id: workspaceId, created_by: actor, updated_by: actor,
      type: 'checklist', title: t, content: '', status: 'inbox', seen: false, origin: 'manual',
      created_at: now, updated_at: now,
    }
    const tempItems = lines.map((text, i) => ({
      id: 'tmp-' + uid(), inbox_item_id: id, workspace_id: workspaceId, position: i, text, checked: false,
    }))
    mutate({
      key: id,
      apply: () => { if (showsInbox) { setNotes((ns) => [temp, ...ns]); setChecklist((m) => setItems(m, id, tempItems)) } },
      revert: () => { setNotes((ns) => removeNote(ns, id)); setChecklist((m) => dropItems(m, id)) },
      run: async () => {
        const note = await inboxService.create(workspaceId, actor, { type: 'checklist', title: t })
        let position = 0
        for (const text of lines) await inboxService.addChecklistItem(workspaceId, note.id, { text, position: position++ })
        const items = await inboxService.listChecklistItems(workspaceId, note.id)
        return { note, items }
      },
      onOk: ({ note, items }) => {
        if (!showsInbox) { reload(); return }
        setNotes((ns) => replaceNote(ns, id, note))
        setChecklist((m) => setItems(moveItems(m, id, note.id), note.id, items))
      },
    })
  }

  const submitComposer = () => {
    const content = draft.trim()
    const t = title.trim()
    if (!content && !t) return
    const wasHidden = !showsInbox
    if (composerType === 'checklist') {
      createChecklist(t, content.split('\n').map((s) => s.trim()).filter(Boolean))
    } else {
      createNote(t, content)
    }
    setTitle(''); setDraft(''); contentRef.current?.focus()
    if (wasHidden) setFilter('inbox')
  }
  const onComposerKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComposer() } }

  // ----- Handlers dos cards (otimistas, memoizados/estaveis) -----
  const handlers = useMemo(() => {
    const changeStatus = (note, newStatus, runFn) => {
      const leaving = filterStatus !== null && filterStatus !== newStatus
      mutate({
        key: note.id,
        apply: () => setNotes((ns) => (leaving
          ? removeNote(ns, note.id)
          : patchNote(ns, note.id, { status: newStatus, updated_at: new Date().toISOString() }))),
        revert: () => setNotes((ns) => (leaving ? upsertNote(ns, note) : patchNote(ns, note.id, { status: note.status }))),
        run: runFn,
      })
    }
    return {
      saveNote: (note, patch) => {
        const prev = { title: note.title, content: note.content }
        mutate({
          key: note.id,
          apply: () => setNotes((ns) => patchNote(ns, note.id, { ...patch, updated_at: new Date().toISOString() })),
          revert: () => setNotes((ns) => patchNote(ns, note.id, prev)),
          run: () => inboxService.editContent(note, patch, actor),
        })
      },
      move: (note, s) => changeStatus(note, s, () =>
        (s === 'to_think' ? inboxService.moveToThink(note, actor) : inboxService.moveToInbox(note, actor))),
      archive: (note) => changeStatus(note, 'archived', () => inboxService.archive(note, actor)),
      restore: (note) => changeStatus(note, 'inbox', () => inboxService.restore(note, actor)),
      setSeen: (note, v) => mutate({
        key: note.id,
        apply: () => setNotes((ns) => patchNote(ns, note.id, { seen: v })),
        revert: () => setNotes((ns) => patchNote(ns, note.id, { seen: !v })),
        run: () => inboxService.setSeen(note, v, actor),
      }),
      convert: (note, type) => {
        const isToChecklist = type === 'checklist'
        const prevNote = { type: note.type, content: note.content }
        const prevItems = checklistRef.current[note.id] || []
        const joined = prevItems.map((i) => i.text).join('\n')
        const tempItems = isToChecklist
          ? String(note.content || '').split('\n').map((s) => s.trim()).filter(Boolean)
            .map((text, i) => ({ id: 'tmp-' + uid(), inbox_item_id: note.id, workspace_id: workspaceId, position: i, text, checked: false }))
          : []
        mutate({
          key: note.id,
          apply: () => {
            setNotes((ns) => patchNote(ns, note.id, { type, content: isToChecklist ? '' : joined }))
            setChecklist((m) => setItems(m, note.id, isToChecklist ? tempItems : []))
          },
          revert: () => {
            setNotes((ns) => patchNote(ns, note.id, prevNote))
            setChecklist((m) => setItems(m, note.id, prevItems))
          },
          run: () => inboxService.setType(workspaceId, note, type, actor),
          onOk: async () => {
            const items = await inboxService.listChecklistItems(workspaceId, note.id)
            setChecklist((m) => setItems(m, note.id, items))
          },
        })
      },
      remove: (note) => {
        if (!window.confirm('Excluir esta nota?')) return
        const prevItems = checklistRef.current[note.id] || []
        mutate({
          key: note.id,
          apply: () => { setNotes((ns) => removeNote(ns, note.id)); setChecklist((m) => dropItems(m, note.id)) },
          revert: () => { setNotes((ns) => upsertNote(ns, note)); setChecklist((m) => setItems(m, note.id, prevItems)) },
          run: () => inboxService.remove(note),
        })
      },
      addItem: (note, text) => {
        const tid = 'tmp-' + uid()
        const position = (checklistRef.current[note.id] || []).length
        const temp = { id: tid, inbox_item_id: note.id, workspace_id: workspaceId, position, text, checked: false }
        mutate({
          key: note.id,
          apply: () => setChecklist((m) => addItem(m, note.id, temp)),
          revert: () => setChecklist((m) => removeItem(m, note.id, tid)),
          run: () => inboxService.addChecklistItem(workspaceId, note.id, { text, position }),
          onOk: (saved) => setChecklist((m) => replaceItem(m, note.id, tid, saved)),
        })
      },
      toggleItem: (note, item, checked) => mutate({
        key: note.id,
        apply: () => setChecklist((m) => patchItem(m, note.id, item.id, { checked })),
        revert: () => setChecklist((m) => patchItem(m, note.id, item.id, { checked: !checked })),
        run: () => inboxService.toggleChecklistItem(item, checked),
      }),
      saveItem: (note, item, text) => {
        const prev = item.text
        mutate({
          key: note.id,
          apply: () => setChecklist((m) => patchItem(m, note.id, item.id, { text })),
          revert: () => setChecklist((m) => patchItem(m, note.id, item.id, { text: prev })),
          run: () => inboxService.updateChecklistItem(item, { text }),
        })
      },
      removeItem: (note, item) => mutate({
        key: note.id,
        apply: () => setChecklist((m) => removeItem(m, note.id, item.id)),
        revert: () => setChecklist((m) => addItem(m, note.id, item)),
        run: () => inboxService.removeChecklistItem(item),
      }),
      // Abre o modal de conversao (nao altera a captura: Inbox permanece intacta).
      convertToTask: (note) => setConverting(note),
      // Abre a Task vinculada (selo "Convertido").
      openTask: async (note) => {
        const link = convertedMap[note.id]
        if (!link) return
        try {
          const t = await taskService.getById(workspaceId, link.task_id)
          if (t) setEditingTask(t)
          else { toast('A atividade vinculada nao foi encontrada.', 'error'); loadConverted() }
        } catch (err) {
          toast('Erro ao abrir atividade: ' + err.message, 'error')
        }
      },
      loadEvents,
    }
  }, [mutate, setNotes, setChecklist, workspaceId, actor, filterStatus, loadEvents, convertedMap, toast, loadConverted])

  const isToThink = filter === 'to_think'

  return (
    <div className="mx-auto max-w-2xl">
      {/* Cabecalho com identidade propria (tile em gradiente da marca). */}
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
          <InboxIcon size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-800 dark:text-slate-100">
            Caixa de Entrada
          </h1>
          <p className="text-sm text-slate-500">Capture agora, organize depois.</p>
        </div>
      </div>

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
                aria-pressed={composerType === t.key}
                className={cx(
                  'press flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
                  composerType === t.key
                    ? 'bg-white text-brand-600 shadow-sm dark:bg-slate-900 dark:text-brand-300'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300',
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
            {/* Nunca bloqueado por sincronizacao — captura e prioridade maxima. */}
            <button onClick={submitComposer} disabled={!draft.trim() && !title.trim()} className="btn-primary press">
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
            aria-pressed={filter === f.key}
            className={cx(
              'press shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
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
        <div className="animate-in mb-4 flex items-start gap-3.5 overflow-hidden rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 via-fuchsia-50/60 to-amber-50/40 p-5 dark:border-violet-900/40 dark:from-violet-950/25 dark:via-fuchsia-950/15 dark:to-slate-900">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-sm">
            <Lightbulb size={22} />
          </div>
          <div className="min-w-0">
            <h2 className="flex items-center gap-1.5 font-bold text-violet-700 dark:text-violet-200">
              Para pensar <Sparkles size={14} className="text-fuchsia-400" />
            </h2>
            <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
              Onde as ideias descansam ate amadurecer — projetos, negocios, viagens, sonhos. Sem pressa, sem prazo.
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <TaskListSkeleton count={3} />
      ) : error ? (
        <ErrorState onRetry={reload} />
      ) : notes.length === 0 ? (
        <EmptyState
          icon={filter === 'archived' ? Archive : isToThink ? Lightbulb : InboxIcon}
          title={
            filter === 'archived' ? 'Nada arquivado'
              : isToThink ? 'Nenhuma ideia aqui ainda'
                : filter === 'all' ? 'Nada por aqui ainda'
                  : 'Caixa de entrada vazia'
          }
          description={
            filter === 'archived' ? 'O que voce arquivar aparece aqui — nada se perde.'
              : isToThink ? 'Mova uma nota para ca quando quiser incubar uma ideia. Sem pressa, sem prazo.'
                : 'Capture uma ideia, um lembrete ou uma lista. Sem data, sem prioridade.'
          }
          action={
            isToThink || filter === 'archived' ? (
              <button onClick={() => setFilter('inbox')} className="btn-secondary press">
                <InboxIcon size={16} /> Ir para a Caixa
              </button>
            ) : (
              <button onClick={() => contentRef.current?.focus()} className="btn-primary press">
                <Send size={16} /> Capturar agora
              </button>
            )
          }
        />
      ) : (
        <div className="space-y-2.5">
          {notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              items={checklist[note.id] || EMPTY_ITEMS}
              syncing={Boolean(syncMap[note.id])}
              converted={Boolean(convertedMap[note.id])}
              highlight={highlightId === note.id}
              handlers={handlers}
            />
          ))}
        </div>
      )}

      {/* Conversao Inbox -> Task: reutiliza o TaskModal (form completo), com a
          persistencia injetada (cria a Task com origin 'inbox' + o vinculo). */}
      <TaskModal
        open={Boolean(converting)}
        task={null}
        defaults={
          converting
            ? {
                title: (converting.title || converting.content || '').split('\n')[0].trim(),
                description: converting.type === 'checklist' ? '' : (converting.content || ''),
              }
            : null
        }
        onCreate={(ws, uidArg, payload) =>
          conversionService
            .convertInboxItemToTask(ws, uidArg, converting, payload)
            .then((r) => r.task)}
        onSaved={() => { loadConverted(); toast('Convertido em atividade') }}
        onClose={() => setConverting(null)}
      />

      {/* Edicao da Task vinculada, aberta pelo selo "Convertido". */}
      <TaskModal
        open={Boolean(editingTask)}
        task={editingTask}
        onClose={() => { setEditingTask(null); loadConverted() }}
      />
    </div>
  )
}
