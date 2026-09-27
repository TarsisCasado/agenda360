import { describe, it, expect } from 'vitest'
import { interpretLocal } from '../nlu/localNlu'
import { missingSlots, withDaypartNote } from '../slots'

// ---------------------------------------------------------------------------
// SUITE DE REGRESSAO DE LINGUAGEM REAL.
//
// Cada caso e uma frase que uma pessoa escreveria de verdade (varias vieram do
// QA no iPhone). O criterio nao e "o build passou": e intencao certa, titulo
// preservado, data certa, hora certa quando informada, NENHUM horario ou data
// inventados, e pergunta so quando falta mesmo.
//
// Hoje = DOMINGO 2026-08-23 (o dia do QA). Amanha = segunda 2026-08-24.
// Sexta = 2026-08-28. Semana que vem = 24/08 a 30/08.
// ---------------------------------------------------------------------------
const CTX = {
  today: '2026-08-23',
  now: '19:06',
  timezone: 'America/Fortaleza',
  categories: [{ id: 'cat-trab', name: 'Trabalho' }],
}

const AMANHA = '2026-08-24'
const SEXTA = '2026-08-28'

const run = (text) => interpretLocal(text, CTX)
// O que a camada de slots ainda perguntaria para esta interpretacao.
const asks = (r) => missingSlots(r.intent, r.data, { asked: [] })

describe('As 10 frases do QA real', () => {
  it('1. "Amanhã preciso vê os processos com o Sr Francisco, não posso esquecer disso."', () => {
    const r = run('Amanhã preciso vê os processos com o Sr Francisco, não posso esquecer disso.')
    expect(r.intent).toBe('create_task')
    expect(r.data.title).toBe('Vê os processos com o Sr Francisco')
    expect(r.data.date).toBe(AMANHA)
    expect(r.data.start_time).toBeUndefined() // nao inventa horario
    expect(asks(r)).toEqual([]) // tarefa comum: nao precisa perguntar nada
  })

  it('2. "Reunião com gerentes amanhã às 08:30h"', () => {
    const r = run('Reunião com gerentes amanhã às 08:30h')
    expect(r.intent).toBe('create_task')
    expect(r.data.title).toBe('Reunião com gerentes')
    expect(r.data.date).toBe(AMANHA)
    expect(r.data.start_time).toBe('08:30')
    expect(asks(r)).toEqual([]) // 08:30 nao e ambiguo: nada a perguntar
  })

  it('3. "Me lembra de ligar pro Francisco amanhã"', () => {
    const r = run('Me lembra de ligar pro Francisco amanhã')
    expect(r.intent).toBe('create_task')
    expect(r.data.title).toBe('Ligar pro Francisco')
    expect(r.data.date).toBe(AMANHA)
    expect(r.data.start_time).toBeUndefined()
  })

  it('4. "sexta tenho reunião com o Jander às 9" (hora ambigua -> pergunta o periodo)', () => {
    const r = run('sexta tenho reunião com o Jander às 9')
    expect(r.intent).toBe('create_task')
    expect(r.data.title).toBe('Reunião com o Jander')
    expect(r.data.date).toBe(SEXTA)
    expect(r.data.start_time).toBe('09:00')
    expect(r.ambiguities).toContain('horario')
    expect(asks({ ...r, data: { ...r.data, time_ambiguous: true } })).toEqual(['periodo'])
  })

  it('5. "preciso resolver o problema da Renault semana que vem" (intervalo, nao um dia)', () => {
    const r = run('preciso resolver o problema da Renault semana que vem')
    expect(r.intent).toBe('create_task')
    expect(r.data.title).toBe('Resolver o problema da Renault')
    expect(r.data.date).toBeUndefined() // NAO escolhe um dia sozinho
    expect(r.data.date_range).toEqual({ start: '2026-08-24', end: '2026-08-30' })
    expect(asks(r)).toEqual(['dia_da_semana'])
  })

  it('6. "lembra de pagar isso depois do almoço" (periodo vira nota, nao horario)', () => {
    const r = run('lembra de pagar isso depois do almoço')
    expect(r.intent).toBe('create_task')
    expect(r.data.title).toBe('Pagar isso')
    expect(r.data.daypart).toBe('depois_do_almoco')
    expect(r.data.start_time).toBeUndefined()
    expect(r.data.date).toBeUndefined()
    // CP5.8.1 mudou o que se pergunta aqui, e de proposito: "lembra de" e um
    // PEDIDO DE AVISO, e um aviso precisa de um instante. "Depois do almoco"
    // nao e um instante — entao, alem da data, o horario do alerta tambem e
    // perguntado. O que NAO mudou (e continua sendo o ponto deste teste): o
    // periodo dito pelo usuario nunca vira uma hora inventada.
    expect(r.data.alert_enabled).toBe(true)
    expect(asks(r)).toEqual(['data', 'horario_alerta'])
    const payload = withDaypartNote({ ...r.data, date: AMANHA })
    expect(payload.notes).toBe('Depois do almoço')
    expect(payload.start_time).toBeUndefined()
  })

  it('7. "amanhã 8:30 reunião dos gerentes" (hora antes do assunto)', () => {
    const r = run('amanhã 8:30 reunião dos gerentes')
    expect(r.intent).toBe('create_task')
    expect(r.data.title).toBe('Reunião dos gerentes')
    expect(r.data.date).toBe(AMANHA)
    expect(r.data.start_time).toBe('08:30')
  })

  it('8. "Tenho alguma coisa sexta?" e CONSULTA (nunca cria)', () => {
    const r = run('Tenho alguma coisa sexta?')
    expect(r.intent).toBe('list_schedule')
    expect(r.data).toEqual({ start: SEXTA, end: SEXTA })
  })

  it('9. "O que tenho amanhã?" e CONSULTA', () => {
    const r = run('O que tenho amanhã?')
    expect(r.intent).toBe('list_schedule')
    expect(r.data).toEqual({ start: AMANHA, end: AMANHA })
  })

  it('10. "Conclui a tarefa reunião com gerentes" CONCLUI (nao cria)', () => {
    const r = run('Conclui a tarefa reunião com gerentes')
    expect(r.intent).toBe('complete_task')
    expect(r.data.query).toBe('reunião com gerentes')
    expect(r.data.title).toBeUndefined()
  })
})

