import { describe, it, expect, beforeEach } from 'vitest'
import { createConversationMemory } from './conversationMemory'

// ---------------------------------------------------------------------------
// Memoria de conversa no MODO LOCAL (sem Supabase). Prova que a intencao
// pendente do slot-filling persiste em ai_conversations.context — a coluna
// jsonb que JA existia no schema. Nenhuma migration foi criada para isto.
// ---------------------------------------------------------------------------
class MemoryStorage {
  constructor() {
    this.map = new Map()
  }
  getItem(k) {
    return this.map.has(k) ? this.map.get(k) : null
  }
  setItem(k, v) {
    this.map.set(k, String(v))
  }
  removeItem(k) {
    this.map.delete(k)
  }
}

beforeEach(() => {
  globalThis.localStorage = new MemoryStorage()
})

describe('conversationMemory — historico', () => {
  it('grava e recupera os turnos da conversa', async () => {
    const memory = createConversationMemory()
    const id = await memory.startConversation('w1', 'u1')
    await memory.append(id, 'user', 'Preciso falar com Francisco amanhã')
    await memory.append(id, 'assistant', 'Qual horário?')
    const history = await memory.history(id)
    expect(history).toHaveLength(2)
    expect(history[0]).toMatchObject({ role: 'user' })
    expect(history[1].content).toBe('Qual horário?')
  })

  it('history de conversa inexistente/vazia nao quebra', async () => {
    const memory = createConversationMemory()
    expect(await memory.history(null)).toEqual([])
    expect(await memory.history('nao-existe')).toEqual([])
  })
})

describe('conversationMemory — intencao pendente (ai_conversations.context)', () => {
  it('guarda, le e limpa a pendencia', async () => {
    const memory = createConversationMemory()
    const id = await memory.startConversation('w1', 'u1')
    expect(await memory.getPending(id)).toBeNull()

    await memory.setPending(id, {
      intent: 'create_task',
      data: { title: 'Falar com Francisco', date: '2026-08-24' },
      asked: [],
      awaiting: 'horario',
    })

    const pending = await memory.getPending(id)
    expect(pending.intent).toBe('create_task')
    expect(pending.awaiting).toBe('horario')
    expect(pending.data.title).toBe('Falar com Francisco')

    await memory.clearPending(id)
    expect(await memory.getPending(id)).toBeNull()
  })

  it('setContext preserva as outras chaves do contexto', async () => {
    const memory = createConversationMemory()
    const id = await memory.startConversation('w1', 'u1')
    await memory.setContext(id, { origem: 'captura' })
    await memory.setPending(id, { intent: 'create_task', data: {} })
    const context = await memory.getContext(id)
    expect(context.origem).toBe('captura')
    expect(context.pending.intent).toBe('create_task')
  })

  it('conversas diferentes nao compartilham pendencia', async () => {
    const memory = createConversationMemory()
    const a = await memory.startConversation('w1', 'u1')
    const b = await memory.startConversation('w1', 'u1')
    await memory.setPending(a, { intent: 'create_task', data: { title: 'A' } })
    expect(await memory.getPending(b)).toBeNull()
    expect((await memory.getPending(a)).data.title).toBe('A')
  })
})
