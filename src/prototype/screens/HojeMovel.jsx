import { useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, MoreHorizontal, ChevronRight, Check, CalendarCheck2, CalendarPlus,
  Sparkles, CornerDownLeft, Ban, Clock3, CalendarClock,
} from 'lucide-react'
import { useProto, useAcoes } from '../store/contexto'
import {
  destaqueDoMomento, decisoesDoDia, rotuloDeDecisao, semData,
  janelaLivre, sugestoesDaJanela,
} from '../store/hojeM2'
import {
  ESTADO, RESPONSABILIDADE, AGORA_DEMO, saudacao,
  nomeDoDia, numeroDoDia, mesPorExtenso, rotuloDeData,
} from '../mock/dados'
import DetalheMovel from '../parts/detalheMovel'
import { cx } from '../../lib/utils'

// ---------------------------------------------------------------------------
// HOJE NO TELEFONE — A DIRECAO VISUAL APROVADA (UX-M2).
//
// O UX-M1 tirou a tela do formato "documento vertical" e provou que dava. O
// que ele nao acertou foi o TOM: ficou uma home sem superficie nenhuma, e
// "calma" virou "apagada". A referencia aprovada corrige exatamente isso, e
// esta tela e a implementacao dela — nao uma releitura.
//
// -------------------- A COMPOSICAO APROVADA --------------------------------
//
//   CONTEXTO    data + saudacao. A saudacao e o maior texto da tela e o unico
//               elemento editorial. Nenhuma barra de marca acima: a home nao
//               precisa dizer em que aplicativo voce esta;
//
//   TRES SUPERFICIES, cada uma com funcao diferente — e e por terem funcoes
//   diferentes que elas sao tres, e nao uma lista com bordas:
//
//     1. PROXIMO COMPROMISSO  lavanda. O horario e o objeto; o marcador
//        vertical liga a hora ao que vai acontecer;
//     2. PRECISA DE VOCE      branca. O que esta PARADO esperando por mim:
//        circulo para resolver, linha para abrir. A terceira linha nao e
//        tarefa — e o convite a organizar o que nunca ganhou data;
//     3. SUGESTAO CONTEXTUAL  lavanda, e a unica que pode ser dispensada. Ela
//        ocupa o fim da composicao de proposito: e a ultima coisa que se le,
//        nunca a primeira.
//
//   O RESTO DA ALTURA FICA VAZIO. Nao ha frase motivacional, grafico nem
//   agenda completa para preencher a tela: o conteudo se agrupa em cima e a
//   navegacao fica ancorada embaixo. Espaco vazio aqui e composicao.
//
// -------------------- O QUE NAO ESTA AQUI ----------------------------------
//
// A agenda do dia, a lista de tarefas de hoje e o quadro nao aparecem. Eles
// nao sumiram do produto — sao o conteudo de Agenda e de Tarefas, a um toque
// na barra de baixo. A home responde UMA pergunta: "o que precisa de mim
// agora?".
// ---------------------------------------------------------------------------