describe('Variacao linguistica — a mesma intencao sobrevive a formas diferentes', () => {
  const sameMeeting = [
    'Reunião com gerentes amanhã às 08:30h',
    'Reunião com gerentes amanhã às 08:30hs',
    'amanhã 8:30 reunião dos gerentes',
    'amanhã às 8h30 tenho reunião com os gerentes',
    'reunião dos gerentes amanhã 08:30hs',
    'marca reunião com os gerentes amanhã às 08:30',
    'agende a reunião dos gerentes amanhã, 8:30',
  ]
  for (const phrase of sameMeeting) {
    it(`reuniao amanha 08:30 — "${phrase}"`, () => {
      const r = run(phrase)
      expect(r.intent).toBe('create_task')
      expect(r.data.date).toBe(AMANHA)
      expect(r.data.start_time).toBe('08:30')
      expect(r.data.title.toLowerCase()).toContain('gerentes')
      expect(r.data.title.toLowerCase()).toContain('reuni')
      // nenhum residuo de hora/data no titulo
      expect(r.data.title).not.toMatch(/\d|amanh|hs\b|\bh\b/i)
    })
  }

  const sameTask = [
    'Me lembra de ligar pro Francisco amanhã',
    'amanhã preciso ligar pro Francisco',
    'tenho que ligar pro Francisco amanhã',
    'não posso esquecer de ligar pro Francisco amanhã',
    'ligar pro Francisco amanhã',
  ]
  for (const phrase of sameTask) {
    it(`tarefa "ligar pro Francisco" amanha — "${phrase}"`, () => {
      const r = run(phrase)
      expect(r.intent).toBe('create_task')
      expect(r.data.date).toBe(AMANHA)
      expect(r.data.title.toLowerCase()).toContain('francisco')
      expect(r.data.title.toLowerCase()).toMatch(/ligar/)
      expect(r.data.start_time).toBeUndefined()
    })
  }

  const sameQuery = [
    'O que tenho amanhã?',
    'o que eu tenho amanhã',
    'tenho alguma coisa amanhã?',
    'tem algo amanhã?',
    'como está minha agenda amanhã?',
  ]
  for (const phrase of sameQuery) {
    it(`consulta de amanha — "${phrase}"`, () => {
      const r = run(phrase)
      expect(r.intent).toBe('list_schedule')
      expect(r.data.start).toBe(AMANHA)
    })
  }

  const sameComplete = [
    'Conclui a tarefa reunião com gerentes',
    'concluí a reunião com gerentes',
    'conclua a tarefa reunião com gerentes',
    'terminei a reunião com gerentes',
    'já fiz a reunião com gerentes',
  ]
  for (const phrase of sameComplete) {
    it(`conclusao — "${phrase}"`, () => {
      const r = run(phrase)
      expect(r.intent).toBe('complete_task')
      expect(r.data.query.toLowerCase()).toContain('gerentes')
    })
  }
})

