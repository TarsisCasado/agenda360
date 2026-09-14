import { useState, useEffect } from 'react'
import { useProto, useAcoes } from '../store/contexto'
import { ESTADO, somarDias, iso, inicioDaSemana, diaCurto, numeroDoDia, rotuloDeData } from '../mock/dados'
import { Folha, Campo, Texto, Area, Escolha, Botao, Chip } from '../parts/base'

// ---------------------------------------------------------------------------
// NOVA TAREFA / EDITAR TAREFA — criacao ESTRUTURADA.
//
// A captura livre nao substitui isto. Sao duas intencoes diferentes: "quero
// registrar isso rapidamente" e "eu SEI que quero criar uma tarefa". A segunda
// merece um formulario de verdade, e nenhum dos dois caminhos depende da IA.
//
// O que fica a vista: titulo, estado, dia, prazo. O resto — descricao,
// prioridade, contexto, lembrete, horario reservado — abre em "Mais detalhes",
// porque nao e o que se preenche na maioria das vezes.
//
// CONTEXTO VEM PREENCHIDO: criar a partir da coluna "Em andamento" ja nasce em
// andamento; criar a partir de um dia ja nasce naquele dia. Quem escolheu o
// lugar nao deveria ter de escolher de novo.
// ---------------------------------------------------------------------------
const PRIORIDADES = [
  { valor: 'baixa', label: 'Baixa' },
  { valor: 'media', label: 'Média' },
  { valor: 'alta', label: 'Alta' },
]
const CONTEXTOS = ['Operação', 'Comercial', 'Financeiro', 'Diretoria', 'Pessoal']
const LEMBRETES = [
  { valor: 0, label: 'Na hora' },
  { valor: 15, label: '15 min antes' },
  { valor: 30, label: '30 min antes' },
  { valor: 60, label: '1 h antes' },
]

