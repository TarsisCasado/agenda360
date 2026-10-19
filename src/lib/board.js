import { STATUS } from './constants'
import { isTaskOverdue, byTime } from './date'

// ---------------------------------------------------------------------------
// DERIVACAO DAS COLUNAS DE FLUXO — base estrutural do CP5.3.
//
// Aqui NAO ha interface. E so a regra que responde "em que coluna esta cada
// atividade", isolada para poder ser testada com a serie de casos reais do
// dominio antes de existir qualquer quadro na tela.
//
// AS QUATRO COLUNAS
//   sem_data    todo/rescheduled SEM data. E o backlog: de onde o trabalho sai.
//   a_fazer     todo/rescheduled COM data.
//   em_andamento in_progress e delegated (delegado continua em curso, so que
//               com outra pessoa — vira marca no cartao, nao coluna propria).
//   concluido   done.
//
// O QUE NAO VIRA COLUNA
//   missed, not_needed e cancelled sao DESFECHOS, nao estagios. Uma coluna para
//   cada um transformaria o quadro numa planilha de oito colunas. Vao para
//   `arquivadas`, atras de um filtro.
//
// ATRASO NAO E ESTAGIO
//   "Atrasada" e atributo derivado (data + status), nao lugar. Aparece como
//   marca no cartao e ordena primeiro dentro de "A fazer" — quem esta atrasado
//   nao mudou de fase do trabalho, so estourou o prazo.
//
// SEM DATA != SEMANA
//   Sao eixos diferentes. "Sem data" e uma coluna do FLUXO; a visao SEMANA
//   recorta por data. Uma tarefa sem data nunca e inventada num dia da semana,
//   e uma tarefa com data continua sendo tarefa — nao vira compromisso da
//   agenda so por aparecer na semana.
//
// INVARIANTE
//   Toda atividade aparece em EXATAMENTE um balde. A soma das quatro colunas
//   mais as arquivadas e igual ao total recebido. Isso e testado.
// ---------------------------------------------------------------------------
export const FLOW_COLUMNS = [
  { key: 'sem_data', label: 'Sem data', hint: 'Backlog' },
  { key: 'a_fazer', label: 'A fazer' },
  { key: 'em_andamento', label: 'Em andamento' },
  { key: 'concluido', label: 'Concluído' },
]

const ABERTAS = [STATUS.TODO, STATUS.RESCHEDULED]
const EM_CURSO = [STATUS.IN_PROGRESS, STATUS.DELEGATED]
const ARQUIVADAS = [STATUS.MISSED, STATUS.NOT_NEEDED, STATUS.CANCELLED]

// Em que coluna esta esta atividade? null = arquivada (fora do quadro).
export function columnOf(task) {
  if (!task) return null
  const status = task.status || STATUS.TODO
  if (status === STATUS.DONE) return 'concluido'
  if (EM_CURSO.includes(status)) return 'em_andamento'
  if (ARQUIVADAS.includes(status)) return null
  if (ABERTAS.includes(status)) return task.date ? 'a_fazer' : 'sem_data'
  // Status desconhecido (dado antigo, integracao futura): trata como aberta em
  // vez de sumir com a atividade.
  return task.date ? 'a_fazer' : 'sem_data'
}

// Ordem DENTRO da coluna. Deterministica de proposito: o CP5.2/CP5.3 nao tem
// coluna `position` na tabela, entao arrastar muda de COLUNA, nunca de posicao.
// Atrasadas primeiro, depois por data, depois por prioridade, depois por hora.
const PESO_PRIORIDADE = { urgent: 0, high: 1, medium: 2, low: 3 }

export function compareInColumn(a, b) {
  const atrasoA = isTaskOverdue(a) ? 0 : 1
  const atrasoB = isTaskOverdue(b) ? 0 : 1
  if (atrasoA !== atrasoB) return atrasoA - atrasoB

  const dataA = a.date || '9999-12-31'
  const dataB = b.date || '9999-12-31'
  if (dataA !== dataB) return dataA < dataB ? -1 : 1

  const pA = PESO_PRIORIDADE[a.priority] ?? 2
  const pB = PESO_PRIORIDADE[b.priority] ?? 2
  if (pA !== pB) return pA - pB

  return byTime(a, b)
}

// buildBoard(tasks) -> { colunas: {key: []}, arquivadas: [], total }
export function buildBoard(tasks = []) {
  const colunas = { sem_data: [], a_fazer: [], em_andamento: [], concluido: [] }
  const arquivadas = []

  for (const task of tasks) {
    const key = columnOf(task)
    if (key) colunas[key].push(task)
    else arquivadas.push(task)
  }
  for (const key of Object.keys(colunas)) colunas[key].sort(compareInColumn)

  return { colunas, arquivadas, total: tasks.length }
}

// O que muda numa atividade ao ser solta em outra coluna. Devolve so o PATCH —
// quem grava e o servico, e a validacao continua sendo dele.
export function patchForColumn(task, key) {
  switch (key) {
    case 'sem_data':
      // Sair da agenda: perde data e, por consequencia, horario.
      return { status: STATUS.TODO, date: null, start_time: null, end_time: null }
    case 'a_fazer':
      // Sem data definida, o quadro NAO inventa um dia: quem move para "A
      // fazer" um item sem data precisa escolher a data. Sinalizado por
      // `needsDate` para a interface perguntar.
      return task?.date ? { status: STATUS.TODO } : { status: STATUS.TODO, needsDate: true }
    case 'em_andamento':
      return { status: STATUS.IN_PROGRESS }
    case 'concluido':
      return { status: STATUS.DONE }
    default:
      return {}
  }
}

