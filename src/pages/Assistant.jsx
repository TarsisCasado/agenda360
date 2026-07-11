import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Sparkles, Send, Bot, User, Check, Pencil, X, Zap, AlertTriangle, ListChecks,
} from 'lucide-react'
import { PageHeader } from '../components/ui/Common'
import { StatusBadge } from '../components/ui/Badges'
import Spinner from '../components/ui/Spinner'
import { useAuth } from '../context/AuthContext'
import { useWorkspace } from '../context/WorkspaceContext'
import { useData } from '../context/DataContext'
import { useToast } from '../context/ToastContext'
import { agentKernel } from '../agent/kernel'
import { PRIORITY_META } from '../lib/constants'
import { formatShort } from '../lib/date'
import { cx } from '../lib/utils'

const SUGGESTIONS = [
  'Agende reuniao com Rafael amanha as 15h, prioridade alta',
  'O que eu tenho na sexta?',
  'Conclua a tarefa Treino na academia',
  'Busque tarefas de trabalho',
]

const ACTION_LABEL = {
  create_task: 'Criar atividade',
  update_task: 'Editar atividade',
  reschedule_task: 'Reagendar',
  complete_task: 'Concluir',
  mark_missed: 'Marcar como furada',
  cancel_task: 'Cancelar atividade',
  delete_task: 'Excluir atividade',
  create_link: 'Salvar link',
}

function ConfidenceBar({ value = 0 }) {
  const pct = Math.round(value * 100)
  const tone = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div className={cx('h-full rounded-full', tone)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] text-slate-400">confianca {pct}%</span>
    </div>
  )
}