describe('Protecoes — o agente nao pode fazer a coisa errada', () => {
  it('consulta NUNCA vira create_task', () => {
    for (const p of ['O que tenho amanhã?', 'Tenho alguma coisa sexta?', 'tem algo hoje?']) {
      expect(run(p).intent).toBe('list_schedule')
    }
  })

  it('conclusao NUNCA vira create_task', () => {
    for (const p of ['Conclui a tarefa X', 'terminei o treino', 'já fiz a reunião']) {
      expect(run(p).intent).toBe('complete_task')
    }
  })

  it('ausencia de data NUNCA vira "hoje" caladinho', () => {
    for (const p of ['preciso resolver isso', 'me lembra de pagar o boleto', 'tenho que enviar o contrato']) {
      const r = run(p)
      expect(r.data.date).toBeUndefined()
      expect(missingSlots(r.intent, r.data)).toContain('data')
    }
  })

  it('mensagem ambigua nunca dispara acao destrutiva', () => {
    const r = run('exclua todas as tarefas')
    expect(r.needs_clarification).toBe(true)
    expect(r.confidence).toBeLessThanOrEqual(0.5)
    expect(r.data.query).toBeUndefined()
  })

  it('texto sem sentido continua "unknown" (o NLU mais aberto nao virou chute)', () => {
    for (const p of ['asdkjahsd xyz', 'kkkk', '???']) {
      expect(run(p).intent).toBe('unknown')
    }
  })

  it('nunca inventa horario quando o usuario nao deu', () => {
    for (const p of ['reunião com gerentes amanhã', 'preciso falar com Francisco amanhã']) {
      expect(run(p).data.start_time).toBeUndefined()
    }
  })

  it('periodo do dia nao vira horario exato', () => {
    for (const p of ['reunião amanhã de manhã', 'ligar pro Jander amanhã à tarde', 'resolver isso no fim do dia']) {
      const r = run(p)
      expect(r.data.start_time).toBeUndefined()
      expect(r.data.daypart).toBeTruthy()
    }
  })
})

describe('Extras temporais cobrados no produto', () => {
  it('"depois de amanhã"', () => {
    expect(run('reunião depois de amanhã às 10h').data.date).toBe('2026-08-25')
  })
  it('"sexta-feira" e "próxima sexta" apontam para a mesma sexta futura', () => {
    expect(run('reunião sexta-feira às 10h').data.date).toBe(SEXTA)
    expect(run('reunião próxima sexta às 10h').data.date).toBe(SEXTA)
  })
  it('"daqui a duas horas" usa a hora atual', () => {
    const r = run('me lembra de ligar pro Jander daqui a duas horas')
    expect(r.data.date).toBe('2026-08-23')
    expect(r.data.start_time).toBe('21:06')
  })
  it('prioridade e categoria saem do texto e do titulo', () => {
    const r = run('Agende reunião com Rafael amanhã às 15h, prioridade alta')
    expect(r.data.priority).toBe('high')
    expect(r.data.title).toBe('Reunião com Rafael')
  })
})