export default function HojeMovel({ aoBuscar, aoMenu }) {
  const { estado } = useProto()
  const acoes = useAcoes()
  const navegar = useNavigate()
  const [aberta, setAberta] = useState(null)
  const [verSugestoes, setVerSugestoes] = useState(false)
  const [verMais, setVerMais] = useState(false)
  const [sugestaoViva, setSugestaoViva] = useState(true)
  const rolagem = useRef(null)

  const agora = AGORA_DEMO

  const { item: destaque, emCurso, faltam } = destaqueDoMomento(estado, agora)
  const decisoes = decisoesDoDia(estado)
  const visiveis = verMais ? decisoes.todas : decisoes.visiveis
  const soltas = semData(estado)
  const janela = sugestaoViva ? janelaLivre(estado, agora) : null
  const candidatos = sugestoesDaJanela(estado)

  // -------------------------------------------------------------------------
  // VOLTAR AO MESMO LUGAR. Enquanto o detalhe esta aberto a raiz fica com
  // `overflow:hidden` para o fundo nao rolar por baixo da folha. Medido no
  // navegador: isso NAO zera a rolagem, e o caso comum ja volta certo. A
  // reposicao abaixo e garantia — se o conteudo encolher enquanto o detalhe
  // esta aberto (uma tarefa resolvida por ali sai da lista), o navegador
  // recorta a rolagem para o novo limite e a pessoa volta num lugar que nao e
  // o dela.
  // -------------------------------------------------------------------------
  useLayoutEffect(() => {
    const algoAberto = aberta || verSugestoes
    if (algoAberto || rolagem.current === null) return
    const y = rolagem.current
    rolagem.current = null
    if (Math.abs(window.scrollY - y) < 2) return
    window.scrollTo(0, y)
    requestAnimationFrame(() => window.scrollTo(0, y))
  }, [aberta, verSugestoes])

  const abrir = (t) => {
    rolagem.current = window.scrollY
    setAberta(t)
  }
  const abrirSugestoes = () => {
    rolagem.current = window.scrollY
    setVerSugestoes(true)
  }

  return (
    <div className="m2 relative -mt-3" data-testid="m2-hoje">
      {/* A ATMOSFERA. Um plano fixo atras de tudo: o fundo claro com a
          tonalidade fria e uma variacao muito discreta embaixo, que existe
          para o rodape nao parecer recortado. Nao e ilustracao — se voce
          reparar nela, ela esta forte demais. */}
      <div className="m2-fundo" aria-hidden="true" />

      <div className="relative">
        {/* ----------------------------------------------------------------
            TOPO — data, utilidades, saudacao. Uma hierarquia so.
            ---------------------------------------------------------------- */}
        <header className="pt-safe pt-3">
          <div className="flex items-start gap-3">
            <p className="min-w-0 flex-1 pt-2 text-[15px] leading-snug text-secondary">
              <span className="capitalize">{nomeDoDia(estado.hoje)}</span>, {numeroDoDia(estado.hoje)} de {mesPorExtenso(estado.hoje)}
            </p>
            <div className="flex flex-none items-center gap-2">
              <button type="button" onClick={aoBuscar} aria-label="Buscar" className="m2-redondo">
                <Search size={19} />
              </button>
              <button type="button" onClick={aoMenu} aria-label="Mais" className="m2-redondo">
                <MoreHorizontal size={19} />
              </button>
            </div>
          </div>
          <h1 className="mt-1 text-[30px] font-bold leading-[1.12] tracking-[-0.03em]">
            {saudacao(agora)}, {estado.pessoa}
          </h1>
        </header>

        {/* ----------------------------------------------------------------
            1 · PROXIMO COMPROMISSO
            ---------------------------------------------------------------- */}
        {destaque && (
          <button
            type="button"
            data-testid="m2-proximo"
            onClick={() => navegar(destaque.especie === 'reserva'
              ? `/prototipo/tarefas/${destaque.tarefaId}`
              : '/prototipo/agenda')}
            className="m2-superficie m2-lavanda press mt-6 w-full text-left"
          >
            <div className="flex items-center gap-2">
              <span className="m2-selo"><CalendarCheck2 size={13} /></span>
              <span className="m2-rotulo">{emCurso ? 'Acontecendo agora' : 'Próximo compromisso'}</span>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="m2-hora px-hora flex-none font-semibold leading-none tracking-[-0.03em]">
                {destaque.inicio}
              </span>
              <span className="m2-marcador" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                {/* `balance` para a quebra ser decidida, nao sobrada: em 430
                    o titulo cabe em uma linha; abaixo disso ele se reparte em
                    duas metades parecidas em vez de deixar uma palavra orfa.
                    Encolher a fonte ate caber custaria legibilidade — e a
                    prioridade aqui e ler, nao imitar pixel. */}
                <span className="m2-titulo block text-balance font-semibold leading-snug tracking-[-0.01em]">
                  {destaque.titulo}
                </span>
                <span className="mt-0.5 block text-[13.5px] leading-snug text-muted">
                  {destaque.local && <>{destaque.local} · </>}
                  <span className="font-medium text-accent-text">
                    {emCurso ? `até ${destaque.fim}` : `em ${faltam} min`}
                  </span>
                </span>
              </span>
              <ChevronRight size={16} className="flex-none text-faint" />
            </div>
          </button>
        )}

        {/* ----------------------------------------------------------------
            2 · PRECISA DE VOCE
            ---------------------------------------------------------------- */}
        {(visiveis.length > 0 || soltas.length > 0) && (
          <section className="m2-superficie m2-branca mt-4 px-0 py-0" data-testid="m2-decisoes">
            <div className="flex items-baseline justify-between gap-3 px-4 pt-4">
              <h2 className="text-[19px] font-bold leading-none tracking-[-0.02em]">Precisa de você</h2>
              {decisoes.sobram > 0 && !verMais && (
                <button
                  type="button"
                  onClick={() => setVerMais(true)}
                  data-testid="m2-ver-mais"
                  className="press -mr-1 flex items-center gap-0.5 pl-2 text-[14px] font-semibold text-accent-text"
                >
                  Ver mais {decisoes.sobram} <ChevronRight size={15} />
                </button>
              )}
            </div>

            <div className="mt-1 px-4 pb-1">
              {visiveis.map((t, i) => (
                <div key={t.id}>
                  {i > 0 && <div className="m2-divisor" />}
                  <LinhaDecisao
                    t={t}
                    hoje={estado.hoje}
                    aoConcluir={() => acoes.mudarEstado(t.id, ESTADO.FEITO)}
                    aoAbrir={() => abrir(t)}
                  />
                </div>
              ))}

              {soltas.length > 0 && (
                <>
                  {visiveis.length > 0 && <div className="m2-divisor" />}
                  <button
                    type="button"
                    data-testid="m2-sem-data"
                    onClick={() => navegar('/prototipo/tarefas')}
                    className="press flex w-full items-center gap-3 py-3 text-left"
                  >
                    <span className="m2-icone-linha"><CalendarPlus size={17} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="m2-linha block font-medium leading-snug">
                        {soltas.length} {soltas.length === 1 ? 'tarefa sem data' : 'tarefas sem data'}
                      </span>
                      <span className="mt-0.5 block text-[13.5px] leading-snug text-muted">
                        Escolher data para organizar
                      </span>
                    </span>
                    <ChevronRight size={18} className="flex-none text-faint" />
                  </button>
                </>
              )}
            </div>
          </section>
        )}

        {/* ----------------------------------------------------------------
            3 · SUGESTAO CONTEXTUAL
            A IA nao decide nada aqui: ela nota uma janela real e PERGUNTA.
            "Ver sugestoes" abre a escolha; nada e gravado antes disso.
            ---------------------------------------------------------------- */}
        {janela && candidatos.length > 0 && (
          <section className="m2-superficie m2-lavanda px-entra relative mt-4 overflow-hidden" data-testid="m2-sugestao">
            <div className="flex items-center gap-2">
              <Sparkles size={15} className="flex-none text-accent" />
              <span className="m2-rotulo">Tempo livre antes da reunião</span>
            </div>
            <p className="relative mt-2 text-[15px] leading-snug text-primary">
              Você tem {janela.minutos} min livres antes da reunião.
              <br />Quer adiantar alguma tarefa?
            </p>
            <div className="relative mt-3.5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={abrirSugestoes}
                data-testid="m2-ver-sugestoes"
                className="press rounded-control bg-accent px-4 py-2.5 text-[14px] font-semibold text-white"
              >
                Ver sugestões
              </button>
              <button
                type="button"
                onClick={() => setSugestaoViva(false)}
                data-testid="m2-dispensar"
                className="press rounded-control bg-accent-soft px-4 py-2.5 text-[14px] font-medium text-accent-text ring-1 ring-inset ring-accent/15"
              >
                Agora não
              </button>
            </div>
            <GlifoJanela />
          </section>
        )}
      </div>

      <DetalheTarefa
        t={aberta}
        estado={estado}
        acoes={acoes}
        aoVoltar={() => setAberta(null)}
        aoAbrirCompleto={(id) => navegar(`/prototipo/tarefas/${id}`)}
      />

      <FolhaSugestoes
        aberta={verSugestoes && Boolean(janela)}
        janela={janela}
        candidatos={candidatos}
        hoje={estado.hoje}
        aoVoltar={() => setVerSugestoes(false)}
        aoReservar={(t) => {
          acoes.reservarHorario(t.id, estado.hoje, janela.de, janela.ate)
          setVerSugestoes(false)
          setSugestaoViva(false)
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// UMA LINHA DE "PRECISA DE VOCE".
//
// Circulo a esquerda, colado no objeto: resolver nao pode custar uma viagem.
// O resto da linha abre o contexto, que e onde a decisao tem informacao para
// ser tomada. A cor do alerta e vermelho CONTIDO e fica so no alerta — pintar
// a linha inteira transformaria "precisa de voce" em "voce esta falhando".
// ---------------------------------------------------------------------------
function LinhaDecisao({ t, hoje, aoConcluir, aoAbrir }) {
  const [saindo, setSaindo] = useState(false)
  const { alerta, contexto } = rotuloDeDecisao(t, hoje)

  // O feedback acontece NO PROPRIO ITEM antes de a lista mudar: a linha marca
  // e esmaece, e so entao o estado muda. Sem isso, concluir parece que a
  // tarefa evaporou.
  const concluir = () => {
    setSaindo(true)
    setTimeout(aoConcluir, 180)
  }

  return (
    <div className={cx('flex items-start gap-3 py-3 transition-opacity duration-200', saindo && 'opacity-40')}>
      <button
        type="button"
        onClick={concluir}
        aria-label={`Concluir ${t.titulo}`}
        data-testid="m2-concluir"
        className={cx(
          'press mt-0.5 grid h-[26px] w-[26px] flex-none place-items-center rounded-full border-[1.5px] transition-colors',
          saindo ? 'border-positive bg-positive text-white' : 'border-hairline text-transparent',
        )}
      >
        <Check size={14} strokeWidth={3} />
      </button>
      <button
        type="button"
        onClick={aoAbrir}
        data-testid="m2-decisao"
        className="min-w-0 flex-1 text-left"
      >
        <span className={cx('m2-linha block text-balance font-medium leading-snug', saindo && 'line-through')}>
          {t.titulo}
        </span>
        {(alerta || contexto) && (
          <span className="mt-0.5 block text-[13.5px] leading-snug text-muted">
            {alerta && <span className="text-danger">{alerta}</span>}
            {alerta && contexto && ' · '}
            {contexto}
          </span>
        )}
      </button>
      <ChevronRight size={18} className="mt-1 flex-none text-faint" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// O GLIFO DA SUGESTAO. Um desenho pequeno, do mesmo violeta, meio transparente
// e atras do texto: da corpo a superficie sem virar banner. Se ele competir
// com a frase, ele esta errado — por isso nao tem cor propria nem sombra, e o
// texto tem largura maxima para nunca passar por cima dele.
// ---------------------------------------------------------------------------
function GlifoJanela() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 64 64"
      className="pointer-events-none absolute right-2 top-[46%] h-[68px] w-[68px] text-accent opacity-[0.15]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="6" y="12" width="42" height="40" rx="8" />
      <path d="M6 24h42M18 6v10M36 6v10" />
      <path d="M17 36h12" />
      <circle cx="47" cy="45" r="13" fill="currentColor" stroke="none" opacity="0.5" />
      <path d="M47 39v6l4 3" stroke="currentColor" opacity="0.9" />
    </svg>
  )
}

function IconeDecisao({ t }) {
  const Icone = t.responsabilidade === RESPONSABILIDADE.DEVOLVIDA
    ? CornerDownLeft
    : t.bloqueio ? Ban : Clock3
  return <Icone size={15} className="flex-none text-warning" />
}

// ---------------------------------------------------------------------------
// A ESCOLHA DA JANELA. A sugestao nao reserva sozinha: mostra o que cabe nos
// 20 minutos e deixa a pessoa apontar. Sair daqui nao grava nada.
// ---------------------------------------------------------------------------
function FolhaSugestoes({ aberta, janela, candidatos, hoje, aoVoltar, aoReservar }) {
  if (!aberta || !janela) return null
  return (
    <DetalheMovel aberto aoVoltar={aoVoltar} titulo="Sugestões para a janela" acima={`${janela.de}–${janela.ate}`}>
      <h2 className="mt-2 text-[24px] font-bold leading-[1.15] tracking-[-0.02em]">
        {janela.minutos} min antes da reunião
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed text-secondary">
        Dá para adiantar uma destas. Reservar marca o horário no seu dia — nada é
        guardado enquanto você não escolher.
      </p>

      <div className="mt-5" data-testid="m2-sugestoes-lista">
        {candidatos.map((t, i) => (
          <div key={t.id}>
            {i > 0 && <div className="m2-divisor" />}
            <div className="flex items-start gap-3 py-3">
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-medium leading-snug">{t.titulo}</span>
                <span className="mt-0.5 block text-[13.5px] leading-snug text-muted">
                  {[
                    t.prazo ? `prazo ${rotuloDeData(t.prazo, hoje)}` : null,
                    t.prioridade === 'alta' ? 'prioridade alta' : null,
                    t.contexto,
                  ].filter(Boolean).slice(0, 2).join(' · ')}
                </span>
              </span>
              <button
                type="button"
                onClick={() => aoReservar(t)}
                data-testid="m2-reservar"
                className="press flex-none rounded-control bg-accent px-3.5 py-2 text-[13.5px] font-semibold text-white"
              >
                Reservar
              </button>
            </div>
          </div>
        ))}
      </div>
    </DetalheMovel>
  )
}

// ---------------------------------------------------------------------------
// O DETALHE (preservado do UX-M1). Informacoes essenciais em cima, acoes
// secundarias embaixo — e a acao principal no rodape, onde o polegar alcanca.
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
            data-testid="m2-detalhe-concluir"
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
        <p className="mt-3 flex items-center gap-1.5 text-[14px] font-medium leading-snug text-warning">
          <IconeDecisao t={t} />
          {t.motivoDecisao}
        </p>
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

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => { acoes.escolherParaHoje(t.id, true); aoVoltar() }}
          className="press rounded-full border border-hairline px-3.5 py-2 text-[13px] font-medium text-secondary"
        >
          Trazer para hoje
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
