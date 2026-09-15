import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, Clock, Users } from 'lucide-react'
import { useProto, useAcoes } from '../store/contexto'
import { naoLidas } from '../store/reducer'
import { rotuloDeMomento } from '../mock/dados'
import { Folha, Vazio, Chip } from '../parts/base'
import { cx } from '../../lib/utils'

// ---------------------------------------------------------------------------
// CAIXA DE NOTIFICACOES (simulada) — duas origens que NAO se misturam.
//
//   LEMBRETE   vem do tempo: um alerta que eu configurei disparou.
//   ATIVIDADE  vem de gente: alguem aceitou, devolveu, bloqueou, mudou prazo.
//
// E a distincao que o UX1.2 pediu em voz alta:
//
//   HISTORICO != NOTIFICACAO.
//
// Todo evento relevante entra no historico da tarefa. Nem todo evento
// interrompe alguem. "Rubens moveu A fazer → Em andamento" esta na Atividade da
// tarefa e NAO esta aqui — mudanca rotineira de estado nao vale um toque no
// ombro. Aceite, devolucao, bloqueio, prazo e nova atribuicao valem.
//
// Silenciar uma tarefa muda o que INTERROMPE, nunca o que fica registrado.
// ---------------------------------------------------------------------------
const ORIGENS = [
  { chave: 'tudo', label: 'Tudo' },
  { chave: 'lembrete', label: 'Lembretes', icone: Clock },
  { chave: 'atividade', label: 'Atividade', icone: Users },
]

export default function Notificacoes({ aberta, aoFechar }) {
  const { estado } = useProto()
  const acoes = useAcoes()
  const [origem, setOrigem] = useState('tudo')

  const todas = [...(estado.notificacoes || [])].sort((a, b) => b.quando.localeCompare(a.quando))
  const lista = origem === 'tudo' ? todas : todas.filter((n) => n.origem === origem)
  const pendentes = naoLidas(estado).length

  const destino = (n) => {
    if (n.alvo?.tipo === 'tarefa') return `/prototipo/tarefas/${n.alvo.id}`
    if (n.alvo?.tipo === 'agenda') return `/prototipo/agenda?dia=${n.alvo.id}`
    if (n.alvo?.tipo === 'memoria') return `/prototipo/memoria/${n.alvo.id}`
    return null
  }

  return (
    <Folha
      aberta={aberta}
      aoFechar={aoFechar}
      titulo="Notificações"
      subtitulo={pendentes ? `${pendentes} não ${pendentes === 1 ? 'lida' : 'lidas'}` : 'Tudo em dia'}
      largura="max-w-[460px]"
      rodape={
        <button
          type="button"
          onClick={acoes.lerTodasNotificacoes}
          disabled={!pendentes}
          className="press text-[13px] font-semibold text-accent-text disabled:opacity-40"
        >
          Marcar todas como lidas
        </button>
      }
    >
      <div className="mb-2 flex gap-1.5">
        {ORIGENS.map((o) => (
          <Chip key={o.chave} on={origem === o.chave} onClick={() => setOrigem(o.chave)}>
            {o.icone && <o.icone size={12} />} {o.label}
          </Chip>
        ))}
      </div>

      {lista.length === 0 && <Vazio>Nada por aqui.</Vazio>}

      {lista.map((n) => {
        const para = destino(n)
        const corpo = (
          <>
            <span className={cx(
              'mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-[7px]',
              n.origem === 'lembrete' ? 'bg-surface-3 text-secondary' : 'bg-accent-soft text-accent-text',
            )}>
              {n.origem === 'lembrete' ? <Clock size={13} /> : <Users size={13} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className={cx('block text-[13.5px] leading-snug', !n.lida && 'font-semibold')}>
                {n.titulo}
              </span>
              {n.detalhe && <span className="mt-0.5 block text-[12.5px] leading-snug text-secondary">{n.detalhe}</span>}
              <span className="px-motivo mt-0.5 block">
                {n.agendada ? 'programada para ' : ''}{rotuloDeMomento(n.quando, estado.hoje)}
              </span>
            </span>
            {!n.lida && <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-accent" aria-label="não lida" />}
          </>
        )
        const classe = 'px-linha px-toque w-full items-start text-left'
        return para ? (
          <Link key={n.id} to={para} onClick={() => { acoes.lerNotificacao(n.id); aoFechar() }} className={classe}>
            {corpo}
          </Link>
        ) : (
          <button key={n.id} type="button" onClick={() => acoes.lerNotificacao(n.id)} className={classe}>
            {corpo}
          </button>
        )
      })}

      <p className="mt-4 border-t border-hairline pt-3 text-[11.5px] leading-relaxed text-faint">
        <Bell size={11} className="mr-1 inline" />
        Nem todo evento vira notificação. Mudanças rotineiras de estado ficam só
        no histórico da tarefa, em <strong className="font-semibold">Atividade</strong>.
      </p>
    </Folha>
  )
}
