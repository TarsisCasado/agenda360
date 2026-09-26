import { Link, useNavigate } from 'react-router-dom'
import { CalendarClock, CornerDownLeft, Ban, Inbox, AlertTriangle, Scissors } from 'lucide-react'
import { useProto, useAcoes } from '../store/contexto'
import { atrasadas, porOrganizar, conflitosDaSemana, delegadasPorMim } from '../store/reducer'
import { inicioDaSemana, somarDias, iso, nomeDoDia, rotuloDeData, ESTADO, RESPONSABILIDADE } from '../mock/dados'
import { Secao, Vazio } from '../parts/base'

// ---------------------------------------------------------------------------
// REVISAO — a pergunta e "O QUE MERECE ATENCAO, E O QUE EU POSSO AJUSTAR?".
//
// Relatorios responde "o que aconteceu" e pode ser quantitativo. Aqui nao: um
// segundo painel de metricas seria a mesma tela duas vezes. Esta olha para
// SITUACOES — coisas concretas da semana que estao pedindo uma decisao.
//
// A forma e sempre a mesma, e ela e a promessa desta tela:
//
//   EVIDENCIA          o que foi observado, sem adjetivo;
//   INTERPRETACAO      o que aquilo PODE significar — prudente, no condicional;
//   DECISAO            as saidas, cada uma a um clique.
//
// Nenhum julgamento e nenhuma psicologia: nada de "voce procrastinou", "voce
// falhou", "parece que voce esta sobrecarregado". Um numero e um numero; o que
// ele quer dizer, quem sabe e quem viveu a semana.
// ---------------------------------------------------------------------------
export default function Revisao() {
  const { estado } = useProto()
  const acoes = useAcoes()
  const navegar = useNavigate()

  const seg = inicioDaSemana(new Date(`${estado.hoje}T12:00:00`))
  const dias = Array.from({ length: 7 }, (_, i) => iso(somarDias(seg, i)))
  const amanha = iso(somarDias(new Date(`${estado.hoje}T12:00:00`), 1))

  const vencidas = atrasadas(estado)
  const soltas = porOrganizar(estado)
  const conflitos = conflitosDaSemana(estado, dias)
  const devolvidas = estado.tarefas.filter((t) => t.responsabilidade === RESPONSABILIDADE.DEVOLVIDA)
  const bloqueadas = estado.tarefas.filter((t) => t.bloqueio && t.estado !== ESTADO.FEITO)
  const semAceite = delegadasPorMim(estado).filter((t) => t.responsabilidade === RESPONSABILIDADE.AGUARDANDO)
  const reagendadas = estado.tarefas.filter((t) => (t.reagendamentos || 0) >= 3 && t.estado !== ESTADO.FEITO)
  const grandesSemPasso = estado.tarefas.filter(
    (t) => t.grande && (t.subtarefas || []).filter((s) => !s.feito).length === 0 && t.estado !== ESTADO.FEITO,
  )
  // "Capturas antigas": guardadas há mais de uma semana e ainda cruas. Uma
  // captura de ontem não é um problema — é uma captura de ontem.
  const antigas = soltas.filter((m) => m.criadoEm < iso(somarDias(new Date(`${estado.hoje}T12:00:00`), -7)))

  const situacoes = []

  for (const t of reagendadas) {
    situacoes.push({
      chave: `re-${t.id}`,
      icone: CalendarClock,
      evidencia: `“${t.titulo}” mudou de dia ${t.reagendamentos} vezes e o prazo venceu ${rotuloDeData(t.prazo, estado.hoje)}.`,
      interpretacao: 'Pode ser maior do que parece, ou depender de alguém que ainda não respondeu.',
      acoes: [
        { rotulo: 'Abrir tarefa', fazer: () => navegar(`/prototipo/tarefas/${t.id}`) },
        { rotulo: 'Quebrar em etapas', fazer: () => navegar(`/prototipo/copiloto?contexto=tarefa&id=${t.id}`) },
        { rotulo: 'Fazer amanhã', fazer: () => acoes.reagendar(t.id, amanha) },
      ],
    })
  }

  for (const t of devolvidas) {
    situacoes.push({
      chave: `dev-${t.id}`,
      icone: CornerDownLeft,
      evidencia: `“${t.titulo}” voltou para você${t.motivoDevolucao ? `: “${t.motivoDevolucao}”` : '.'}`,
      interpretacao: 'Enquanto não houver uma decisão sua, ela não anda com ninguém.',
      acoes: [
        { rotulo: 'Abrir tarefa', fazer: () => navegar(`/prototipo/tarefas/${t.id}`) },
        { rotulo: 'Fazer hoje', fazer: () => acoes.escolherParaHoje(t.id, true) },
      ],
    })
  }

  for (const t of bloqueadas) {
    situacoes.push({
      chave: `blo-${t.id}`,
      icone: Ban,
      evidencia: `“${t.titulo}” está bloqueada — ${t.bloqueio}.`,
      interpretacao: 'O bloqueio está registrado, mas não há nada agendado para destravá-lo.',
      acoes: [
        { rotulo: 'Abrir tarefa', fazer: () => navegar(`/prototipo/tarefas/${t.id}`) },
        { rotulo: 'Reservar tempo amanhã', fazer: () => acoes.reservarHorario(t.id, amanha, '09:00', '09:30') },
      ],
    })
  }

  for (const { data, par } of conflitos) {
    situacoes.push({
      chave: `con-${data}-${par[0].id}`,
      icone: AlertTriangle,
      evidencia: `Na ${nomeDoDia(data)}, “${par[0].titulo}” e “${par[1].titulo}” se sobrepõem entre ${par[1].inicio} e ${par[0].fim}.`,
      interpretacao: 'Um dos dois vai começar atrasado, ou alguém vai sair no meio.',
      acoes: [{ rotulo: 'Ver agenda do dia', fazer: () => navegar(`/prototipo/agenda?dia=${data}`) }],
    })
  }

  for (const t of semAceite) {
    situacoes.push({
      chave: `ace-${t.id}`,
      icone: CalendarClock,
      evidencia: `“${t.titulo}” está com ${estado.pessoas.find((p) => p.id === t.responsavelId)?.nome} e ainda não foi aceita.`,
      interpretacao: 'Pode ser só falta de tempo de olhar — ou a pessoa não soube que recebeu.',
      acoes: [{ rotulo: 'Abrir tarefa', fazer: () => navegar(`/prototipo/tarefas/${t.id}`) }],
    })
  }

  for (const t of grandesSemPasso) {
    situacoes.push({
      chave: `gra-${t.id}`,
      icone: Scissors,
      evidencia: `“${t.titulo}” é grande e não tem um próximo passo definido.`,
      interpretacao: 'Tarefas assim costumam esperar um bloco de tempo que nunca aparece.',
      acoes: [
        { rotulo: 'Quebrar em etapas', fazer: () => navegar(`/prototipo/tarefas/${t.id}`) },
      ],
    })
  }

  if (antigas.length > 0) {
    situacoes.push({
      chave: 'cap',
      icone: Inbox,
      evidencia: `${antigas.length} ${antigas.length === 1 ? 'captura está guardada' : 'capturas estão guardadas'} há mais de uma semana sem organização.`,
      interpretacao: 'A entrada está funcionando; a saída, nem tanto.',
      acoes: [{ rotulo: 'Organizar agora', fazer: () => navegar('/prototipo/memoria?filtro=por-organizar') }],
    })
  }

  return (
    <div className="px-entra">
      <header>
        <h1 className="px-titulo-tela">Revisão</h1>
        <p className="mt-1 text-[13px] text-muted">O que merece atenção — e o que dá para ajustar agora</p>
        <p className="mt-2 text-[13.5px] text-muted">
          {vencidas.length} com prazo vencido · {soltas.length} por organizar ·{' '}
          {conflitos.length} {conflitos.length === 1 ? 'conflito' : 'conflitos'} nesta semana
        </p>
      </header>

      <Secao>
        {situacoes.length === 0 && <Vazio>Nada pedindo decisão agora.</Vazio>}
        {situacoes.map((s) => (
          <article key={s.chave} className="border-t border-hairline py-4 first:border-t-0 first:pt-2">
            <div className="flex items-start gap-2.5">
              <s.icone size={16} className="mt-0.5 flex-none text-warning" />
              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] font-medium leading-snug">{s.evidencia}</p>
                <p className="mt-1 text-[13.5px] leading-relaxed text-secondary">{s.interpretacao}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {s.acoes.map((a) => (
                    <button key={a.rotulo} type="button" onClick={a.fazer} className="px-chip press">
                      {a.rotulo}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </article>
        ))}
      </Secao>

      <p className="mt-8 text-[12.5px] leading-relaxed text-faint">
        Evidência, interpretação prudente e decisão sua. Esta tela não conclui,
        não reagenda e não delega nada sozinha — e não tenta adivinhar como você
        está se sentindo.{' '}
        <Link to="/prototipo/relatorios" className="text-accent-text hover:underline">
          Para os números do período, veja Relatórios.
        </Link>
      </p>
    </div>
  )
}
