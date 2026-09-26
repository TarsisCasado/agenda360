import { describe, it, expect, beforeEach, vi } from 'vitest'

// MODO DEMO: 100% local, sem rede e sem IA.
vi.mock('../lib/supabaseClient', () => ({ supabase: null, isSupabaseConfigured: false }))
vi.mock('../services/logService', () => ({
  logService: { record: vi.fn().mockResolvedValue(null), list: vi.fn() },
}))

import { conversionService } from '../services/conversionService'
import { inboxService } from '../services/inboxService'
import { inboxTaskLinkService } from '../services/inboxTaskLinkService'
import { taskService } from '../services/taskService'
import { TASK_ORIGINS } from '../services/taskService'
import { baseline, invariante } from './contrato'

// ---------------------------------------------------------------------------
// BASELINE — CAPTURA -> TAREFA.
//
// Esta e a area mais bem resolvida do produto atual, e o trabalho da migracao
// e NAO quebra-la. Quatro garantias entram aqui como invariante, porque o
// UX1.3.1 as promoveu a contrato e elas ja sao verdade:
//
//   . guardar nao depende de IA (nenhum modulo de agente e importado aqui);
//   . converter NAO apaga nem arquiva a captura;
//   . o vinculo captura-tarefa e registrado nos dois sentidos;
//   . `origin` vem da fonte real, nunca do formulario.
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

describe('BASELINE Captura — guardar', () => {
  it(invariante('INV-22', 'guardar uma captura nao passa por IA nenhuma'), async () => {
    const nota = await inboxService.create(WS, USER, { title: '', content: 'ligar para a locadora' })
    expect(nota.id).toBeTruthy()
    expect(nota.content).toBe('ligar para a locadora')
    // Estado inicial: por organizar. Nao ha "processando", nao ha espera.
    expect(nota.status).toBe('inbox')
  })

  it(baseline('a captura nasce com origem `manual` e tipo `note`'), async () => {
    const nota = await inboxService.create(WS, USER, { content: 'x' })
    expect(nota.origin).toBe('manual')
    expect(nota.type).toBe('note')
  })

  it(baseline('origem fora da lista conhecida cai para `manual` em vez de persistir lixo'), async () => {
    const nota = await inboxService.create(WS, USER, { content: 'x', origin: 'telepatia' })
    expect(nota.origin).toBe('manual')
  })
})

describe('BASELINE Captura — virar tarefa', () => {
  it(invariante('INV-23', 'criar a tarefa NAO apaga nem arquiva a captura'), async () => {
    const nota = await inboxService.create(WS, USER, { content: 'revisar contrato' })
    await conversionService.convertInboxItemToTask(WS, USER, nota, { title: 'Revisar contrato' })

    const aindaLa = (await inboxService.list(WS)).find((n) => n.id === nota.id)
    expect(aindaLa).toBeTruthy()
    expect(aindaLa.status).toBe('inbox') // nem arquivada, nem "processada"
    expect(aindaLa.content).toBe('revisar contrato')
  })

  it(invariante('INV-23', 'o vinculo captura-tarefa e registrado e navegavel nos dois sentidos'), async () => {
    const nota = await inboxService.create(WS, USER, { content: 'y' })
    const { task, link } = await conversionService.convertInboxItemToTask(WS, USER, nota, { title: 'Y' })

    expect(link.inbox_item_id).toBe(nota.id)
    expect(link.task_id).toBe(task.id)

    // Da tarefa para a captura: consulta direta.
    const daTarefa = await inboxTaskLinkService.getByTask(WS, task.id)
    expect(daTarefa?.inbox_item_id).toBe(nota.id)

    // Da captura para a tarefa: o produto expoe um MAPA de convertidas, nao
    // uma consulta por item. Caracterizado como esta.
    const mapa = await inboxTaskLinkService.convertedMap(WS)
    expect(mapa[nota.id]?.task_id).toBe(task.id)
  })

  it(baseline('uma captura pode gerar N tarefas, e todas apontam de volta'), async () => {
    const nota = await inboxService.create(WS, USER, { content: 'tres coisas' })
    const a = await conversionService.convertInboxItemToTask(WS, USER, nota, { title: 'A' })
    const b = await conversionService.convertInboxItemToTask(WS, USER, nota, { title: 'B' })

    // Os dois vinculos existem...
    expect((await inboxTaskLinkService.getByTask(WS, a.task.id))?.inbox_item_id).toBe(nota.id)
    expect((await inboxTaskLinkService.getByTask(WS, b.task.id))?.inbox_item_id).toBe(nota.id)
    // ...e o mapa de convertidas guarda UMA por captura (a mais recente).
    const mapa = await inboxTaskLinkService.convertedMap(WS)
    expect([a.task.id, b.task.id]).toContain(mapa[nota.id].task_id)
  })
})

describe('BASELINE Captura — proveniencia', () => {
  it(baseline('captura manual gera tarefa com origin `inbox`'), async () => {
    const nota = await inboxService.create(WS, USER, { content: 'z' })
    const { task } = await conversionService.convertInboxItemToTask(WS, USER, nota, { title: 'Z' })
    expect(task.origin).toBe('inbox')
  })

  it(baseline('captura por foto gera tarefa com origin `photo`'), async () => {
    const nota = await inboxService.create(WS, USER, { content: 'w', origin: 'photo' })
    const { task } = await conversionService.convertInboxItemToTask(WS, USER, nota, { title: 'W' })
    expect(task.origin).toBe('photo')
  })

  it(
    invariante('proveniencia-confiavel', 'o formulario NAO consegue escolher a origem da tarefa'),
    async () => {
      const nota = await inboxService.create(WS, USER, { content: 'v' })
      const { task } = await conversionService.convertInboxItemToTask(WS, USER, nota, {
        title: 'V',
        origin: 'assistant', // tentativa explicita de mentir sobre a origem
      })
      expect(task.origin).toBe('inbox')
    },
  )

  it(baseline('criacao comum de tarefa nasce com origin `manual`'), async () => {
    const t = await taskService.create(WS, USER, { title: 'Direto' })
    expect(t.origin).toBe('manual')
  })

  it(baseline('edicao comum NUNCA altera a origem ja gravada'), async () => {
    const t = await taskService.create(WS, USER, { title: 'Direto' })
    const editada = await taskService.update(USER, t, { title: 'Editado', origin: 'google_calendar' })
    expect(editada.origin).toBe('manual')
  })

  it(baseline('as origens que o produto reconhece hoje'), () => {
    expect(TASK_ORIGINS).toEqual([
      'manual',
      'inbox',
      'assistant',
      'photo',
      'pdf',
      'audio',
      'google_calendar',
      'email',
      'integration',
    ])
  })
})
