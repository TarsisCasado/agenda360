import { describe, it, expect } from 'vitest'
import { STATUS } from './constants'
import {
  eventoDeTask, eventosDoDia, semHorarioDoDia, disposicaoDoDia,
  faixaDeHorasDaSemana, conflitosDoDiaReal, gradeDoMes, intervaloDoRecorte,
  situacaoDoEvento, textoDoAlerta, DURACAO_PADRAO_MIN, COR_PADRAO, FORA_DA_AGENDA,
} from './agendaReal'

// ---------------------------------------------------------------------------
// O ADAPTADOR (C2) — o que ele tem de provar nao e desenho, e HONESTIDADE:
// que cada distincao do modelo real sobrevive a traducao para o vocabulario
// visual aprovado, e que nada e inventado no caminho.
// ---------------------------------------------------------------------------

const HOJE = '2026-10-15'

const base = {
  workspace_id: 'w1',
  description: '', notes: '', link: '',
  status: STATUS.TODO,
  priority: 'medium',
  category_id: null,
  date: null, start_time: null, end_time: null,
  alert_enabled: false, alert_type: 'push', alert_minutes_before: 15,
  reschedule_count: 0,
}
const task = (extra) => ({ ...base, ...extra })

const CATEGORIAS = {
  'cat-op': { id: 'cat-op', name: 'Operação', color: '#7c3aed' },
  'cat-fin': { id: 'cat-fin', name: 'Financeiro', color: '#0ea5e9' },
}
const cat = { categoriaPorId: (id) => CATEGORIAS[id] || null }

// As cinco distincoes do §3, uma task de cada.
const COMPROMISSO = task({
  id: 'compromisso', title: 'Reunião com a diretoria', date: HOJE,
  start_time: '09:00:00', end_time: '10:30:00', category_id: 'cat-op',
})
const SEM_HORARIO = task({ id: 'sem-horario', title: 'Revisar a proposta', date: HOJE })
const RESERVA = task({
  // CP5.8.1: tem hora e NAO e encontro — as 9h sao do aviso. `tipoDeAtividade`
  // chama isso de TAREFA; a Agenda mostra como horario reservado.
  id: 'reserva', title: 'Pagar as contas do mês', date: HOJE,
  start_time: '14:00:00', alert_enabled: true, alert_minutes_before: 30,
})
const SEM_DATA = task({ id: 'sem-data', title: 'Ideia solta' })
const COM_LEMBRETE = task({
  id: 'lembrete', title: 'Almoço com o cliente', date: HOJE,
  start_time: '12:00:00', end_time: '13:00:00',
  alert_enabled: true, alert_minutes_before: 60, category_id: 'cat-fin',
})

const TODAS = [COMPROMISSO, SEM_HORARIO, RESERVA, SEM_DATA, COM_LEMBRETE]

describe('1 · compromisso com intervalo', () => {
  it('vira evento com inicio e fim reais', () => {
    const e = eventoDeTask(COMPROMISSO, cat)
    expect(e).toMatchObject({ inicio: '09:00', fim: '10:30', especie: 'compromisso' })
  })

  it('leva a cor da categoria, do banco — nao de um mapa por nome', () => {
    expect(eventoDeTask(COMPROMISSO, cat).cor).toBe('#7c3aed')
  })

  it('sem categoria cai no accent do produto, nunca numa cor sorteada', () => {
    expect(eventoDeTask(task({ id: 'x', date: HOJE, start_time: '08:00' }), cat).cor).toBe(COR_PADRAO)
  })

  it('a task REAL viaja dentro do evento, para abrir/editar/concluir o objeto certo', () => {
    expect(eventoDeTask(COMPROMISSO, cat).task).toBe(COMPROMISSO)
  })
})

describe('2 · tarefa com dia planejado e sem horario', () => {
  it('aparece em "Sem horário", nunca na regua', () => {
    expect(semHorarioDoDia(TODAS, HOJE).map((t) => t.id)).toEqual(['sem-horario'])
    expect(eventosDoDia(TODAS, HOJE, cat).map((e) => e.id)).not.toContain('sem-horario')
  })

  it('o que ja foi resolvido sai da lista de "a fazer"', () => {
    const feita = task({ id: 'feita', title: 'Pronto', date: HOJE, status: STATUS.DONE })
    expect(semHorarioDoDia([feita], HOJE)).toHaveLength(0)
  })
})

