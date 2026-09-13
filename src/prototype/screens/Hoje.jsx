import { Link } from 'react-router-dom'
import { useState } from 'react'
import { useProto, useAcoes } from '../store/contexto'
import { paraHoje, atrasadas, porOrganizar, agendaDoDia, MOTIVO } from '../store/reducer'
import { ESTADO, rotuloDeData, somarDias, iso, nomeDoDia, AGORA_DEMO } from '../mock/dados'
import { Secao, Vazio, Botao, Marcar } from '../parts/base'

// ---------------------------------------------------------------------------
// HOJE — o centro operacional, nao um painel de estatistica.
//
// A pergunta que esta tela responde e "o que importa agora?". Por isso ela nao
// abre com contagens (2 atrasadas · 0 hoje · 1 sem data): contagem descreve o
// sistema, nao ajuda a decidir.
//
// Hoje e SELECAO. Cada item mostra POR QUE esta aqui — escolhida para hoje,
// prazo hoje, atrasada, o horario do compromisso. E "sem data" nunca e motivo:
// uma tarefa sem dia nao aparece nesta tela.
//
// "Precisa da sua atencao" nao e deposito: atraso real e decisao pendente
// entram; capturas comuns aparecem como "Por organizar", sem urgencia
// inventada.
// ---------------------------------------------------------------------------
export default function Hoje({ onCapturar }) {
  const { estado } = useProto()
  const acoes = useAcoes()
  const [sugestaoVisivel, setSugestaoVisivel] = useState(true)

  const agenda = agendaDoDia(estado, estado.hoje)
  const agora = AGORA_DEMO
  const emCurso = agenda.find((e) => e.inicio <= agora && e.fim > agora)
  const proximo = agenda.find((e) => e.inicio > agora)
  const destaque = emCurso || proximo
  const tarefas = paraHoje(estado)
  const vencidas = atrasadas(estado)
  const soltas = porOrganizar(estado)
  const terca = iso(somarDias(new Date(`${estado.hoje}T12:00:00`), 1))

  return (
    <div className="px-entra">
      <header>
        <p className="px-secao">{capitalizar(nomeDoDia(estado.hoje))} · {rotuloDeData(estado.hoje, estado.hoje)}</p>
        <h1 className="px-serif px-hero mt-1.5">{saudacao()}, {estado.pessoa}</h1>
      </header>

      {/* AGORA / A SEGUIR ---------------------------------------------------- */}
      <Secao titulo={emCurso ? 'Agora' : 'A seguir'}>
        {destaque ? (
          <>
            <div className="flex items-baseline gap-4 py-1">
              <span className="px-hora px-serif text-[26px] font-semibold leading-none">
                {destaque.inicio}
              </span>
              <div className="min-w-0">
                <p className="text-[16.5px] font-semibold leading-snug">{destaque.titulo}</p>
                <p className="px-motivo mt-0.5">
                  {destaque.especie === 'reserva' ? 'Horário reservado' : 'Compromisso'}
                  {destaque.local ? ` · ${destaque.local}` : ''} · até {destaque.fim}
                </p>
              </div>
            </div>
            <div className="mt-3 border-t border-hairline pt-3">
              {agenda
                .filter((e) => e !== destaque && e.inicio > agora)
                .map((e) => (
                  <div key={e.id} className="flex items-baseline gap-4 py-1.5">
                    <span className="px-hora w-[46px] flex-none text-[13.5px] text-muted">{e.inicio}</span>
                    <span className="text-[14.5px] text-secondary">{e.titulo}</span>
                  </div>
                ))}
              <Link
                to="/prototipo/agenda"
                className="mt-2 inline-block text-[13px] font-semibold text-accent-text hover:underline"
              >
                Ver a agenda
              </Link>
            </div>
          </>
        ) : (
          <Vazio>Nada marcado pelo resto do dia.</Vazio>
        )}
      </Secao>

      {/* SUGESTAO CONTEXTUAL — discreta, e nunca aplica nada sozinha. --------- */}
      {sugestaoVisivel && (
        <div className="mt-6 rounded-row border border-hairline bg-surface-2 px-4 py-3.5">
          <p className="px-secao">Sugestão</p>
          <p className="mt-1.5 text-[14.5px] leading-relaxed text-secondary">
            Você tem uma janela entre 13:20 e 14:40. Reservar para revisar o estoque?
          </p>
          <div className="mt-3 flex gap-2">
            <Botao
              variante="secundario"
              onClick={() => { acoes.reservarHorario('t-estoque', estado.hoje, '13:20', '14:40'); setSugestaoVisivel(false) }}
            >
              Reservar horário
            </Botao>
            <Botao variante="fantasma" onClick={() => setSugestaoVisivel(false)}>Agora não</Botao>
          </div>
        </div>
      )}

      {/* PARA HOJE ----------------------------------------------------------- */}
      <Secao titulo="Para hoje">
        {tarefas.length === 0 && <Vazio>Nada escolhido para hoje.</Vazio>}
        {tarefas.map((t) => (
          <div key={t.id} className="px-linha px-toque items-start">
            <Marcar
              feito={t.estado === ESTADO.FEITO}
              label={`Concluir ${t.titulo}`}
              onClick={() => acoes.mudarEstado(t.id, ESTADO.FEITO)}
            />
            <div className="min-w-0 flex-1">
              <Link to={`/prototipo/tarefas/${t.id}`} className="block text-[15px] leading-snug hover:underline">
                {t.titulo}
              </Link>
              <p className="px-motivo mt-0.5">
                {t.motivo}
                {t.reserva && ` · ${t.reserva.inicio}–${t.reserva.fim}`}
                {t.contexto && ` · ${t.contexto}`}
              </p>
            </div>
            <button
              onClick={() => acoes.reagendar(t.id, terca)}
              className="press mt-0.5 flex-none text-[12.5px] text-muted hover:text-accent-text"
            >
              Adiar
            </button>
          </div>
        ))}
      </Secao>

      {/* PRECISA DA SUA ATENCAO ---------------------------------------------- */}
      <Secao titulo="Precisa da sua atenção">
        {vencidas.map((t) => (
          <div key={t.id} className="px-linha px-toque items-start">
            <Marcar
              feito={false}
              label={`Concluir ${t.titulo}`}
              onClick={() => acoes.mudarEstado(t.id, ESTADO.FEITO)}
            />
            <div className="min-w-0 flex-1">
              <Link to={`/prototipo/tarefas/${t.id}`} className="block text-[15px] leading-snug hover:underline">
                {t.titulo}
              </Link>
              <p className="px-motivo mt-0.5">
                <span className="text-warning">{MOTIVO.ATRASADA}</span>
                {' · prazo '}{rotuloDeData(t.prazo, estado.hoje)}
              </p>
            </div>
            <button
              onClick={() => acoes.escolherParaHoje(t.id, true)}
              className="press mt-0.5 flex-none text-[12.5px] text-muted hover:text-accent-text"
            >
              Fazer hoje
            </button>
          </div>
        ))}

        {soltas.length > 0 && (
          <Link
            to="/prototipo/memoria?filtro=por-organizar"
            className="px-linha px-toque items-center justify-between text-secondary"
          >
            <span className="text-[14.5px]">
              {soltas.length} {soltas.length === 1 ? 'captura' : 'capturas'} por organizar
            </span>
            <span className="px-motivo">quando der</span>
          </Link>
        )}

        {vencidas.length === 0 && soltas.length === 0 && <Vazio>Nada pendente. Bom sinal.</Vazio>}
      </Secao>

      <button
        onClick={onCapturar}
        className="press mt-10 w-full rounded-row border border-dashed border-hairline py-3 text-[13.5px] text-muted transition hover:border-accent hover:text-accent-text lg:hidden"
      >
        Registrar alguma coisa
      </button>
    </div>
  )
}

const capitalizar = (s) => s.charAt(0).toUpperCase() + s.slice(1)
function saudacao() {
  const h = Number(AGORA_DEMO.slice(0, 2))
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}
