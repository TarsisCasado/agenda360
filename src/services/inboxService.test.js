import { describe, it, expect, beforeEach, vi } from 'vitest'

// Forca MODO DEMO (independente do .env): roda 100% local, sem rede.
vi.mock('../lib/supabaseClient', () => ({
  supabase: null,
  isSupabaseConfigured: false,
}))

import { inboxService } from './inboxService'

beforeEach(() => {
  const store = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  })
})

const WS = '00000000-0000-4000-8000-0000000000b1'
const WS2 = '00000000-0000-4000-8000-0000000000b2'
const USER = '00000000-0000-4000-8000-000000000001'

describe('inboxService — nota de texto (A1/A1.5)', () => {
  it('cria nota com title/content, status inbox, seen false e origem manual', async () => {
    const saved = await inboxService.create(WS, USER, { title: 'Comprar tablets', content: 'Samsung' })
    expect(saved.type).toBe('note')
    expect(saved.title).toBe('Comprar tablets')
    expect(saved.content).toBe('Samsung')
    expect(saved.status).toBe('inbox')
    expect(saved.seen).toBe(false)
    expect(saved.origin).toBe('manual')
    expect(saved.created_by).toBe(USER)
    expect(saved.updated_by).toBe(USER)
  })

  it('edita title e conteudo', async () => {
    const saved = await inboxService.create(WS, USER, { content: 'rascunho' })
    const up = await inboxService.update(saved, { title: 'A', content: 'final' })
    expect(up.title).toBe('A')
    expect(up.content).toBe('final')
  })

  it('escopa por workspace', async () => {
    await inboxService.create(WS, USER, { content: 'ws1' })
    await inboxService.create(WS2, USER, { content: 'ws2' })
    expect(await inboxService.list(WS)).toHaveLength(1)
    expect(await inboxService.list(WS2)).toHaveLength(1)
  })
})

describe('inboxService — estados (A2.1)', () => {
  it('list filtra por status; "todos" traz tudo', async () => {
    const a = await inboxService.create(WS, USER, { content: 'na caixa' })
    const b = await inboxService.create(WS, USER, { content: 'pensar' })
    await inboxService.moveToThink(b)
    const c = await inboxService.create(WS, USER, { content: 'arquivar' })
    await inboxService.archive(c)

    expect((await inboxService.list(WS, { status: 'inbox' })).map((n) => n.id)).toEqual([a.id])
    expect((await inboxService.list(WS, { status: 'to_think' })).map((n) => n.id)).toEqual([b.id])
    expect((await inboxService.list(WS, { status: 'archived' })).map((n) => n.id)).toEqual([c.id])
    expect(await inboxService.list(WS)).toHaveLength(3) // todos
  })

  it('mover para pensar / caixa / arquivar / restaurar', async () => {
    const n = await inboxService.create(WS, USER, { content: 'x' })
    expect((await inboxService.moveToThink(n)).status).toBe('to_think')
    expect((await inboxService.moveToInbox(n)).status).toBe('inbox')
    expect((await inboxService.archive(n)).status).toBe('archived')
    expect((await inboxService.restore(n)).status).toBe('inbox')
  })

  it('marcar como visto (controle visual)', async () => {
    const n = await inboxService.create(WS, USER, { content: 'x' })
    expect(n.seen).toBe(false)
    expect((await inboxService.setSeen(n, true)).seen).toBe(true)
    expect((await inboxService.setSeen(n, false)).seen).toBe(false)
  })
})

describe('inboxService — checklist (A2.1)', () => {
  it('cria checklist e adiciona/marca/edita/remove itens', async () => {
    const cl = await inboxService.create(WS, USER, { type: 'checklist', title: 'Compras' })
    expect(cl.type).toBe('checklist')

    const i1 = await inboxService.addChecklistItem(WS, cl.id, { text: 'Pao', position: 0 })
    const i2 = await inboxService.addChecklistItem(WS, cl.id, { text: 'Leite', position: 1 })
    let items = await inboxService.listChecklistItems(WS, cl.id)
    expect(items).toHaveLength(2)
    expect(items.map((i) => i.text)).toEqual(['Pao', 'Leite'])
    expect(items.every((i) => !i.checked)).toBe(true)

    await inboxService.toggleChecklistItem(i1, true)
    items = await inboxService.listChecklistItems(WS, cl.id)
    expect(items.find((i) => i.id === i1.id).checked).toBe(true)

    await inboxService.updateChecklistItem(i2, { text: 'Leite integral' })
    items = await inboxService.listChecklistItems(WS, cl.id)
    expect(items.find((i) => i.id === i2.id).text).toBe('Leite integral')

    await inboxService.removeChecklistItem(i1)
    items = await inboxService.listChecklistItems(WS, cl.id)
    expect(items).toHaveLength(1)
  })

  it('excluir a nota remove os itens de checklist (cascade em demo)', async () => {
    const cl = await inboxService.create(WS, USER, { type: 'checklist' })
    await inboxService.addChecklistItem(WS, cl.id, { text: 'a' })
    await inboxService.addChecklistItem(WS, cl.id, { text: 'b' })
    await inboxService.remove(cl)
    expect(await inboxService.listChecklistItems(WS, cl.id)).toHaveLength(0)
  })
})

