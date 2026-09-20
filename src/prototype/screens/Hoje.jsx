import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { Check, CalendarClock, Bell, CornerUpRight, ChevronRight, CornerDownLeft, Ban, Clock3 } from 'lucide-react'
import { useProto, useAcoes, useDesktop } from '../store/contexto'
import { paraHoje, atrasadas, porOrganizar, agendaDoDia, planejadasDoDia, decisoes, MOTIVO } from '../store/reducer'
import { ESTADO, RESPONSABILIDADE, rotuloDeData, somarDias, iso, nomeDoDia, numeroDoDia, mesCurto, AGORA_DEMO, emMinutos, saudacao } from '../mock/dados'
import { Vazio, Botao } from '../parts/base'
import { Sanfona } from '../parts/movel'
import { alertaCurto } from '../mock/alerta'
import TarefaForm from '../forms/TarefaForm'
import { cx } from '../../lib/utils'

// ---------------------------------------------------------------------------
// HOJE — "o Agenda entendeu meu dia".
//
// UX1.1.1 trabalhou COMPOSIÇÃO, não conteúdo novo. O que já existia passou a
// caber melhor:
//
//   AGORA / PRÓXIMO   uma faixa compacta com a contagem real ("em 20 min") e
//                     as ações que cabem naquele instante;
//   MEU DIA           a linha do tempo do dia — compromissos, horários
//                     reservados e o que foi escolhido para hoje, na ordem em
//                     que vão acontecer. Não é uma segunda Agenda: é a leitura
//                     ordenada do que já existe;
//   PRIORIDADES       o punhado de itens que merece decisão, com o MOTIVO de
//                     estar ali;
//   POR ORGANIZAR     uma linha, não uma seção.
//
// Densidade veio de linhas mais informativas e de menos ar entre elas — não de
// widgets. Cada linha diz o suficiente para decidir sem abrir nada.
// ---------------------------------------------------------------------------
export default function Hoje() {
  const { estado } = useProto()
  const acoes = useAcoes()
  const desktop = useDesktop()
  const navegar = useNavigate()
  const [sugestao, setSugestao] = useState(true)
  const [form, setForm] = useState(null)

  const agenda = agendaDoDia(estado, estado.hoje)
  const agora = AGORA_DEMO
  const emCurso = agenda.find((e) => e.inicio <= agora && e.fim > agora)
  const proximo = agenda.find((e) => e.inicio > agora)
  const destaque = emCurso || proximo
  const faltam = destaque && !emCurso ? emMinutos(destaque.inicio) - emMinutos(agora) : null

  const tarefas = paraHoje(estado)
  const vencidas = atrasadas(estado).filter((t) => !tarefas.some((x) => x.id === t.id))
  const soltas = porOrganizar(estado)
  // O que a DELEGAÇÃO devolve para mim. Uma tarefa que está com outra pessoa e
  // andando não é assunto meu hoje; uma que voltou, travou ou está com prazo em
  // cima, é. Por isso Hoje continua sendo seleção, e não "tudo que existe".
  const decisao = decisoes(estado)

  // UX1.2.1 — a sugestão do Copiloto deixa de ser um bloco separado e passa a
  // ser um dado ligado ao item que ela propõe. No telefone ela aparece embaixo
  // da própria tarefa; no desktop continua onde estava.
  const sugestaoContextual = sugestao
    ? {
        alvo: 't-repasse',
        texto: 'Você tem 40 min livres antes da reunião. Adiantar o fechamento do repasse?',
        curta: 'Você tem 40 min livres antes da reunião.',
        rotulo: 'Reservar',
        aceitar: () => { acoes.reservarHorario('t-repasse', estado.hoje, '08:45', '09:00'); setSugestao(false) },
        dispensar: () => setSugestao(false),
      }
    : null

  // Uma decisão que já está travada aparece inteira; o resto fica atrás de uma
  // linha. "3 decisões precisam de você" é uma linha; três cartões são meia
  // tela antes do conteúdo.
  const urgente = decisao.find((t) => t.motivoDecisao?.startsWith('Devolvida')) || decisao[0] || null
  const demais = decisao.filter((t) => t.id !== urgente?.id)
  const amanha = iso(somarDias(new Date(`${estado.hoje}T12:00:00`), 1))
  const concluidasHoje = estado.tarefas.filter(
    (t) => t.estado === ESTADO.FEITO && t.planejadaPara === estado.hoje,
  )

  // MEU DIA: tudo que tem hora, mais o que foi escolhido sem hora, em ordem.
  const comHora = agenda.map((e) => ({ ...e, ordem: e.inicio }))
  const semHora = planejadasDoDia(estado, estado.hoje)
    .filter((t) => !tarefas.some((x) => x.id === t.id && x.reserva))
    .filter((t) => !t.reserva)
    .map((t) => ({ id: `p-${t.id}`, tarefaId: t.id, titulo: t.titulo, especie: 'tarefa', tarefa: t, ordem: '99:99' }))
  const meuDia = [...comHora, ...semHora].sort((a, b) => a.ordem.localeCompare(b.ordem))

  return (
    <div className="px-entra">
      {/* A personalidade do produto atual volta — e ela cabe numa linha. Um
          cabeçalho que cumprimenta e diz a data não precisa de mais que isso, e
          os quatro cards de contagem continuam fora: eles diziam QUANTOS, e a
          pergunta desta tela é QUAIS. */}
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h1 className={cx('px-titulo-tela', !desktop && 'text-[21px]')}>
          {saudacao(AGORA_DEMO)}, {estado.pessoa}
        </h1>
        <p className="text-[12.5px] text-muted lg:text-[13px]">
          <span className="capitalize">{nomeDoDia(estado.hoje)}</span>, {numeroDoDia(estado.hoje)} de {mesCurto(estado.hoje)}
          <span className="text-faint"> · {AGORA_DEMO}</span>
        </p>
      </header>

      {/* AGORA / PRÓXIMO ---------------------------------------------------- */}
      {destaque && (!desktop ? (
        // No telefone o título é a informação, e ele precisa da largura toda.
        // Hora e contagem cabem numa linha fina acima; a ação vira um link
        // curto na mesma linha, em vez de um botão disputando espaço.
        <Link
          to={destaque.especie === 'reserva' ? `/prototipo/tarefas/${destaque.tarefaId}` : '/prototipo/agenda'}
          className="press mt-3 block rounded-row border border-accent/30 bg-accent-soft/45 px-3.5 py-2.5"
        >
          <span className="flex items-baseline gap-2">
            <span className="px-hora text-[17px] font-semibold leading-none">{destaque.inicio}</span>
            <span className="px-motivo text-accent-text">
              {emCurso ? 'acontecendo agora' : faltam <= 90 ? `em ${faltam} min` : `às ${destaque.inicio}`}
            </span>
            <span className="px-motivo ml-auto">até {destaque.fim}</span>
          </span>
          <span className="mt-1 block text-[15px] font-semibold leading-snug">{destaque.titulo}</span>
          {(destaque.local || destaque.especie === 'reserva') && (
            <span className="px-motivo mt-0.5 block">
              {destaque.local}
              {destaque.especie === 'reserva' ? 'horário reservado' : ''}
            </span>
          )}
        </Link>
      ) : (
        <div className="mt-3 flex items-center gap-3 rounded-row border border-accent/30 bg-accent-soft/45 px-3.5 py-2.5">
          <span className="px-hora flex-none text-[19px] font-semibold leading-none">{destaque.inicio}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14.5px] font-semibold leading-tight">{destaque.titulo}</p>
            <p className="px-motivo mt-0.5">
              {emCurso ? 'acontecendo agora' : faltam <= 90 ? `em ${faltam} min` : `às ${destaque.inicio}`}
              {' · '}até {destaque.fim}
              {destaque.local ? ` · ${destaque.local}` : ''}
              {destaque.especie === 'reserva' ? ' · horário reservado' : ''}
            </p>
          </div>
          <Link
            to={destaque.especie === 'reserva' ? `/prototipo/tarefas/${destaque.tarefaId}` : '/prototipo/agenda'}
            className="press shrink-0 rounded-control border border-hairline bg-surface px-2.5 py-1.5 text-[12.5px] font-semibold text-accent-text transition hover:border-accent"
          >
            {destaque.especie === 'reserva' ? 'Abrir tarefa' : 'Ver na agenda'}
          </Link>
        </div>
      ))}

      {!desktop ? (
        // ------------------------------------------------------------------
        // TELEFONE — o primeiro viewport responde "o que acontece agora?" e
        // "qual é a próxima coisa importante?". Meu dia vem inteiro porque é o
        // conteúdo; decisões vêm por uma linha, com a mais travada à mostra.
        // ------------------------------------------------------------------
        <>
          <section className="mt-4">
            <header className="mb-1 flex items-center justify-between">
              <h2 className="px-secao">Meu dia</h2>
              <Link to="/prototipo/agenda" className="press text-[12px] font-semibold text-accent-text">
                Agenda
              </Link>
            </header>

            {meuDia.length === 0 && <Vazio>Dia livre.</Vazio>}
            {meuDia.map((item) => (
              <LinhaComSugestao
                key={item.id}
                item={item}
                agora={agora}
                sugestao={sugestaoContextual?.alvo === item.tarefaId ? sugestaoContextual : null}
                aoAbrir={(id) => navegar(`/prototipo/tarefas/${id}`)}
                aoConcluir={(id) => acoes.mudarEstado(id, ESTADO.FEITO)}
              />
            ))}

            {concluidasHoje.length > 0 && (
              <details className="group mt-1">
                <summary className="px-motivo flex cursor-pointer list-none items-center gap-1.5 py-2 marker:hidden">
                  <Check size={12} className="text-positive" />
                  {concluidasHoje.length} {concluidasHoje.length === 1 ? 'concluída' : 'concluídas'} hoje
                  <ChevronRight size={12} className="transition group-open:rotate-90" />
                </summary>
                <div className="opacity-60">
                  {concluidasHoje.map((t) => (
                    <div key={t.id} className="px-linha items-center gap-2.5 py-1.5">
                      <span className="flex-1 truncate text-[13.5px] line-through">{t.titulo}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </section>

          {/* DECISÕES — uma linha, e só abre quem quiser. */}
          {decisao.length > 0 && (
            <>
              {urgente && (
                <div className="mt-4">
                  <h2 className="px-secao mb-1">Precisa de você</h2>
                  <LinhaDecisao t={urgente} estado={estado} acoes={acoes} navegar={navegar} />
                </div>
              )}
              {demais.length > 0 && (
                <Sanfona
                  contagem={demais.length}
                  titulo={demais.length === 1 ? 'outra decisão esperando' : 'outras decisões esperando'}
                  tom="atencao"
                >
                  {demais.map((t) => (
                    <LinhaDecisao key={t.id} t={t} estado={estado} acoes={acoes} navegar={navegar} />
                  ))}
                </Sanfona>
              )}
            </>
          )}

          {/* PRIORIDADES do dia — também atrás de uma linha: são tarefas que já
              estão em Meu dia, e repeti-las abertas era metade do amontoado. */}
          {(tarefas.length > 0 || vencidas.length > 0) && (
            <Sanfona
              contagem={tarefas.length + vencidas.length}
              titulo="prioridades de hoje"
              detalhe={vencidas.length ? `${vencidas.length} com prazo vencido` : null}
            >
              {vencidas.map((t) => (
                <LinhaPrioridade
                  key={t.id}
                  t={t}
                  motivo={MOTIVO.ATRASADA}
                  detalhe={`prazo ${rotuloDeData(t.prazo, estado.hoje)}`}
                  aviso
                  aoConcluir={() => acoes.mudarEstado(t.id, ESTADO.FEITO)}
                  aoReagendar={() => acoes.escolherParaHoje(t.id, true)}
                  rotuloReagendar="Fazer hoje"
                  aoAbrir={() => navegar(`/prototipo/tarefas/${t.id}`)}
                />
              ))}
              {tarefas.map((t) => (
                <LinhaPrioridade
                  key={t.id}
                  t={t}
                  motivo={t.motivo}
                  detalhe={t.reserva ? `${t.reserva.inicio}–${t.reserva.fim}` : t.contexto}
                  aoConcluir={() => acoes.mudarEstado(t.id, ESTADO.FEITO)}
                  aoReagendar={() => acoes.reagendar(t.id, amanha)}
                  aoAbrir={() => navegar(`/prototipo/tarefas/${t.id}`)}
                />
              ))}
              <Botao
                variante="secundario"
                className="mt-2 w-full"
                onClick={() => setForm({ estado: ESTADO.A_FAZER, planejadaPara: estado.hoje })}
              >
                Nova tarefa para hoje
              </Botao>
            </Sanfona>
          )}

          {soltas.length > 0 && (
            <Link
              to="/prototipo/memoria?filtro=por-organizar"
              className="press mt-3 flex items-center justify-between rounded-row border border-hairline px-3.5 py-2.5 text-[13.5px]"
            >
              <span>Por organizar <span className="text-muted">· {soltas.length}</span></span>
              <ChevronRight size={15} className="text-muted" />
            </Link>
          )}
        </>
      ) : (
      <div className="mt-5 gap-x-8 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        {/* MEU DIA ---------------------------------------------------------- */}
        <section>
          <header className="mb-1.5 flex items-center justify-between">
            <h2 className="px-secao">Meu dia</h2>
            <Link to="/prototipo/agenda" className="press text-[12px] font-semibold text-accent-text hover:underline">
              Agenda
            </Link>
          </header>

          {meuDia.length === 0 && <Vazio>Dia livre.</Vazio>}
          {meuDia.map((item) => (
            <ItemDoDia
              key={item.id}
              item={item}
              agora={agora}
              aoAbrir={(id) => navegar(`/prototipo/tarefas/${id}`)}
              aoConcluir={(id) => acoes.mudarEstado(id, ESTADO.FEITO)}
            />
          ))}

          {/* O que já saiu hoje. Não é métrica: é a outra metade do dia, e sem
              ela a tela conta só o que falta. Fechada por padrão. */}
          {concluidasHoje.length > 0 && (
            <details className="group mt-1.5">
              <summary className="px-motivo flex cursor-pointer list-none items-center gap-1.5 py-1.5 marker:hidden hover:text-secondary">
                <Check size={12} className="text-positive" />
                {concluidasHoje.length} {concluidasHoje.length === 1 ? 'concluída' : 'concluídas'} hoje
                <ChevronRight size={12} className="transition group-open:rotate-90" />
              </summary>
              <div className="opacity-60">
                {concluidasHoje.map((t) => (
                  <div key={t.id} className="px-linha items-center gap-2.5 py-1.5">
                    <span className="px-hora w-[42px] flex-none text-[12px] text-faint">—</span>
                    <span className="flex-1 truncate text-[13.5px] line-through">{t.titulo}</span>
                    {t.contexto && <span className="px-motivo flex-none">{t.contexto}</span>}
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* A sugestão fica junto do que ela propõe, curta, sem faixa própria. */}
          {sugestao && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-row border border-dashed border-accent/40 px-3 py-2">
              <span className="text-[12.5px] leading-snug text-secondary">
                Você tem 40 min livres antes da reunião. Adiantar o fechamento do repasse?
              </span>
              <span className="ml-auto flex shrink-0 gap-1.5">
                <Botao
                  variante="secundario"
                  className="px-2.5 py-1 text-[12.5px]"
                  onClick={() => { acoes.reservarHorario('t-repasse', estado.hoje, '08:45', '09:00'); setSugestao(false) }}
                >
                  Reservar
                </Botao>
                <Botao variante="fantasma" className="px-2 py-1 text-[12.5px]" onClick={() => setSugestao(false)}>
                  Agora não
                </Botao>
              </span>
            </div>
          )}
        </section>

        {/* PRIORIDADES + POR ORGANIZAR --------------------------------------- */}
        <section className="mt-7 lg:mt-0">
          <header className="mb-1.5 flex items-center justify-between">
            <h2 className="px-secao">Decisões e prioridades</h2>
            <Botao
              variante="fantasma"
              className="px-2 py-0.5 text-[12px]"
              onClick={() => setForm({ estado: ESTADO.A_FAZER, planejadaPara: estado.hoje })}
            >
              Nova tarefa
            </Botao>
          </header>

          {tarefas.length === 0 && vencidas.length === 0 && decisao.length === 0 && (
            <Vazio>Nada exigindo decisão.</Vazio>
          )}

          {/* DECISÕES primeiro: são as únicas linhas que estão paradas
              esperando por mim. */}
          {decisao.map((t) => (
            <LinhaDecisao key={`d-${t.id}`} t={t} estado={estado} acoes={acoes} navegar={navegar} />
          ))}

          {vencidas.map((t) => (
            <LinhaPrioridade
              key={t.id}
              t={t}
              motivo={MOTIVO.ATRASADA}
              detalhe={`prazo ${rotuloDeData(t.prazo, estado.hoje)}`}
              aviso
              aoConcluir={() => acoes.mudarEstado(t.id, ESTADO.FEITO)}
              aoReagendar={() => acoes.escolherParaHoje(t.id, true)}
              rotuloReagendar="Fazer hoje"
              aoAbrir={() => navegar(`/prototipo/tarefas/${t.id}`)}
            />
          ))}

          {tarefas.map((t) => (
            <LinhaPrioridade
              key={t.id}
              t={t}
              motivo={t.motivo}
              detalhe={t.reserva ? `${t.reserva.inicio}–${t.reserva.fim}` : t.contexto}
              aoConcluir={() => acoes.mudarEstado(t.id, ESTADO.FEITO)}
              aoReagendar={() => acoes.reagendar(t.id, amanha)}
              aoAbrir={() => navegar(`/prototipo/tarefas/${t.id}`)}
            />
          ))}

          {soltas.length > 0 && (
            <Link
              to="/prototipo/memoria?filtro=por-organizar"
              className="press mt-3 flex items-center justify-between rounded-row border border-hairline px-3 py-2 text-[13px] transition hover:border-accent hover:bg-surface-2"
            >
              <span>Por organizar <span className="text-muted">· {soltas.length}</span></span>
              <ChevronRight size={14} className="text-muted" />
            </Link>
          )}
        </section>
      </div>

      )}

      <TarefaForm aberta={Boolean(form)} aoFechar={() => setForm(null)} padroes={form || {}} />
    </div>
  )
}

// Uma linha do dia: hora à esquerda, espécie na barra, ação à direita quando faz
// sentido. Compromisso não se conclui — tarefa sim.
function ItemDoDia({ item, agora, aoAbrir, aoConcluir }) {
  const desktop = useDesktop()
  const passou = item.ordem !== '99:99' && item.fim && item.fim <= agora
  const tarefa = item.especie === 'tarefa' || item.especie === 'reserva'
  const id = item.tarefaId

  return (
    <div className={cx('px-linha px-toque items-center gap-2.5 py-2', passou && 'opacity-55')}>
      <span className="px-hora w-[42px] flex-none text-[12.5px] text-muted">
        {item.ordem === '99:99' ? '—' : item.inicio}
      </span>
      <span
        className={cx(
          'px-especie h-7 self-center',
          item.especie === 'compromisso' ? 'px-compromisso' : item.especie === 'reserva' ? 'px-reserva' : 'px-planejada',
        )}
      />
      <button
        type="button"
        onClick={() => (tarefa ? aoAbrir(id) : null)}
        className={cx('min-w-0 flex-1 text-left', !tarefa && 'cursor-default')}
      >
        <span className="block truncate text-[14px] leading-snug">{item.titulo}</span>
        <span className="px-motivo mt-0.5 flex flex-wrap items-center gap-x-2">
          {item.especie === 'compromisso' && (
            <>
              <span>{item.inicio}–{item.fim}</span>
              {item.local && <span>{item.local}</span>}
              {item.alerta && (
                <span className="inline-flex items-center gap-0.5"><Bell size={10} /> {alertaCurto(item.alerta)}</span>
              )}
            </>
          )}
          {item.especie === 'reserva' && <span className="text-accent-text">horário reservado · {item.inicio}–{item.fim}</span>}
          {item.especie === 'tarefa' && (
            <>
              {/* "escolhida para hoje" dentro de MEU DIA é a seção se repetindo:
                  no telefone ela sai e sobra o que decide. */}
              {desktop && <span>escolhida para hoje</span>}
              {item.tarefa.contexto && <span>{item.tarefa.contexto}</span>}
              {item.tarefa.prioridade === 'alta' && (
                <span className="text-danger">{desktop ? 'alta' : 'Alta'}</span>
              )}
            </>
          )}
        </span>
      </button>
      {tarefa && (
        <button
          type="button"
          onClick={() => aoConcluir(id)}
          aria-label="Concluir"
          className="press flex-none rounded-[7px] px-2 py-1 text-[12px] text-muted transition hover:bg-surface-2 hover:text-positive"
        >
          Concluir
        </button>
      )}
    </div>
  )
}

// A linha do dia com a sugestão do Copiloto PRESA nela. Uma sugestão sobre o
// repasse flutuando no fim da tela obriga a reconstruir mentalmente de que item
// ela falava; aqui ela está embaixo do item, e a ação cabe na mesma linha.
function LinhaComSugestao({ item, agora, aoAbrir, aoConcluir, sugestao }) {
  return (
    <div>
      <ItemDoDia item={item} agora={agora} aoAbrir={aoAbrir} aoConcluir={aoConcluir} />
      {sugestao && (
        <div className="px-entra -mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 pb-2 pl-[54px]">
          <span className="text-[12.5px] leading-snug text-secondary">{sugestao.curta}</span>
          <button
            type="button"
            onClick={sugestao.aceitar}
            className="press rounded-[7px] border border-accent/45 px-2 py-0.5 text-[12px] font-semibold text-accent-text"
          >
            {sugestao.rotulo}
          </button>
          <button type="button" onClick={sugestao.dispensar} className="press px-1 text-[12px] text-muted">
            dispensar
          </button>
        </div>
      )}
    </div>
  )
}

// Uma decisão pendente traz consigo o porquê e a resposta mais provável. Sem o
// motivo, a linha seria só mais uma tarefa numa lista — e o que a torna urgente
// é justamente a razão pela qual ela voltou.
function LinhaDecisao({ t, estado, acoes, navegar }) {
  const pessoa = estado.pessoas?.find((p) => p.id === t.responsavelId)
  const devolvida = t.responsabilidade === RESPONSABILIDADE.DEVOLVIDA
  const aguardandoMeuAceite =
    t.responsabilidade === RESPONSABILIDADE.AGUARDANDO && t.responsavelId === estado.pessoas?.find((p) => p.eu)?.id
  const Icone = devolvida ? CornerDownLeft : t.bloqueio ? Ban : Clock3

  return (
    <div className="px-linha px-toque items-start gap-2.5 py-2">
      <Icone size={15} className="mt-1 flex-none text-warning" />
      <button type="button" onClick={() => navegar(`/prototipo/tarefas/${t.id}`)} className="min-w-0 flex-1 text-left">
        <span className="block text-[14px] leading-snug">{t.titulo}</span>
        <span className="px-motivo mt-0.5 flex flex-wrap items-center gap-x-2">
          <span className="font-medium text-warning">{t.motivoDecisao}</span>
          {pessoa && !pessoa.eu && <span>com {pessoa.nome}</span>}
          {t.prazo && <span>prazo {rotuloDeData(t.prazo, estado.hoje)}</span>}
        </span>
        {t.motivoDevolucao && devolvida && (
          <span className="mt-1 block text-[12.5px] leading-snug text-secondary">“{t.motivoDevolucao}”</span>
        )}
      </button>
      {aguardandoMeuAceite ? (
        <button
          type="button"
          onClick={() => acoes.aceitar(t.id)}
          className="press mt-0.5 flex-none rounded-[7px] border border-hairline px-2 py-1 text-[12px] font-semibold text-accent-text transition hover:border-accent"
        >
          Aceitar
        </button>
      ) : devolvida ? (
        <button
          type="button"
          onClick={() => acoes.escolherParaHoje(t.id, true)}
          className="press mt-0.5 flex-none rounded-[7px] px-2 py-1 text-[12px] text-muted transition hover:bg-surface-2 hover:text-accent-text"
        >
          Fazer hoje
        </button>
      ) : (
        <button
          type="button"
          onClick={() => navegar(`/prototipo/tarefas/${t.id}`)}
          className="press mt-0.5 flex-none rounded-[7px] px-2 py-1 text-[12px] text-muted transition hover:bg-surface-2 hover:text-accent-text"
        >
          Abrir
        </button>
      )}
    </div>
  )
}

function LinhaPrioridade({ t, motivo, detalhe, aviso, aoConcluir, aoReagendar, rotuloReagendar = 'Adiar', aoAbrir }) {
  return (
    <div className="px-linha px-toque items-start gap-2.5 py-2">
      <button
        type="button"
        onClick={aoConcluir}
        aria-label={`Concluir ${t.titulo}`}
        className="press mt-0.5 grid h-[18px] w-[18px] flex-none place-items-center rounded-[6px] border border-hairline text-transparent transition hover:border-accent hover:text-accent-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        <Check size={11} />
      </button>

      <button type="button" onClick={aoAbrir} className="min-w-0 flex-1 text-left">
        <span className="block text-[14px] leading-snug">{t.titulo}</span>
        <span className="px-motivo mt-0.5 flex flex-wrap items-center gap-x-2">
          <span className={cx(aviso && 'font-medium text-warning')}>{motivo}</span>
          {detalhe && (
            <span className={cx('inline-flex items-center gap-1', t.reserva && 'text-accent-text')}>
              {t.reserva && <CalendarClock size={11} />}
              {detalhe}
            </span>
          )}
          {t.prioridade === 'alta' && !aviso && <span className="text-danger">alta</span>}
          {t.estado === ESTADO.FAZENDO && <span>em andamento</span>}
          {t.origemId && <CornerUpRight size={11} className="text-accent-text" />}
        </span>
      </button>

      <button
        type="button"
        onClick={aoReagendar}
        className="press mt-0.5 flex-none rounded-[7px] px-2 py-1 text-[12px] text-muted transition hover:bg-surface-2 hover:text-accent-text"
      >
        {rotuloReagendar}
      </button>
    </div>
  )
}
