import { STATUS } from './constants'
import { toISODate, fromISODate, addDays, getWeekDays } from './date'
import { toMinutes } from './agendaTime'
import { tipoDeAtividade, COMPROMISSO } from './activityKind'
import { disporDia, faixaDeHoras, conflitosDoDia } from './agendaGrade'

// ---------------------------------------------------------------------------
// O ADAPTADOR (C2) — entre os servicos reais e a Agenda aprovada.
//
// A direcao visual aprovada em UX-M3/M3.1 foi desenhada sobre o vocabulario do
// prototipo: `evento` com `inicio`/`fim`, `especie` ('compromisso' | 'reserva'),
// `categoria` por nome e `cor` por nome. O produto real guarda outra coisa:
// uma tabela `tasks` com `date`, `start_time`, `end_time`, `status`,
// `category_id`, `alert_*`.
//
// Este arquivo e a TRADUCAO, e so isso. Ele nao inventa campo, nao cria estado
// novo, nao escreve nada e nao chama servico — recebe as tasks que `useTasks`
// ja carregou e as categorias que o `DataContext` ja tem.
//
// ===================== AS CINCO DISTINCOES, PRESERVADAS ====================
//
// 1. COMPROMISSO COM INTERVALO
//    `date` + `start_time`, e `tipoDeAtividade` diz COMPROMISSO.
//    -> bloco na linha do tempo, altura = duracao.
//
// 2. TAREFA COM DIA PLANEJADO, SEM HORARIO
//    `date` preenchida, `start_time` nula.
//    -> secao "Sem horário", abaixo da regua. NUNCA na regua: por-la la
//       exigiria inventar um horario, que e a unica coisa que a Agenda nao faz.
//
// 3. TAREFA COM HORARIO QUE NAO E COMPROMISSO  (= a `reserva` do prototipo)
//    `date` + `start_time`, mas `tipoDeAtividade` diz TAREFA — o caso do
//    CP5.8.1: "me lembra de pagar a conta amanha as 9h" tem hora e nao e um
//    encontro; as 9h sao do AVISO.
//    -> ocupa lugar na regua (a hora existe e e verdadeira) com a identidade
//       visual separada que o prototipo chamava de "horario reservado".
//    E a mesma semantica, derivada do mesmo jeito. Nao ha campo novo.
//
// 4. INFORMACAO SEM DATA
//    `date` nula. -> NAO aparece na Agenda, em nenhum recorte. O lugar dela e
//    Tarefas. A Agenda e o eixo TEMPO; um item sem tempo nao tem posicao nela.
//
// 5. LEMBRETE CONFIGURADO
//    `alert_enabled` + `alert_minutes_before`. -> viaja no evento como texto de
//    apoio e aparece no detalhe. Nao vira bloco proprio: o lembrete e um
//    atributo da atividade, nao uma segunda atividade.
//
// ===================== O QUE O MODELO REAL *NAO* TEM ======================
//
// FIM OBRIGATORIO. No mock todo evento tinha `fim`. Em `tasks`, `end_time` e
// nulavel. Entao `fim` aqui pode ser null e o intervalo so e ESCRITO quando
// existe de verdade; para a geometria usa-se `fimGeometrico`, que completa com
// uma duracao padrao declarada. A tela nunca afirma "09:00–10:00" quando o
// banco so sabe "09:00".
//
// COR DE CATEGORIA POR NOME. O mapa fechado do prototipo (Operação=violeta,
// Comercial=azul…) era vocabulario de maquete. Aqui a cor vem de
// `categories.color`, que e um hex real escolhido pela pessoa. Sem categoria,
// cai no accent do produto — nunca numa cor sorteada.
// ---------------------------------------------------------------------------

// Status que NAO ocupam a linha do tempo. Um compromisso cancelado nao
// acontece; deixa-lo no lugar faria a grade mentir sobre o dia. `done` CONTINUA
// aparecendo: o que foi feito aconteceu, e um dia que esconde o que aconteceu
// deixa de ser um registro do dia.
export const FORA_DA_AGENDA = [STATUS.CANCELLED, STATUS.NOT_NEEDED]