// ---------------------------------------------------------------------------
// CP5.3 — regras que o QUADRO precisa e que continuam sendo dominio puro.
//
// Tudo aqui e funcao pura sobre tarefas: rotulo temporal do cartao, janela do
// "Concluido" e filtros. Fica em lib/ pelo mesmo motivo das colunas — para ser
// testado com a serie de casos reais antes de virar pixel, e para que o
// componente nao precise saber a regra, so pintar o resultado.
// ---------------------------------------------------------------------------

const DIA_MS = 86400000

function isoToUTC(iso) {
  const [y, m, d] = String(iso).split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

// Diferenca em dias entre duas datas ISO (b - a). Em UTC de proposito: datas
// sem hora nao devem mudar de valor por causa de fuso ou horario de verao.
export function daysBetween(a, b) {
  return Math.round((isoToUTC(b) - isoToUTC(a)) / DIA_MS)
}

const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

// ROTULO TEMPORAL DO CARTAO — o unico metadado que sempre vale a pena.
//
// Devolve { text, tone } ou null. `tone` diz o SIGNIFICADO, nao a cor: quem
// pinta e o cartao. Sao tres, e so tres:
//   'danger'  atraso — precisa ser visto de imediato;
//   'accent'  hoje — e o presente, merece destaque discreto;
//   'muted'   qualquer outro dia — silencioso.
//
// Sem data devolve null: a coluna "Sem data" ja diz isso, e repetir "Sem data"
// em cada cartao e ruido puro.
export function boardDateLabel(task, today, now = new Date()) {
  if (!task?.date) return null

  // Uma tarefa fechada (concluida, furada, cancelada) nao tem urgencia: a data
  // dela e historico. Sem esta guarda, "Concluido" pintava metade da coluna de
  // azul com "Hoje" em destaque e competia com "A fazer" pela atencao.
  if (!ABERTAS.includes(task.status || STATUS.TODO) && !EM_CURSO.includes(task.status)) {
    const [, am, ad] = task.date.split('-').map(Number)
    return { text: `${String(ad).padStart(2, '0')}/${String(am).padStart(2, '0')}`, tone: 'muted' }
  }

  if (isTaskOverdue(task, now) && task.date < today) {
    const dias = daysBetween(task.date, today)
    return { text: dias === 1 ? 'Ontem' : `${dias} dias atrasada`, tone: 'danger' }
  }
  if (task.date === today) return { text: 'Hoje', tone: isTaskOverdue(task, now) ? 'danger' : 'accent' }

  const diff = daysBetween(today, task.date)
  if (diff === 1) return { text: 'Amanhã', tone: 'muted' }
  if (diff === -1) return { text: 'Ontem', tone: 'muted' }

  const [y, m, d] = task.date.split('-').map(Number)
  const dow = DIAS_CURTOS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  const curta = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`
  // Dentro da semana o dia da semana orienta melhor que o numero; fora dela o
  // numero e o unico que orienta.
  return { text: diff > 1 && diff <= 6 ? `${dow}, ${curta}` : curta, tone: 'muted' }
}

// JANELA DO CONCLUIDO — a coluna nao pode virar arquivo morto.
//
// Mostrar tudo que ja foi feito transforma "Concluido" numa coluna infinita que
// so atrapalha a leitura das outras tres. Mostramos a janela recente e deixamos
// o resto a UM toque de distancia — escondido nao e o mesmo que perdido.
//
// A referencia de tempo e `updated_at` (quando a tarefa foi de fato concluida)
// com queda para `date`. Tarefa concluida sem nenhuma das duas fica em
// `recentes`: some-la seria pior que mostra-la.
export const DONE_WINDOW_DAYS = 7

export function splitDoneWindow(done = [], { today, days = DONE_WINDOW_DAYS } = {}) {
  const recentes = []
  const antigas = []
  for (const task of done) {
    const ref = (task.updated_at || task.date || '').slice(0, 10)
    if (!ref || !today || daysBetween(ref, today) <= days) recentes.push(task)
    else antigas.push(task)
  }
  return { recentes, antigas }
}

// FILTROS — recorte de LEITURA. Nunca tocam no dominio: nao mudam status, nao
// mudam data, nao reordenam. Entra lista, sai sublista com as MESMAS
// referencias de objeto (e o que o teste trava).
export const BOARD_FILTERS = [
  { key: 'todas', label: 'Todas' },
  { key: 'atrasadas', label: 'Atrasadas' },
  { key: 'alta', label: 'Prioridade alta' },
]

const ALTA = ['high', 'urgent']

export function filterBoardTasks(tasks = [], filter = 'todas', now = new Date()) {
  if (filter === 'atrasadas') return tasks.filter((t) => isTaskOverdue(t, now))
  if (filter === 'alta') return tasks.filter((t) => ALTA.includes(t.priority))
  return tasks
}
