import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createTools } from '../tools'
import { createToolRegistry } from '../toolRegistry'
import { createAgentRuntime } from '../agentRuntime'
import { createFeatureFlags, FLAGS } from '../featureFlags'
import { createEventBus, EVENTS } from '../eventBus'
import { ErrorCodes } from '../errors'

const IDENTITY = { workspaceId: 'w1', userId: 'u1' }
const VALID_TASK = { title: 'Reuniao com Rafael', date: '2026-07-15' }

function makeServices(overrides = {}) {
  return {
    tasks: {
      getById: vi.fn(async (ws, id) =>
        id === 'missing' ? null : { id, workspace_id: ws, title: 'X', status: 'todo', reschedule_count: 0 },
      ),
      create: vi.fn(async (ws, uid, data) => ({ id: 'task-new', workspace_id: ws, created_by: uid, ...data })),
      update: vi.fn(async (uid, task, patch) => ({ ...task, ...patch })),
      changeStatus: vi.fn(async (uid, task, status) => ({ ...task, status })),
      reschedule: vi.fn(async (uid, task, date) => ({ ...task, date, status: 'rescheduled' })),
      remove: vi.fn(async () => {}),
      list: vi.fn(async () => [
        { id: 't1', title: 'Alpha', status: 'todo' },
        { id: 't2', title: 'Beta', status: 'done' },
      ]),
      ...overrides.tasks,
    },
    links: {
      create: vi.fn(async (ws, uid, data) => ({ id: 'link-1', workspace_id: ws, ...data })),
      ...overrides.links,
    },
  }
}

function makeRegistry({ services = makeServices(), flags = createFeatureFlags(), eventBus = createEventBus() } = {}) {
  const registry = createToolRegistry({ tools: createTools(services), flags, eventBus })
  return { registry, services, flags, eventBus }
}

function makeAiActions() {
  return {
    recordProposed: vi.fn(async () => 'action-1'),
    recordResult: vi.fn(async () => {}),
  }
}

describe('Tool Registry — allowlist e segurança', () => {
  it('rejeita intent inexistente', async () => {
    const { registry } = makeRegistry()
    await expect(registry.execute('drop_database', {}, IDENTITY)).rejects.toMatchObject({
      code: ErrorCodes.UNKNOWN_INTENT,
    })
  })

  it('rejeita payload inválido (create_task sem título)', async () => {
    const { registry } = makeRegistry()
    await expect(
      registry.execute('create_task', { date: '2026-07-15' }, IDENTITY),
    ).rejects.toMatchObject({ code: ErrorCodes.INVALID_PAYLOAD })
  })

  it('rejeita ferramenta desativada por feature flag', async () => {
    const flags = createFeatureFlags({ [FLAGS.ASSISTANT]: false })
    const { registry } = makeRegistry({ flags })
    await expect(registry.execute('create_task', VALID_TASK, IDENTITY)).rejects.toMatchObject({
      code: ErrorCodes.TOOL_DISABLED,
    })
  })

  it('marca ferramentas destrutivas como requiresConfirmation', () => {
    const { registry } = makeRegistry()
    expect(registry.get('delete_task').requiresConfirmation).toBe(true)
    expect(registry.get('cancel_task').requiresConfirmation).toBe(true)
    expect(registry.get('create_task').requiresConfirmation).toBe(false)
  })

  it('bloqueia execução sem confirmação em ferramenta sensível', async () => {
    const { registry } = makeRegistry()
    await expect(
      registry.execute('delete_task', { task_id: 't1' }, IDENTITY),
    ).rejects.toMatchObject({ code: ErrorCodes.CONFIRMATION_REQUIRED })
  })

  it('executa ferramenta sensível quando confirmada', async () => {
    const { registry, services } = makeRegistry()
    const res = await registry.execute('delete_task', { task_id: 't1' }, IDENTITY, { confirmed: true })
    expect(res).toMatchObject({ id: 't1', deleted: true })
    expect(services.tasks.remove).toHaveBeenCalledOnce()
  })

  it('rejeita tarefa inexistente com NOT_FOUND', async () => {
    const { registry } = makeRegistry()
    await expect(
      registry.execute('complete_task', { task_id: 'missing' }, IDENTITY),
    ).rejects.toMatchObject({ code: ErrorCodes.NOT_FOUND })
  })

  it('rejeita identidade/workspace ausente', async () => {
    const { registry } = makeRegistry()
    await expect(
      registry.execute('create_task', VALID_TASK, { userId: 'u1' }),
    ).rejects.toMatchObject({ code: ErrorCodes.FORBIDDEN_WORKSPACE })
  })

  it('executa ação bem-sucedida usando os services com a identidade da sessão', async () => {
    const { registry, services } = makeRegistry()
    const res = await registry.execute('create_task', VALID_TASK, IDENTITY)
    expect(res).toMatchObject({ id: 'task-new', title: 'Reuniao com Rafael' })
    expect(services.tasks.create).toHaveBeenCalledWith(
      'w1',
      'u1',
      expect.objectContaining({ title: 'Reuniao com Rafael', priority: 'medium', status: 'todo' }),
    )
  })

  it('padroniza falha inesperada do service como EXECUTION_FAILED', async () => {
    const services = makeServices({ tasks: { create: vi.fn(async () => { throw new Error('db down') }) } })
    const { registry } = makeRegistry({ services })
    await expect(registry.execute('create_task', VALID_TASK, IDENTITY)).rejects.toMatchObject({
      code: ErrorCodes.EXECUTION_FAILED,
    })
  })
})