// Previa editavel de uma acao de escrita.
function PreviewCard({ pending, categories, onConfirm, onCancel, busy }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(pending.proposal.payload)
  useEffect(() => setForm(pending.proposal.payload), [pending])

  const p = pending.proposal
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const has = (k) => form[k] !== undefined
  const catName = categories.find((c) => c.id === form.category_id)?.name

  const confirm = () => onConfirm({ ...p, payload: form })

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2 dark:border-slate-800 dark:bg-slate-800/50">
        <span className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
          <Sparkles size={15} className="text-brand-500" />
          {ACTION_LABEL[p.intent] || p.intent}
          {p.destructive && (
            <span className="chip bg-red-50 text-red-600 dark:bg-red-950/40">destrutiva</span>
          )}
        </span>
        <ConfidenceBar value={pending.confidence ?? 0} />
      </div>

      <div className="space-y-3 p-4">
        {pending.ambiguities?.includes('horario') && (
          <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
            <AlertTriangle size={14} /> Confirme o horario (manha ou noite) antes de salvar.
          </p>
        )}

        {!editing ? (
          <dl className="space-y-1.5 text-sm">
            {has('title') && <Row label="Titulo" value={form.title} />}
            {has('date') && <Row label="Data" value={formatShort(form.date)} />}
            {has('start_time') && <Row label="Horario" value={form.start_time} />}
            {has('priority') && <Row label="Prioridade" value={PRIORITY_META[form.priority]?.label} />}
            {catName && <Row label="Categoria" value={catName} />}
            {has('url') && <Row label="URL" value={form.url} />}
            {has('notes') && <Row label="Observacoes" value={form.notes} />}
            {p.intent !== 'create_task' && p.intent !== 'create_link' && (
              <Row label="Tarefa" value={form.task_id ? 'selecionada' : '—'} />
            )}
          </dl>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {has('title') && (
              <Field label="Titulo" className="sm:col-span-2">
                <input className="input" value={form.title || ''} onChange={set('title')} />
              </Field>
            )}
            {has('date') && (
              <Field label="Data">
                <input type="date" className="input" value={form.date || ''} onChange={set('date')} />
              </Field>
            )}
            {(has('start_time') || p.intent === 'create_task') && (
              <Field label="Horario">
                <input type="time" className="input" value={form.start_time || ''} onChange={set('start_time')} />
              </Field>
            )}
            {(has('priority') || p.intent === 'create_task') && (
              <Field label="Prioridade">
                <select className="input" value={form.priority || 'medium'} onChange={set('priority')}>
                  {Object.entries(PRIORITY_META).map(([k, m]) => (
                    <option key={k} value={k}>{m.label}</option>
                  ))}
                </select>
              </Field>
            )}
            {p.intent === 'create_task' && (
              <Field label="Categoria">
                <select className="input" value={form.category_id || ''} onChange={set('category_id')}>
                  <option value="">Sem categoria</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
            )}
            {p.intent === 'create_task' && (
              <Field label="Observacoes" className="sm:col-span-2">
                <textarea className="input min-h-[54px]" value={form.notes || ''} onChange={set('notes')} />
              </Field>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-slate-100 p-3 dark:border-slate-800">
        <button className="btn-primary press" onClick={confirm} disabled={busy}>
          <Check size={16} /> Confirmar
        </button>
        <button className="btn-secondary" onClick={() => setEditing((v) => !v)} disabled={busy}>
          <Pencil size={16} /> {editing ? 'Concluir edicao' : 'Editar'}
        </button>
        <button className="btn-ghost" onClick={onCancel} disabled={busy}>
          <X size={16} /> Cancelar
        </button>
      </div>
    </div>
  )
}

const Row = ({ label, value }) => (
  <div className="flex justify-between gap-3">
    <dt className="text-slate-400">{label}</dt>
    <dd className="text-right font-medium text-slate-700 dark:text-slate-200">{value ?? '—'}</dd>
  </div>
)
const Field = ({ label, children, className }) => (
  <div className={className}>
    <label className="label">{label}</label>
    {children}
  </div>
)

export default function Assistant() {
  const { user } = useAuth()
  const { workspace, workspaceId } = useWorkspace()
  const { categories, reload } = useData()
  const { toast } = useToast()
  const identity = { workspaceId, userId: user?.id }

  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'Ola! Diga um comando, ex.: "Agende reuniao com Rafael amanha as 15h".' },
  ])
  const [pending, setPending] = useState(null) // {kind:'proposal'|'selection', ...}
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const convRef = useRef(null)
  const endRef = useRef(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, pending])

  const pushMsg = (role, text) => setMessages((m) => [...m, { role, text }])

  const handleOutcome = useCallback((res) => {
    convRef.current = res.conversationId || convRef.current
    if (res.kind === 'clarification') {
      pushMsg('assistant', res.message)
      setPending(null)
    } else if (res.kind === 'result') {
      pushMsg('assistant', res.message || 'Resultado:')
      setPending({ kind: 'result', result: res.result })
    } else if (res.kind === 'selection') {
      pushMsg('assistant', res.message)
      setPending({ kind: 'selection', intent: res.intent, data: res.data, options: res.options })
    } else if (res.kind === 'proposal') {
      pushMsg('assistant', res.message)
      setPending({ kind: 'proposal', proposal: res.proposal, confidence: res.confidence, ambiguities: res.ambiguities })
    }
  }, [])

  const send = async (text) => {
    const content = (text ?? input).trim()
    if (!content || busy) return
    setInput('')
    setPending(null)
    pushMsg('user', content)
    setBusy(true)
    try {
      const res = await agentKernel.assistant.ask({
        text: content, identity, categories, conversationId: convRef.current,
      })
      handleOutcome(res)
    } catch (err) {
      pushMsg('assistant', 'Ops, algo deu errado ao processar.')
      toast('Erro: ' + err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const confirmProposal = async (proposal) => {
    setBusy(true)
    try {
      await agentKernel.assistant.confirm({ proposal, identity, conversationId: convRef.current })
      pushMsg('assistant', 'Feito! Acao executada.')
      toast('Acao executada')
      reload()
      setPending(null)
    } catch (err) {
      pushMsg('assistant', 'Nao consegui executar: ' + err.message)
      toast('Erro: ' + err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const cancelProposal = async (proposal) => {
    try {
      await agentKernel.assistant.cancel({ proposal, conversationId: convRef.current })
    } catch { /* noop */ }
    pushMsg('assistant', 'Acao cancelada.')
    setPending(null)
  }

  const pickSelection = async (taskId) => {
    setBusy(true)
    try {
      const res = await agentKernel.assistant.resolveSelection({
        intent: pending.intent, data: pending.data, taskId, identity, conversationId: convRef.current,
      })
      handleOutcome(res)
    } catch (err) {
      toast('Erro: ' + err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col">
      <PageHeader
        title="Assistente"
        subtitle="Modo simulado (sem IA externa). Prévia e confirmacao obrigatorias."
        actions={
          <span className="chip bg-brand-50 text-brand-600 dark:bg-brand-900/30">
            Workspace: {workspace?.name || 'Pessoal'}
          </span>
        }
      />

      <div className="card flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {messages.map((m, i) => (
            <div key={i} className={cx('flex gap-3', m.role === 'user' && 'flex-row-reverse')}>
              <div className={cx(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                m.role === 'user' ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-600 dark:bg-brand-900/40',
              )}>
                {m.role === 'user' ? <User size={16} /> : <Bot size={16} />}
              </div>
              <div className={cx(
                'max-w-[80%] whitespace-pre-line rounded-2xl px-4 py-2.5 text-sm',
                m.role === 'user' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100',
              )}>
                {m.text}
              </div>
            </div>
          ))}

          {/* Previa de acao (escrita) */}
          {pending?.kind === 'proposal' && (
            <PreviewCard
              pending={pending}
              categories={categories}
              busy={busy}
              onConfirm={confirmProposal}
              onCancel={() => cancelProposal(pending.proposal)}
            />
          )}

          {/* Selecao de tarefa (multiplas) */}
          {pending?.kind === 'selection' && (
            <div className="card p-3">
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
                <ListChecks size={15} /> Selecione a tarefa:
              </p>
              <div className="space-y-1.5">
                {pending.options.map((o) => (
                  <button key={o.id} onClick={() => pickSelection(o.id)} disabled={busy}
                    className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                    <span className="font-medium text-slate-700 dark:text-slate-200">{o.title}</span>
                    <span className="text-xs text-slate-400">{formatShort(o.date)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Resultado de leitura */}
          {pending?.kind === 'result' && (
            <div className="card p-3">
              {(!pending.result || pending.result.length === 0) ? (
                <p className="py-2 text-center text-sm text-slate-400">Nenhum resultado.</p>
              ) : (
                <div className="space-y-1.5">
                  {pending.result.slice(0, 12).map((t) => (
                    <div key={t.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm dark:border-slate-800">
                      <span className="font-medium text-slate-700 dark:text-slate-200">{t.title}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">{formatShort(t.date)}</span>
                        <StatusBadge status={t.status} size="xs" />
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {busy && (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Spinner size={16} /> processando...
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Sugestoes */}
        <div className="flex flex-wrap gap-2 border-t border-slate-100 px-4 py-2 dark:border-slate-800">
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => send(s)} disabled={busy}
              className="chip bg-slate-100 text-slate-600 hover:bg-brand-50 hover:text-brand-600 dark:bg-slate-800 dark:text-slate-300">
              <Zap size={11} /> {s}
            </button>
          ))}
        </div>

        <form onSubmit={(e) => { e.preventDefault(); send() }}
          className="flex items-center gap-2 border-t border-slate-200 p-3 dark:border-slate-800">
          <Sparkles size={18} className="ml-1 text-brand-500" />
          <input className="input border-0 focus:ring-0" value={input}
            onChange={(e) => setInput(e.target.value)} placeholder="Escreva um comando..." disabled={busy} />
          <button type="submit" className="btn-primary press" disabled={busy || !input.trim()}>
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  )
}