describe('3 · tarefa com horario que nao e compromisso (o "horario reservado")', () => {
  it('ocupa lugar na regua, porque a hora existe e e verdadeira', () => {
    expect(eventosDoDia(TODAS, HOJE, cat).map((e) => e.id)).toContain('reserva')
  })

  it('e identificada como reserva, nao como compromisso', () => {
    expect(eventoDeTask(RESERVA, cat).especie).toBe('reserva')
  })

  it('um titulo de encontro com aviso continua compromisso — a heuristica e a do produto', () => {
    const r = task({
      id: 'r2', title: 'Reunião com o jurídico', date: HOJE,
      start_time: '15:00', alert_enabled: true,
    })
    expect(eventoDeTask(r, cat).especie).toBe('compromisso')
  })
})

describe('4 · informacao sem data', () => {
  it('NAO entra na Agenda em nenhum recorte', () => {
    expect(eventosDoDia(TODAS, HOJE, cat).map((e) => e.id)).not.toContain('sem-data')
    expect(semHorarioDoDia(TODAS, HOJE).map((t) => t.id)).not.toContain('sem-data')
    const mes = gradeDoMes(TODAS, 2026, 9, cat)
    expect(mes.reduce((s, c) => s + c.total, 0)).toBe(4)
  })
})

describe('5 · lembrete configurado', () => {
  it('viaja no evento, com o texto do proprio dado', () => {
    expect(eventoDeTask(COM_LEMBRETE, cat).alerta).toBe('Aviso 1h antes')
    expect(eventoDeTask(RESERVA, cat).alerta).toBe('Aviso 30 min antes')
  })

  it('sem alerta ligado, nao ha texto — nunca um lembrete inventado', () => {
    expect(eventoDeTask(COMPROMISSO, cat).alerta).toBe(null)
  })

  it('le dias e horas quando o numero fecha', () => {
    expect(textoDoAlerta(task({ alert_enabled: true, alert_minutes_before: 1440 }))).toBe('Aviso 1 dia antes')
    expect(textoDoAlerta(task({ alert_enabled: true, alert_minutes_before: 2880 }))).toBe('Aviso 2 dias antes')
    expect(textoDoAlerta(task({ alert_enabled: true, alert_minutes_before: 120 }))).toBe('Aviso 2h antes')
    expect(textoDoAlerta(task({ alert_enabled: true, alert_minutes_before: 0 }))).toBe('Aviso na hora')
  })

  it('o lembrete NAO vira um segundo bloco na grade', () => {
    expect(eventosDoDia([COM_LEMBRETE], HOJE, cat)).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
describe('o fim que o banco nao sabe', () => {
  it('end_time nulo NAO e escrito na tela: `fim` continua nulo', () => {
    expect(eventoDeTask(RESERVA, cat).fim).toBe(null)
  })

  it('mas a geometria precisa de um fim, e ele e declarado e separado', () => {
    const e = eventoDeTask(RESERVA, cat)
    expect(e.fimGeometrico).toBe('15:00')
    expect(DURACAO_PADRAO_MIN).toBe(60)
  })

  it('end_time anterior ao inicio nao encolhe o bloco para altura negativa', () => {
    const torto = task({ id: 't', date: HOJE, start_time: '10:00', end_time: '09:00' })
    expect(eventoDeTask(torto, cat).fimGeometrico).toBe('11:00')
  })

  it('a disposicao expoe o fim real a parte, para o bloco nao mentir o intervalo', () => {
    const [bloco] = disposicaoDoDia([RESERVA], HOJE, cat)
    expect(bloco.evento.fim).toBe('15:00')
    expect(bloco.evento.fimReal).toBe(null)
  })
})

describe('o que nao ocupa a linha do tempo', () => {
  it('cancelado e nao-necessario saem da regua: eles nao acontecem', () => {
    expect(FORA_DA_AGENDA).toEqual([STATUS.CANCELLED, STATUS.NOT_NEEDED])
    const cancelado = task({ id: 'c', title: 'Cancelado', date: HOJE, start_time: '08:00', status: STATUS.CANCELLED })
    expect(eventosDoDia([cancelado], HOJE, cat)).toHaveLength(0)
  })

  it('FEITO continua aparecendo: um dia que esconde o que aconteceu deixa de ser o dia', () => {
    const feito = task({ id: 'f', title: 'Feito', date: HOJE, start_time: '08:00', status: STATUS.DONE })
    const [e] = eventosDoDia([feito], HOJE, cat)
    expect(e.feito).toBe(true)
  })
})

describe('ordem, conflito e faixa de horas', () => {
  it('os eventos do dia saem em ordem de inicio', () => {
    expect(eventosDoDia(TODAS, HOJE, cat).map((e) => e.inicio)).toEqual(['09:00', '12:00', '14:00'])
  })

  it('sobreposicao real e detectada sobre o fim GEOMETRICO, que e o que ocupa espaco', () => {
    const a = task({ id: 'a', title: 'Reunião A', date: HOJE, start_time: '10:00', end_time: '12:00' })
    const b = task({ id: 'b', title: 'Reunião B', date: HOJE, start_time: '11:30', end_time: '12:30' })
    expect(conflitosDoDiaReal([a, b], HOJE, cat)).toHaveLength(1)
    expect(conflitosDoDiaReal([COMPROMISSO, COM_LEMBRETE], HOJE, cat)).toHaveLength(0)
  })

  it('a faixa olha a semana inteira: a altura da grade nao pula ao deslizar', () => {
    const cedo = task({ id: 'cedo', date: '2026-10-13', start_time: '06:30', end_time: '07:00' })
    const tarde = task({ id: 'tarde', date: '2026-10-17', start_time: '20:30', end_time: '21:30' })
    const dias = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']
    expect(faixaDeHorasDaSemana([cedo, tarde], dias, cat)).toEqual({ inicio: 6, fim: 22 })
  })
})

describe('o mes', () => {
  const mes = gradeDoMes(TODAS, 2026, 9, cat)

  it('seis semanas, sempre', () => {
    expect(mes).toHaveLength(42)
  })

  it('comeca na SEGUNDA — a mesma semana do Kanban, do desktop e da faixa', () => {
    // DESVIO DELIBERADO da referencia UX-M3, que mostrava domingo. Ver a nota
    // em `agendaReal.js`: o produto real comeca a semana na segunda em todo
    // lugar, e duas semanas diferentes na mesma tela seria pior.
    expect(new Date(`${mes[0].data}T12:00:00`).getDay()).toBe(1)
  })

  it('a celula conta o dia e guarda no maximo tres cores', () => {
    const hoje = mes.find((c) => c.data === HOJE)
    expect(hoje).toMatchObject({ compromissos: 3, total: 4, doMes: true })
    expect(hoje.pontos.length).toBeLessThanOrEqual(3)
  })

  it('dias de fora do mes continuam na grade, marcados', () => {
    expect(mes.some((c) => !c.doMes)).toBe(true)
  })
})

describe('o intervalo que a tela pede ao servico', () => {
  it('Dia e Semana pedem a semana inteira — a faixa de sete dias precisa dos pontos', () => {
    expect(intervaloDoRecorte('dia', HOJE)).toEqual({ start: '2026-10-12', end: '2026-10-18' })
    expect(intervaloDoRecorte('semana', HOJE)).toEqual({ start: '2026-10-12', end: '2026-10-18' })
  })

  it('o Mes pede as seis semanas que ele desenha, e nada mais', () => {
    const { start, end } = intervaloDoRecorte('mes', HOJE)
    expect(start).toBe('2026-09-28')
    expect(end).toBe('2026-11-08')
    expect(gradeDoMes([], 2026, 9, cat)[0].data).toBe(start)
    expect(gradeDoMes([], 2026, 9, cat)[41].data).toBe(end)
  })
})

describe('agora e a seguir', () => {
  const e = eventoDeTask(COMPROMISSO, cat)

  it('"Agora" e durante, nao antes', () => {
    expect(situacaoDoEvento(e, '08:40')).toMatchObject({ tipo: 'proximo', texto: 'em 20 min' })
    expect(situacaoDoEvento(e, '09:30')).toMatchObject({ tipo: 'agora' })
  })

  it('depois do fim nao diz nada, e longe demais tambem nao', () => {
    expect(situacaoDoEvento(e, '11:00')).toBe(null)
    expect(situacaoDoEvento(e, '06:00')).toBe(null)
  })

  it('um evento sem end_time ainda sabe dizer que esta acontecendo', () => {
    const r = eventoDeTask(RESERVA, cat)
    expect(situacaoDoEvento(r, '14:30')).toMatchObject({ tipo: 'agora' })
    expect(situacaoDoEvento(r, '15:30')).toBe(null)
  })
})
