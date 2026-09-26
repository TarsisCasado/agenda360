import { useLayoutEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Search, MoreHorizontal, ChevronRight, ArrowRight, Check,
  CornerDownLeft, Ban, Clock3, Bell, CalendarClock,
} from 'lucide-react'
import { useProto, useAcoes } from '../store/contexto'
import { porOrganizar } from '../store/reducer'
import {
  destaqueDoMomento, filaDeHoje, decisaoPrincipal, sugestaoDaJanela, restoDoDia,
} from '../store/hojeM1'
import {
  ESTADO, RESPONSABILIDADE, AGORA_DEMO, saudacao,
  nomeDoDia, numeroDoDia, mesCurto, rotuloDeData,
} from '../mock/dados'
import { alertaCurto } from '../mock/alerta'
import DetalheMovel from '../parts/detalheMovel'
import { cx } from '../../lib/utils'

// ---------------------------------------------------------------------------
// HOJE NO TELEFONE — PILOTO DA NOVA LINGUAGEM (UX-M1).
//
// Esta tela NAO e o Hoje anterior com menos padding. Ela foi recomposta do
// zero, e o que ela deixou de fazer importa tanto quanto o que faz.
//
// -------------------- O QUE ESTAVA ERRADO ----------------------------------
//
// A composicao antiga era um DOCUMENTO VERTICAL: barra de marca -> cabecalho
// -> card do proximo -> "MEU DIA" -> "PRECISA DE VOCE" -> sanfona de
// prioridades -> "Por organizar". Cada bloco era uma secao de um relatorio, e
// a reuniao das 09:00 aparecia DUAS VEZES — no card de destaque e de novo como
// primeira linha de Meu dia. Encolher espaçamento nao conserta isso: o problema
// e a tela ser uma pilha de modulos, nao uma home.
//
// -------------------- O QUE ESTA TELA FAZ ----------------------------------
//
// UMA pergunta: "o que merece minha atencao agora?". A resposta cabe no
// primeiro viewport e tem exatamente quatro movimentos:
//
//   CONTEXTO      data + saudacao, numa hierarquia so (sem barra de marca);
//   AGORA         UM objeto. Hierarquia por tipografia: a hora e o maior
//                 elemento da tela e nao ha caixa nenhuma em volta;
//   PARA VOCE FAZER   tres tarefas executaveis. Circulo junto do objeto;
//   PRECISA DE VOCE   UMA situacao. O resto vira uma linha discreta.
//
// A AGENDA INTEIRA SAIU do primeiro viewport. Ela e o conteudo da Agenda, nao
// da home: aqui fica o que vem A SEGUIR, e o resto do dia desce para depois da
// dobra, onde responde "e depois?" sem disputar a abertura.
//
// CARD E EXCECAO (e neste piloto nao ha nenhum). Os grupos se separam por
// RITMO — 28px entre secoes, 0 entre linhas irmas — e por rotulo pequeno. O
// que antes era borda virou espaco.
//
// A IA NAO TEM SECAO. Ela aparece colada na tarefa que a sugestao propoe, em
// uma frase, e so quando ha janela real. Se nao couber, nao aparece: este
// piloto quer validar a HOME.
// ---------------------------------------------------------------------------

