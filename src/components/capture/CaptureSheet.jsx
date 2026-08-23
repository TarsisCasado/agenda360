import { useEffect, useRef, useState } from 'react'
import { Sparkles, CornerDownLeft, Loader2, Check, SlidersHorizontal, Calendar, Tag, Bell } from 'lucide-react'
import Sheet from '../ui/Sheet'
import { useAuth } from '../../context/AuthContext'
import { useWorkspace } from '../../context/WorkspaceContext'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'
import { agentKernel } from '../../agent/kernel'
import { toISODate, addDays, formatShort } from '../../lib/date'

// CAPTURA UNIVERSAL — a entrada principal do Agenda 360. Escreva em linguagem
// natural; o interpretador REAL (agentKernel) entende e devolve uma previa
// simples para confirmar. Sem formulario de selects na frente. Baixa confianca
// -> pergunta so o necessario. "Editar detalhes" abre o editor completo.
function whenLabel(payload) {
  if (!payload?.date) return null
  const today = toISODate(new Date())
  const tomorrow = toISODate(addDays(new Date(), 1))
  const d = payload.date === today ? 'Hoje' : payload.date === tomorrow ? 'Amanhã' : formatShort(payload.date)
  const t = payload.start_time ? ` · ${String(payload.start_time).slice(0, 5)}` : ''
  return d + t
}

export default function CaptureSheet({ open, onClose, onEditDetails }) {
  const { user } = useAuth()
  const { workspaceId } = useWorkspace()
  const { categories, reload } = useData()
  const { toast } = useToast()
  const identity = { workspaceId, userId: user?.id }
  const inputRef = useRef(null)
  const convRef = useRef(null)

  const [text, setText] = useState('')
  const [phase, setPhase] = useState('input') // input | thinking | proposal | clarify | busy
  const [proposal, setProposal] = useState(null)
  const [question, setQuestion] = useState('')

  useEffect(() => {
    if (open) {
      setText(''); setPhase('input'); setProposal(null); setQuestion(''); convRef.current = null
      setTimeout(() => inputRef.current?.focus(), 120)
    }
  }, [open])

  const interpret = async (content) => {
    const t = content.trim()
    if (!t) return
    setPhase('thinking')
    try {
      const res = await agentKernel.assistant.ask({ text: t, identity, categories, conversationId: convRef.current })
      convRef.current = res.conversationId || convRef.current
      if (res.kind === 'proposal') { setProposal(res.proposal); setPhase('proposal') }
      else if (res.kind === 'clarification') { setQuestion(res.message); setText(''); setPhase('clarify') }
      else if (res.kind === 'result') { toast('Busca concluída'); onClose?.() }
      else if (res.kind === 'selection') { setQuestion(res.message); setPhase('clarify') }
      else { setQuestion('Não entendi bem. Pode reescrever com mais detalhes?'); setPhase('clarify') }
    } catch (err) {
      toast('Não consegui interpretar agora: ' + err.message, 'error')
      setPhase('input')
    }
  }

  const confirm = async () => {
    if (!proposal) return
    setPhase('busy')
    try {
      await agentKernel.assistant.confirm({ proposal, identity, conversationId: convRef.current })
      reload()
      toast('Adicionado ✓')
      onClose?.()
    } catch (err) {
      toast('Erro ao salvar: ' + err.message, 'error')
      setPhase('proposal')
    }
  }

  const editDetails = () => {
    const p = proposal?.payload || {}
    onClose?.()
    onEditDetails?.(p)
  }

  const category = categories.find((c) => c.id === proposal?.payload?.category_id)
  const isTask = proposal && proposal.intent !== 'create_link'

  return (
    <Sheet open={open} onClose={onClose} maxWidth="max-w-xl">
      {/* INPUT / CLARIFY */}
      {(phase === 'input' || phase === 'clarify' || phase === 'thinking') && (
        <div>
          <div className="flex items-center gap-2 text-brand-600 dark:text-brand-400">
            <Sparkles size={16} />
            <span className="text-sm font-semibold">Captura</span>
          </div>
          <h2 className="text-display mt-1 !text-[22px]">
            {phase === 'clarify' ? question : 'O que você precisa organizar?'}
          </h2>
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); interpret(text) } }}
            placeholder={phase === 'clarify' ? 'Responda aqui…' : 'Ex: Reunião com Rafael amanhã às 8h'}
            rows={3}
            className="mt-3 w-full resize-none bg-transparent text-[17px] leading-relaxed text-slate-800 placeholder:text-slate-300 focus:outline-none dark:text-slate-100 dark:placeholder:text-slate-600"
          />
          <div className="mt-2 flex items-center justify-between">
            <p className="text-caption">Enter para interpretar · linguagem natural</p>
            <button
              onClick={() => interpret(text)}
              disabled={!text.trim() || phase === 'thinking'}
              className="btn-primary press"
            >
              {phase === 'thinking' ? <Loader2 size={16} className="animate-spin" /> : <CornerDownLeft size={16} />}
              Interpretar
            </button>
          </div>
        </div>
      )}

      {/* PROPOSAL — previa simples */}
      {(phase === 'proposal' || phase === 'busy') && proposal && (
        <div>
          <div className="flex items-center gap-2 text-brand-600 dark:text-brand-400">
            <Sparkles size={16} /> <span className="text-sm font-semibold">Entendi</span>
          </div>
          <div className="surface-outline mt-3 p-4">
            <p className="text-[17px] font-bold text-slate-800 dark:text-slate-100">
              {proposal.payload?.title || proposal.payload?.url || 'Nova captura'}
            </p>
            <div className="mt-2 space-y-1.5 text-sm text-slate-500 dark:text-slate-400">
              {whenLabel(proposal.payload) && (
                <p className="flex items-center gap-2"><Calendar size={14} /> {whenLabel(proposal.payload)}</p>
              )}
              {category && (
                <p className="flex items-center gap-2">
                  <Tag size={14} /> <span className="h-2 w-2 rounded-full" style={{ backgroundColor: category.color }} /> {category.name}
                </p>
              )}
              {proposal.payload?.alert_minutes_before != null && (
                <p className="flex items-center gap-2"><Bell size={14} /> lembrete {proposal.payload.alert_minutes_before} min antes</p>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <button onClick={confirm} disabled={phase === 'busy'} className="btn-primary press w-full py-3 text-base">
              {phase === 'busy' ? <Loader2 size={16} className="animate-spin" /> : <Check size={18} />} Confirmar
            </button>
            <div className="flex gap-2">
              {isTask && (
                <button onClick={editDetails} disabled={phase === 'busy'} className="btn-secondary press flex-1">
                  <SlidersHorizontal size={15} /> Editar detalhes
                </button>
              )}
              <button onClick={() => { setPhase('input'); setProposal(null); setText('') }} disabled={phase === 'busy'} className="btn-ghost press flex-1">
                Recomeçar
              </button>
            </div>
          </div>
        </div>
      )}
    </Sheet>
  )
}
