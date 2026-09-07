import { useEffect, useRef, useState } from 'react'
import {
  Sparkles,
  Loader2,
  Check,
  SlidersHorizontal,
  Calendar,
  Tag,
  Bell,
  ArrowUp,
  Inbox,
  RotateCcw,
} from 'lucide-react'
import Sheet from '../ui/Sheet'
import { useAuth } from '../../context/AuthContext'
import { useWorkspace } from '../../context/WorkspaceContext'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'
import { agentKernel } from '../../agent/kernel'
import { inboxService } from '../../services/inboxService'
import { toISODate, addDays, formatShort } from '../../lib/date'
import { tipoDaProposta, destinoDaProposta } from '../../lib/capture'
import { guardarCaptura, capturaPendente, limparCaptura } from '../../lib/captureVault'

// ---------------------------------------------------------------------------
// CAPTURA UNIVERSAL — uma conversa, nao um formulario.
//
// Esta e a UNICA superficie de entrada do produto: o `+` do mobile e o
// "Nova atividade" do desktop abrem exatamente isto. Antes eram duas portas
// para dois lugares diferentes (uma conversa e um formulario completo), e o
// usuario tinha que aprender duas gramaticas para dizer a mesma coisa.
//
// Fluxo visual: voce escreve -> o que voce disse fica na tela como uma fala ->
// o assistente responde com o que entendeu -> voce confirma. Quando falta um
// dado, a pergunta aparece como fala dele e o campo continua ali, no mesmo
// lugar: nada de trocar de tela ou reabrir formulario.
//
// A interpretacao e o multi-turno vem do agente local (CP2). A IA NAO escreve
// sozinha: nada entra no sistema sem a confirmacao humana.
//
// A REGRA MAIS IMPORTANTE — NUNCA PERDER UMA CAPTURA. O texto vai para o cofre
// local (lib/captureVault) no instante em que a interpretacao comeca, e sai de
// la so quando virou artefato ou quando o usuario descartou. Se a
// interpretacao falhar, o texto volta para o campo E fica oferecido para a
// Caixa. Fechar a folha no meio nao apaga nada: ao reabrir, ele volta.
//
// Os estados (A vazio ... K recuperado) estao nomeados em lib/capture.js.
// ---------------------------------------------------------------------------
function whenLabel(payload) {
  // Sem data e uma informacao, nao a ausencia dela: quem confirma precisa ver
  // que a atividade vai para a lista de tarefas a fazer (mesma decisao do
  // cartao do Copiloto, no CP4.1).
  if (!payload?.date) return 'Sem data'
  const today = toISODate(new Date())
  const tomorrow = toISODate(addDays(new Date(), 1))
  const d =
    payload.date === today ? 'Hoje' : payload.date === tomorrow ? 'Amanhã' : formatShort(payload.date)
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
  const [phase, setPhase] = useState('input') // input | thinking | proposal | busy
  const [proposal, setProposal] = useState(null)
  const [turns, setTurns] = useState([]) // [{ role:'user'|'agent', text }]
  // Estado J — a captura nao virou artefato. Guarda o texto exato para a Caixa.
  const [falha, setFalha] = useState(null)
  // Estado K — o texto voltou do cofre ao reabrir a folha.
  const [recuperada, setRecuperada] = useState(false)
  const endRef = useRef(null)

  // A folha cresce com a conversa ate o teto; passando disso o scroll e
  // interno — entao a ultima fala precisa ser trazida a vista.
  useEffect(() => {
    if (!open || turns.length === 0) return
    const id = setTimeout(() => endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }), 80)
    return () => clearTimeout(id)
  }, [open, turns, phase])

  useEffect(() => {
    if (open) {
      // Estado K: se ficou uma captura sem destino, ela volta para o campo. O
      // usuario nao precisa lembrar que escreveu — o produto lembra.
      const pendente = capturaPendente({ workspaceId })
      setText(pendente?.texto || '')
      setRecuperada(Boolean(pendente))
      setPhase('input')
      setProposal(null)
      setTurns([])
      setFalha(null)
      convRef.current = null
      setTimeout(() => inputRef.current?.focus(), 140)
    }
  }, [open, workspaceId])

  const interpret = async (content) => {
    const t = content.trim()
    if (!t) return
    // O TEXTO PRIMEIRO. Antes de qualquer chamada que possa falhar, a captura
    // ja esta persistida: dai em diante nenhuma falha a apaga.
    guardarCaptura(t, { workspaceId })
    setTurns((prev) => [...prev, { role: 'user', text: t }])
    setText('')
    setFalha(null)
    setRecuperada(false)
    setPhase('thinking')
    try {
      const res = await agentKernel.assistant.ask({
        text: t,
        identity,
        categories,
        conversationId: convRef.current,
      })
      convRef.current = res.conversationId || convRef.current
      if (res.kind === 'proposal') {
        // Pode ser a primeira proposta OU o rascunho revisado por texto
        // ("muda para sexta"): nos dois casos o cartao e substituido.
        if (res.revised) setTurns((prev) => [...prev, { role: 'agent', text: res.message }])
        setProposal(res.proposal)
        setPhase('proposal')
      } else if (res.kind === 'confirmed') {
        // Confirmacao POR TEXTO, sem tocar no botao.
        limparCaptura()
        reload()
        toast(destinoDaProposta(proposal) || 'Adicionado ✓')
        onClose?.()
      } else if (res.kind === 'answer') {
        // CP5.1.1 — o agente respondeu sobre o rascunho. Nada muda no cartao.
        setTurns((prev) => [...prev, { role: 'agent', text: res.message }])
        if (res.proposal) { setProposal(res.proposal); setPhase('proposal') }
        else { setPhase('input'); setTimeout(() => inputRef.current?.focus(), 60) }
      } else if (res.kind === 'cancelled') {
        limparCaptura()
        setProposal(null)
        setTurns((prev) => [...prev, { role: 'agent', text: res.message || 'Tudo bem, descartei.' }])
        setPhase('input')
        setTimeout(() => inputRef.current?.focus(), 60)
      } else if (res.kind === 'clarification' || res.kind === 'selection') {
        setTurns((prev) => [...prev, { role: 'agent', text: res.message }])
        // Uma pergunta pode chegar com o rascunho ainda vivo: se veio proposta
        // junto, o cartao continua; senao, volta a escrita.
        if (res.proposal) { setProposal(res.proposal); setPhase('proposal') }
        else {
          // SEM RASCUNHO NENHUM (nem intencao, nem slot aberto) o sistema nao
          // entendeu coisa alguma: nao ha pergunta a responder, ha um texto sem
          // destino. Ai vale o estado J — o texto volta ao campo, para ser
          // reescrito, e a Caixa fica oferecida para quem nao quer reescrever
          // agora. Quando HA um slot aberto ("para quando e o dentista?"), a
          // conversa segue: oferecer a Caixa ali seria empurrar para a Caixa
          // algo que esta a uma palavra de virar atividade.
          const semRascunho = res.kind === 'clarification' && !res.slot && !res.intent
          if (semRascunho) { setText(t); setFalha({ texto: t }) }
          setPhase('input')
          setTimeout(() => inputRef.current?.focus(), 60)
        }
      } else if (res.kind === 'result') {
        limparCaptura()
        toast('Busca concluída')
        onClose?.()
      } else {
        // Nao entendeu. Isso NAO e perder: o texto volta ao campo e a Caixa
        // fica oferecida.
        naoInterpretou(t, 'Não entendi essa. Pode reescrever — ou guardar na Caixa como está.')
      }
    } catch {
      // Provider fora, rede fora, erro inesperado: mesma saida. O usuario nao
      // precisa saber de que camada veio a falha, precisa do texto de volta.
      naoInterpretou(t, 'Não consegui interpretar agora. Seu texto está aqui — guarde na Caixa se preferir.')
    }
  }

  // Estado J — devolve a captura ao campo e abre a saida para a Caixa.
  const naoInterpretou = (t, mensagem) => {
    setTurns((prev) => [...prev, { role: 'agent', text: mensagem }])
    setText(t)
    setFalha({ texto: t })
    setPhase('input')
    setTimeout(() => inputRef.current?.focus(), 60)
  }

  const guardarNaCaixa = async () => {
    const t = (falha?.texto || text).trim()
    if (!t) return
    setPhase('busy')
    try {
      await inboxService.create(workspaceId, user?.id, {
        type: 'note',
        title: t.slice(0, 120),
        content: t,
        origin: 'manual',
      })
      limparCaptura()
      reload()
      toast('Guardado na Caixa.')
      onClose?.()
    } catch (err) {
      // Nem para a Caixa foi: o cofre continua com o texto e o campo tambem.
      toast('Não consegui guardar agora: ' + err.message, 'error')
      setPhase('input')
    }
  }

  const confirm = async () => {
    if (!proposal) return
    const destino = destinoDaProposta(proposal)
    setPhase('busy')
    try {
      await agentKernel.assistant.confirm({ proposal, identity, conversationId: convRef.current })
      limparCaptura()
      reload()
      toast(destino || 'Adicionado ✓')
      onClose?.()
    } catch (err) {
      toast('Erro ao salvar: ' + err.message, 'error')
      setPhase('proposal')
    }
  }

  const editDetails = () => {
    const p = proposal?.payload || {}
    // Ajustar no formulario e um destino legitimo da captura: o cofre pode sair
    // daqui, porque o texto ja virou um rascunho editavel na outra tela.
    limparCaptura()
    onClose?.()
    onEditDetails?.(p)
  }

  const recomecar = () => {
    // Descarte EXPLICITO: e a unica coisa, junto do artefato, que tira a
    // captura do cofre.
    limparCaptura()
    setPhase('input')
    setProposal(null)
    setText('')
    setTurns([])
    setFalha(null)
    setRecuperada(false)
    setTimeout(() => inputRef.current?.focus(), 60)
  }

  const category = categories.find((c) => c.id === proposal?.payload?.category_id)
  const tipo = tipoDaProposta(proposal)
  const isTask = proposal && proposal.intent !== 'create_link'
  const writing = phase === 'input' || phase === 'thinking'
  // CP5.1 — com a proposta na tela o rascunho continua VIVO: o usuario pode
  // ajusta-lo por texto ("muda para sexta"), confirmar ("pode salvar") ou
  // descartar ("cancela isso"). Sem um campo aqui, nada disso seria alcancavel
  // na folha — so na pagina do Copiloto.
  const canTalk = writing || phase === 'proposal'

  return (
    <Sheet open={open} onClose={onClose} maxWidth="max-w-2xl">
      <div className="pb-1">
        {/* Conversa ate aqui */}
        {turns.length > 0 && (
          <div className="mb-4 space-y-2.5">
            {turns.map((turn, i) => (
              <div
                key={i}
                className={turn.role === 'user' ? 'flex justify-end' : 'flex items-start gap-2'}
              >
                {turn.role === 'agent' && (
                  <Sparkles size={15} className="mt-1 shrink-0 text-accent" />
                )}
                <p
                  className={
                    turn.role === 'user'
                      ? 'msg-in max-w-[85%] rounded-[16px] rounded-br-[6px] bg-surface-2 px-3.5 py-2 text-[15px] text-primary'
                      : 'msg-in max-w-[85%] text-[15px] leading-relaxed text-secondary'
                  }
                >
                  {turn.text}
                </p>
              </div>
            ))}
            {phase === 'thinking' && (
              <div className="flex items-center gap-2 pl-[22px]">
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted" />
                <span
                  className="typing-dot h-1.5 w-1.5 rounded-full bg-muted"
                  style={{ animationDelay: '0.2s' }}
                />
                <span
                  className="typing-dot h-1.5 w-1.5 rounded-full bg-muted"
                  style={{ animationDelay: '0.4s' }}
                />
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}

        {/* ------------------------------------------------------------------
            A PROPOSTA — um OBJETO a ponto de entrar no sistema, nao um
            paragrafo. Hierarquia: TIPO / TITULO / DATA-HORA / ALERTA /
            CONTEXTO / ACAO. O contorno existe para que se leia como coisa: e
            ele que diz "isto vai virar um registro se voce confirmar".
            ------------------------------------------------------------------ */}
        {(phase === 'proposal' || (phase === 'busy' && proposal)) && proposal && (
          <div
            data-testid="captura-proposta"
            className="animate-in rounded-row border hair bg-surface-2/60 p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <span
                data-testid="captura-tipo"
                className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-accent"
              >
                {tipo?.label}
              </span>
              <span className="text-caption">ainda não foi salvo</span>
            </div>

            <p className="mt-2.5 text-[19px] font-semibold leading-snug tracking-[-0.01em] text-primary">
              {proposal.payload?.title || proposal.payload?.url || 'Nova captura'}
            </p>

            <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
              <span className="text-secondary-sm flex items-center gap-1.5">
                <Calendar size={14} className="text-muted" /> {whenLabel(proposal.payload)}
              </span>
              {proposal.payload?.alert_minutes_before != null && (
                <span className="text-secondary-sm flex items-center gap-1.5">
                  <Bell size={14} className="text-muted" /> {proposal.payload.alert_minutes_before} min antes
                </span>
              )}
              {category && (
                <span className="text-secondary-sm flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: category.color }}
                  />
                  {category.name}
                </span>
              )}
              {proposal.payload?.notes && (
                <span className="text-secondary-sm flex items-center gap-1.5">
                  <Tag size={14} className="text-muted" /> {proposal.payload.notes}
                </span>
              )}
            </div>

            <div className="mt-4 flex flex-col gap-2">
              <button
                onClick={confirm}
                disabled={phase === 'busy'}
                className="btn-primary press w-full !min-h-[46px] text-[15px]"
              >
                {phase === 'busy' ? (
                  <Loader2 size={17} className="animate-spin" />
                ) : (
                  <Check size={18} />
                )}
                Confirmar
              </button>
              <div className="flex gap-2">
                {isTask && (
                  <button
                    onClick={editDetails}
                    disabled={phase === 'busy'}
                    className="btn-ghost press flex-1"
                  >
                    <SlidersHorizontal size={15} /> Ajustar
                  </button>
                )}
                <button
                  onClick={recomecar}
                  disabled={phase === 'busy'}
                  className="btn-ghost press flex-1"
                >
                  Descartar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Escrita — sempre disponivel enquanto houver conversa aberta */}
        {canTalk && (
          <div className={phase === 'proposal' ? 'mt-5 border-t hair pt-3' : undefined}>
            {turns.length === 0 && (
              <>
                <div className="flex items-center gap-2 text-accent">
                  <Sparkles size={15} />
                  <span className="text-[12px] font-semibold uppercase tracking-[0.06em]">
                    Captura
                  </span>
                </div>
                <h2 className="text-page mt-1.5">O que você precisa organizar?</h2>
              </>
            )}
            {/* Estado K — dito com clareza, sem susto: o campo nao veio
                preenchido por magica. */}
            {recuperada && (
              <p
                data-testid="captura-recuperada"
                className="text-caption mt-2 flex items-center gap-1.5"
              >
                <RotateCcw size={13} className="text-muted" />
                Isto ficou de uma captura anterior. Continue ou apague.
              </p>
            )}
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  interpret(text)
                }
              }}
              placeholder={
                phase === 'proposal'
                  ? 'Ajuste por aqui: "muda para sexta", "sem horário"…'
                  : turns.length
                    ? 'Responda aqui…'
                    : 'Ex: Reunião com gerentes amanhã às 8:30'
              }
              rows={phase === 'proposal' ? 1 : turns.length ? 2 : 3}
              className="field mt-3 w-full resize-none text-[17px] leading-relaxed"
            />
            <div className="mt-1 flex items-center justify-between gap-3">
              <p className="text-caption">
                {phase === 'proposal' ? 'Ou confirme acima.' : 'Escreva do seu jeito — organizo depois.'}
              </p>
              <button
                onClick={() => interpret(text)}
                disabled={!text.trim() || phase === 'thinking'}
                aria-label="Interpretar"
                className="press flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-opacity disabled:opacity-30"
              >
                {phase === 'thinking' ? (
                  <Loader2 size={17} className="animate-spin" />
                ) : (
                  <ArrowUp size={19} strokeWidth={2.5} />
                )}
              </button>
            </div>

            {/* Estado J — a saida que garante que nada se perde. So aparece
                quando ha uma captura sem destino: nunca como botao decorativo. */}
            {falha && (
              <button
                data-testid="captura-para-caixa"
                onClick={guardarNaCaixa}
                disabled={phase === 'busy'}
                className="btn-ghost press mt-2 w-full"
              >
                <Inbox size={15} /> Guardar na Caixa como está
              </button>
            )}
          </div>
        )}
      </div>
    </Sheet>
  )
}
