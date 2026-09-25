import { describe, it, expect } from 'vitest'
import { buildToday } from './today'
import {
  linhaDoDia, precisaDeVoce, sugestaoDoMomento, diasDeAtraso,
  AMOSTRA_ATENCAO, REMARCACOES_PARA_SINAL, JANELA_MINIMA_MIN,
} from './hojeMobile'

const HOJE = '2026-09-25'
const AGORA = new Date('2026-09-25T08:00:00')

const tarefa = (over = {}) => ({
  id: 't' + Math.random().toString(36).slice(2, 8),
  title: 'Tarefa',
  date: HOJE,
  start_time: null,
  end_time: null,
  status: 'todo',
  reschedule_count: 0,
  ...over,
})

const montar = (tasks) => buildToday(tasks, { today: HOJE, now: AGORA })

describe('linha do dia — uma agenda, nao dois blocos', () => {
  it('compromissos vem na ordem do relogio', () => {
    const t = montar([
      tarefa({ id: 'tarde', title: 'Almoço', start_time: '12:00' }),
      tarefa({ id: 'manha', title: 'Reunião', start_time: '09:00' }),
      tarefa({ id: 'noite', title: 'Jantar', start_time: '20:00' }),
    ])
    // 'manha' e o proximo e fica em AGORA; a linha segue na ordem do relogio.
    expect(linhaDoDia(t).map((l) => l.task.id)).toEqual(['tarde', 'noite'])
  })

  it('tarefa sem hora entra DEPOIS, e nunca ganha horario inventado', () => {
    const t = montar([
      tarefa({ id: 'sem', title: 'Revisar proposta' }),
      tarefa({ id: 'com', title: 'Reunião', start_time: '09:00' }),
      tarefa({ id: 'com2', title: 'Almoço', start_time: '12:00' }),
    ])
    const l = linhaDoDia(t)
    expect(l.map((x) => x.task.id)).toEqual(['com2', 'sem'])
    expect(l[1].hora).toBeNull()
  })

  it('a hora vem cortada em HH:MM', () => {
    const t = montar([tarefa({ start_time: '09:00:00' })])
    expect(linhaDoDia(t, { excluirProximo: false })[0].hora).toBe('09:00')
  })

  it('UM ITEM, UM LUGAR: o destaque de AGORA sai da linha do dia', () => {
    const t = montar([
      tarefa({ id: 'a', start_time: '09:00' }),
      tarefa({ id: 'b', start_time: '14:00' }),
    ])
    expect(t.proximo.id).toBe('a')
    const ids = linhaDoDia(t).map((l) => l.task.id)
    expect(ids).toEqual(['b'])
  })

  it('sem destaque, o dia inteiro fica na linha', () => {
    const t = montar([tarefa({ id: 'passou', start_time: '07:00' })])
    // 07:00 ja passou as 08:00, entao a tarefa esta ATRASADA e nao ha proximo.
    expect(t.proximo).toBeNull()
    expect(linhaDoDia(t)).toHaveLength(0)
  })

  it('o destaque pode ser reincluido explicitamente, se alguma tela quiser', () => {
    const t = montar([tarefa({ id: 'a', start_time: '09:00' })])
    expect(linhaDoDia(t, { excluirProximo: false }).map((l) => l.task.id)).toEqual(['a'])
  })

  it('dia sem nada devolve lista vazia, nao um placeholder', () => {
    expect(linhaDoDia(montar([]))).toEqual([])
  })
})

