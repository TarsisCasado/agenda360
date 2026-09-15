import { describe, it, expect } from 'vitest'
import { PRIORITIES, STATUSES, ALLOWED_INTENTS } from './interpretation'
import { PRIORITY, STATUS } from '../../lib/constants'
import { createTools } from '../tools'

// ---------------------------------------------------------------------------
// A VIGIA DA DUPLICACAO DECLARADA (CP6.2).
//
// O contrato compartilhado nao importa nada — e o que o torna importavel por
// Vite e por Deno ao mesmo tempo, sem negociar com bundler. O preco sao duas
// listas literais (prioridades e status) que espelham `lib/constants`.
//
// Duplicacao que ninguem vigia e duplicacao que diverge. Estes testes sao a
// vigia: no dia em que o dominio ganhar um status novo e o contrato nao, a
// suite fica vermelha ANTES de um provider comecar a devolver um valor que a
// fronteira recusa em silencio.
//
// A allowlist de intents e vigiada do mesmo jeito, contra as ferramentas
// realmente registradas: prometer ao modelo uma intencao que o dominio nao
// executa e pior que nao prometer nada.
// ---------------------------------------------------------------------------
describe('o contrato compartilhado não pode divergir do domínio', () => {
  it('as prioridades são exatamente as de lib/constants', () => {
    expect([...PRIORITIES].sort()).toEqual(Object.values(PRIORITY).sort())
  })

  it('os status são exatamente os de lib/constants', () => {
    expect([...STATUSES].sort()).toEqual(Object.values(STATUS).sort())
  })

  it('toda intent da allowlist existe como ferramenta de verdade', () => {
    const registradas = new Set(createTools({ tasks: {}, links: {} }).map((t) => t.intent))
    const fantasmas = [...ALLOWED_INTENTS].filter((i) => !registradas.has(i))
    expect(fantasmas, `intents prometidas ao modelo sem ferramenta: ${fantasmas}`).toEqual([])
  })
})
