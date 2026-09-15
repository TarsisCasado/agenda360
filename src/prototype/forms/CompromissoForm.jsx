import { useState, useEffect } from 'react'
import { useProto, useAcoes } from '../store/contexto'
import { somarDias, iso, inicioDaSemana, diaCurto, numeroDoDia } from '../mock/dados'
import { Folha, Campo, Texto, Area, Escolha, Botao, Chip } from '../parts/base'
import AlertaCampo from '../parts/AlertaCampo'

// ---------------------------------------------------------------------------
// NOVO COMPROMISSO / EDITAR — a outra criacao estruturada.
//
// Compromisso e diferente de tarefa por natureza: ACONTECE naquele horario,
// com outras pessoas ou num lugar. Entao data e hora nao sao opcionais aqui —
// sao o proprio assunto.
//
// Clicar num horario vazio da agenda abre este formulario JA com o dia e a
// hora preenchidos. Quem apontou para as 14h de terça nao deveria ter de
// digitar "terça, 14h".
// ---------------------------------------------------------------------------
const HORAS = ['07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00']
const DURACOES = [
  { valor: 30, label: '30 min' },
  { valor: 60, label: '1 h' },
  { valor: 90, label: '1 h 30' },
  { valor: 120, label: '2 h' },
]
const CATEGORIAS = ['Operação', 'Comercial', 'Financeiro', 'Diretoria', 'Pessoal']

export default function CompromissoForm({ aberta, aoFechar, compromisso, padroes = {} }) {
  const { estado } = useProto()
  const acoes = useAcoes()
  const editando = Boolean(compromisso)
  const [f, setF] = useState(() => inicial(compromisso, padroes, estado.hoje))
  const [mais, setMais] = useState(false)

  useEffect(() => {
    if (aberta) {
      setF(inicial(compromisso, padroes, estado.hoje))
      setMais(Boolean(compromisso?.notas || compromisso?.alerta))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberta, compromisso?.id, padroes.data, padroes.inicio])

  const seg = inicioDaSemana(new Date(`${estado.hoje}T12:00:00`))
  const dias = Array.from({ length: 7 }, (_, i) => iso(somarDias(seg, i)))
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))

  const salvar = () => {
    const dados = {
      titulo: f.titulo.trim(),
      data: f.data,
      inicio: f.inicio,
      fim: somarMinutos(f.inicio, f.duracao),
      local: f.local.trim() || null,
      categoria: f.categoria,
      alerta: f.alerta,
      notas: f.notas.trim() || null,
    }
    if (editando) acoes.editarCompromisso(compromisso.id, dados)
    else acoes.criarCompromisso(dados)
    aoFechar()
  }

  return (
    <Folha
      aberta={aberta}
      aoFechar={aoFechar}
      titulo={editando ? 'Editar compromisso' : 'Novo compromisso'}
      subtitulo={editando ? compromisso.titulo : null}
      rodape={
        <>
          <Botao variante="primario" onClick={salvar} disabled={!f.titulo.trim()}>
            {editando ? 'Salvar' : 'Criar compromisso'}
          </Botao>
          <Botao variante="fantasma" onClick={aoFechar}>Cancelar</Botao>
          {editando && (
            <Botao
              variante="perigo"
              className="ml-auto"
              onClick={() => { acoes.excluirCompromisso(compromisso.id); aoFechar() }}
            >
              Excluir
            </Botao>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <Campo rotulo="O quê">
          <Texto autoFocus value={f.titulo} onChange={(e) => set('titulo', e.target.value)} placeholder="Ex.: reunião com os gerentes" />
        </Campo>

        <div>
          <span className="px-rotulo">Dia</span>
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
            {dias.map((d) => (
              <Chip key={d} on={f.data === d} onClick={() => set('data', d)}>
                {diaCurto(d)} {numeroDoDia(d)}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <span className="px-rotulo">Começa</span>
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
            {HORAS.map((h) => (
              <Chip key={h} on={f.inicio === h} onClick={() => set('inicio', h)}>
                <span className="px-hora">{h}</span>
              </Chip>
            ))}
          </div>
        </div>

        <Campo rotulo="Duração">
          <Escolha valor={f.duracao} aoEscolher={(v) => set('duracao', v || 60)} opcoes={DURACOES} />
        </Campo>

        <p className="text-[12.5px] text-secondary">
          <span className="px-hora font-semibold">{f.inicio}–{somarMinutos(f.inicio, f.duracao)}</span>
        </p>

        {!mais ? (
          <button type="button" onClick={() => setMais(true)} className="press text-[13px] font-semibold text-accent-text">
            Mais detalhes
          </button>
        ) : (
          <div className="space-y-4 border-t border-hairline pt-4">
            <Campo rotulo="Onde">
              <Texto value={f.local} onChange={(e) => set('local', e.target.value)} placeholder="Sala, endereço, link…" />
            </Campo>
            <Campo rotulo="Categoria">
              <Escolha permitirVazio valor={f.categoria} aoEscolher={(v) => set('categoria', v)} opcoes={CATEGORIAS.map((c) => ({ valor: c, label: c }))} />
            </Campo>

            <AlertaCampo
              valor={f.alerta}
              aoMudar={(v) => set('alerta', v)}
              item={{ data: f.data, inicio: f.inicio }}
            />

            <Campo rotulo="Notas">
              <Area value={f.notas} onChange={(e) => set('notas', e.target.value)} placeholder="Pauta, quem participa, o que levar…" />
            </Campo>
          </div>
        )}
      </div>
    </Folha>
  )
}

function inicial(c, padroes, hoje) {
  const inicio = c?.inicio ?? padroes.inicio ?? '09:00'
  return {
    titulo: c?.titulo ?? '',
    data: c?.data ?? padroes.data ?? hoje,
    inicio,
    duracao: c ? minutosEntre(c.inicio, c.fim) : padroes.duracao ?? 60,
    local: c?.local ?? '',
    categoria: c?.categoria ?? null,
    alerta: c?.alerta ?? null,
    notas: c?.notas ?? '',
  }
}

function somarMinutos(hhmm, minutos) {
  const [h, m] = String(hhmm).split(':').map(Number)
  const total = h * 60 + m + minutos
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function minutosEntre(a, b) {
  const [ha, ma] = String(a).split(':').map(Number)
  const [hb, mb] = String(b).split(':').map(Number)
  return Math.max(30, hb * 60 + mb - (ha * 60 + ma))
}
