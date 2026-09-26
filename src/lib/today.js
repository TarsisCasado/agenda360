import { STATUS } from './constants'
import { isTaskOverdue, byTime, toISODate } from './date'

// ---------------------------------------------------------------------------
// HOJE — a regra de "o que merece minha atencao agora".
//
// Aqui NAO ha interface. E so a derivacao, isolada para poder ser testada com
// os sete cenarios reais (dia vazio, so atrasadas, so compromisso, so tarefa em
// andamento, so sem data, dia cheio, mistura) antes de virar pixel.
//
// A PERGUNTA QUE HOJE RESPONDE e "o que merece minha atencao agora?", nao
// "quantas coisas existem no sistema?". Por isso o que entra e o que entra:
//   - atrasada, em andamento, de hoje, ou sem data;
//   - e NADA de tarefa futura com data. Uma tarefa de sexta nao merece atencao
//     hoje: ela ja tem lugar, e o lugar dela e a Agenda.
//
// ---------------------------------------------------------------------------
// A REGRA DE DEDUPLICACAO (o pedido explicito do briefing)
//
// Uma tarefa satisfaz varias condicoes ao mesmo tempo: pode estar atrasada E em
// andamento, ser de hoje E em andamento. Mostrar a mesma tarefa em tres lugares
// da mesma tela nao informa tres vezes — confunde uma vez, porque quem le passa
// a nao saber se sao tres tarefas ou uma.
//
// Entao CADA TAREFA CAI EM EXATAMENTE UM BALDE, pelo primeiro criterio que ela
// satisfizer nesta ordem:
//
//   1. atrasada       o prazo passou. E excecao, e excecao ganha a frente de
//                     tudo — inclusive de "em andamento", porque ja ter comecado
//                     nao diminui o atraso;
//   2. em_andamento   status in_progress. Trabalho ja iniciado pesa mais que
//                     trabalho apenas agendado, e por isso vem antes de "hoje";
//   3. hoje           tem a data de hoje;
//   4. sem_data       nao tem data nenhuma. E carga ainda nao organizada.
//
// A consequencia que interessa: as quatro contagens SOMAM o total. Se a tela
// diz 2 + 1 + 5 + 3, sao onze tarefas distintas, nunca onze aparicoes de sete.
// Isso e testado.
//
// "AGORA / PROXIMO" NAO E UM QUINTO BALDE — e uma LENTE sobre o balde `hoje`:
// o compromisso com hora que vem a seguir. Ele aparece em destaque no topo e
// NAO se repete na lista de hoje logo abaixo. Quem remove e a interface, com a
// lista `hojeSemProximo` que esta funcao ja devolve pronta.
// ---------------------------------------------------------------------------

const ABERTAS = [STATUS.TODO, STATUS.IN_PROGRESS, STATUS.RESCHEDULED, STATUS.DELEGATED]

export const HOJE_BALDES = [
  { key: 'atrasada', label: 'Atrasadas', tone: 'danger' },
  { key: 'hoje', label: 'Hoje', tone: 'accent' },
  { key: 'em_andamento', label: 'Em andamento', tone: 'neutro' },
  { key: 'sem_data', label: 'Sem data', tone: 'neutro' },
]

// Quantas atrasadas aparecem na lista antes de virar "ver as outras N". Atraso
// precisa ser visto, mas vinte atrasadas empurrando o dia inteiro para fora da
// tela transformam a excecao em toda a tela.
export const AMOSTRA_ATRASADAS = 3
// Sem data e sinal, nao inventario: a area completa e Tarefas -> Fluxo.
export const AMOSTRA_SEM_DATA = 3

function hhmm(time) {
  return time ? String(time).slice(0, 5) : null
}

// ATRASO PARA EFEITO DE APRESENTACAO. `isTaskOverdue` do dominio so considera
// todo/in_progress — uma tarefa REAGENDADA para uma data que ja passou nao
// entra la. Para o dominio isso e coerente (reagendar e um estado proprio);
// para esta tela seria um buraco: a tarefa sumiria de Hoje sem estar em lugar
// nenhum. Entao aqui atraso e "prazo no passado OU o dominio ja considera
// atrasada". Nao muda nada no dominio — e leitura.
export function estaAtrasada(task, { today, now } = {}) {
  if (!task || !ABERTAS.includes(task.status)) return false
  if (task.date && today && task.date < today) return true
  return isTaskOverdue(task, now)
}

