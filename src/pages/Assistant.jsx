import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Sparkles, Send, Check, Pencil, X, Calendar, Clock, Tag, Flag,
  Link2, ListChecks, CheckCircle2, AlertTriangle, Trash2, XCircle,
  CalendarClock, MessageSquare, CornerDownLeft,
} from 'lucide-react'
import { StatusBadge } from '../components/ui/Badges'
import { useAuth } from '../context/AuthContext'
import { useWorkspace } from '../context/WorkspaceContext'
import { useData } from '../context/DataContext'
import { useToast } from '../context/ToastContext'
import { agentKernel } from '../agent/kernel'
import { PRIORITY_META } from '../lib/constants'
import { formatShort } from '../lib/date'
import { cx } from '../lib/utils'

// --- Copy de concierge (humanizada, curta, elegante) -----------------------
const INTRO = {
  create_task: 'Perfeito! Preparei uma nova atividade. É só confirmar. 👇',
  update_task: 'Certo — vou ajustar essa atividade para você.',
  reschedule_task: 'Combinado! Posso mover para a nova data.',
  complete_task: 'Boa! Marco como concluída?',
  mark_missed: 'Sem problema — registro como furada.',
  cancel_task: 'Tudo bem, posso cancelar essa atividade.',
  delete_task: 'Só confirmando: quer mesmo excluir?',
  create_link: 'Salvo! Guardo esse link para você.',
}
const DONE_LABEL = {
  create_task: 'Atividade criada',
  update_task: 'Atividade atualizada',
  reschedule_task: 'Atividade reagendada',
  complete_task: 'Atividade concluída',
  mark_missed: 'Marcada como furada',
  cancel_task: 'Atividade cancelada',
  delete_task: 'Atividade excluída',
  create_link: 'Link salvo',
}
const CARD_TITLE = {
  create_task: 'Nova atividade', update_task: 'Editar atividade',
  reschedule_task: 'Reagendar', complete_task: 'Concluir atividade',
  mark_missed: 'Marcar como furada', cancel_task: 'Cancelar atividade',
  delete_task: 'Excluir atividade', create_link: 'Novo link',
}
const DONE_ICON = {
  create_task: CheckCircle2, update_task: Pencil, reschedule_task: CalendarClock,
  complete_task: CheckCircle2, mark_missed: XCircle, cancel_task: XCircle,
  delete_task: Trash2, create_link: Link2,
}

const SUGGESTIONS = [
  { t: 'Agende reunião com Rafael amanhã às 15h, prioridade alta', i: Calendar },
  { t: 'O que eu tenho na sexta?', i: ListChecks },
  { t: 'Conclua a tarefa Treino na academia', i: CheckCircle2 },
  { t: 'Busque tarefas de trabalho', i: Tag },
]

const now = () => new Date()
const hhmm = (d) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

function confidenceLevel(confidence = 0, ambiguities = []) {
  if (ambiguities.length) {
    return { label: 'Confirme', tone: 'text-danger', hint: 'Revise o que está destacado antes de confirmar.' }
  }
  if (confidence >= 0.85) return { label: null, tone: 'text-positive' }
  return { label: 'Confira', tone: 'text-warning', hint: 'Ajuste se algo não estiver certo.' }
}

// --- Avatares ---------------------------------------------------------------
// O copiloto nao usa "avatar de chatbot": a fala dele e o texto da pagina,
// marcado por uma faisca discreta. So o usuario ganha bolha.
const AgentMark = () => <Sparkles size={15} className="mt-[3px] shrink-0 text-accent" />

// --- Linha de campo do cartao (icone + label + valor) -----------------------
const FieldRow = ({ icon: Icon, label, children }) => (
  <div className="flex items-center gap-2.5 py-1.5">
    <Icon size={14} className="shrink-0 text-muted" />
    <span className="text-caption w-[68px] shrink-0">{label}</span>
    <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-primary">{children}</span>
  </div>
)