describe('Event Bus', () => {
  it('emite ACTION_SUCCEEDED em sucesso e ACTION_FAILED em falha', async () => {
    const eventBus = createEventBus()
    const okSpy = vi.fn()
    const failSpy = vi.fn()
    eventBus.on(EVENTS.ACTION_SUCCEEDED, okSpy)
    eventBus.on(EVENTS.ACTION_FAILED, failSpy)

    const { registry } = makeRegistry({ eventBus })
    await registry.execute('create_task', VALID_TASK, IDENTITY)
    expect(okSpy).toHaveBeenCalledOnce()

    await expect(registry.execute('complete_task', { task_id: 'missing' }, IDENTITY)).rejects.toBeTruthy()
    expect(failSpy).toHaveBeenCalledOnce()
  })

  it('unsubscribe para de receber eventos', () => {
    const eventBus = createEventBus()
    const spy = vi.fn()
    const off = eventBus.on(EVENTS.TASK_CREATED, spy)
    eventBus.emit(EVENTS.TASK_CREATED, {})
    off()
    eventBus.emit(EVENTS.TASK_CREATED, {})
    expect(spy).toHaveBeenCalledOnce()
  })
})

describe('Agent Runtime — propose/confirm/cancel e registro em ai_actions', () => {
  let aiActions
  let runtime
  let services
  beforeEach(() => {
    aiActions = makeAiActions()
    const r = makeRegistry()
    services = r.services
    runtime = createAgentRuntime({ registry: r.registry, aiActions, eventBus: r.eventBus })
  })

  it('propose registra a ação proposta em ai_actions e retorna prévia validada', async () => {
    const proposal = await runtime.propose({
      intent: 'create_task',
      payload: VALID_TASK,
      identity: IDENTITY,
      context: { conversationId: 'c1', messageId: 'm1' },
    })
    expect(aiActions.recordProposed).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'w1', conversationId: 'c1', messageId: 'm1', intent: 'create_task' }),
    )
    expect(proposal).toMatchObject({ actionId: 'action-1', intent: 'create_task' })
    expect(proposal.preview).toMatchObject({ priority: 'medium', status: 'todo' })
  })

  it('confirm executa e registra resultado applied', async () => {
    const proposal = await runtime.propose({ intent: 'create_task', payload: VALID_TASK, identity: IDENTITY })
    const res = await runtime.confirm(proposal, IDENTITY)
    expect(res).toMatchObject({ id: 'task-new' })
    expect(aiActions.recordResult).toHaveBeenCalledWith('action-1', { status: 'applied', taskId: 'task-new' })
  })

  it('confirm registra failed quando a execução falha', async () => {
    services.tasks.create.mockImplementationOnce(async () => { throw new Error('boom') })
    const proposal = await runtime.propose({ intent: 'create_task', payload: VALID_TASK, identity: IDENTITY })
    await expect(runtime.confirm(proposal, IDENTITY)).rejects.toBeTruthy()
    expect(aiActions.recordResult).toHaveBeenCalledWith('action-1', { status: 'failed' })
  })

  it('cancel registra dismissed sem tocar no domínio', async () => {
    const proposal = await runtime.propose({ intent: 'create_task', payload: VALID_TASK, identity: IDENTITY })
    await runtime.cancel(proposal)
    expect(aiActions.recordResult).toHaveBeenCalledWith('action-1', { status: 'dismissed' })
    expect(services.tasks.create).not.toHaveBeenCalled()
  })

  it('propose rejeita intent inexistente e payload inválido', async () => {
    await expect(runtime.propose({ intent: 'nope', payload: {}, identity: IDENTITY })).rejects.toMatchObject({
      code: ErrorCodes.UNKNOWN_INTENT,
    })
    await expect(
      runtime.propose({ intent: 'create_task', payload: { date: '2026-07-15' }, identity: IDENTITY }),
    ).rejects.toMatchObject({ code: ErrorCodes.INVALID_PAYLOAD })
  })
})
