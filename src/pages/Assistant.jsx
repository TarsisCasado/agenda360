import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Sparkles, Send, User, Check, Pencil, X, Calendar, Clock, Tag, Flag,
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
    return { label: 'Precisa confirmar', dot: '#ef4444', bg: 'bg-red-50 text-red-600 dark:bg-red-950/40',
      hint: 'Revise os itens destacados antes de confirmar.' }
  }
  if (confidence >= 0.85) return { label: 'Alta confiança', dot: '#10b981', bg: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40' }
  return { label: 'Média confiança', dot: '#f59e0b', bg: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40',
    hint: 'Confira os detalhes — ajuste se algo não estiver certo.' }
}

// --- Avatares ---------------------------------------------------------------
const AssistantAvatar = () => (
  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
    <Sparkles size={15} />
  </div>
)
const UserAvatar = () => (
  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-200">
    <User size={15} />
  </div>
)

// --- Linha de campo do cartao (icone + label + valor) -----------------------
const FieldRow = ({ icon: Icon, label, children, accent }) => (
  <div className="flex items-center gap-2.5 py-1">
    <span className={cx('flex h-6 w-6 items-center justify-center rounded-md', accent || 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400')}>
      <Icon size={13} />
    </span>
    <span className="w-16 shrink-0 text-xs text-slate-400">{label}</span>
    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700 dark:text-slate-100">{children}</span>
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
    <div className="msg-in max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5 dark:border-slate-700/60">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-400">{CARD_TITLE[p.intent] || 'Ação'}</span>
        <span className={cx('chip', conf.bg)}>
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: conf.dot }} /> {conf.label}
        </span>
      </div>

      <div className="p-4">
        {has('title') && !editing && (
          <p className="mb-2 text-base font-bold text-slate-800 dark:text-slate-100">{form.title}</p>
        )}
        {has('url') && !editing && (
          <p className="mb-2 break-all text-sm font-semibold text-brand-600">{form.url}</p>
        )}

        {!editing ? (
          <div className="divide-y divide-slate-50 dark:divide-slate-700/40">
            {has('date') && <FieldRow icon={Calendar} label="Data" accent="bg-brand-50 text-brand-500 dark:bg-brand-900/30">{formatShort(form.date)}</FieldRow>}
            {has('start_time') && <FieldRow icon={Clock} label="Horário" accent="bg-sky-50 text-sky-500 dark:bg-sky-900/30">{form.start_time}</FieldRow>}
            {prio && <FieldRow icon={Flag} label="Prioridade" accent="bg-amber-50 text-amber-500 dark:bg-amber-900/30"><span style={{ color: prio.color }}>{prio.label}</span></FieldRow>}
            {catName && <FieldRow icon={Tag} label="Categoria" accent="bg-violet-50 text-violet-500 dark:bg-violet-900/30">{catName}</FieldRow>}
            {has('notes') && <FieldRow icon={MessageSquare} label="Obs.">{form.notes}</FieldRow>}
            {(p.intent !== 'create_task' && p.intent !== 'create_link') && (
              <FieldRow icon={CheckCircle2} label="Tarefa">{form.task_id ? 'selecionada' : '—'}</FieldRow>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {has('title') && (
              <label className="col-span-2 text-xs font-medium text-slate-500">Título
                <input className="input mt-1" value={form.title || ''} onChange={set('title')} />
              </label>
            )}
            {has('date') && (
              <label className="text-xs font-medium text-slate-500">Data
                <input type="date" className="input mt-1" value={form.date || ''} onChange={set('date')} />
              </label>
            )}
            {(has('start_time') || p.intent === 'create_task') && (
              <label className="text-xs font-medium text-slate-500">Horário
                <input type="time" className="input mt-1" value={form.start_time || ''} onChange={set('start_time')} />
              </label>
            )}
            {(has('priority') || p.intent === 'create_task') && (
              <label className="text-xs font-medium text-slate-500">Prioridade
                <select className="input mt-1" value={form.priority || 'medium'} onChange={set('priority')}>
                  {Object.entries(PRIORITY_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
                </select>
              </label>
            )}
            {p.intent === 'create_task' && (
              <label className="text-xs font-medium text-slate-500">Categoria
                <select className="input mt-1" value={form.category_id || ''} onChange={set('category_id')}>
                  <option value="">Sem categoria</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            )}
            {p.intent === 'create_task' && (
              <label className="col-span-2 text-xs font-medium text-slate-500">Observações
                <textarea className="input mt-1 min-h-[48px]" value={form.notes || ''} onChange={set('notes')} />
              </label>
            )}
          </div>
        )}

        {conf.hint && (
          <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-500 dark:bg-slate-700/40">
            <AlertTriangle size={12} /> {conf.hint}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-slate-100 px-3 py-2.5 dark:border-slate-700/60">
        <button className="btn-primary press flex-1" disabled={busy} onClick={() => onConfirm({ ...p, payload: form })}>
          <Check size={16} /> Confirmar
        </button>
        <button className="btn-secondary press" disabled={busy} onClick={() => setEditing((v) => !v)} aria-label="Editar">
          <Pencil size={15} /> {editing ? 'Pronto' : 'Editar'}
        </button>
        <button className="btn-ghost" disabled={busy} onClick={onCancel} aria-label="Cancelar">
          <X size={16} />
        </button>
      </div>
    </div>
  )
}

// --- Cartao de atividade executada (timeline) -------------------------------
function ActivityCard({ intent, at }) {
  const Icon = DONE_ICON[intent] || CheckCircle2
  return (
    <div className="msg-in flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2.5 dark:border-emerald-900/50 dark:bg-emerald-950/20">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-white"><Icon size={16} /></span>
      <div className="flex-1">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{DONE_LABEL[intent] || 'Ação concluída'}</p>
        <p className="text-[11px] text-slate-400">{hhmm(at)} · concluída</p>
      </div>
      <Check size={16} className="text-emerald-500" />
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
    <div className="mx-auto flex h-full max-w-2xl flex-col">
      {/* Cabecalho enxuto */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <AssistantAvatar />
          <div>
            <h1 className="text-lg font-extrabold leading-tight text-slate-800 dark:text-slate-100">Assistente</h1>
            <p className="text-[11px] text-slate-400">Concierge da sua agenda · modo simulado</p>
          </div>
        </div>
        <span className="chip bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">{workspace?.name || 'Pessoal'}</span>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5" role="log" aria-live="polite">
          {/* Primeiro acesso / sem mensagens */}
          {empty && (
            <div className="flex h-full flex-col items-center justify-center gap-5 py-6 text-center animate-in">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-600/20">
                <Sparkles size={30} />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-800 dark:text-slate-100">
                  Olá, {user?.full_name?.split(' ')[0] || 'por aqui'} 👋
                </p>
                <p className="mt-1 max-w-xs text-sm text-slate-500">
                  Diga em linguagem natural o que precisa. Eu preparo, você confirma.
                </p>
              </div>
              <div className="grid w-full max-w-md grid-cols-1 gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s.t} onClick={() => send(s.t)}
                    className="interactive flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-sm text-slate-600 hover:border-brand-300 hover:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-brand-700">
                    <s.i size={15} className="shrink-0 text-brand-500" />
                    <span className="line-clamp-2">{s.t}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Historico */}
          {messages.map((m) => (
            <div key={m.id} className={cx('msg-in flex items-end gap-2.5', m.role === 'user' && 'flex-row-reverse')}>
              {m.role === 'user' ? <UserAvatar /> : <AssistantAvatar />}
              <div className={cx('flex max-w-[82%] flex-col gap-1.5', m.role === 'user' && 'items-end')}>
                {m.text && (
                  <div className={cx(
                    'whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                    m.role === 'user'
                      ? 'rounded-br-md bg-brand-600 text-white'
                      : 'rounded-bl-md bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-100',
                  )}>
                    {m.text}
                  </div>
                )}
                {m.activity && <ActivityCard intent={m.activity.intent} at={m.at} />}
                {m.result && (
                  m.result.length === 0 ? null : (
                    <div className="w-full space-y-1.5">
                      {m.result.slice(0, 10).map((t) => (
                        <div key={t.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-800/50">
                          <span className="truncate font-medium text-slate-700 dark:text-slate-200">{t.title}</span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="text-xs text-slate-400">{formatShort(t.date)}</span>
                            <StatusBadge status={t.status} size="xs" />
                          </span>
                        </div>
                      ))}
                    </div>
                  )
                )}
                <span className={cx('px-1 text-[10px] text-slate-300 dark:text-slate-600', m.role === 'user' && 'text-right')}>{hhmm(m.at)}</span>
              </div>
            </div>
          ))}

          {/* Previa (interativa) */}
          {pending?.kind === 'proposal' && (
            <div className="flex items-end gap-2.5">
              <AssistantAvatar />
              <ActionCard pending={pending} categories={categories} busy={busy}
                onConfirm={confirmProposal} onCancel={() => cancelProposal(pending.proposal)} />
            </div>
          )}

          {/* Selecao */}
          {pending?.kind === 'selection' && (
            <div className="flex items-end gap-2.5">
              <AssistantAvatar />
              <div className="msg-in max-w-md rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <ListChecks size={13} /> Qual delas?
                </p>
                <div className="space-y-1.5">
                  {pending.options.map((o) => (
                    <button key={o.id} onClick={() => pickSelection(o.id)} disabled={busy}
                      className="interactive flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:border-brand-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-700/50">
                      <span className="font-medium text-slate-700 dark:text-slate-200">{o.title}</span>
                      <span className="flex items-center gap-2 text-xs text-slate-400">{formatShort(o.date)} <CornerDownLeft size={12} /></span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Pensando / digitando */}
          {busy && (
            <div className="flex items-end gap-2.5">
              <AssistantAvatar />
              <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-slate-100 px-4 py-3 dark:bg-slate-800">
                <span className="typing-dot h-2 w-2 rounded-full bg-slate-400" />
                <span className="typing-dot h-2 w-2 rounded-full bg-slate-400" style={{ animationDelay: '0.2s' }} />
                <span className="typing-dot h-2 w-2 rounded-full bg-slate-400" style={{ animationDelay: '0.4s' }} />
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Sugestoes rapidas (quando ja ha conversa) */}
        {!empty && (
          <div className="flex flex-wrap gap-2 border-t border-slate-100 px-4 py-2 dark:border-slate-800">
            {SUGGESTIONS.slice(0, 3).map((s) => (
              <button key={s.t} onClick={() => send(s.t)} disabled={busy}
                className="chip bg-slate-100 text-slate-500 hover:bg-brand-50 hover:text-brand-600 dark:bg-slate-800 dark:text-slate-300">
                {s.t.length > 34 ? s.t.slice(0, 32) + '…' : s.t}
              </button>
            ))}
          </div>
        )}

        {/* Campo de entrada */}
        <form onSubmit={(e) => { e.preventDefault(); send() }}
          className="flex items-center gap-2 border-t border-slate-200 p-3 dark:border-slate-800">
          <input className="input rounded-full border-slate-200 bg-slate-50 dark:bg-slate-800" value={input}
            onChange={(e) => setInput(e.target.value)} placeholder="Mensagem para o assistente…" disabled={busy}
            aria-label="Mensagem para o assistente" />
          <button type="submit" aria-label="Enviar" disabled={busy || !input.trim()}
            className="press flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white transition-colors hover:bg-brand-700 disabled:opacity-40">
            <Send size={17} />
          </button>
        </form>
      </div>
    </div>
  )
}
