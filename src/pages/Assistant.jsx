import { useState, useRef, useEffect } from 'react'
import { Sparkles, Send, Bot, User, Zap } from 'lucide-react'
import { PageHeader } from '../components/ui/Common'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import { useToast } from '../context/ToastContext'
import { aiService } from '../services/aiService'
import { taskService } from '../services/taskService'
import { STATUS } from '../lib/constants'
import { toISODate, weekRange } from '../lib/date'

const SUGGESTIONS = [
  'Agende uma reuniao amanha as 15h',
  'Crie uma tarefa para eu ver isso na sexta',
  'Reagende todas as tarefas atrasadas para amanha',
  'Mostre o que eu mais furei essa semana',
  'Crie uma rotina semanal com base nas minhas pendencias',
]

export default function Assistant() {
  const { user } = useAuth()
  const { categoryByName, reload } = useData()
  const { toast } = useToast()
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text: 'Ola! Sou seu assistente de produtividade. Diga o que precisa — por exemplo, "Agende uma reuniao amanha as 15h" ou "Reagende as tarefas atrasadas para amanha".',
    },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Aplica os "intents" retornados pelo assistente.
  const applyIntents = async (intents) => {
    const notes = []
    for (const intent of intents) {
      if (intent.type === 'create_task') {
        const { categoryName, ...payload } = intent.payload
        const category = categoryName ? categoryByName(categoryName) : null
        await taskService.create(user.id, {
          ...payload,
          category_id: category?.id || null,
        })
        notes.push(`✅ Atividade "${payload.title}" criada em ${payload.date}.`)
      } else if (intent.type === 'reschedule_overdue') {
        const today = toISODate(new Date())
        const all = await taskService.list(user.id, {})
        const overdue = all.filter(
          (t) =>
            t.date < today &&
            [STATUS.TODO, STATUS.IN_PROGRESS, STATUS.MISSED].includes(t.status),
        )
        for (const t of overdue) {
          await taskService.reschedule(user.id, t, intent.payload.toDate)
        }
        notes.push(
          overdue.length
            ? `🔁 ${overdue.length} atividade(s) atrasada(s) reagendada(s) para ${intent.payload.toDate}.`
            : 'Nenhuma atividade atrasada encontrada.',
        )
      } else if (intent.type === 'report' && intent.payload.metric === 'missed_this_week') {
        const { start, end } = weekRange(new Date())
        const week = await taskService.list(user.id, { start, end })
        const missed = week.filter((t) => t.status === STATUS.MISSED)
        if (!missed.length) {
          notes.push('🎉 Voce nao furou nenhuma atividade nesta semana!')
        } else {
          notes.push(
            `📊 Voce furou ${missed.length} atividade(s) nesta semana:\n` +
              missed.map((t) => `• ${t.title} (${t.date})`).join('\n'),
          )
        }
      } else if (intent.type === 'weekly_routine') {
        const all = await taskService.list(user.id, {})
        const pending = all.filter((t) =>
          [STATUS.TODO, STATUS.IN_PROGRESS].includes(t.status),
        )
        notes.push(
          pending.length
            ? `🗓️ Voce tem ${pending.length} pendencia(s). Sugiro distribui-las ao longo da semana no Kanban, priorizando as urgentes pela manha.`
            : 'Voce esta sem pendencias — semana livre para planejar!',
        )
      }
    }
    if (intents.some((i) => i.type !== 'report')) reload()
    return notes
  }

  const send = async (text) => {
    const content = (text ?? input).trim()
    if (!content || busy) return
    setInput('')
    setMessages((m) => [...m, { role: 'user', text: content }])
    setBusy(true)
    try {
      const { reply, intents } = await aiService.ask(content)
      const notes = await applyIntents(intents)
      setMessages((m) => [
        ...m,
        { role: 'assistant', text: [reply, ...notes].filter(Boolean).join('\n\n') },
      ])
    } catch (err) {
      toast('Erro no assistente: ' + err.message, 'error')
      setMessages((m) => [
        ...m,
        { role: 'assistant', text: 'Ops, algo deu errado ao processar.' },
      ])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col">
      <PageHeader
        title="Assistente IA"
        subtitle={
          aiService.provider === 'mock' || !aiService.hasApiKey
            ? 'Modo simulado (sem API). Pronto para integrar ChatGPT ou Claude.'
            : `Conectado via ${aiService.provider}.`
        }
      />

      <div className="card flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                  m.role === 'user'
                    ? 'bg-brand-600 text-white'
                    : 'bg-brand-50 text-brand-600 dark:bg-brand-900/40'
                }`}
              >
                {m.role === 'user' ? <User size={16} /> : <Bot size={16} />}
              </div>
              <div
                className={`max-w-[80%] whitespace-pre-line rounded-2xl px-4 py-2.5 text-sm ${
                  m.role === 'user'
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100'
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-900/40">
                <Bot size={16} />
              </div>
              <div className="rounded-2xl bg-slate-100 px-4 py-3 dark:bg-slate-800">
                <span className="flex gap-1">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:0.15s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:0.3s]" />
                </span>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Sugestoes */}
        <div className="flex flex-wrap gap-2 border-t border-slate-100 px-4 py-2 dark:border-slate-800">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              disabled={busy}
              className="chip bg-slate-100 text-slate-600 hover:bg-brand-50 hover:text-brand-600 dark:bg-slate-800 dark:text-slate-300"
            >
              <Zap size={11} /> {s}
            </button>
          ))}
        </div>

        {/* Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}
          className="flex items-center gap-2 border-t border-slate-200 p-3 dark:border-slate-800"
        >
          <Sparkles size={18} className="ml-1 text-brand-500" />
          <input
            className="input border-0 focus:ring-0"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escreva um comando..."
            disabled={busy}
          />
          <button type="submit" className="btn-primary" disabled={busy || !input.trim()}>
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  )
}
