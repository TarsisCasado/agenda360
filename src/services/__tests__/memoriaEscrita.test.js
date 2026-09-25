import { describe, it, expect, beforeEach, vi } from 'vitest'

// MODO DEMO (sem Supabase): o mesmo caminho de codigo, 100% local.
vi.mock('../../lib/supabaseClient', () => ({ supabase: null, isSupabaseConfigured: false }))
vi.mock('../logService', () => ({
  logService: { record: vi.fn().mockResolvedValue(null), list: vi.fn() },
}))

import { inboxService } from '../inboxService'
import { linkService } from '../linkService'
import { taskService } from '../taskService'
import { conversionService } from '../conversionService'
import { inboxTaskLinkService } from '../inboxTaskLinkService'
import { agregarMemoria, ORGANIZACAO, SIGNIFICADO } from '../../lib/memoria'

// ---------------------------------------------------------------------------
// UX1.6 (C3) — O QUE A MEMORIA ESCREVE, E O QUE ELA JAMAIS DESTROI.
//
// Estes testes rodam contra os SERVICES REAIS (em modo demo), nao contra
// dublês: a garantia que interessa aqui — "derivar uma acao nao consome o
// conteudo que a gerou" — e sobre persistencia, e um mock que devolve o que eu
// mandei provaria apenas que eu sei escrever mocks.
//
// Cobre: F, G, H, I, J, K do checkpoint.
// ---------------------------------------------------------------------------

const WS = '00000000-0000-4000-8000-0000000000b1'
const USER = '00000000-0000-4000-8000-000000000001'

beforeEach(() => {
  const store = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  })
})

// O modo demo SEMEIA tarefas (e a Memoria comeca vazia porque `inbox_items`
// nao entra no seed). Contar tarefas em valor absoluto mediria o seed, nao o
// efeito do que o teste fez — entao aqui se mede sempre a VARIACAO.
const contarTarefas = async () => (await taskService.list(WS, {})).length

const listarMemoriaReal = async () => {
  const [notas, links, vinculos] = await Promise.all([
    inboxService.list(WS),
    linkService.list(WS),
    inboxTaskLinkService.convertedMap(WS),
  ])
  return agregarMemoria({ notas, links, vinculos })
}

// ===========================================================================
// F / G — UMA NOTA PODE SIMPLESMENTE SER UMA NOTA
// ===========================================================================
describe('F — criar nota nao cria tarefa', () => {
  it('escrever uma nota nao produz nenhuma tarefa', async () => {
    const antes = await contarTarefas()
    await inboxService.create(WS, USER, { title: 'Pensar no layout', content: 'talvez' })
    expect(await contarTarefas()).toBe(antes)
  })

  it('nem cria vinculo com tarefa', async () => {
    await inboxService.create(WS, USER, { title: 'Pensar no layout', content: '' })
    expect(await inboxTaskLinkService.convertedMap(WS)).toEqual({})
  })
})

describe('G — nota nao exige categoria, data, status nem IA', () => {
  it('nota em branco e valida e ja aparece na Memoria', async () => {
    const n = await inboxService.create(WS, USER, {})
    expect(n.id).toBeTruthy()
    expect(n.title).toBe('')
    expect(n.content).toBe('')
    const itens = await listarMemoriaReal()
    expect(itens).toHaveLength(1)
    expect(itens[0].titulo).toBe('Sem título')
  })

  it('nao ha campo obrigatorio de categoria nem de data na nota', async () => {
    const n = await inboxService.create(WS, USER, { content: 'so o texto' })
    expect(n).not.toHaveProperty('category_id')
    expect(n).not.toHaveProperty('date')
    expect(n).not.toHaveProperty('due_date')
  })

  it('a nota nasce POR ORGANIZAR — e isso e um estado, nao uma pendencia', async () => {
    await inboxService.create(WS, USER, { content: 'x' })
    const [item] = await listarMemoriaReal()
    expect(item.organizacao).toBe(ORGANIZACAO.POR_ORGANIZAR)
    expect(item.significado).toBeNull()
  })
})

