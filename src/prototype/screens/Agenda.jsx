import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Plus, Sparkles, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react'
import { useProto, useDesktop } from '../store/contexto'
import { agendaDoDia, planejadasDoDia, ocupacaoDoDia, conflitosDoDia } from '../store/reducer'
import { inicioDaSemana, somarDias, iso, diaCurto, numeroDoDia, rotuloDeData, nomeDoDia, AGORA_DEMO } from '../mock/dados'
import { Secao, Vazio, Botao } from '../parts/base'
import { Segmentos, TituloDeTela } from '../parts/movel'
import CompromissoForm from '../forms/CompromissoForm'
import { cx } from '../../lib/utils'

// ---------------------------------------------------------------------------
// AGENDA — precisa PARECER uma agenda, e não uma lista com horas escritas.
//
// No desktop a semana usa a largura para representar TEMPO: uma grade com
// horas, em que a altura de um bloco é a duração e o espaço entre blocos é o
// intervalo livre. É isso que permite olhar e ver "a terça à tarde está vazia".
//
// TRÊS ESPÉCIES, distinguíveis sem depender de cor:
//   compromisso        bloco cheio, borda sólida — acontece naquele horário;
//   horário reservado  bloco hachurado, borda tracejada — tempo que eu decidi
//                      proteger para executar uma tarefa;
//   tarefa planejada   fora da grade, numa faixa do dia — quero fazer nesse
//                      dia, sem hora marcada.
//
// Clicar num horário vazio cria um compromisso JÁ com dia e hora. Clicar num
// bloco abre para editar.
// ---------------------------------------------------------------------------
const H_INICIO = 7
const H_FIM = 21
const PX_HORA = 46

