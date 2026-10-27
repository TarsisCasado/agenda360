import { describe, it, expect, beforeEach, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Caminho SUPABASE: prova os FILTROS que chegam ao PostgREST.
//
// O teste no modo demo prova o comportamento; este prova a consulta. E a
// consulta e o que importa aqui, porque o escopo de workspace numa exclusao so
// existe se o `.eq('workspace_id', ...)` de fato sair na requisicao — um
// `if` no nosso codigo que nao virasse filtro seria teatro.
// ---------------------------------------------------------------------------
const captured = { table: null, filters: [], deleted: false }

vi.mock('../lib/supabaseClient', () => {
  const chain = {
    delete() { captured.deleted = true; return chain },
    eq(col, val) { captured.filters.push([col, val]); return chain },
    select() { return chain },
    insert() { return chain },
    order() { return chain },
    maybeSingle: async () => ({ data: null, error: null }),
    single: async () => ({ data: {}, error: null }),
    then(resolve) { resolve({ data: [], error: null }) },
  }
  const supabase = { from: (t) => { captured.table = t; return chain } }
  return { supabase, isSupabaseConfigured: true }
})
vi.mock('./logService', () => ({
  logService: { record: vi.fn().mockResolvedValue(null), list: vi.fn() },
}))

import { inboxService } from './inboxService'

const WS = '00000000-0000-4000-8000-0000000000b1'
const WS2 = '00000000-0000-4000-8000-0000000000b2'

beforeEach(() => {
  captured.table = null
  captured.filters = []
  captured.deleted = false
})

describe('inboxService.remove — escopo na consulta', () => {
  it('o DELETE sai com os dois filtros: id E workspace_id', async () => {
    // TRANSIÇÃO DE CONTRATO — UX-M2.5a. Antes saía apenas:
    //
    //   expect(captured.filters).toEqual([['id', 'nota-1']])
    //
    // Um registro de outro espaço nunca foi apagável por causa da RLS; o que
    // mudou é que agora nem a consulta tenta.
    await inboxService.remove({ id: 'nota-1', workspace_id: WS })
    expect(captured.table).toBe('inbox_items')
    expect(captured.deleted).toBe(true)
    expect(captured.filters).toEqual([['id', 'nota-1'], ['workspace_id', WS]])
  })

  it('o workspace explícito é o que vai na consulta quando os dois concordam', async () => {
    await inboxService.remove({ id: 'nota-2', workspace_id: WS }, WS)
    expect(captured.filters).toEqual([['id', 'nota-2'], ['workspace_id', WS]])
  })

  it('workspace em conflito: NENHUMA consulta é feita', async () => {
    await expect(
      inboxService.remove({ id: 'nota-3', workspace_id: WS }, WS2),
    ).rejects.toThrow(/espaço de trabalho/i)
    expect(captured.deleted).toBe(false)
    expect(captured.filters).toEqual([])
  })

  it('sem workspace resolvível: NENHUMA consulta é feita', async () => {
    await expect(inboxService.remove({ id: 'nota-4' })).rejects.toThrow(/workspaceId/i)
    expect(captured.deleted).toBe(false)
  })
})