// ===========================================================================
// H / I — DERIVAR ACAO SEM CONSUMIR O CONTEUDO
// ===========================================================================
describe('H — criar tarefa a partir de nota PRESERVA a nota', () => {
  it('a nota continua existindo, com o mesmo texto, depois da conversao', async () => {
    const nota = await inboxService.create(WS, USER, {
      title: 'Padronizar preparação dos veículos',
      content: 'checklist de preparação',
    })
    await conversionService.convertInboxItemToTask(WS, USER, nota, {
      title: 'Revisar checklist de preparação',
      date: null,
    })

    const notas = await inboxService.list(WS)
    expect(notas).toHaveLength(1)
    expect(notas[0].id).toBe(nota.id)
    expect(notas[0].title).toBe('Padronizar preparação dos veículos')
    expect(notas[0].content).toBe('checklist de preparação')
  })

  it('a nota nao e arquivada nem marcada como consumida', async () => {
    const nota = await inboxService.create(WS, USER, { title: 'Ideia', content: '' })
    await conversionService.convertInboxItemToTask(WS, USER, nota, { title: 'Tarefa', date: null })
    const [salva] = await inboxService.list(WS)
    expect(salva.status).toBe('inbox')
  })

  it('a tarefa existe em Tarefas, com titulo proprio', async () => {
    const antes = await contarTarefas()
    const nota = await inboxService.create(WS, USER, { title: 'Nota', content: '' })
    await conversionService.convertInboxItemToTask(WS, USER, nota, {
      title: 'Revisar checklist', date: null,
    })
    const tarefas = await taskService.list(WS, {})
    expect(tarefas).toHaveLength(antes + 1)
    expect(tarefas.some((t) => t.title === 'Revisar checklist')).toBe(true)
  })
})

describe('I — a relacao origem -> tarefa e recuperavel dos DOIS lados', () => {
  it('a Memoria mostra "1 tarefa relacionada" lendo o vinculo persistido', async () => {
    const nota = await inboxService.create(WS, USER, { title: 'Nota', content: '' })
    const { task } = await conversionService.convertInboxItemToTask(WS, USER, nota, {
      title: 'Tarefa', date: null,
    })
    const [item] = await listarMemoriaReal()
    expect(item.tarefasRelacionadas).toEqual([task.id])
  })

  it('a tarefa sabe de onde veio (origin inbox + vinculo por task_id)', async () => {
    const nota = await inboxService.create(WS, USER, { title: 'Nota', content: '' })
    const { task } = await conversionService.convertInboxItemToTask(WS, USER, nota, {
      title: 'Tarefa', date: null,
    })
    expect(task.origin).toBe('inbox')
    const vinculo = await inboxTaskLinkService.getByTask(WS, task.id)
    expect(vinculo.inbox_item_id).toBe(nota.id)
  })

  it('link tambem guarda a relacao — pela coluna task_id que ja existia', async () => {
    const link = await linkService.create(WS, USER, {
      url: 'https://carmais.com.br', title: 'Relatório', desired_action: 'read',
    })
    const t = await taskService.create(WS, USER, { title: 'Ler relatório', date: null })
    await linkService.attachTask(link.id, t.id)
    const item = (await listarMemoriaReal()).find((i) => i.fonte === 'links')
    expect(item.tarefasRelacionadas).toEqual([t.id])
  })

  it('DUAS tarefas a partir da mesma nota: a nota continua uma so', async () => {
    const nota = await inboxService.create(WS, USER, { title: 'Reunião', content: 'dois assuntos' })
    const antes = await contarTarefas()
    await conversionService.convertInboxItemToTask(WS, USER, nota, { title: 'A', date: null })
    await conversionService.convertInboxItemToTask(WS, USER, nota, { title: 'B', date: null })
    expect(await inboxService.list(WS)).toHaveLength(1)
    expect(await contarTarefas()).toBe(antes + 2)
  })
})

// ===========================================================================
// ORGANIZAR — decisao reversivel, nunca obrigatoria
// ===========================================================================
describe('organizar e uma decisao, e ela volta atras', () => {
  it('"tratar como ideia" tira de Por organizar e da significado', async () => {
    const nota = await inboxService.create(WS, USER, { title: 'Talvez', content: '' })
    await inboxService.moveToThink(nota, USER)
    const [item] = await listarMemoriaReal()
    expect(item.organizacao).toBe(ORGANIZACAO.ORGANIZADO)
    expect(item.significado).toBe(SIGNIFICADO.IDEIA)
  })

  it('"manter como nota" organiza sem virar ideia nem tarefa', async () => {
    const antes = await contarTarefas()
    const nota = await inboxService.create(WS, USER, { title: 'Só uma nota', content: '' })
    await inboxService.markProcessed(nota, USER)
    const [item] = await listarMemoriaReal()
    expect(item.organizacao).toBe(ORGANIZACAO.ORGANIZADO)
    expect(item.significado).toBeNull()
    expect(await contarTarefas()).toBe(antes)
  })

  it('da para voltar para Por organizar', async () => {
    const nota = await inboxService.create(WS, USER, { title: 'x', content: '' })
    const ideia = await inboxService.moveToThink(nota, USER)
    await inboxService.moveToInbox(ideia, USER)
    const [item] = await listarMemoriaReal()
    expect(item.organizacao).toBe(ORGANIZACAO.POR_ORGANIZAR)
  })

  it('organizar NAO altera o texto guardado', async () => {
    const nota = await inboxService.create(WS, USER, { title: 'T', content: 'corpo' })
    await inboxService.markProcessed(nota, USER)
    const [salva] = await inboxService.list(WS)
    expect(salva.title).toBe('T')
    expect(salva.content).toBe('corpo')
  })

  it('a decisao fica na timeline — o historico nunca e apagado', async () => {
    const nota = await inboxService.create(WS, USER, { title: 'T', content: '' })
    await inboxService.markProcessed(nota, USER)
    const eventos = await inboxService.listEvents(WS, nota.id)
    expect(eventos.map((e) => e.action)).toContain('organized')
    expect(eventos.map((e) => e.action)).toContain('created')
  })
})