// Em que balde esta tarefa cai? null = nao e assunto de Hoje.
export function baldeDe(task, { today, now } = {}) {
  if (!task) return null
  if (!ABERTAS.includes(task.status)) return null
  if (estaAtrasada(task, { today, now })) return 'atrasada'
  if (task.status === STATUS.IN_PROGRESS) return 'em_andamento'
  if (task.date === today) return 'hoje'
  if (!task.date) return 'sem_data'
  // Tarefa futura com data: tem lugar, e o lugar dela e a Agenda.
  return null
}

// Minutos entre agora e um "HH:mm" de hoje. Negativo = ja passou.
export function minutosAte(time, now = new Date()) {
  const t = hhmm(time)
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  return h * 60 + m - (now.getHours() * 60 + now.getMinutes())
}

// Como se le a distancia ate um compromisso. Devolve null quando nao vale a
// pena dizer nada — daqui a seis horas "em 360 min" nao ajuda ninguem.
export function proximidade(time, now = new Date()) {
  const min = minutosAte(time, now)
  if (min === null) return null
  if (min < -1) return { texto: 'começou', tom: 'agora' }
  if (min <= 1) return { texto: 'agora', tom: 'agora' }
  if (min < 60) return { texto: `em ${min} min`, tom: 'breve' }
  if (min < 180) {
    const h = Math.floor(min / 60)
    const r = min % 60
    return { texto: r ? `em ${h}h${String(r).padStart(2, '0')}` : `em ${h}h`, tom: 'breve' }
  }
  return null
}

// Ordem dentro de cada balde: quem tem hora vem na hora; sem hora vai depois.
// Nas atrasadas, a mais antiga primeiro — e a que esta esperando ha mais tempo.
function ordenar(lista, key) {
  const copia = [...lista]
  if (key === 'atrasada') {
    return copia.sort((a, b) => {
      const da = a.date || '9999-12-31'
      const db = b.date || '9999-12-31'
      return da !== db ? (da < db ? -1 : 1) : byTime(a, b)
    })
  }
  return copia.sort(byTime)
}

// ---------------------------------------------------------------------------
// buildToday(tasks) -> tudo que a tela precisa, ja deduplicado.
// ---------------------------------------------------------------------------
export function buildToday(tasks = [], { today = toISODate(new Date()), now = new Date() } = {}) {
  // Na ordem de EXIBICAO (a mesma de HOJE_BALDES). A ordem de PRIORIDADE, que
  // e outra, vive na cadeia de ifs de `baldeDe` — sao coisas diferentes e
  // misturar as duas aqui so confundiria quem lesse depois.
  const baldes = { atrasada: [], hoje: [], em_andamento: [], sem_data: [] }
  for (const task of tasks) {
    const key = baldeDe(task, { today, now })
    if (key) baldes[key].push(task)
  }
  for (const key of Object.keys(baldes)) baldes[key] = ordenar(baldes[key], key)

  const contagens = Object.fromEntries(Object.entries(baldes).map(([k, v]) => [k, v.length]))
  const total = Object.values(contagens).reduce((n, x) => n + x, 0)

  // A LENTE "agora/proximo": compromissos de HOJE, na ordem do relogio. O
  // proximo e o primeiro que ainda nao passou; se todos passaram, nao ha
  // proximo (e o que passou e atrasado, e ja esta no balde certo).
  const compromissos = baldes.hoje.filter((t) => t.start_time)
  const agoraHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const proximo = compromissos.find((t) => hhmm(t.start_time) >= agoraHHMM) || null

  return {
    baldes,
    contagens,
    total,
    compromissos,
    proximo,
    // A interface recebe a lista de hoje JA sem o item em destaque: e assim que
    // o destaque nao vira uma segunda aparicao da mesma tarefa.
    hojeSemProximo: proximo ? baldes.hoje.filter((t) => t.id !== proximo.id) : baldes.hoje,
    vazio: total === 0,
  }
}