export default function HojeMovel({ aoBuscar, aoMenu }) {
  const { estado } = useProto()
  const acoes = useAcoes()
  const navegar = useNavigate()
  const [aberta, setAberta] = useState(null)
  const [verDecisoes, setVerDecisoes] = useState(false)
  const [sugestaoViva, setSugestaoViva] = useState(true)
  const rolagem = useRef(null)

  const agora = AGORA_DEMO

  // As REGRAS moram em `store/hojeM1` — fora da interface, onde podem ser
  // testadas. Esta tela so as desenha.
  const { item: destaque, emCurso, faltam } = destaqueDoMomento(estado, agora)
  const fila = filaDeHoje(estado)
  const tarefas = fila.visiveis
  const sobram = fila.sobram
  const { primeira, outras } = decisaoPrincipal(estado)
  const proposta = sugestaoViva ? sugestaoDaJanela(estado, { item: destaque, faltam }, fila) : null
  const resto = restoDoDia(estado, destaque, tarefas)

  const compromisso = destaque && destaque.especie === 'compromisso'
    ? estado.compromissos.find((c) => c.id === destaque.id)
    : null
  const soltas = porOrganizar(estado)
  const feitasHoje = estado.tarefas.filter(
    (t) => t.estado === ESTADO.FEITO && t.planejadaPara === estado.hoje,
  )

  const sugestao = proposta
    ? {
        alvo: proposta.candidato.id,
        frase: `Há ${proposta.minutos} min livres antes da reunião.`,
        pergunta: `Reservar para “${proposta.candidato.titulo}”?`,
        aceitar: () => {
          acoes.reservarHorario(proposta.candidato.id, estado.hoje, agora, proposta.ate)
          setSugestaoViva(false)
        },
        dispensar: () => setSugestaoViva(false),
      }
    : null

  // -------------------------------------------------------------------------
  // VOLTAR AO MESMO LUGAR.
  //
  // Enquanto o detalhe esta aberto a raiz fica com `overflow:hidden`, para o
  // fundo nao rolar por baixo da folha. Medido no navegador: isso NAO zera a
  // rolagem — a posicao sobrevive sozinha, e o caso comum ja volta certo.
  //
  // A reposicao abaixo e garantia, nao conserto: se o conteudo mudar de altura
  // enquanto o detalhe esta aberto (uma tarefa concluida por ali reduz a
  // lista), o navegador recorta a rolagem para o novo limite e a pessoa volta
  // num lugar que nao e o dela. `useLayoutEffect` repoe antes da pintura, e o
  // quadro seguinte cobre o caso em que a altura so se acomoda depois.
  // -------------------------------------------------------------------------
  useLayoutEffect(() => {
    if (aberta || rolagem.current === null) return
    const y = rolagem.current
    rolagem.current = null
    if (Math.abs(window.scrollY - y) < 2) return
    window.scrollTo(0, y)
    requestAnimationFrame(() => window.scrollTo(0, y))
  }, [aberta])

  const abrir = (t) => {
    rolagem.current = window.scrollY
    setAberta(t)
  }
  const voltar = () => setAberta(null)

  const concluir = (id) => acoes.mudarEstado(id, ESTADO.FEITO)

  return (
    <div className="px-entra -mt-1" data-testid="m1-hoje">
      {/* ------------------------------------------------------------------
          TOPO — UMA hierarquia.
          A barra de marca saiu: ela ocupava 44px em toda tela para dizer o
          nome do aplicativo, que e a unica coisa que ninguem precisa ser
          lembrado ali dentro. O que sobrou e o que muda: a data, quem esta
          falando e duas utilidades.
          ------------------------------------------------------------------ */}
      <header className="pt-safe">
        <div className="flex items-center gap-2 pt-1">
          <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-muted">
            <span className="capitalize">{nomeDoDia(estado.hoje)}</span>, {numeroDoDia(estado.hoje)} de {mesCurto(estado.hoje)}
          </p>
          <button
            type="button"
            onClick={aoBuscar}
            aria-label="Buscar"
            className="press -mr-1 grid h-9 w-9 place-items-center rounded-full text-secondary"
          >
            <Search size={19} />
          </button>
          <button
            type="button"
            onClick={aoMenu}
            aria-label="Mais"
            className="press -mr-2 grid h-9 w-9 place-items-center rounded-full text-secondary"
          >
            <MoreHorizontal size={19} />
          </button>
        </div>
        <h1 className="mt-0.5 text-[26px] font-bold leading-[1.1] tracking-[-0.025em]">
          {saudacao(agora)}, {estado.pessoa}
        </h1>
      </header>

      {/* ------------------------------------------------------------------
          AGORA — um objeto, sem caixa.
          ------------------------------------------------------------------ */}
      {destaque && (
        <section className="mt-6" data-testid="m1-agora">
          <p className="px-secao">{emCurso ? 'Agora' : 'A seguir'}</p>
          <button
            type="button"
            data-testid="m1-agora-abrir"
            onClick={() => navegar(destaque.especie === 'reserva'
              ? `/prototipo/tarefas/${destaque.tarefaId}`
              : '/prototipo/agenda')}
            className="press mt-1 flex w-full items-start gap-3 text-left"
          >
            <span className="min-w-0 flex-1">
              <span className="px-hora block text-[34px] font-bold leading-none tracking-[-0.03em]">
                {destaque.inicio}
              </span>
              <span className="mt-1.5 block text-[19px] font-semibold leading-snug tracking-[-0.015em]">
                {destaque.titulo}
              </span>
              <span className="px-motivo mt-1 block">
                {[
                  destaque.local,
                  emCurso ? 'acontecendo agora' : faltam <= 90 ? `em ${faltam} min` : `até ${destaque.fim}`,
                ].filter(Boolean).join(' · ')}
              </span>
            </span>
            <ArrowRight size={18} className="mt-2 flex-none text-muted" />
          </button>

          {/* Contexto relacionado, discreto — nunca um segundo bloco. */}
          {compromisso?.notas && (
            <Link
              to="/prototipo/agenda"
              className="press mt-2 inline-flex items-center gap-0.5 text-[13px] font-semibold text-accent-text"
            >
              Ver pauta <ChevronRight size={13} />
            </Link>
          )}
        </section>
      )}

      {/* ------------------------------------------------------------------
          PARA VOCE FAZER — tres, executaveis.
          ------------------------------------------------------------------ */}
      {tarefas.length > 0 && (
        <section className="mt-7" data-testid="m1-fazer">
          <div className="flex items-baseline justify-between gap-3">
            <p className="px-secao">Para você fazer</p>
            <Link to="/prototipo/tarefas" className="press text-[13px] font-semibold text-accent-text">
              Ver todas
            </Link>
          </div>
          <div className="mt-1">
            {tarefas.map((t) => (
              <div key={t.id}>
                <LinhaTarefa
                  t={t}
                  hoje={estado.hoje}
                  vencida={fila.ehVencida(t)}
                  aoConcluir={() => concluir(t.id)}
                  aoAbrir={() => abrir(t)}
                />
                {sugestao?.alvo === t.id && (
                  <div className="px-entra pb-2.5 pl-[34px]">
                    <p className="text-[13.5px] leading-snug text-secondary">
                      {sugestao.frase} <span className="text-primary">{sugestao.pergunta}</span>
                    </p>
                    <div className="mt-1 flex items-center gap-4">
                      <button type="button" onClick={sugestao.aceitar} className="press text-[13px] font-semibold text-accent-text">
                        Reservar
                      </button>
                      <button type="button" onClick={sugestao.dispensar} className="press text-[13px] text-muted">
                        Agora não
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          {sobram > 0 && (
            <Link
              to="/prototipo/tarefas"
              className="press mt-1.5 inline-block text-[13px] text-muted"
            >
              + {sobram} {sobram === 1 ? 'outra tarefa para hoje' : 'outras tarefas para hoje'}
            </Link>
          )}
        </section>
      )}

      {/* ------------------------------------------------------------------
          PRECISA DE VOCE — UMA situacao. Sem tres botoes: tocar abre o
          contexto, que e onde a decisao tem informacao para ser tomada.
          ------------------------------------------------------------------ */}
      {primeira && (
        <section className="mt-7" data-testid="m1-decisao">
          <p className="px-secao">Precisa de você</p>
          <button
            type="button"
            onClick={() => abrir(primeira)}
            className="press mt-1 flex w-full items-start gap-2.5 py-1 text-left"
          >
            <IconeDecisao t={primeira} />
            <span className="min-w-0 flex-1">
              <span className="block text-[17px] font-medium leading-snug">{primeira.titulo}</span>
              <span className="px-motivo mt-0.5 block text-warning">{primeira.motivoDecisao}</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => abrir(primeira)}
            className="press mt-1.5 inline-flex items-center gap-0.5 pl-[26px] text-[13px] font-semibold text-accent-text"
          >
            Ver situação <ArrowRight size={13} />
          </button>

          {outras.length > 0 && !verDecisoes && (
            <button
              type="button"
              onClick={() => setVerDecisoes(true)}
              data-testid="m1-mais-decisoes"
              className="press mt-2 block text-[13px] text-muted"
            >
              + {outras.length} {outras.length === 1 ? 'outra decisão' : 'outras decisões'}
            </button>
          )}
          {verDecisoes && outras.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => abrir(t)}
              className="press mt-2 flex w-full items-start gap-2.5 py-1 text-left"
            >
              <IconeDecisao t={t} />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] leading-snug">{t.titulo}</span>
                <span className="px-motivo mt-0.5 block text-warning">{t.motivoDecisao}</span>
              </span>
            </button>
          ))}
        </section>
      )}

      {/* ==================================================================
          ABAIXO DA DOBRA — "e depois?". Nada aqui e necessario para a tela
          cumprir o que ela promete no primeiro viewport.
          ================================================================== */}
      {resto.length > 0 && (
        <section className="mt-8" data-testid="m1-resto">
          <div className="flex items-baseline justify-between gap-3">
            <p className="px-secao">Resto do dia</p>
            <Link to="/prototipo/agenda" className="press text-[13px] font-semibold text-accent-text">
              Agenda
            </Link>
          </div>
          <div className="mt-1">
            {resto.map((item) => (
              <div key={item.id} className="flex items-baseline gap-3 py-2">
                <span className={cx(
                  'px-hora w-[44px] flex-none text-[13px]',
                  item.ordem === '99:99' ? 'text-faint' : 'text-secondary',
                )}>
                  {item.ordem === '99:99' ? 'sem hora' : item.inicio}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] leading-snug">{item.titulo}</span>
                  {item.especie === 'compromisso' && (item.local || item.alerta) && (
                    <span className="px-motivo mt-0.5 flex items-center gap-2">
                      {item.local && <span>{item.local}</span>}
                      {item.alerta && (
                        <span className="inline-flex items-center gap-0.5">
                          <Bell size={10} /> {alertaCurto(item.alerta)}
                        </span>
                      )}
                    </span>
                  )}
                  {item.especie === 'reserva' && (
                    <span className="px-motivo mt-0.5 block text-accent-text">
                      horário reservado · {item.inicio}–{item.fim}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {(feitasHoje.length > 0 || soltas.length > 0) && (
        <section className="mt-7 space-y-2">
          {feitasHoje.length > 0 && (
            <p className="flex items-center gap-1.5 text-[13px] text-muted">
              <Check size={13} className="text-positive" />
              {feitasHoje.length} {feitasHoje.length === 1 ? 'concluída hoje' : 'concluídas hoje'}
            </p>
          )}
          {soltas.length > 0 && (
            <Link
              to="/prototipo/memoria?filtro=por-organizar"
              className="press flex items-center gap-1 text-[13px] text-muted"
            >
              {soltas.length} {soltas.length === 1 ? 'item por organizar' : 'itens por organizar'}
              <ChevronRight size={13} />
            </Link>
          )}
        </section>
      )}

      <DetalheTarefa
        t={aberta}
        estado={estado}
        acoes={acoes}
        aoVoltar={voltar}
        aoAbrirCompleto={(id) => navegar(`/prototipo/tarefas/${id}`)}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// UMA TAREFA EXECUTAVEL. Circulo a esquerda, colado no objeto: concluir nao
// pode custar uma viagem. Sem coluna de hora com travessao — uma coluna que so
// mostra "—" e uma coluna que nao carrega informacao.
// ---------------------------------------------------------------------------
function LinhaTarefa({ t, hoje, vencida, aoConcluir, aoAbrir }) {
  const [saindo, setSaindo] = useState(false)
  const detalhe = [
    vencida ? `prazo ${rotuloDeData(t.prazo, hoje)}` : null,
    !vencida && t.prazo === hoje ? 'prazo hoje' : null,
    t.reserva?.data === hoje ? `${t.reserva.inicio}–${t.reserva.fim}` : null,
    !vencida && t.prioridade === 'alta' ? 'Prioridade' : null,
    t.contexto,
  ].filter(Boolean).slice(0, 2)

  // O feedback da conclusao acontece NO PROPRIO ITEM antes de a lista mudar:
  // a linha marca e esmaece, e so entao o estado muda. Sem isso, concluir
  // parece que a tarefa evaporou.
  const concluir = () => {
    setSaindo(true)
    setTimeout(aoConcluir, 180)
  }

  return (
    <div className={cx('flex items-start gap-3 py-2.5 transition-opacity duration-200', saindo && 'opacity-40')}>
      <button
        type="button"
        onClick={concluir}
        aria-label={`Concluir ${t.titulo}`}
        data-testid="m1-concluir"
        className={cx(
          'press mt-0.5 grid h-[22px] w-[22px] flex-none place-items-center rounded-full border-[1.5px] transition-colors',
          saindo ? 'border-positive bg-positive text-white' : 'border-hairline text-transparent',
        )}
      >
        <Check size={13} strokeWidth={3} />
      </button>
      <button
        type="button"
        onClick={aoAbrir}
        data-testid="m1-tarefa"
        className="min-w-0 flex-1 text-left"
      >
        <span className={cx('block text-[17px] leading-snug', saindo && 'line-through')}>{t.titulo}</span>
        {detalhe.length > 0 && (
          <span className={cx('px-motivo mt-0.5 block', vencida && 'text-warning')}>
            {detalhe.join(' · ')}
          </span>
        )}
      </button>
    </div>
  )
}

function IconeDecisao({ t }) {
  const Icone = t.responsabilidade === RESPONSABILIDADE.DEVOLVIDA
    ? CornerDownLeft
    : t.bloqueio ? Ban : Clock3
  return <Icone size={16} className="mt-1 flex-none text-warning" />
}

// ---------------------------------------------------------------------------
// O DETALHE. Informacoes essenciais em cima, acoes secundarias embaixo — e a
// acao principal (concluir) no rodape, onde o polegar alcanca.
// ---------------------------------------------------------------------------
function DetalheTarefa({ t, estado, acoes, aoVoltar, aoAbrirCompleto }) {
  if (!t) return null
  const pessoa = estado.pessoas?.find((p) => p.id === t.responsavelId)
  const devolvida = t.responsabilidade === RESPONSABILIDADE.DEVOLVIDA
  const meta = [
    t.prazo ? `Prazo ${rotuloDeData(t.prazo, estado.hoje)}` : null,
    t.contexto,
    t.prioridade === 'alta' ? 'Prioridade alta' : null,
    pessoa && !pessoa.eu ? `Com ${pessoa.nome}` : null,
  ].filter(Boolean)

  return (
    <DetalheMovel
      aberto
      aoVoltar={aoVoltar}
      titulo={t.titulo}
      acima={t.estado === ESTADO.FAZENDO ? 'em andamento' : null}
      rodape={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { acoes.mudarEstado(t.id, ESTADO.FEITO); aoVoltar() }}
            data-testid="m1-detalhe-concluir"
            className="press flex-1 rounded-control bg-accent py-3 text-[15px] font-semibold text-white"
          >
            Concluir
          </button>
          <button
            type="button"
            onClick={() => aoAbrirCompleto(t.id)}
            className="press rounded-control border border-hairline px-4 py-3 text-[14px] font-medium text-secondary"
          >
            Abrir tudo
          </button>
        </div>
      }
    >
      <h2 className="mt-2 text-[24px] font-bold leading-[1.15] tracking-[-0.02em]">{t.titulo}</h2>

      {meta.length > 0 && (
        <p className="px-motivo mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          {meta.map((m) => <span key={m}>{m}</span>)}
        </p>
      )}

      {t.motivoDecisao && (
        <p className="mt-3 text-[14px] font-medium leading-snug text-warning">{t.motivoDecisao}</p>
      )}
      {devolvida && t.motivoDevolucao && (
        <p className="mt-2 text-[15px] leading-relaxed text-secondary">“{t.motivoDevolucao}”</p>
      )}

      {t.descricao && (
        <p className="mt-4 text-[16px] leading-relaxed text-secondary">{t.descricao}</p>
      )}

      {t.reserva?.data === estado.hoje && (
        <p className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-medium text-accent-text">
          <CalendarClock size={15} />
          Reservado {t.reserva.inicio}–{t.reserva.fim}
        </p>
      )}

      {t.subtarefas?.length > 0 && (
        <div className="mt-5">
          <p className="px-secao">Passos</p>
          <div className="mt-1">
            {t.subtarefas.map((s) => (
              <p key={s.id} className="flex items-center gap-2.5 py-1.5 text-[15px]">
                <Check size={14} className={s.feito ? 'text-positive' : 'text-faint'} />
                <span className={cx(s.feito && 'text-muted line-through')}>{s.titulo}</span>
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Acoes secundarias: presentes, mas sem competir com o rodape. */}
      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => { acoes.escolherParaHoje(t.id, false); aoVoltar() }}
          className="press rounded-full border border-hairline px-3.5 py-2 text-[13px] font-medium text-secondary"
        >
          Tirar de hoje
        </button>
        <button
          type="button"
          onClick={() => aoAbrirCompleto(t.id)}
          className="press rounded-full border border-hairline px-3.5 py-2 text-[13px] font-medium text-secondary"
        >
          Histórico
        </button>
      </div>
    </DetalheMovel>
  )
}
