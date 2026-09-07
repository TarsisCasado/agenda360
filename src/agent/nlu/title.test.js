import { describe, it, expect } from 'vitest'
import { extractTitle, extractQuery, extractTarget } from './title'
import { resolveTemporal } from './temporal'

const CTX = { today: '2026-08-23', now: '19:06' }
const title = (text) => extractTitle(text, resolveTemporal(text, CTX).spans)

describe('titulo — nenhum residuo de data/hora (bugs reais do QA)', () => {
  const cases = [
    // O caso exato do iPhone: "hs" deixava um "s" solto no titulo.
    ['Reunião com gerentes amanhã às 08:30hs', 'Reunião com gerentes'],
    ['Reunião com gerentes amanhã às 08:30h', 'Reunião com gerentes'],
    ['Reunião com gerentes amanhã às 8:30', 'Reunião com gerentes'],
    // "8h30" deixava um "30" solto no titulo e perdia os minutos.
    ['reunião gerentes amanhã às 8h30', 'Reunião gerentes'],
    // Hora ANTES do assunto: o titulo virava "8 30 reunião dos gerentes".
    ['amanhã 8:30 reunião dos gerentes', 'Reunião dos gerentes'],
    ['reunião dos gerentes amanhã 08:30hs', 'Reunião dos gerentes'],
    ['Reunião com gerentes, amanhã, 08:30h', 'Reunião com gerentes'],
    ['reunião sexta-feira às 15h', 'Reunião'],
  ]
  for (const [input, expected] of cases) {
    it(`"${input}" -> "${expected}"`, () => {
      expect(title(input)).toBe(expected)
    })
  }

  it('nunca sobra "s", "h" ou numero de hora solto', () => {
    for (const [input] of cases) {
      expect(title(input)).not.toMatch(/(^|\s)(s|h|hs|hrs|\d{1,2}|30)(\s|$)/)
    }
  })
})

describe('titulo — envelope de comando sai, conteudo do usuario fica', () => {
  const cases = [
    ['Me lembra de ligar pro Francisco amanhã', 'Ligar pro Francisco'],
    ['me lembra de pagar o boleto', 'Pagar o boleto'],
    ['lembra de pagar isso depois do almoço', 'Pagar isso'],
    ['preciso resolver o problema da Renault semana que vem', 'Resolver o problema da Renault'],
    ['sexta tenho reunião com o Jander às 9', 'Reunião com o Jander'],
    ['Agende reunião com Rafael amanhã às 15h, prioridade alta', 'Reunião com Rafael'],
    ['tenho que enviar o contrato hoje', 'Enviar o contrato'],
    ['marca uma call com o time amanhã às 10h', 'Call com o time'],
    [
      'Amanhã preciso vê os processos com o Sr Francisco, não posso esquecer disso.',
      'Vê os processos com o Sr Francisco',
    ],
  ]
  for (const [input, expected] of cases) {
    it(`"${input}" -> "${expected}"`, () => {
      expect(title(input)).toBe(expected)
    })
  }

  it('nomes proprios e palavras do usuario sao preservados', () => {
    expect(title('preciso falar com o Sr. Francisco amanhã')).toContain('Sr. Francisco')
    expect(title('resolver o problema da Renault amanhã')).toContain('Renault')
  })

  it('texto que vira vazio depois da limpeza devolve string vazia', () => {
    expect(extractTitle('amanhã', resolveTemporal('amanhã', CTX).spans)).toBe('')
    expect(extractTitle('me lembra de', [])).toBe('')
  })
})

describe('query e alvo', () => {
  it('extractQuery limpa o verbo de busca', () => {
    expect(extractQuery('Busque tarefas de trabalho', [])).toBe('trabalho')
    expect(extractQuery('procure as tarefas do Francisco', [])).toBe('Francisco')
  })

  it('extractTarget limpa o verbo de conclusao e o rotulo "tarefa"', () => {
    expect(extractTarget('Conclui a tarefa reunião com gerentes', [])).toBe('reunião com gerentes')
    expect(extractTarget('Conclua a tarefa Treino na academia', [])).toBe('Treino na academia')
    expect(extractTarget('cancele a reunião com o Jander', [])).toBe('reunião com o Jander')
  })
})
