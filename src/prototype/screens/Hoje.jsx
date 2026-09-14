import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { Check, CalendarClock, ChevronRight } from 'lucide-react'
import { useProto, useAcoes } from '../store/contexto'
import { paraHoje, atrasadas, porOrganizar, agendaDoDia, MOTIVO } from '../store/reducer'
import { ESTADO, rotuloDeData, somarDias, iso, nomeDoDia, numeroDoDia, AGORA_DEMO } from '../mock/dados'
import { Secao, Vazio, Botao } from '../parts/base'
import TarefaForm from '../forms/TarefaForm'
import { cx } from '../../lib/utils'

// ---------------------------------------------------------------------------
// HOJE — centro operacional, com o trabalho perto da abertura.
//
// O UX1 abria com uma capa: saudação em corpo enorme, muito ar, e as tarefas
// do dia empurradas para baixo da dobra. Cabeçalho agora é uma linha; o
// próximo compromisso tem destaque, mas destaque não é capa.
//
// Hoje continua sendo SELEÇÃO: cada item mostra por que está aqui, e tarefa
// sem dia não aparece. E as ações frequentes — concluir, reagendar, abrir —
// estão à vista, com palavra, não escondidas atrás de um ícone cinza.
// ---------------------------------------------------------------------------
export default function Hoje() {
  const { estado } = useProto()
  const acoes = useAcoes()
  const navegar = useNavigate()
  const [sugestao, setSugestao] = useState(true)
  const [form, setForm] = useState(null)

  const agenda = agendaDoDia(estado, estado.hoje)
  const agora = AGORA_DEMO
  const emCurso = agenda.find((e) => e.inicio <= agora && e.fim > agora)
  const proximo = agenda.find((e) => e.inicio > agora)
  const destaque = emCurso || proximo
  const restantes = agenda.filter((e) => e !== destaque && e.fim > agora)
  const tarefas = paraHoje(estado)
  const vencidas = atrasadas(estado).filter((t) => !tarefas.some((x) => x.id === t.id))
  const soltas = porOrganizar(estado)
  const amanha = iso(somarDias(new Date(`${estado.hoje}T12:00:00`), 1))

  return (
    <div className="px-entra">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h1 className="px-titulo-tela">Hoje</h1>
        <p className="text-[13px] text-muted">
          {capitalizar(nomeDoDia(estado.hoje))}, {numeroDoDia(estado.hoje)} · bom dia, {estado.pessoa}
        </p>
      </header>

      {/* AGORA / A SEGUIR — destaque, não capa. */}
      {destaque && (
        <div className="px-painel mt-4 p-3.5">
          <div className="flex items-start gap-3">
            <span className="px-hora w-[52px] flex-none text-[20px] font-semibold leading-none">
              {destaque.inicio}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold leading-snug">{destaque.titulo}</p>
              <p className="px-motivo mt-0.5">
                {emCurso ? 'Agora' : 'A seguir'} · {destaque.especie === 'reserva' ? 'horário reservado' : 'compromisso'}
                {destaque.local ? ` · ${destaque.local}` : ''} · até {destaque.fim}
              </p>
            </div>
            <Link to="/prototipo/agenda" className="press flex-none text-[12.5px] font-semibold text-accent-text hover:underline">
              Agenda
            </Link>
          </div>

          {restantes.length > 0 && (
            <div className="mt-2.5 space-y-0.5 border-t border-hairline pt-2.5">
              {restantes.map((e) => (
                <div key={e.id} className="flex items-baseline gap-3">
                  <span className="px-hora w-[52px] flex-none text-[12.5px] text-muted">{e.inicio}</span>
                  <span className="truncate text-[13.5px] text-secondary">{e.titulo}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* PARA HOJE — logo abaixo, com ação visível em cada linha. */}
      <Secao
        titulo="Para hoje"
        acao={
          <Botao variante="fantasma" className="px-2 py-1" onClick={() => setForm({ estado: ESTADO.A_FAZER, planejadaPara: estado.hoje })}>
            Nova tarefa
          </Botao>
        }
      >
        {tarefas.length === 0 && <Vazio>Nada escolhido para hoje.</Vazio>}
        {tarefas.map((t) => (
          <LinhaHoje
            key={t.id}
            t={t}
            motivo={t.motivo}
            aoConcluir={() => acoes.mudarEstado(t.id, ESTADO.FEITO)}
            aoReagendar={() => acoes.reagendar(t.id, amanha)}
            aoAbrir={() => navegar(`/prototipo/tarefas/${t.id}`)}
          />
        ))}

        {/* A sugestão da IA fica JUNTO da tarefa a que se refere, e é pequena. */}
        {sugestao && tarefas.some((t) => t.id === 't-estoque' && !t.reserva) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-row border border-dashed border-accent/35 px-3 py-2">
            <span className="text-[12.5px] text-secondary">
              Há uma janela livre das 13:20 às 14:40. Reservar para “Revisar estoque”?
            </span>
            <span className="ml-auto flex gap-1.5">
              <Botao
                variante="secundario"
                className="px-2.5 py-1 text-[12.5px]"
                onClick={() => { acoes.reservarHorario('t-estoque', estado.hoje, '13:20', '14:40'); setSugestao(false) }}
              >
                Reservar
              </Botao>
              <Botao variante="fantasma" className="px-2 py-1 text-[12.5px]" onClick={() => setSugestao(false)}>
                Agora não
              </Botao>
            </span>
          </div>
        )}
      </Secao>

      {/* PRECISA DA SUA ATENÇÃO — atraso real e decisão. Não é depósito. */}
      <Secao titulo="Precisa da sua atenção">
        {vencidas.map((t) => (
          <LinhaHoje
            key={t.id}
            t={t}
            motivo={`${MOTIVO.ATRASADA} · prazo ${rotuloDeData(t.prazo, estado.hoje)}`}
            aviso
            aoConcluir={() => acoes.mudarEstado(t.id, ESTADO.FEITO)}
            aoReagendar={() => acoes.escolherParaHoje(t.id, true)}
            rotuloReagendar="Fazer hoje"
            aoAbrir={() => navegar(`/prototipo/tarefas/${t.id}`)}
          />
        ))}

        {soltas.length > 0 && (
          <Link to="/prototipo/memoria?filtro=por-organizar" className="px-linha px-toque items-center justify-between">
            <span className="text-[14px]">
              {soltas.length} {soltas.length === 1 ? 'captura' : 'capturas'} por organizar
            </span>
            <span className="px-motivo inline-flex items-center gap-1">quando der <ChevronRight size={13} /></span>
          </Link>
        )}

        {vencidas.length === 0 && soltas.length === 0 && <Vazio>Nada pendente.</Vazio>}
      </Secao>

      <TarefaForm aberta={Boolean(form)} aoFechar={() => setForm(null)} padroes={form || {}} />
    </div>
  )
}

function LinhaHoje({ t, motivo, aviso, aoConcluir, aoReagendar, rotuloReagendar = 'Adiar', aoAbrir }) {
  return (
    <div className="px-linha px-toque items-start">
      <button
        type="button"
        onClick={aoConcluir}
        aria-label={`Concluir ${t.titulo}`}
        className="press mt-0.5 grid h-[19px] w-[19px] flex-none place-items-center rounded-[6px] border border-hairline transition hover:border-accent hover:text-accent-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        <Check size={12} className="opacity-0" aria-hidden="true" />
      </button>

      <button type="button" onClick={aoAbrir} className="min-w-0 flex-1 text-left">
        <span className="block text-[14.5px] leading-snug">{t.titulo}</span>
        <span className={cx('px-motivo mt-0.5 flex flex-wrap items-center gap-x-2', aviso && 'text-warning')}>
          <span>{motivo}</span>
          {t.reserva && (
            <span className="inline-flex items-center gap-1 text-accent-text">
              <CalendarClock size={12} />
              <span className="px-hora">{t.reserva.inicio}–{t.reserva.fim}</span>
            </span>
          )}
          {t.contexto && <span className="text-muted">{t.contexto}</span>}
        </span>
      </button>

      <div className="flex flex-none items-center gap-1">
        <button
          type="button"
          onClick={aoReagendar}
          className="press rounded-[7px] px-2 py-1 text-[12.5px] text-muted transition hover:bg-surface-2 hover:text-accent-text"
        >
          {rotuloReagendar}
        </button>
        <button
          type="button"
          onClick={aoConcluir}
          className="press rounded-[7px] px-2 py-1 text-[12.5px] text-muted transition hover:bg-surface-2 hover:text-positive"
        >
          Concluir
        </button>
      </div>
    </div>
  )
}

const capitalizar = (s) => s.charAt(0).toUpperCase() + s.slice(1)
