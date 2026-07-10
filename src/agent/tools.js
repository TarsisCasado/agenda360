// ---------------------------------------------------------------------------
// Definicao das FERRAMENTAS (allowlist). Cada ferramenta declara:
//   intent, schema (validacao), requiresConfirmation, destructive, flag,
//   execute(payload, identity) -> usa os services EXISTENTES.
//
// A IA (no futuro) so podera disparar intents presentes aqui. Nao ha caminho
// para executar codigo/SQL arbitrario.
//
// `services` e injetado (facilita testes com mocks): { tasks, links }.
// `identity` vem SEMPRE da sessao autenticada: { workspaceId, userId }.
// ---------------------------------------------------------------------------
import { AgentError, ErrorCodes } from './errors'
import { FLAGS } from './featureFlags'
import { STATUS } from '../lib/constants'

const PRIORITIES = ['low', 'medium', 'high', 'urgent']
const STATUSES = Object.values(STATUS)
const LINK_ACTIONS = ['task', 'meeting', 'idea', 'project', 'reminder', 'future_agenda']

// Carrega uma tarefa do workspace ou lanca NOT_FOUND (cobre workspace invalido).
async function requireTask(services, identity, id) {
  const task = await services.tasks.getById(identity.workspaceId, id)
  if (!task) {
    throw new AgentError(ErrorCodes.NOT_FOUND, `Tarefa nao encontrada: ${id}`)
  }
  return task
}

export function createTools(services) {
  return [
    {
      intent: 'create_task',
      description: 'Cria uma nova tarefa/atividade.',
      flag: FLAGS.ASSISTANT,
      requiresConfirmation: false,
      destructive: false,
      schema: {
        title: { type: 'string', required: true, max: 300 },
        description: { type: 'string', max: 2000 },
        date: { type: 'date', required: true },
        start_time: { type: 'time' },
        end_time: { type: 'time' },
        category_id: { type: 'id' },
        priority: { type: 'enum', values: PRIORITIES, default: 'medium' },
        status: { type: 'enum', values: STATUSES, default: 'todo' },
        link: { type: 'string', max: 2000 },
        notes: { type: 'string', max: 2000 },
      },
      execute: (data, identity) =>
        services.tasks.create(identity.workspaceId, identity.userId, data),
    },

    {
      intent: 'update_task',
      description: 'Edita campos de uma tarefa existente.',
      flag: FLAGS.ASSISTANT,
      requiresConfirmation: false,
      destructive: false,
      schema: {
        task_id: { type: 'id', required: true },
        title: { type: 'string', max: 300 },
        description: { type: 'string', max: 2000 },
        date: { type: 'date' },
        start_time: { type: 'time' },
        end_time: { type: 'time' },
        category_id: { type: 'id' },
        priority: { type: 'enum', values: PRIORITIES },
        status: { type: 'enum', values: STATUSES },
        link: { type: 'string', max: 2000 },
        notes: { type: 'string', max: 2000 },
      },
      execute: async (data, identity) => {
        const { task_id, ...patch } = data
        const task = await requireTask(services, identity, task_id)
        return services.tasks.update(identity.userId, task, patch)
      },
    },

    {
      intent: 'reschedule_task',
      description: 'Reagenda uma tarefa para outra data.',
      flag: FLAGS.ASSISTANT,
      requiresConfirmation: false,
      destructive: false,
      schema: {
        task_id: { type: 'id', required: true },
        date: { type: 'date', required: true },
      },
      execute: async (data, identity) => {
        const task = await requireTask(services, identity, data.task_id)
        return services.tasks.reschedule(identity.userId, task, data.date)
      },
    },

    {
      intent: 'complete_task',
      description: 'Marca uma tarefa como concluida.',
      flag: FLAGS.ASSISTANT,
      requiresConfirmation: false,
      destructive: false,
      schema: { task_id: { type: 'id', required: true } },
      execute: async (data, identity) => {
        const task = await requireTask(services, identity, data.task_id)
        return services.tasks.changeStatus(identity.userId, task, STATUS.DONE)
      },
    },

    {
      intent: 'mark_missed',
      description: 'Marca uma tarefa como furada.',
      flag: FLAGS.ASSISTANT,
      requiresConfirmation: false,
      destructive: false,
      schema: { task_id: { type: 'id', required: true } },
      execute: async (data, identity) => {
        const task = await requireTask(services, identity, data.task_id)
        return services.tasks.changeStatus(identity.userId, task, STATUS.MISSED)
      },
    },

    {
      intent: 'cancel_task',
      description: 'Cancela uma tarefa (exige confirmacao).',
      flag: FLAGS.ASSISTANT,
      requiresConfirmation: true,
      destructive: false,
      schema: { task_id: { type: 'id', required: true } },
      execute: async (data, identity) => {
        const task = await requireTask(services, identity, data.task_id)
        return services.tasks.changeStatus(identity.userId, task, STATUS.CANCELLED)
      },
    },

    {
      intent: 'delete_task',
      description: 'Exclui uma tarefa (destrutivo, exige confirmacao).',
      flag: FLAGS.ASSISTANT,
      requiresConfirmation: true,
      destructive: true,
      schema: { task_id: { type: 'id', required: true } },
      execute: async (data, identity) => {
        const task = await requireTask(services, identity, data.task_id)
        await services.tasks.remove(identity.userId, task)
        return { id: task.id, deleted: true }
      },
    },

    {
      intent: 'search_tasks',
      description: 'Pesquisa tarefas por texto e/ou periodo.',
      flag: FLAGS.ASSISTANT,
      requiresConfirmation: false,
      destructive: false,
      schema: {
        query: { type: 'string', max: 200 },
        start: { type: 'date' },
        end: { type: 'date' },
        status: { type: 'enum', values: STATUSES },
      },
      execute: async (data, identity) => {
        const list = await services.tasks.list(identity.workspaceId, {
          start: data.start,
          end: data.end,
        })
        const q = (data.query || '').toLowerCase()
        return list.filter(
          (t) =>
            (!q || t.title?.toLowerCase().includes(q)) &&
            (!data.status || t.status === data.status),
        )
      },
    },

    {
      intent: 'create_link',
      description: 'Salva um link na central de links.',
      flag: FLAGS.ASSISTANT,
      requiresConfirmation: false,
      destructive: false,
      schema: {
        url: { type: 'string', required: true, max: 2000 },
        title: { type: 'string', max: 300 },
        note: { type: 'string', max: 2000 },
        desired_action: { type: 'enum', values: LINK_ACTIONS, default: 'task' },
      },
      execute: (data, identity) =>
        services.links.create(identity.workspaceId, identity.userId, data),
    },

    {
      intent: 'list_schedule',
      description: 'Lista a agenda de um periodo.',
      flag: FLAGS.ASSISTANT,
      requiresConfirmation: false,
      destructive: false,
      schema: {
        start: { type: 'date', required: true },
        end: { type: 'date', required: true },
      },
      execute: (data, identity) =>
        services.tasks.list(identity.workspaceId, {
          start: data.start,
          end: data.end,
        }),
    },
  ]
}