export default function TarefaForm({ aberta, aoFechar, tarefa, padroes = {} }) {
  const { estado } = useProto()
  const acoes = useAcoes()
  const editando = Boolean(tarefa)
  const [f, setF] = useState(() => inicial(tarefa, padroes))
  const [mais, setMais] = useState(false)

  useEffect(() => {
    if (aberta) { setF(inicial(tarefa, padroes)); setMais(Boolean(tarefa?.descricao || tarefa?.reserva)) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberta, tarefa?.id])

  const seg = inicioDaSemana(new Date(`${estado.hoje}T12:00:00`))
  const dias = Array.from({ length: 7 }, (_, i) => iso(somarDias(seg, i)))
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))

  const salvar = () => {
    const dados = {
      titulo: f.titulo.trim(),
      descricao: f.descricao.trim() || null,
      estado: f.estado,
      planejadaPara: f.planejadaPara,
      prazo: f.prazo,
      prioridade: f.prioridade,
      contexto: f.contexto,
      alerta: f.alerta,
      reserva: f.reservaInicio && f.planejadaPara
        ? { data: f.planejadaPara, inicio: f.reservaInicio, fim: maisUma(f.reservaInicio) }
        : null,
    }
    if (editando) acoes.editarTarefa(tarefa.id, dados)
    else acoes.criarTarefa({ ...dados, origemId: padroes.origemId || null })
    aoFechar()
  }

  return (
    <Folha
      aberta={aberta}
      aoFechar={aoFechar}
      titulo={editando ? 'Editar tarefa' : 'Nova tarefa'}
      subtitulo={editando ? tarefa.titulo : null}
      rodape={
        <>
          <Botao variante="primario" onClick={salvar} disabled={!f.titulo.trim()}>
            {editando ? 'Salvar' : 'Criar tarefa'}
          </Botao>
          <Botao variante="fantasma" onClick={aoFechar}>Cancelar</Botao>
          {editando && (
            <Botao
              variante="perigo"
              className="ml-auto"
              onClick={() => { acoes.excluirTarefa(tarefa.id); aoFechar() }}
            >
              Excluir
            </Botao>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <Campo rotulo="O quê">
          <Texto
            autoFocus
            value={f.titulo}
            onChange={(e) => set('titulo', e.target.value)}
            placeholder="Ex.: conferir fechamento do repasse"
          />
        </Campo>

        <Campo rotulo="Situação">
          <Escolha
            valor={f.estado}
            aoEscolher={(v) => set('estado', v)}
            opcoes={[
              { valor: ESTADO.A_FAZER, label: 'A fazer' },
              { valor: ESTADO.FAZENDO, label: 'Em andamento' },
              { valor: ESTADO.FEITO, label: 'Concluído' },
            ]}
          />
        </Campo>

        <div>
          <span className="px-rotulo">Fazer em</span>
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
            <Chip on={!f.planejadaPara} onClick={() => { set('planejadaPara', null); set('reservaInicio', null) }}>
              Sem dia
            </Chip>
            {dias.map((d) => (
              <Chip key={d} on={f.planejadaPara === d} onClick={() => set('planejadaPara', d)}>
                {diaCurto(d)} {numeroDoDia(d)}
              </Chip>
            ))}
          </div>
          <p className="mt-1.5 text-[11.5px] text-faint">
            Escolher o dia não reserva horário.
          </p>
        </div>

        <div>
          <span className="px-rotulo">Prazo</span>
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
            <Chip on={!f.prazo} onClick={() => set('prazo', null)}>Sem prazo</Chip>
            {dias.map((d) => (
              <Chip key={d} on={f.prazo === d} onClick={() => set('prazo', d)}>
                {diaCurto(d)} {numeroDoDia(d)}
              </Chip>
            ))}
          </div>
        </div>

        {!mais ? (
          <button type="button" onClick={() => setMais(true)} className="press text-[13px] font-semibold text-accent-text">
            Mais detalhes
          </button>
        ) : (
          <div className="space-y-4 border-t border-hairline pt-4">
            <Campo rotulo="Detalhes">
              <Area value={f.descricao} onChange={(e) => set('descricao', e.target.value)} placeholder="Observações, contexto, o que precisa estar pronto…" />
            </Campo>

            <Campo rotulo="Prioridade">
              <Escolha valor={f.prioridade} aoEscolher={(v) => set('prioridade', v || 'media')} opcoes={PRIORIDADES} />
            </Campo>

            <Campo rotulo="Contexto">
              <Escolha
                permitirVazio
                valor={f.contexto}
                aoEscolher={(v) => set('contexto', v)}
                opcoes={CONTEXTOS.map((c) => ({ valor: c, label: c }))}
              />
            </Campo>

            <Campo rotulo="Lembrete">
              <Escolha permitirVazio valor={f.alerta} aoEscolher={(v) => set('alerta', v)} opcoes={LEMBRETES} />
            </Campo>

            <div>
              <span className="px-rotulo">Horário reservado</span>
              {f.planejadaPara ? (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    <Chip on={!f.reservaInicio} onClick={() => set('reservaInicio', null)}>Sem horário</Chip>
                    {['09:00', '11:00', '14:00', '16:00'].map((h) => (
                      <Chip key={h} on={f.reservaInicio === h} onClick={() => set('reservaInicio', h)}>
                        <span className="px-hora">{h}–{maisUma(h)}</span>
                      </Chip>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[11.5px] text-faint">
                    Reserva {rotuloDeData(f.planejadaPara, estado.hoje)} — tempo protegido para executar.
                  </p>
                </>
              ) : (
                <p className="text-[12.5px] text-faint">Escolha um dia primeiro para poder reservar um horário.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </Folha>
  )
}

function inicial(tarefa, padroes) {
  return {
    titulo: tarefa?.titulo ?? padroes.titulo ?? '',
    descricao: tarefa?.descricao ?? '',
    estado: tarefa?.estado ?? padroes.estado ?? ESTADO.A_FAZER,
    planejadaPara: tarefa?.planejadaPara ?? padroes.planejadaPara ?? null,
    prazo: tarefa?.prazo ?? null,
    prioridade: tarefa?.prioridade ?? 'media',
    contexto: tarefa?.contexto ?? null,
    alerta: tarefa?.alerta ?? null,
    reservaInicio: tarefa?.reserva?.inicio ?? padroes.reservaInicio ?? null,
  }
}

function maisUma(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number)
  return `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