describe('precisa de voce — so excecao de verdade', () => {
  it('atraso entra, com a evidencia em dias', () => {
    const t = montar([tarefa({ id: 'x', title: 'Pagar contas', date: '2026-09-22' })])
    const p = precisaDeVoce(t, { today: HOJE })
    expect(p).toHaveLength(1)
    expect(p[0].tipo).toBe('atraso')
    expect(p[0].evidencia).toBe('3 dias de atraso')
  })

  it('1 dia de atraso fala no singular', () => {
    const t = montar([tarefa({ date: '2026-09-24' })])
    expect(precisaDeVoce(t, { today: HOJE })[0].evidencia).toBe('1 dia de atraso')
  })

  it('atraso maior vem primeiro', () => {
    const t = montar([
      tarefa({ id: 'pouco', date: '2026-09-24' }),
      tarefa({ id: 'muito', date: '2026-09-10' }),
    ])
    expect(precisaDeVoce(t, { today: HOJE })[0].task.id).toBe('muito')
  })

  it('remarcada SEM DATA vira sinal, e a frase nao julga a pessoa', () => {
    const t = montar([tarefa({ id: 'r', date: null, reschedule_count: REMARCACOES_PARA_SINAL })])
    const p = precisaDeVoce(t, { today: HOJE })
    expect(p[0].tipo).toBe('remarcada')
    expect(p[0].evidencia).toBe('Mudou de dia 3 vezes')
    expect(p[0].evidencia).not.toMatch(/procrastin|preguic|disciplin|falh/i)
  })

  it('UM ITEM, UM LUGAR: remarcada DE HOJE nao aparece duas vezes', () => {
    const t = montar([tarefa({ id: 'hoje-remarcada', reschedule_count: 4 })])
    // Ela e do dia, entao esta na linha do dia...
    const linha = linhaDoDia(t)
    expect(linha.map((l) => l.task.id)).toContain('hoje-remarcada')
    // ...e o sinal viaja COM ela, em vez de criar um segundo item.
    expect(linha[0].sinal).toBe('4×')
    expect(precisaDeVoce(t, { today: HOJE })).toHaveLength(0)
  })

  it('a linha do dia normal nao carrega sinal nenhum', () => {
    const t = montar([tarefa({ reschedule_count: 1 })])
    expect(linhaDoDia(t)[0].sinal).toBeNull()
  })

  it('UMA remarcacao nao vira alarme', () => {
    const t = montar([tarefa({ date: null, reschedule_count: 1 })])
    expect(precisaDeVoce(t, { today: HOJE })).toHaveLength(0)
  })

  it('delegada aparece como aguardando, sem inventar "devolvida" nem "aceite"', () => {
    const t = montar([tarefa({ id: 'd', status: 'delegated', date: null })])
    const p = precisaDeVoce(t, { today: HOJE })
    expect(p[0].tipo).toBe('delegada')
    expect(p[0].evidencia).toBe('Delegada — ainda sem retorno')
  })

  it('atraso ganha de remarcada, que ganha de delegada', () => {
    const t = montar([
      tarefa({ id: 'del', status: 'delegated', date: null }),
      tarefa({ id: 'rem', date: null, reschedule_count: 4 }),
      tarefa({ id: 'atr', date: '2026-09-20' }),
    ])
    expect(precisaDeVoce(t, { today: HOJE }).map((p) => p.task.id))
      .toEqual(['atr', 'rem', 'del'])
  })

  it('tarefa normal de hoje NAO e excecao', () => {
    const t = montar([tarefa({ title: 'Reunião', start_time: '14:00' })])
    expect(precisaDeVoce(t, { today: HOJE })).toHaveLength(0)
  })

  it('a amostra e pequena de proposito: excecao nao e feed', () => {
    expect(AMOSTRA_ATENCAO).toBeLessThanOrEqual(2)
  })

  it('dia limpo nao produz nenhuma pendencia', () => {
    expect(precisaDeVoce(montar([]), { today: HOJE })).toEqual([])
  })
})

describe('dias de atraso', () => {
  it('conta dias de calendario', () => {
    expect(diasDeAtraso({ date: '2026-09-20' }, HOJE)).toBe(5)
  })
  it('sem data nao quebra', () => {
    expect(diasDeAtraso({ date: null }, HOJE)).toBe(0)
  })
})

describe('sugestao do momento — a IA cabe numa frase', () => {
  it('propoe quando ha janela e ha candidato', () => {
    const t = montar([
      tarefa({ id: 'reuniao', title: 'Reunião', start_time: '09:00' }),
      tarefa({ id: 'atrasada', title: 'Fechar repasse', date: '2026-09-20' }),
    ])
    const s = sugestaoDoMomento(t, AGORA)
    expect(s).not.toBeNull()
    expect(s.minutos).toBe(60)
    expect(s.task.id).toBe('atrasada')
    expect(s.pergunta).toContain('Fechar repasse')
  })

  it('o atrasado ganha do sem data', () => {
    const t = montar([
      tarefa({ id: 'reuniao', start_time: '09:00' }),
      tarefa({ id: 'semdata', date: null }),
      tarefa({ id: 'atrasada', date: '2026-09-20' }),
    ])
    expect(sugestaoDoMomento(t, AGORA).task.id).toBe('atrasada')
  })

  it('sem candidato NAO inventa sugestao para preencher espaco', () => {
    const t = montar([tarefa({ start_time: '09:00' })])
    expect(sugestaoDoMomento(t, AGORA)).toBeNull()
  })

  it('compromisso perto demais nao vira janela', () => {
    const t = montar([
      tarefa({ id: 'reuniao', start_time: '08:10' }),
      tarefa({ id: 'atrasada', date: '2026-09-20' }),
    ])
    expect(sugestaoDoMomento(t, AGORA)).toBeNull()
  })

  it('janela longa demais tambem nao: "daqui a 6 horas" nao e um bloco', () => {
    const t = montar([
      tarefa({ id: 'reuniao', start_time: '18:00' }),
      tarefa({ id: 'atrasada', date: '2026-09-20' }),
    ])
    expect(sugestaoDoMomento(t, AGORA)).toBeNull()
  })

  it('sem proximo compromisso nao ha momento a sugerir', () => {
    const t = montar([tarefa({ id: 'atrasada', date: '2026-09-20' })])
    expect(sugestaoDoMomento(t, AGORA)).toBeNull()
  })

  it('a janela minima e generosa o bastante para caber alguma coisa', () => {
    expect(JANELA_MINIMA_MIN).toBeGreaterThanOrEqual(15)
  })

  it('a sugestao PERGUNTA — nunca anuncia que fez algo', () => {
    const t = montar([
      tarefa({ id: 'reuniao', start_time: '09:00' }),
      tarefa({ id: 'atrasada', title: 'X', date: '2026-09-20' }),
    ])
    const s = sugestaoDoMomento(t, AGORA)
    expect(s.pergunta.trim().endsWith('?')).toBe(true)
    expect(s.frase).not.toMatch(/reservei|criei|agendei|marquei/i)
  })
})