describe('inboxService — conversao de tipo (A2.1)', () => {
  it('nota -> checklist quebra as linhas em itens', async () => {
    const n = await inboxService.create(WS, USER, { content: 'Pao\nLeite\n\nCafe' })
    const conv = await inboxService.setType(WS, n, 'checklist')
    expect(conv.type).toBe('checklist')
    expect(conv.content).toBe('')
    const items = await inboxService.listChecklistItems(WS, n.id)
    expect(items.map((i) => i.text)).toEqual(['Pao', 'Leite', 'Cafe'])
  })

  it('checklist -> nota junta os itens no content', async () => {
    const cl = await inboxService.create(WS, USER, { type: 'checklist' })
    await inboxService.addChecklistItem(WS, cl.id, { text: 'um', position: 0 })
    await inboxService.addChecklistItem(WS, cl.id, { text: 'dois', position: 1 })
    const conv = await inboxService.setType(WS, cl, 'note')
    expect(conv.type).toBe('note')
    expect(conv.content).toBe('um\ndois')
    expect(await inboxService.listChecklistItems(WS, cl.id)).toHaveLength(0)
  })
})

describe('inboxService — timeline / historico (A2.2)', () => {
  const actions = async (note) => (await inboxService.listEvents(WS, note.id)).map((e) => e.action)

  it('registra "created" ao criar (com actor)', async () => {
    const n = await inboxService.create(WS, USER, { content: 'x' })
    const events = await inboxService.listEvents(WS, n.id)
    expect(events).toHaveLength(1)
    expect(events[0].action).toBe('created')
    expect(events[0].actor_id).toBe(USER)
  })

  it('registra "edited" ao editar conteudo', async () => {
    const n = await inboxService.create(WS, USER, { content: 'x' })
    await inboxService.editContent(n, { content: 'y' }, USER)
    expect(await actions(n)).toEqual(['edited', 'created']) // mais recente 1o
  })

  it('registra cada movimentacao e o historico NUNCA e apagado (reversivel)', async () => {
    const n = await inboxService.create(WS, USER, { content: 'x' })
    // inbox -> para pensar -> arquivado -> inbox (restaurado)
    await inboxService.moveToThink(n, USER)
    await inboxService.archive(n, USER)
    await inboxService.restore(n, USER)
    const acts = await actions(n)
    // ordem cronologica reversa (mais recente 1o)
    expect(acts).toEqual(['restored', 'archived', 'moved_to_think', 'created'])
    // volta para caixa a partir de "para pensar" gera moved_to_inbox
    await inboxService.moveToThink(n, USER)
    await inboxService.moveToInbox(n, USER)
    const acts2 = await actions(n)
    expect(acts2[0]).toBe('moved_to_inbox')
    expect(acts2).toContain('moved_to_think')
    // nada foi removido: total cresce monotonicamente
    expect(acts2.length).toBe(6)
  })

  it('registra "seen"/"unseen" ao marcar/desmarcar visto', async () => {
    const n = await inboxService.create(WS, USER, { content: 'x' })
    await inboxService.setSeen(n, true, USER)
    await inboxService.setSeen(n, false, USER)
    const acts = await actions(n)
    expect(acts.slice(0, 2)).toEqual(['unseen', 'seen'])
  })

  it('falha ao gravar evento nao derruba a operacao (best-effort)', async () => {
    // Mesmo sem actor, a nota e criada normalmente.
    const n = await inboxService.create(WS, null, { content: 'x' })
    expect(n.id).toBeTruthy()
  })
})

// ===========================================================================
// UX-M2.3 — `get` escopado por workspace.
//
// Existe para que anexar possa PROVAR que o item de destino e real e e deste
// espaco. O teste que mais importa aqui e o do vazamento: um id de outro
// workspace tem de responder a mesma coisa que um id inventado.
// ===========================================================================
describe('inboxService — get (uma nota, sempre do workspace certo)', () => {
  it('devolve a nota do próprio workspace', async () => {
    const nota = await inboxService.create(WS, USER, { title: 'Minha', content: 'conteúdo' })
    const lida = await inboxService.get(WS, nota.id)
    expect(lida).not.toBeNull()
    expect(lida.id).toBe(nota.id)
    expect(lida.title).toBe('Minha')
    expect(lida.content).toBe('conteúdo')
  })

  it('devolve null para id inexistente', async () => {
    await inboxService.create(WS, USER, { title: 'Existe' })
    expect(await inboxService.get(WS, 'id-que-nao-existe')).toBeNull()
  })

  it('NÃO atravessa workspace — e responde igual ao inexistente', async () => {
    const alheia = await inboxService.create(WS2, USER, { title: 'Segredo do outro espaço' })
    const porId = await inboxService.get(WS, alheia.id)
    const inventado = await inboxService.get(WS, 'id-que-nao-existe')
    // Mesma resposta: quem nao pode ver nao descobre que existe.
    expect(porId).toBeNull()
    expect(porId).toEqual(inventado)
    // E do lado de la continua acessivel.
    expect((await inboxService.get(WS2, alheia.id)).title).toBe('Segredo do outro espaço')
  })

  it('null para argumentos faltando, sem consultar nada', async () => {
    expect(await inboxService.get(null, 'x')).toBeNull()
    expect(await inboxService.get(WS, null)).toBeNull()
    expect(await inboxService.get()).toBeNull()
  })

  it('não altera a nota: ler é só ler', async () => {
    const nota = await inboxService.create(WS, USER, { title: 'Intacta', content: 'texto' })
    await inboxService.get(WS, nota.id)
    await inboxService.get(WS, nota.id)
    const depois = await inboxService.get(WS, nota.id)
    expect(depois.updated_at).toBe(nota.updated_at)
    expect(depois.seen).toBe(nota.seen)
    expect(depois.status).toBe(nota.status)
  })
})