export default function Agenda() {
  const { estado } = useProto()
  const desktop = useDesktop()
  const [params] = useSearchParams()
  const diaPedido = params.get('dia')
  const [visao, setVisao] = useState(diaPedido ? 'dia' : desktop ? 'semana' : 'dia')
  const [dia, setDia] = useState(diaPedido || estado.hoje)
  const [form, setForm] = useState(null) // { compromisso } | { padroes }

  useEffect(() => {
    if (diaPedido) { setDia(diaPedido); setVisao('dia') }
  }, [diaPedido])

  const seg = inicioDaSemana(new Date(`${estado.hoje}T12:00:00`))
  const dias = Array.from({ length: 7 }, (_, i) => iso(somarDias(seg, i)))

  const abrirNovo = (padroes = {}) => setForm({ padroes })
  const abrirItem = (evento) => {
    if (evento.especie === 'compromisso') {
      setForm({ compromisso: estado.compromissos.find((c) => c.id === evento.id) })
    }
  }

  return (
    <div className="px-entra">
      {!desktop ? (
        // Cabeçalho compacto: título, uma ação e o eixo de visão. Nada mais
        // disputa a primeira linha do telefone.
        <>
          <TituloDeTela
            titulo="Agenda"
            detalhe={visao === 'dia' ? `${numeroDoDia(dia)} de ${mesDe(dia)}` : mesDe(dia)}
            acao={
              <button
                type="button"
                onClick={() => abrirNovo({ data: dia })}
                aria-label="Novo compromisso"
                className="press grid h-9 w-9 place-items-center rounded-control bg-accent text-white shadow-raised"
              >
                <Plus size={19} />
              </button>
            }
          />
          <Segmentos
            className="mt-3"
            valor={visao}
            aoEscolher={setVisao}
            opcoes={[
              { chave: 'dia', label: 'Dia' },
              { chave: 'semana', label: 'Semana' },
              { chave: 'mês', label: 'Mês' },
            ]}
          />
        </>
      ) : (
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="px-titulo-tela">Agenda</h1>
          <span className="text-[13px] text-muted">
            {visao === 'semana'
              ? `${numeroDoDia(dias[0])}–${numeroDoDia(dias[6])} de ${mesDe(dias[6])}`
              : `${capitalizar(nomeDoDia(dia))}, ${numeroDoDia(dia)} de ${mesDe(dia)}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-control border border-hairline p-0.5">
            {['dia', 'semana', 'mês'].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVisao(v)}
                aria-pressed={visao === v}
                className={cx(
                  'press rounded-[7px] px-3 py-1.5 text-[13px] capitalize transition',
                  visao === v ? 'bg-accent-soft font-semibold text-accent-text' : 'text-muted hover:text-primary',
                )}
              >
                {v}
              </button>
            ))}
          </div>
          <Botao variante="primario" onClick={() => abrirNovo({ data: dia })}>
            <Plus size={16} /> Novo compromisso
          </Botao>
        </div>
      </header>
      )}

      {/* A faixa de dias serve para TROCAR de dia. Na semana e no mês a própria
          grade já faz isso, então ela sairia do caminho em vez de ajudar. */}
      <div className={cx('no-scrollbar mt-3 flex gap-1 overflow-x-auto', visao !== 'dia' && 'hidden')}>
        {dias.map((d) => {
          const ativo = visao !== 'semana' && d === dia
          const hoje = d === estado.hoje
          const carga = agendaDoDia(estado, d).length + planejadasDoDia(estado, d).length
          return (
            <button
              key={d}
              type="button"
              onClick={() => { setDia(d); if (visao === 'mês') setVisao('dia') }}
              className={cx(
                'press flex min-w-[44px] flex-1 flex-col items-center gap-0.5 rounded-row border py-1.5 transition',
                ativo ? 'border-accent bg-accent-soft' : 'border-transparent hover:bg-surface-2',
              )}
            >
              <span className={cx('text-[10px] uppercase tracking-wider', ativo ? 'text-accent-text' : 'text-faint')}>
                {diaCurto(d)}
              </span>
              <span className={cx('px-hora text-[14.5px]', ativo ? 'font-semibold text-accent-text' : hoje ? 'font-semibold' : 'text-secondary')}>
                {numeroDoDia(d)}
              </span>
              <span className={cx('h-1 w-1 rounded-full', carga ? 'bg-accent/60' : 'bg-transparent')} />
            </button>
          )
        })}
      </div>

      <AvisoConflito dias={visao === 'semana' ? dias : [dia]} aoDia={(d) => { setDia(d); setVisao('dia') }} />

      {visao === 'semana' ? (
        desktop ? (
          <GradeSemana dias={dias} aoNovo={abrirNovo} aoAbrir={abrirItem} aoDia={(d) => { setDia(d); setVisao('dia') }} />
        ) : (
          <SemanaSequencial dias={dias} aoAbrir={abrirItem} aoDia={(d) => { setDia(d); setVisao('dia') }} />
        )
      ) : visao === 'mês' ? (
        <Mes desktop={desktop} aoDia={(d) => { setDia(d); setVisao('dia') }} />
      ) : (
        <Dia data={dia} aoNovo={abrirNovo} aoAbrir={abrirItem} desktop={desktop} />
      )}

      <Link
        to="/prototipo/copiloto?contexto=semana"
        className="press mt-8 flex items-center justify-center gap-2 rounded-row border border-hairline py-2.5 text-[13.5px] font-semibold text-accent-text transition hover:border-accent hover:bg-surface-2"
      >
        <Sparkles size={15} /> Planejar esta semana com o Copiloto
      </Link>

      <CompromissoForm
        aberta={Boolean(form)}
        aoFechar={() => setForm(null)}
        compromisso={form?.compromisso}
        padroes={form?.padroes || {}}
      />
    </div>
  )
}

// Conflito: dois compromissos que se encavalam. A Agenda MOSTRA e a decisão
// continua sendo de quem marcou — o produto não desmarca nada sozinho.
function AvisoConflito({ dias, aoDia }) {
  const { estado } = useProto()
  const desktop = useDesktop()
  const conflitos = dias.flatMap((d) => conflitosDoDia(estado, d).map((par) => ({ data: d, par })))
  if (!conflitos.length) return null
  return (
    <div className="mt-3 space-y-1.5">
      {conflitos.map(({ data, par }) => (
        <button
          key={`${data}-${par[0].id}-${par[1].id}`}
          type="button"
          onClick={() => aoDia(data)}
          className="press flex w-full items-center gap-2.5 rounded-row border border-warning/40 bg-warning/[0.07] px-3.5 py-2 text-left"
        >
          <AlertTriangle size={15} className="flex-none text-warning" />
          {/* No telefone o aviso é uma linha que leva ao dia: os dois títulos
              inteiros viravam um parágrafo antes do conteúdo da semana. */}
          {desktop ? (
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] leading-snug">
                <strong className="font-semibold">{capitalizar(nomeDoDia(data))}</strong>: “{par[0].titulo}” e
                “{par[1].titulo}” se sobrepõem.
              </span>
              <span className="px-motivo mt-0.5 block">
                <span className="px-hora">{par[1].inicio}–{par[0].fim}</span> em comum — um dos dois vai começar atrasado.
              </span>
            </span>
          ) : (
            <span className="min-w-0 flex-1 truncate text-[13px]">
              <strong className="font-semibold">{capitalizar(nomeDoDia(data))}</strong>: dois compromissos
              se sobrepõem às <span className="px-hora">{par[1].inicio}</span>
            </span>
          )}
          <ChevronRight size={15} className="flex-none text-muted" />
        </button>
      ))}
    </div>
  )
}

// --- a grade -----------------------------------------------------------------
const minutos = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number)
  return h * 60 + m
}
// A altura da hora é um parâmetro: no telefone a mesma grade precisa de mais
// espaço por hora para que tocar num horário vazio seja um alvo confortável, e
// não uma mira de 46px dividida entre duas meias-horas.
const PX_HORA_TOQUE = 58
const topoDe = (hhmm, px = PX_HORA) => ((minutos(hhmm) - H_INICIO * 60) / 60) * px
const alturaDe = (ini, fim, px = PX_HORA) => Math.max(22, ((minutos(fim) - minutos(ini)) / 60) * px)

function ColunaDeHoras({ px = PX_HORA }) {
  return (
    <div className="w-[42px] flex-none">
      {Array.from({ length: H_FIM - H_INICIO }, (_, i) => (
        <div key={i} style={{ height: px }} className="relative">
          <span className="px-hora absolute -top-1.5 right-1.5 text-[10.5px] text-faint">
            {String(H_INICIO + i).padStart(2, '0')}:00
          </span>
        </div>
      ))}
    </div>
  )
}

function ColunaDoDia({ data, aoNovo, aoAbrir, compacta, px = PX_HORA }) {
  const { estado } = useProto()
  const eventos = agendaDoDia(estado, data)
  const hoje = data === estado.hoje

  return (
    <div className="relative flex-1 border-l border-hairline">
      {/* fatias de hora: clicaveis para criar ali mesmo */}
      {Array.from({ length: H_FIM - H_INICIO }, (_, i) => {
        const hora = `${String(H_INICIO + i).padStart(2, '0')}:00`
        return (
          <button
            key={hora}
            type="button"
            aria-label={`Novo compromisso ${rotuloDeData(data, estado.hoje)} às ${hora}`}
            onClick={() => aoNovo({ data, inicio: hora })}
            style={{ height: px }}
            className="px-slot px-grade-hora block w-full"
          />
        )
      })}

      {/* agora */}
      {hoje && (
        <div
          className="pointer-events-none absolute inset-x-0 z-10 border-t border-danger/70"
          style={{ top: topoDe(AGORA_DEMO, px) }}
        >
          <span className="absolute -left-1 -top-[3px] h-1.5 w-1.5 rounded-full bg-danger" />
        </div>
      )}

      {eventos.map((e) => {
        const reserva = e.especie === 'reserva'
        const altura = alturaDe(e.inicio, e.fim, px)
        // Bloco alto tem espaço para o título inteiro; bloco curto não pode
        // empurrar o vizinho, então corta. A informação some por falta de
        // espaço real, nunca por padrão.
        const linhas = altura >= 62 ? 2 : 1
        const conteudo = (
          <>
            <span className="px-hora block text-[10px] leading-tight text-accent-text/80">
              {e.inicio}–{e.fim}
            </span>
            <span
              className={cx('block overflow-hidden text-[12px] font-medium leading-[1.25]', compacta && 'text-[11.5px]')}
              style={{ display: '-webkit-box', WebkitLineClamp: linhas, WebkitBoxOrient: 'vertical' }}
            >
              {e.titulo}
            </span>
            {altura >= 96 && e.local && (
              <span className="mt-0.5 block truncate text-[10.5px] text-secondary">{e.local}</span>
            )}
          </>
        )
        const estilo = { top: topoDe(e.inicio, px), height: altura }
        return reserva ? (
          <Link
            key={e.id}
            to={`/prototipo/tarefas/${e.tarefaId}`}
            style={estilo}
            title={`Horário reservado · ${e.titulo}`}
            className="px-evento px-evento-reserva"
          >
            {conteudo}
          </Link>
        ) : (
          <button
            key={e.id}
            type="button"
            onClick={() => aoAbrir(e)}
            style={estilo}
            title={`Compromisso · ${e.titulo}`}
            className="px-evento"
          >
            {conteudo}
          </button>
        )
      })}
    </div>
  )
}

function FaixaPlanejadas({ data }) {
  const { estado } = useProto()
  const planejadas = planejadasDoDia(estado, data)
  if (!planejadas.length) return <div className="min-h-[6px]" />
  return (
    <div className="space-y-1 border-l border-hairline px-1 py-1.5">
      {planejadas.map((t) => (
        <Link
          key={t.id}
          to={`/prototipo/tarefas/${t.id}`}
          className="flex items-center gap-1.5 rounded-[7px] px-1 py-0.5 text-[11.5px] text-secondary transition hover:bg-surface-2"
        >
          <span className="px-especie px-planejada h-3" />
          <span className="truncate">{t.titulo}</span>
        </Link>
      ))}
    </div>
  )
}

function GradeSemana({ dias, aoNovo, aoAbrir, aoDia }) {
  const { estado } = useProto()
  return (
    <div className="mt-4">
      <div className="flex">
        <div className="w-[42px] flex-none" />
        {dias.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => aoDia(d)}
            className={cx(
              'press flex-1 border-l border-hairline pb-1 text-center transition hover:bg-surface-2',
              d === estado.hoje && 'bg-accent-soft/40',
            )}
          >
            <span className="px-secao block">{diaCurto(d)}</span>
            <span className={cx('px-hora text-[15px]', d === estado.hoje && 'font-semibold text-accent-text')}>
              {numeroDoDia(d)}
            </span>
          </button>
        ))}
      </div>

      {/* faixa das tarefas planejadas: fora da linha do tempo, de propósito */}
      <div className="flex border-y border-hairline bg-surface-2/40">
        <div className="w-[42px] flex-none py-1.5 pr-1.5 text-right">
          <span className="text-[9.5px] uppercase tracking-wider text-faint">tarefas</span>
        </div>
        {dias.map((d) => (
          <div key={d} className="min-w-0 flex-1"><FaixaPlanejadas data={d} /></div>
        ))}
      </div>

      <div className="flex pt-2">
        <ColunaDeHoras />
        {dias.map((d) => (
          <ColunaDoDia key={d} data={d} aoNovo={aoNovo} aoAbrir={aoAbrir} compacta />
        ))}
      </div>

      <Legenda />
    </div>
  )
}

function Dia({ data, aoNovo, aoAbrir, desktop }) {
  const { estado } = useProto()
  const eventos = agendaDoDia(estado, data)
  const planejadas = planejadasDoDia(estado, data)

  if (!desktop) {
    // UX1.2.1 — o telefone passa a ver a MESMA linha do tempo do desktop, com
    // a hora mais alta. A lista dizia os horários; a grade MOSTRA a duração, o
    // intervalo vazio e onde dá para encaixar alguma coisa — que é a pergunta
    // que leva alguém à agenda do dia.
    return (
      <div className="mt-3">
        {/* O que é para fazer neste dia SEM hora marcada fica fora da grade,
            numa faixa só, que rola na horizontal em vez de virar duas fileiras. */}
        {planejadas.length > 0 && (
          <div className="mb-2">
            <span className="px-secao">Sem hora</span>
            <div className="no-scrollbar mt-1 flex gap-1.5 overflow-x-auto pb-0.5">
              {planejadas.map((t) => (
                <Link
                  key={t.id}
                  to={`/prototipo/tarefas/${t.id}`}
                  className="px-chip press max-w-[72vw] shrink-0 truncate"
                >
                  {t.titulo}
                </Link>
              ))}
            </div>
          </div>
        )}
        <div className="flex">
          <ColunaDeHoras px={PX_HORA_TOQUE} />
          <ColunaDoDia data={data} aoNovo={aoNovo} aoAbrir={aoAbrir} px={PX_HORA_TOQUE} />
        </div>
        <p className="mt-2 text-[11.5px] text-faint">Toque num horário vazio para criar ali.</p>
      </div>
    )
  }

  return (
    <div className="mt-4">
      <div className="flex border-y border-hairline bg-surface-2/40">
        <div className="w-[42px] flex-none py-1.5 pr-1.5 text-right">
          <span className="text-[9.5px] uppercase tracking-wider text-faint">tarefas</span>
        </div>
        <div className="min-w-0 flex-1"><FaixaPlanejadas data={data} /></div>
      </div>
      <div className="flex pt-2">
        <ColunaDeHoras />
        <ColunaDoDia data={data} aoNovo={aoNovo} aoAbrir={aoAbrir} />
      </div>
      <Legenda />
    </div>
  )
}

function ItemDia({ e, aoAbrir }) {
  const reserva = e.especie === 'reserva'
  const conteudo = (
    <>
      <span className="px-hora w-[44px] flex-none pt-0.5 text-[13px] text-muted">{e.inicio}</span>
      <span className={cx('px-especie self-stretch', reserva ? 'px-reserva' : 'px-compromisso')} />
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-medium leading-snug">{e.titulo}</span>
        <span className="px-motivo mt-0.5 block">
          {reserva ? 'Horário reservado' : 'Compromisso'} · {e.inicio}–{e.fim}
          {e.local ? ` · ${e.local}` : ''}
        </span>
      </span>
    </>
  )
  return reserva ? (
    <Link to={`/prototipo/tarefas/${e.tarefaId}`} className="px-linha px-toque">{conteudo}</Link>
  ) : (
    <button type="button" onClick={() => aoAbrir(e)} className="px-linha px-toque w-full text-left">{conteudo}</button>
  )
}

function Legenda() {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-muted">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-[3px] border border-accent/40 bg-accent-soft" /> compromisso
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="px-evento-reserva h-3 w-3 rounded-[3px] border border-dashed border-accent/40" /> horário reservado
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="px-especie px-planejada h-3 w-[3px]" /> tarefa planejada (sem hora)
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// MES — a visao que estava VAZIA.
//
// Um calendario que so mostra numeros e um ponto nao responde a pergunta que
// leva alguem ao mes: "como esta o mes?". Ele obriga a clicar dia a dia para
// descobrir, e nesse ponto a lista teria sido melhor.
//
// Cada celula agora mostra o que cabe de verdade:
//   . os compromissos do dia, por titulo, na ordem da hora;
//   . as tarefas planejadas, marcadas como outra especie (barrinha a esquerda);
//   . "+N" quando nao cabe tudo — a celula nunca finge que aquilo e o total;
//   . uma barra fina de OCUPACAO CONHECIDA, que e o que deixa o olho achar os
//     dias carregados sem ler nada.
//
// A palavra e OCUPACAO CONHECIDA, e nao "livre". O Agenda so sabe o que esta
// dentro dele; dizer "voce esta livre na quinta" seria prometer o que ele nao
// tem como saber.
// ---------------------------------------------------------------------------
const CABEM = 3

function Mes({ aoDia, desktop }) {
  const { estado } = useProto()
  const [deslocamento, setDeslocamento] = useState(0)
  const [selecionado, setSelecionado] = useState(estado.hoje)
  const base = new Date(`${estado.hoje}T12:00:00`)
  const primeiro = new Date(base.getFullYear(), base.getMonth() + deslocamento, 1)
  const inicio = inicioDaSemana(primeiro)
  const celulas = Array.from({ length: 42 }, (_, i) => iso(somarDias(inicio, i)))
  const mesAtual = primeiro.getMonth()

  // A escala da barra vem do mes inteiro: 8 horas ocupadas so parecem muito
  // perto de um dia de 1 hora.
  const maior = Math.max(60, ...celulas.map((d) => ocupacaoDoDia(estado, d)))

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setDeslocamento((x) => x - 1)} aria-label="Mês anterior" className="press grid h-7 w-7 place-items-center rounded-[7px] text-muted hover:bg-surface-2 hover:text-primary">
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-[140px] text-center text-[13.5px] font-semibold">
            {capitalizar(MESES[mesAtual])} de {primeiro.getFullYear()}
          </span>
          <button type="button" onClick={() => setDeslocamento((x) => x + 1)} aria-label="Próximo mês" className="press grid h-7 w-7 place-items-center rounded-[7px] text-muted hover:bg-surface-2 hover:text-primary">
            <ChevronRight size={16} />
          </button>
        </div>
        {desktop && <span className="px-motivo">Barra = ocupação conhecida pelo Agenda</span>}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map((d) => (
          <span key={d} className="px-secao pb-1 text-center">{d}</span>
        ))}
        {celulas.map((d) => {
          const doMes = new Date(`${d}T12:00:00`).getMonth() === mesAtual
          const eventos = agendaDoDia(estado, d)
          const planejadas = planejadasDoDia(estado, d)
          const itens = [
            ...eventos.map((e) => ({ chave: e.id, texto: e.titulo, hora: e.inicio, especie: e.especie })),
            ...planejadas.map((t) => ({ chave: t.id, texto: t.titulo, especie: 'tarefa' })),
          ]
          // No telefone cabe menos: mostrar duas linhas e "+N" e mais honesto
          // do que espremer quatro ate ninguem conseguir ler.
          const limite = desktop ? CABEM : 2
          const visiveis = itens.slice(0, limite)
          const sobrando = itens.length - visiveis.length
          const ocupacao = ocupacaoDoDia(estado, d)

          return (
            <button
              key={d}
              type="button"
              onClick={() => (desktop ? aoDia(d) : setSelecionado(d))}
              aria-label={`${numeroDoDia(d)} — ${itens.length} ${itens.length === 1 ? 'item' : 'itens'}`}
              aria-pressed={!desktop ? d === selecionado : undefined}
              className={cx(
                'px-mes-celula press',
                // Célula curta: o mês é orientação, e o conteúdo do dia
                // aparece logo abaixo. Uma grade que toma a tela inteira
                // empurra justamente a resposta para fora do viewport.
                !desktop && 'px-mes-compacto gap-0 px-1 py-0.5',
                !doMes && 'px-mes-fora',
                d === estado.hoje && 'px-mes-hoje',
                !desktop && d === selecionado && d !== estado.hoje && 'border-accent',
              )}
            >
              <span className="flex items-baseline justify-between gap-1">
                <span className={cx('px-hora text-[12.5px]', !doMes && 'text-faint', d === estado.hoje && 'font-semibold text-accent-text')}>
                  {numeroDoDia(d)}
                </span>
                {itens.length > 0 && doMes && desktop && (
                  <span className="text-[9.5px] text-faint">{itens.length}</span>
                )}
              </span>

              {doMes && ocupacao > 0 && (
                <span className="px-ocupacao" style={{ width: `${Math.min(100, (ocupacao / maior) * 100)}%` }} aria-hidden="true" />
              )}

              {/* No telefone o título NÃO cabe numa célula de 48px: espremê-lo
                  até caber é o jeito de tornar ilegíveis as duas coisas. Aqui o
                  mês serve para ORIENTAR e ESCOLHER — o conteúdo do dia aparece
                  inteiro logo abaixo, na mesma tela. */}
              {doMes && desktop && visiveis.map((i) => (
                <span key={i.chave} className={cx('px-mes-item', i.especie !== 'compromisso' && 'px-mes-tarefa')}>
                  {i.hora ? <span className="px-hora">{i.hora} </span> : null}{i.texto}
                </span>
              ))}

              {doMes && desktop && sobrando > 0 && (
                <span className="px-motivo px-0.5 text-[10px]">+{sobrando}</span>
              )}

              {doMes && !desktop && itens.length > 0 && (
                <span className="mt-auto flex items-center gap-[3px] pb-0.5">
                  {eventos.slice(0, 3).map((e) => (
                    <span key={e.id} className="h-[5px] w-[5px] rounded-full bg-accent" />
                  ))}
                  {planejadas.length > 0 && <span className="h-[5px] w-[5px] rounded-full bg-hairline" />}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Tocar num dia revela a agenda dele AQUI. Obrigar a navegar para outra
          página só para descobrir o que tem no dia 17 é o que faz um calendário
          parecer um índice em vez de uma agenda. */}
      {!desktop && <ResumoDoDia data={selecionado} aoAbrir={() => aoDia(selecionado)} />}
    </div>
  )
}

function ResumoDoDia({ data, aoAbrir }) {
  const { estado } = useProto()
  const eventos = agendaDoDia(estado, data)
  const planejadas = planejadasDoDia(estado, data)

  return (
    <section className="mt-4 border-t border-hairline pt-3">
      <header className="mb-1 flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold">
          {numeroDoDia(data)} de {mesDe(data)}
          <span className="ml-1.5 text-[12.5px] font-normal text-muted">{nomeDoDia(data)}</span>
        </h2>
        <button type="button" onClick={aoAbrir} className="press text-[12.5px] font-semibold text-accent-text">
          Abrir dia
        </button>
      </header>

      {eventos.length === 0 && planejadas.length === 0 && (
        <p className="py-3 text-[13.5px] text-muted">Nada marcado neste dia.</p>
      )}

      {eventos.map((e) => (
        <div key={e.id} className="px-linha items-baseline gap-2.5 py-1.5">
          <span className="px-hora w-[42px] flex-none text-[12.5px] text-muted">{e.inicio}</span>
          <span className={cx('px-especie self-stretch', e.especie === 'reserva' ? 'px-reserva' : 'px-compromisso')} />
          <span className="min-w-0 flex-1 truncate text-[14px]">{e.titulo}</span>
        </div>
      ))}

      {planejadas.map((t) => (
        <div key={t.id} className="px-linha items-baseline gap-2.5 py-1.5">
          <span className="px-hora w-[42px] flex-none text-[12.5px] text-faint">—</span>
          <span className="px-especie px-planejada self-stretch" />
          <span className="min-w-0 flex-1 truncate text-[14px] text-secondary">{t.titulo}</span>
        </div>
      ))}
    </section>
  )
}

// ---------------------------------------------------------------------------
// SEMANA NO TELEFONE — sete colunas não cabem, e reduzir a fonte até caber é
// resolver o layout destruindo a leitura. A semana vira uma sequência de dias:
// cada um com sua faixa, seus eventos legíveis e a ocupação à vista. Continua
// sendo a SEMANA — dá para varrer os sete dias num scroll — sem fingir que um
// título cabe em 40px de largura.
// ---------------------------------------------------------------------------
function SemanaSequencial({ dias, aoAbrir, aoDia }) {
  const { estado } = useProto()
  return (
    <div className="mt-3">
      {dias.map((d) => {
        const eventos = agendaDoDia(estado, d)
        const planejadas = planejadasDoDia(estado, d)
        const ocupado = ocupacaoDoDia(estado, d)
        const hoje = d === estado.hoje
        return (
          <section key={d} className="border-t border-hairline py-2.5 first:border-t-0">
            <header className="mb-1 flex items-baseline gap-2">
              <button
                type="button"
                onClick={() => aoDia(d)}
                className={cx('press flex items-baseline gap-1.5', hoje && 'text-accent-text')}
              >
                <span className="px-secao">{diaCurto(d)}</span>
                <span className={cx('px-hora text-[15px]', hoje && 'font-semibold')}>{numeroDoDia(d)}</span>
              </button>
              {ocupado > 0 ? (
                <span className="px-motivo">
                  {Math.round((ocupado / 60) * 10) / 10} h ocupadas
                </span>
              ) : (
                <span className="px-motivo text-faint">nada marcado</span>
              )}
              {conflitosDoDia(estado, d).length > 0 && (
                <AlertTriangle size={13} className="text-warning" />
              )}
            </header>

            {eventos.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => (e.especie === 'compromisso' ? aoAbrir(e) : aoDia(d))}
                className="px-linha px-toque w-full items-baseline gap-2.5 py-1.5 text-left"
              >
                <span className="px-hora w-[84px] flex-none whitespace-nowrap text-[12px] text-muted">{e.inicio}–{e.fim}</span>
                <span className={cx('px-especie self-stretch', e.especie === 'reserva' ? 'px-reserva' : 'px-compromisso')} />
                <span className="min-w-0 flex-1 text-[14px] leading-snug">{e.titulo}</span>
              </button>
            ))}

            {planejadas.map((t) => (
              <Link
                key={t.id}
                to={`/prototipo/tarefas/${t.id}`}
                className="px-linha px-toque items-baseline gap-2.5 py-1.5"
              >
                <span className="px-hora w-[84px] flex-none whitespace-nowrap text-[12px] text-faint">sem hora</span>
                <span className="px-especie px-planejada self-stretch" />
                <span className="min-w-0 flex-1 text-[14px] leading-snug text-secondary">{t.titulo}</span>
              </Link>
            ))}
          </section>
        )
      })}
      <Legenda />
    </div>
  )
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const mesDe = (data) => MESES[new Date(`${data}T12:00:00`).getMonth()]
const capitalizar = (s) => s.charAt(0).toUpperCase() + s.slice(1)
