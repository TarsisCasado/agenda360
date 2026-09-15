import { useState, useEffect } from 'react'
import { useProto, useAcoes, useDesktop } from '../store/contexto'
import { ESTADO, somarDias, iso, inicioDaSemana, diaCurto, numeroDoDia, rotuloDeData } from '../mock/dados'
import { Campo, Texto, Area, Escolha, Botao, Chip } from '../parts/base'
import { Superficie } from '../parts/movel'
import AlertaCampo from '../parts/AlertaCampo'
import { Pessoa } from '../parts/pessoas'
import { EU } from '../mock/dados'

// ---------------------------------------------------------------------------
// NOVA TAREFA / EDITAR TAREFA — criacao ESTRUTURADA.
//
// A captura livre nao substitui isto. Sao duas intencoes diferentes: "quero
// registrar isso rapidamente" e "eu SEI que quero criar uma tarefa". A segunda
// merece um formulario de verdade, e nenhum dos dois caminhos depende da IA.
//
// O que fica a vista: titulo, estado, dia, prazo. O resto — descricao,
// prioridade, contexto, responsavel, alerta, horario reservado — abre em
// "Mais opcoes", porque nao e o que se preenche na maioria das vezes.
//
// UX1.2.1 — NO TELEFONE ISTO E UMA TELA, nao uma folha. Dez campos dentro de
// uma bottom sheet sao um formulario de desktop espremido, e foi assim que o
// QA humano leu. Em tela cheia o cabecalho fica sendo Cancelar · titulo ·
// Criar, o conteudo rola, e "Mais opcoes" continua adiando o que e raro.
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

export default function TarefaForm({ aberta, aoFechar, tarefa, padroes = {} }) {
  const { estado } = useProto()
  const acoes = useAcoes()
  const desktop = useDesktop()
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
    if (editando) {
      acoes.editarTarefa(tarefa.id, dados)
      // Trocar o responsável é DELEGAR, não editar um campo: passa pela mesma
      // ação, com o mesmo registro no histórico.
      if (f.responsavelId !== (tarefa.responsavelId || EU)) acoes.delegar(tarefa.id, f.responsavelId)
    } else {
      acoes.criarTarefa({ ...dados, responsavelId: f.responsavelId, origemId: padroes.origemId || null })
    }
    aoFechar()
  }

  const primario = (
    <Botao variante="primario" onClick={salvar} disabled={!f.titulo.trim()} className="px-3 py-1.5">
      {editando ? 'Salvar' : 'Criar'}
    </Botao>
  )

  return (
    <Superficie
      aberta={aberta}
      aoFechar={aoFechar}
      titulo={editando ? 'Editar tarefa' : 'Nova tarefa'}
      subtitulo={editando ? tarefa.titulo : null}
      acao={primario}
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
          desktop ? (
            <button type="button" onClick={() => setMais(true)} className="press text-[13px] font-semibold text-accent-text">
              Mais detalhes
            </button>
          ) : (
            // No telefone o gatilho precisa ser um alvo largo e dizer o que
            // está adiando — senão "Mais detalhes" vira um link perdido.
            <button
              type="button"
              onClick={() => setMais(true)}
              className="press flex w-full items-center gap-3 rounded-control border border-hairline px-3.5 py-2.5 text-left text-[13.5px] font-semibold text-accent-text"
            >
              <span className="flex-none">Mais opções</span>
              <span className="min-w-0 flex-1 truncate text-right text-[12px] font-normal text-muted">prioridade · responsável · alerta · horário</span>
            </button>
          )
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

            {/* O alerta vem DEPOIS do horário reservado de propósito: é ele que
                define a referência de "antes de". */}
            <div>
              <span className="px-rotulo">Responsável</span>
              <div className="flex flex-wrap gap-1.5">
                {(estado.pessoas || []).map((p) => (
                  <Chip key={p.id} on={f.responsavelId === p.id} onClick={() => set('responsavelId', p.id)}>
                    <Pessoa id={p.id} /> {p.eu ? 'Você' : p.nome}
                  </Chip>
                ))}
              </div>
              {f.responsavelId !== EU && (
                <p className="mt-1.5 text-[11.5px] text-faint">
                  A atividade passa a aguardar aceite. Continua sendo esta mesma
                  atividade — você acompanha o andamento real.
                </p>
              )}
            </div>

            <AlertaCampo
              valor={f.alerta}
              aoMudar={(v) => set('alerta', v)}
              item={{
                reserva: f.reservaInicio && f.planejadaPara
                  ? { data: f.planejadaPara, inicio: f.reservaInicio }
                  : null,
                prazo: f.prazo,
              }}
            />
          </div>
        )}

        {/* No telefone não há rodapé: excluir vive no fim do conteúdo, longe do
            polegar que acabou de salvar. */}
        {!desktop && editando && (
          <div className="border-t border-hairline pt-4">
            <Botao
              variante="perigo"
              className="w-full"
              onClick={() => { acoes.excluirTarefa(tarefa.id); aoFechar() }}
            >
              Excluir tarefa
            </Botao>
          </div>
        )}
      </div>
    </Superficie>
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
    responsavelId: tarefa?.responsavelId ?? padroes.responsavelId ?? 'p-tarsis',
  }
}

function maisUma(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number)
  return `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