// ---------------------------------------------------------------------------
// EXCLUSAO ESCOPADA POR WORKSPACE (UX-M2.5a).
//
// Era a unica operacao irreversivel do servico sem escopo: `get`, `list` e
// `update` todos filtravam, `remove` apagava por id. A RLS do Supabase ja
// barrava o caso hostil; o que faltava era a camada que protege contra o
// NOSSO codigo passar o item errado.
//
// A regressao a temer aqui nao e de seguranca, e de funcionamento: se o escopo
// ficar apertado demais, excluir nota, ideia ou captura para de funcionar. Por
// isso os tres tipos estao cobertos.
// ---------------------------------------------------------------------------
describe('inboxService — exclusão escopada por workspace', () => {
  it('exclui normalmente nota, ideia e captura do PRÓPRIO workspace', async () => {
    for (const tipo of ['note', 'idea', 'checklist']) {
      const item = await inboxService.create(WS, USER, { type: tipo, title: tipo })
      await inboxService.remove(item)
      const restantes = await inboxService.list(WS)
      expect(restantes.find((n) => n.id === item.id)).toBeUndefined()
    }
  })

  it('o workspace vem do próprio item: a assinatura antiga continua valendo', async () => {
    // Nenhum chamador existente passa workspace — todos passam a linha lida do
    // banco, que carrega `workspace_id`. Isto é o que mantém o contrato.
    const nota = await inboxService.create(WS, USER, { title: 'x' })
    await expect(inboxService.remove(nota)).resolves.toBeUndefined()
  })

  it('workspace explícito que CONCORDA com o item funciona igual', async () => {
    const nota = await inboxService.create(WS, USER, { title: 'x' })
    await inboxService.remove(nota, WS)
    expect((await inboxService.list(WS)).find((n) => n.id === nota.id)).toBeUndefined()
  })

  it('workspace explícito que DISCORDA do item é recusado, e a nota fica', async () => {
    const nota = await inboxService.create(WS, USER, { title: 'não me apague' })
    await expect(inboxService.remove(nota, WS2)).rejects.toThrow(/espaço de trabalho/i)
    const viva = (await inboxService.list(WS)).find((n) => n.id === nota.id)
    expect(viva).toBeDefined()
    expect(viva.title).toBe('não me apague')
  })

  it('item de OUTRO workspace não é apagado — e nem o que pende dele', async () => {
    // O acidente concreto que isto evita: antes, os filtros de checklist e
    // anexo rodavam por `inbox_item_id` SEM conferir o espaço, então uma
    // exclusão com o workspace errado levava embora o checklist de uma nota
    // que continuava existindo.
    const alheia = await inboxService.create(WS2, USER, { type: 'checklist', title: 'alheia' })
    await inboxService.addChecklistItem(WS2, alheia.id, { text: 'item que fica' })

    await inboxService.remove({ ...alheia, workspace_id: WS })

    expect((await inboxService.list(WS2)).find((n) => n.id === alheia.id)).toBeDefined()
    expect(await inboxService.listChecklistItems(WS2, alheia.id)).toHaveLength(1)
  })

  it('sem workspace resolvível, LANÇA em vez de apagar', async () => {
    // TRANSIÇÃO DE CONTRATO — UX-M2.5a. Antes isto apagava por id. A asserção
    // anterior era, em efeito:
    //
    //   await inboxService.remove({ id }) // apagava
    //
    // Hoje recusa: "não sei de que espaço esta nota é" não é razão para apagar.
    const nota = await inboxService.create(WS, USER, { title: 'x' })
    await expect(inboxService.remove({ id: nota.id })).rejects.toThrow(/workspaceId/i)
    expect((await inboxService.list(WS)).find((n) => n.id === nota.id)).toBeDefined()
  })

  it('nota inválida é recusada antes de qualquer coisa', async () => {
    await expect(inboxService.remove(null)).rejects.toThrow(/nota inválida|nota invalida/i)
    await expect(inboxService.remove({})).rejects.toThrow(/nota inválida|nota invalida/i)
  })
})