// Status abertos — a mesma lista de `lib/today.js`. A secao "Sem horário" e de
// coisas A FAZER, entao o que ja foi resolvido sai dela.
const ABERTAS = [STATUS.TODO, STATUS.IN_PROGRESS, STATUS.RESCHEDULED, STATUS.DELEGATED]

// Quanto dura, para efeito de GEOMETRIA, um compromisso sem `end_time`. E o
// mesmo valor que `lib/agendaTime.js:blockGeometry` ja usava na Agenda do dia
// desde antes deste checkpoint — a escolha nao e nova, so ficou explicita.
export const DURACAO_PADRAO_MIN = 60

export const COR_PADRAO = '#6366f1'

const hhmm = (t) => (t ? String(t).slice(0, 5) : null)

const somarMinutos = (hora, minutos) => {
  const total = toMinutes(hora) + minutos
  const h = Math.floor(total / 60) % 24
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// O texto do lembrete, do proprio dado. "Aviso 15 min antes" — nunca um
// lembrete inventado para a linha nao ficar vazia.
export function textoDoAlerta(task) {
  if (!task?.alert_enabled) return null
  const min = Number(task.alert_minutes_before)
  if (!Number.isFinite(min) || min <= 0) return 'Aviso na hora'
  if (min % 1440 === 0) {
    const d = min / 1440
    return `Aviso ${d} ${d === 1 ? 'dia' : 'dias'} antes`
  }
  if (min % 60 === 0) {
    const h = min / 60
    return `Aviso ${h}h antes`
  }
  return `Aviso ${min} min antes`
}

// ---------------------------------------------------------------------------
// UMA TASK VIRA UM EVENTO. `task` viaja inteira dentro de `.task` para que
// abrir o detalhe, concluir, editar ou excluir continue acontecendo sobre a
// atividade REAL, pelos componentes que o produto ja tem.
// ---------------------------------------------------------------------------
export function eventoDeTask(task, { categoriaPorId } = {}) {
  const inicio = hhmm(task.start_time)
  if (!task?.date || !inicio) return null
  const fim = hhmm(task.end_time)
  const categoria = categoriaPorId?.(task.category_id) || null
  const compromisso = tipoDeAtividade(task).id === COMPROMISSO.id
  return {
    id: task.id,
    task,
    titulo: task.title,
    data: task.date,
    inicio,
    fim,
    // So para posicionar e medir. Nunca para escrever na tela.
    fimGeometrico: fim && toMinutes(fim) > toMinutes(inicio)
      ? fim
      : somarMinutos(inicio, DURACAO_PADRAO_MIN),
    especie: compromisso ? 'compromisso' : 'reserva',
    cor: categoria?.color || COR_PADRAO,
    categoria: categoria?.name || null,
    alerta: textoDoAlerta(task),
    feito: task.status === STATUS.DONE,
  }
}

// Os eventos de um dia, em ordem. Um evento tem hora; e isso que o faz evento.
export function eventosDoDia(tasks = [], data, opcoes = {}) {
  return tasks
    .filter((t) => t.date === data && t.start_time && !FORA_DA_AGENDA.includes(t.status))
    .map((t) => eventoDeTask(t, opcoes))
    .filter(Boolean)
    .sort((a, b) => a.inicio.localeCompare(b.inicio) || a.fimGeometrico.localeCompare(b.fimGeometrico))
}

// O que foi escolhido PARA o dia e nao tem hora marcada. Nao e "sem data": tem
// dia, falta hora.
export function semHorarioDoDia(tasks = [], data) {
  return tasks.filter((t) => t.date === data && !t.start_time && ABERTAS.includes(t.status))
}

// A grade e a faixa de horas, prontas para a coluna da Semana.
export function disposicaoDoDia(tasks = [], data, opcoes = {}) {
  return disporDia(
    eventosDoDia(tasks, data, opcoes).map((e) => ({ ...e, fim: e.fimGeometrico, fimReal: e.fim })),
  )
}

export function faixaDeHorasDaSemana(tasks = [], dias = [], opcoes = {}) {
  return faixaDeHoras(
    dias.flatMap((d) => eventosDoDia(tasks, d, opcoes).map((e) => ({ inicio: e.inicio, fim: e.fimGeometrico }))),
  )
}

export function conflitosDoDiaReal(tasks = [], data, opcoes = {}) {
  return conflitosDoDia(
    eventosDoDia(tasks, data, opcoes).map((e) => ({ ...e, fim: e.fimGeometrico })),
  )
}

// ---------------------------------------------------------------------------
// O MES — 6 semanas a partir de SEGUNDA.
//
// AQUI HA UM DESVIO DELIBERADO DA REFERENCIA APROVADA, e esta registrado de
// proposito: a imagem do UX-M3 mostra o mes comecando no DOMINGO. O produto
// real comeca a semana na SEGUNDA em todo lugar — `lib/date.js` o diz em
// comentario ("padrao brasileiro / requisito do Kanban"), o Kanban depende
// disso, o MonthCalendar do desktop usa ['Seg'…'Dom'] e a faixa de sete dias
// desta mesma tela tambem. Fazer so o mes do telefone comecar no domingo
// deixaria DUAS semanas diferentes na mesma tela.
//
// A celula NAO leva titulo: o mes serve para orientacao, e quem responde "o
// que tem nesse dia" e a agenda que abre ABAIXO dele.
// ---------------------------------------------------------------------------
export const MAX_PONTOS = 3

export function gradeDoMes(tasks = [], ano, mes, opcoes = {}) {
  const primeiro = new Date(ano, mes, 1)
  const inicio = getWeekDays(primeiro)[0]
  return Array.from({ length: 42 }, (_, i) => {
    const d = addDays(inicio, i)
    const data = toISODate(d)
    const eventos = eventosDoDia(tasks, data, opcoes)
    const soltas = semHorarioDoDia(tasks, data)
    const cores = []
    for (const e of eventos) if (!cores.includes(e.cor)) cores.push(e.cor)
    if (soltas.length && !cores.includes(COR_PADRAO)) cores.push(COR_PADRAO)
    return {
      data,
      dia: d.getDate(),
      doMes: d.getMonth() === mes,
      total: eventos.length + soltas.length,
      compromissos: eventos.length,
      pontos: cores.slice(0, MAX_PONTOS),
    }
  })
}

// ---------------------------------------------------------------------------
// O INTERVALO DE CARGA de um recorte. A Agenda do telefone pede a SEMANA
// inteira mesmo no Dia: a faixa de sete dias no topo da Semana precisa dos
// pontos, e trocar de dia nao pode custar uma nova consulta.
// ---------------------------------------------------------------------------
export function intervaloDoRecorte(visao, data) {
  const base = fromISODate(data) || new Date()
  if (visao === 'mes') {
    const inicio = getWeekDays(new Date(base.getFullYear(), base.getMonth(), 1))[0]
    return { start: toISODate(inicio), end: toISODate(addDays(inicio, 41)) }
  }
  const dias = getWeekDays(base)
  return { start: toISODate(dias[0]), end: toISODate(dias[6]) }
}

// O que esta acontecendo agora, e o que vem a seguir. "Agora" e durante, nao
// antes: uma reuniao que ainda nao comecou nao esta acontecendo.
export function situacaoDoEvento(e, agora) {
  if (!e?.inicio) return null
  const fim = e.fimGeometrico || e.fim
  if (e.inicio <= agora && fim > agora) return { tipo: 'agora', texto: 'Agora' }
  const faltam = toMinutes(e.inicio) - toMinutes(agora)
  if (faltam > 0 && faltam <= 90) return { tipo: 'proximo', texto: `em ${faltam} min` }
  return null
}
