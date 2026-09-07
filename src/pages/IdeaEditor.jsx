import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { ChevronLeft, Check, Loader2, Trash2, ListChecks } from 'lucide-react'
import { inboxService } from '../services/inboxService'
import { taskService } from '../services/taskService'
import { useAuth } from '../context/AuthContext'
import { useWorkspace } from '../context/WorkspaceContext'
import { useData } from '../context/DataContext'
import { useToast } from '../context/ToastContext'
import Spinner from '../components/ui/Spinner'
import { firstLine } from '../lib/ideas'

// ---------------------------------------------------------------------------
// IDEA EDITOR — experiencia de ESCRITA em tela cheia (principios do Apple
// Notes), fora do Layout: sem sidebar/bottom-nav competindo, viewport inteira,
// safe-area e teclado do iOS respeitados. Autosave com debounce. Persiste em
// inbox_items via inboxService (title + content). Nenhum botao falso: a
// toolbar mostra SO acoes que funcionam agora. (O controle "IA - em breve"
// saiu: um botao desabilitado e permanentemente cinza le como quebrado, nao
// como promessa. Quando a acao de IA existir, ela entra aqui funcionando --
// a arquitetura do agente ja esta pronta em src/agent.)
// ---------------------------------------------------------------------------

export default function IdeaEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const { workspaceId } = useWorkspace()
  const { reload: reloadData } = useData()
  const { toast } = useToast()

  const [note, setNote] = useState(location.state?.note || null)
  const [title, setTitle] = useState(location.state?.note?.title || '')
  const [content, setContent] = useState(location.state?.note?.content || '')
  const [loading, setLoading] = useState(!location.state?.note)
  const [saveState, setSaveState] = useState('idle') // idle | saving | saved
  const bodyRef = useRef(null)
  const saveTimer = useRef(null)
  const lastSaved = useRef({ title: location.state?.note?.title || '', content: location.state?.note?.content || '' })

  // Carrega a nota se veio por deep-link/refresh (sem state de navegacao).
  useEffect(() => {
    if (note || !workspaceId) return
    let alive = true
    inboxService
      .list(workspaceId)
      .then((rows) => {
        const found = rows.find((n) => n.id === id)
        if (!alive) return
        if (found) {
          setNote(found)
          setTitle(found.title || '')
          setContent(found.content || '')
          lastSaved.current = { title: found.title || '', content: found.content || '' }
        }
        setLoading(false)
      })
      .catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [id, note, workspaceId])

  const persist = useCallback(
    async (nextTitle, nextContent) => {
      if (!note) return
      if (nextTitle === lastSaved.current.title && nextContent === lastSaved.current.content) return
      setSaveState('saving')
      try {
        await inboxService.update(note, { title: nextTitle, content: nextContent })
        lastSaved.current = { title: nextTitle, content: nextContent }
        setSaveState('saved')
        reloadData()
      } catch {
        setSaveState('idle')
        toast('Não foi possível salvar agora', 'error')
      }
    },
    [note, reloadData, toast],
  )

  // Autosave com debounce (800ms) apos parar de digitar.
  useEffect(() => {
    if (!note) return
    if (title === lastSaved.current.title && content === lastSaved.current.content) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => persist(title, content), 800)
    return () => clearTimeout(saveTimer.current)
  }, [title, content, note, persist])

  // Salva ao sair da tela (flush do que estiver pendente).
  const leave = async () => {
    clearTimeout(saveTimer.current)
    await persist(title, content)
    navigate('/ideias')
  }

  const removeIdea = async () => {
    if (!note) return navigate('/ideias')
    if (!window.confirm('Excluir esta ideia?')) return
    try {
      await inboxService.remove(note)
      reloadData()
      navigate('/ideias')
    } catch (err) {
      toast('Erro ao excluir: ' + err.message, 'error')
    }
  }

  const toTask = async () => {
    const taskTitle = (title.trim() || firstLine(content) || 'Nova tarefa').slice(0, 200)
    try {
      clearTimeout(saveTimer.current)
      await persist(title, content)
      await taskService.create(workspaceId, user.id, {
        title: taskTitle,
        description: content || '',
        date: null,
      })
      reloadData()
      toast('Ideia transformada em tarefa')
      navigate('/tarefas')
    } catch (err) {
      toast('Erro ao criar tarefa: ' + err.message, 'error')
    }
  }

  if (loading) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-white dark:bg-slate-950">
        <Spinner size={32} />
      </div>
    )
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-white dark:bg-slate-950">
      {/* Barra superior minimalista, com safe-area no topo */}
      <header
        className="flex items-center justify-between gap-2 border-b border-slate-100 px-2 py-2 dark:border-slate-800/80"
        style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
      >
        <button onClick={leave} className="press flex items-center gap-1 rounded-lg px-2 py-1.5 text-brand-600 dark:text-brand-400">
          <ChevronLeft size={20} /> <span className="text-sm font-semibold">Ideias</span>
        </button>
        <span className="flex items-center gap-1.5 text-xs text-slate-400" aria-live="polite">
          {saveState === 'saving' && (<><Loader2 size={13} className="animate-spin" /> Salvando…</>)}
          {saveState === 'saved' && (<><Check size={13} className="text-emerald-500" /> Salvo</>)}
        </span>
        <button onClick={removeIdea} className="press rounded-lg p-2 text-slate-400 hover:text-red-500" aria-label="Excluir">
          <Trash2 size={18} />
        </button>
      </header>

      {/* Area de escrita: titulo discreto + corpo ocupando a viewport */}
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col overflow-hidden px-5">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título"
          className="w-full bg-transparent pt-5 text-2xl font-extrabold text-slate-800 placeholder:text-slate-300 focus:outline-none dark:text-slate-100 dark:placeholder:text-slate-600"
        />
        <textarea
          ref={bodyRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Comece a escrever…"
          className="mt-2 min-h-0 w-full flex-1 resize-none bg-transparent pb-4 text-[17px] leading-relaxed text-slate-700 placeholder:text-slate-300 focus:outline-none dark:text-slate-200 dark:placeholder:text-slate-600"
        />
      </div>

      {/* Toolbar inferior — apenas acoes REAIS.
          Safe-area para nao ficar atras do home indicator. */}
      <div
        className="border-t border-slate-100 px-3 py-2 dark:border-slate-800/80"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          <button onClick={toTask} className="press flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200">
            <ListChecks size={16} /> Transformar em tarefa
          </button>
        </div>
      </div>
    </div>
  )
}