// ===========================================================================
// J / K — GUARDAR NAO E APAGAR
// ===========================================================================
describe('J — arquivar nao exclui', () => {
  it('a nota arquivada continua no banco, com o conteudo intacto', async () => {
    const nota = await inboxService.create(WS, USER, { title: 'Contrato', content: 'jurídico' })
    await inboxService.archive(nota, USER)
    const notas = await inboxService.list(WS)
    expect(notas).toHaveLength(1)
    expect(notas[0].status).toBe('archived')
    expect(notas[0].content).toBe('jurídico')
  })

  it('e da para restaurar', async () => {
    const nota = await inboxService.create(WS, USER, { title: 'Contrato', content: '' })
    const arq = await inboxService.archive(nota, USER)
    await inboxService.restore(arq, USER)
    const [item] = await listarMemoriaReal()
    expect(item.arquivado).toBe(false)
  })

  it('arquivar nao apaga a relacao com a tarefa criada antes', async () => {
    const nota = await inboxService.create(WS, USER, { title: 'Nota', content: '' })
    const { task } = await conversionService.convertInboxItemToTask(WS, USER, nota, {
      title: 'Tarefa', date: null,
    })
    await inboxService.archive(nota, USER)
    const [item] = await listarMemoriaReal()
    expect(item.arquivado).toBe(true)
    expect(item.tarefasRelacionadas).toEqual([task.id])
  })
})

describe('K — excluir e outra coisa, e so acontece quando pedido', () => {
  it('excluir some com a nota (nenhum outro caminho faz isso)', async () => {
    const nota = await inboxService.create(WS, USER, { title: 'x', content: '' })
    await inboxService.remove(nota)
    expect(await inboxService.list(WS)).toHaveLength(0)
  })

  it('nenhuma outra acao da Memoria remove a linha', async () => {
    const nota = await inboxService.create(WS, USER, { title: 'x', content: 'y' })
    await inboxService.moveToThink(nota, USER)
    await inboxService.markProcessed(nota, USER)
    await inboxService.archive(nota, USER)
    await conversionService.convertInboxItemToTask(WS, USER, nota, { title: 'T', date: null })
    expect(await inboxService.list(WS)).toHaveLength(1)
  })

  it('excluir a NOTA nao apaga a tarefa que ela gerou', async () => {
    const antes = await contarTarefas()
    const nota = await inboxService.create(WS, USER, { title: 'x', content: '' })
    await conversionService.convertInboxItemToTask(WS, USER, nota, { title: 'T', date: null })
    await inboxService.remove(nota)
    expect(await contarTarefas()).toBe(antes + 1)
  })
})

// ===========================================================================
// A — A MEMORIA AGREGA AS FONTES REAIS
// ===========================================================================
describe('A — a Memoria le as fontes que ja existiam', () => {
  it('notas, ideias, capturas e links entram na mesma lista', async () => {
    const a = await inboxService.create(WS, USER, { title: 'Nota', content: '' })
    const b = await inboxService.create(WS, USER, { title: 'Ideia', content: '' })
    await inboxService.moveToThink(b, USER)
    await inboxService.create(WS, USER, { title: 'Foto', content: '', origin: 'photo' })
    await linkService.create(WS, USER, { url: 'https://x.com', title: 'X', desired_action: 'read' })

    const itens = await listarMemoriaReal()
    expect(itens).toHaveLength(4)
    expect(itens.filter((i) => i.fonte === 'inbox_items')).toHaveLength(3)
    expect(itens.filter((i) => i.fonte === 'links')).toHaveLength(1)
    expect(itens.find((i) => i.origemId === a.id).titulo).toBe('Nota')
  })

  it('as telas antigas continuam lendo exatamente as mesmas linhas', async () => {
    await inboxService.create(WS, USER, { title: 'Nota', content: '' })
    await linkService.create(WS, USER, { url: 'https://x.com', title: 'X', desired_action: 'read' })
    // Memoria compoe; nao substitui nem esconde a fonte.
    expect(await inboxService.list(WS)).toHaveLength(1)
    expect(await linkService.list(WS)).toHaveLength(1)
  })
})