// --- Cartao inteligente da previa (com edicao inline) -----------------------
function ActionCard({ pending, categories, busy, onConfirm, onCancel }) {
  const p = pending.proposal
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(p.payload)
  useEffect(() => { setForm(p.payload); setEditing(false) }, [p])
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const has = (k) => form[k] !== undefined
  const conf = confidenceLevel(pending.confidence, pending.ambiguities)
  const catName = categories.find((c) => c.id === form.category_id)?.name
  const prio = PRIORITY_META[form.priority]

  return (
    <div className="msg-in w-full max-w-md rounded-surface bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-section">{CARD_TITLE[p.intent] || 'Ação'}</span>
        {conf.label && (
          <span className={cx('text-[12px] font-semibold', conf.tone)}>{conf.label}</span>
        )}
      </div>

      <div className="pt-2">
        {has('title') && !editing && (
          <p className="mb-1.5 text-[17px] font-semibold leading-snug tracking-[-0.01em] text-primary">{form.title}</p>
        )}
        {has('url') && !editing && (
          <p className="mb-2 break-all text-[13px] font-medium text-accent-text">{form.url}</p>
        )}

        {!editing ? (
          <div className="divide-y divide-hairline/50">
            {has('date') && <FieldRow icon={Calendar} label="Data">{formatShort(form.date)}</FieldRow>}
            {has('start_time') && <FieldRow icon={Clock} label="Horário">{form.start_time}</FieldRow>}
            {prio && <FieldRow icon={Flag} label="Prioridade"><span style={{ color: prio.color }}>{prio.label}</span></FieldRow>}
            {catName && <FieldRow icon={Tag} label="Categoria">{catName}</FieldRow>}
            {has('notes') && <FieldRow icon={MessageSquare} label="Obs.">{form.notes}</FieldRow>}
            {(p.intent !== 'create_task' && p.intent !== 'create_link') && (
              <FieldRow icon={CheckCircle2} label="Tarefa">{form.task_id ? 'selecionada' : '—'}</FieldRow>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {has('title') && (
              <label className="col-span-2 text-[12px] font-medium text-secondary">Título
                <input className="input mt-1" value={form.title || ''} onChange={set('title')} />
              </label>
            )}
            {has('date') && (
              <label className="text-[12px] font-medium text-secondary">Data
                <input type="date" className="input mt-1" value={form.date || ''} onChange={set('date')} />
              </label>
            )}
            {(has('start_time') || p.intent === 'create_task') && (
              <label className="text-[12px] font-medium text-secondary">Horário
                <input type="time" className="input mt-1" value={form.start_time || ''} onChange={set('start_time')} />
              </label>
            )}
            {(has('priority') || p.intent === 'create_task') && (
              <label className="text-[12px] font-medium text-secondary">Prioridade
                <select className="input mt-1" value={form.priority || 'medium'} onChange={set('priority')}>
                  {Object.entries(PRIORITY_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
                </select>
              </label>
            )}
            {p.intent === 'create_task' && (
              <label className="text-[12px] font-medium text-secondary">Categoria
                <select className="input mt-1" value={form.category_id || ''} onChange={set('category_id')}>
                  <option value="">Sem categoria</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            )}
            {p.intent === 'create_task' && (
              <label className="col-span-2 text-[12px] font-medium text-secondary">Observações
                <textarea className="input mt-1 min-h-[48px]" value={form.notes || ''} onChange={set('notes')} />
              </label>
            )}
          </div>
        )}

        {conf.hint && (
          <p className="text-caption mt-3 flex items-center gap-1.5">
            <AlertTriangle size={12} /> {conf.hint}
          </p>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button className="btn-primary press flex-1" disabled={busy} onClick={() => onConfirm({ ...p, payload: form })}>
          <Check size={16} /> Confirmar
        </button>
        <button className="btn-ghost press" disabled={busy} onClick={() => setEditing((v) => !v)} aria-label="Editar">
          <Pencil size={15} /> {editing ? 'Pronto' : 'Ajustar'}
        </button>
        <button className="icon-btn" disabled={busy} onClick={onCancel} aria-label="Cancelar">
          <X size={17} />
        </button>
      </div>
    </div>
  )
}

// --- Cartao de atividade executada (timeline) -------------------------------
function ActivityCard({ intent, at }) {
  const Icon = DONE_ICON[intent] || CheckCircle2
  return (
    <div className="msg-in flex items-center gap-2.5 py-1">
      <span className="animate-pop flex h-7 w-7 items-center justify-center rounded-full bg-positive/12 text-positive">
        <Icon size={15} />
      </span>
      <p className="text-[14px] font-medium text-primary">{DONE_LABEL[intent] || 'Ação concluída'}</p>
      <span className="text-caption tabular-nums">{hhmm(at)}</span>
    </div>
  )
}

export default function Assistant() {
  const { user } = useAuth()
  const { workspace, workspaceId } = useWorkspace()
  const { categories, reload } = useData()
  const { toast } = useToast()
  const identity = { workspaceId, userId: user?.id }

  const [messages, setMessages] = useState([]) // {id, role, at, text?, result?, activity?}
  const [pending, setPending] = useState(null)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const convRef = useRef(null)
  const endRef = useRef(null)
  const idRef = useRef(0)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, pending, busy])

  const push = (msg) => setMessages((m) => [...m, { id: ++idRef.current, at: now(), ...msg }])

  const handleOutcome = useCallback((res) => {
    convRef.current = res.conversationId || convRef.current
    if (res.kind === 'clarification') {
      push({ role: 'assistant', text: res.message })
      setPending(null)
    } else if (res.kind === 'result') {
      const n = Array.isArray(res.result) ? res.result.length : 0
      push({ role: 'assistant', text: n ? `Encontrei ${n} ${n === 1 ? 'item' : 'itens'}:` : 'Não encontrei nada por aqui.', result: res.result || [] })
      setPending(null)
    } else if (res.kind === 'selection') {
      push({ role: 'assistant', text: res.message })
      setPending({ kind: 'selection', intent: res.intent, data: res.data, options: res.options })
    } else if (res.kind === 'proposal') {
      push({ role: 'assistant', text: INTRO[res.proposal.intent] || 'Preparei isso para você:' })
      setPending({ kind: 'proposal', proposal: res.proposal, confidence: res.confidence, ambiguities: res.ambiguities })
    }
  }, [])

  const send = async (text) => {
    const content = (text ?? input).trim()
    if (!content || busy) return
    setInput('')
    setPending(null)
    push({ role: 'user', text: content })
    setBusy(true)
    try {
      const res = await agentKernel.assistant.ask({ text: content, identity, categories, conversationId: convRef.current })
      handleOutcome(res)
    } catch (err) {
      push({ role: 'assistant', text: 'Ops, tive um problema para processar. Pode tentar de novo?' })
      toast('Erro: ' + err.message, 'error')
    } finally { setBusy(false) }
  }

  const confirmProposal = async (proposal) => {
    if (busy) return
    setBusy(true)
    try {
      await agentKernel.assistant.confirm({ proposal, identity, conversationId: convRef.current })
      setPending(null)
      push({ role: 'assistant', text: 'Feito! ✨', activity: { intent: proposal.intent } })
      toast('Ação executada')
      reload()
    } catch (err) {
      push({ role: 'assistant', text: 'Não consegui executar: ' + err.message })
      toast('Erro: ' + err.message, 'error')
    } finally { setBusy(false) }
  }

  const cancelProposal = async (proposal) => {
    if (busy) return
    setPending(null)
    try { await agentKernel.assistant.cancel({ proposal, conversationId: convRef.current }) } catch { /* noop */ }
    push({ role: 'assistant', text: 'Tudo bem, cancelei. 👍' })
  }

  const pickSelection = async (taskId) => {
    if (busy) return
    setBusy(true)
    try {
      const res = await agentKernel.assistant.resolveSelection({ intent: pending.intent, data: pending.data, taskId, identity, conversationId: convRef.current })
      handleOutcome(res)
    } catch (err) { toast('Erro: ' + err.message, 'error') } finally { setBusy(false) }
  }

  const empty = messages.length === 0 && !pending && !busy


  return (
    // COPILOTO — a conversa vive na pagina, nao dentro de um card de chat.
    // A entrada flutua sobre o conteudo (como um teclado nativo), com blur.
    <div className="mx-auto flex h-full max-w-2xl flex-col">
      <header className="mb-2 flex items-center justify-between gap-3 px-2">
        <div className="min-w-0">
          <h1 className="text-display">Copiloto</h1>
          <p className="text-caption mt-1">
            Interpretação local · {workspace?.name || 'Pessoal'}
          </p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => { setMessages([]); setPending(null); convRef.current = null }}
            className="press text-[13px] font-semibold text-muted"
          >
            Limpar
          </button>
        )}
      </header>

      <div
        className="min-h-0 flex-1 space-y-5 overflow-y-auto px-2 pb-32 pt-3"
        role="log"
        aria-live="polite"
      >
        {/* Primeiro acesso */}
        {empty && (
          <div className="animate-in flex flex-col gap-6 pt-4">
            <div>
              <h2 className="text-page">
                Olá, {user?.full_name?.split(' ')[0] || 'por aqui'}
              </h2>
              <p className="text-body mt-1.5">
                Diga o que precisa com suas palavras. Eu preparo — você confirma.
              </p>
            </div>
            <div className="list">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.t}
                  onClick={() => send(s.t)}
                  className="flex w-full items-center gap-3 bg-surface px-3 py-3 text-left transition-colors active:bg-surface-2"
                >
                  <s.i size={16} className="shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 text-[15px] text-primary">{s.t}</span>
                  <CornerDownLeft size={14} className="shrink-0 text-faint" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Conversa */}
        {messages.map((m) => (
          <div key={m.id} className={cx('msg-in', m.role === 'user' && 'flex justify-end')}>
            {m.role === 'user' ? (
              <p className="max-w-[85%] rounded-[18px] rounded-br-[6px] bg-surface-2 px-4 py-2.5 text-[15px] leading-relaxed text-primary">
                {m.text}
              </p>
            ) : (
              <div className="flex items-start gap-2.5">
                <AgentMark />
                <div className="min-w-0 flex-1 space-y-2.5">
                  {m.text && (
                    <p className="whitespace-pre-line text-[15px] leading-relaxed text-secondary">
                      {m.text}
                    </p>
                  )}
                  {m.activity && <ActivityCard intent={m.activity.intent} at={m.at} />}
                  {m.result && m.result.length > 0 && (
                    <div className="list-panel max-w-md">
                      {m.result.slice(0, 10).map((t) => (
                        <div key={t.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                          <span className="truncate text-[14px] font-medium text-primary">{t.title}</span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="text-caption tabular-nums">{formatShort(t.date)}</span>
                            <StatusBadge status={t.status} size="xs" />
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Proposta */}
        {pending?.kind === 'proposal' && (
          <div className="flex items-start gap-2.5">
            <AgentMark />
            <ActionCard
              pending={pending}
              categories={categories}
              busy={busy}
              onConfirm={confirmProposal}
              onCancel={() => cancelProposal(pending.proposal)}
            />
          </div>
        )}

        {/* Selecao */}
        {pending?.kind === 'selection' && (
          <div className="flex items-start gap-2.5">
            <AgentMark />
            <div className="msg-in w-full max-w-md">
              <p className="text-section mb-1.5 flex items-center gap-1.5">
                <ListChecks size={13} /> Qual delas?
              </p>
              <div className="list-panel">
                {pending.options.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => pickSelection(o.id)}
                    disabled={busy}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors active:bg-surface-2"
                  >
                    <span className="truncate text-[14px] font-medium text-primary">{o.title}</span>
                    <span className="text-caption flex shrink-0 items-center gap-2 tabular-nums">
                      {formatShort(o.date)} <CornerDownLeft size={12} />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Pensando */}
        {busy && (
          <div className="flex items-center gap-2.5">
            <AgentMark />
            <div className="flex items-center gap-1 py-1">
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted" />
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted" style={{ animationDelay: '0.2s' }} />
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted" style={{ animationDelay: '0.4s' }} />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Entrada flutuante — acompanha o teclado do iOS (dvh + safe-area). */}
      <form
        onSubmit={(e) => { e.preventDefault(); send() }}
        className="sticky bottom-0 -mx-2 bg-canvas/85 px-2 pt-2 backdrop-blur-xl"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-center gap-2 rounded-full bg-surface py-1 pl-4 pr-1 shadow-raised ring-1 ring-hairline/70">
          <input
            className="field flex-1 py-2 text-[16px]"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="O que você precisa?"
            disabled={busy}
            aria-label="Mensagem para o copiloto"
          />
          <button
            type="submit"
            aria-label="Enviar"
            disabled={busy || !input.trim()}
            className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-opacity disabled:opacity-30"
          >
            <Send size={16} />
          </button>
        </div>
      </form>
    </div>
  )
}
