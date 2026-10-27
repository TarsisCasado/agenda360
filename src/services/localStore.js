// ---------------------------------------------------------------------------
// Armazenamento local (MODO DEMO) - usado quando o Supabase nao esta configurado.
// Simula as tabelas do banco (multi-tenant por workspace) no localStorage.
// A API dos services e a mesma nos dois modos.
// ---------------------------------------------------------------------------
import { DEFAULT_CATEGORIES, ROLES, WORKSPACE_ROLES, STATUS } from '../lib/constants'
import { uid } from '../lib/utils'
import { toISODate, addDays } from '../lib/date'

// v2: novo modelo com workspaces. Chave nova evita conflito com o seed antigo.
const KEY = 'agenda360.db.v2'

const DEMO_WORKSPACE_ID = '00000000-0000-4000-8000-0000000000b1'

const DEMO_USER = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'demo@agenda360.app',
  full_name: 'Usuario Demo',
  role: ROLES.ADMIN,
  default_workspace_id: DEMO_WORKSPACE_ID,
  // Espelha profiles.timezone (0012) para paridade demo/Supabase no motor de
  // lembretes. Preferencia editavel; default = o mesmo da coluna.
  timezone: 'America/Sao_Paulo',
}

const DEMO_WORKSPACE = {
  id: DEMO_WORKSPACE_ID,
  name: 'Pessoal',
  slug: 'pessoal-demo',
  owner_id: DEMO_USER.id,
  is_personal: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

function seed() {
  const today = new Date()
  const iso = (offset) => toISODate(addDays(today, offset))
  const ws = DEMO_WORKSPACE.id

  const categories = DEFAULT_CATEGORIES.map((c) => ({
    id: uid(),
    workspace_id: ws,
    created_by: DEMO_USER.id,
    name: c.name,
    color: c.color,
    is_default: true,
    created_at: new Date().toISOString(),
  }))

  const catId = (name) => categories.find((c) => c.name === name)?.id ?? null

  const tasks = [
    // Hoje: mistura de concluidas (progresso + gamificacao) e pendentes.
    { title: 'Planejar a semana', description: 'Revisar pendencias e montar prioridades.', date: iso(0), start_time: '08:00', end_time: '08:30', category_id: catId('Trabalho'), priority: 'high', status: STATUS.DONE },
    { title: 'Responder e-mails importantes', description: '', date: iso(0), start_time: '09:00', end_time: '09:30', category_id: catId('Trabalho'), priority: 'medium', status: STATUS.DONE },
    { title: 'Reuniao de alinhamento da equipe', description: 'Sprint review semanal.', date: iso(0), start_time: '14:00', end_time: '15:00', category_id: catId('Reuniao'), priority: 'high', status: STATUS.TODO },
    { title: 'Revisar proposta comercial', description: 'Ajustar escopo e valores.', date: iso(0), start_time: '', end_time: '', category_id: catId('Projeto'), priority: 'urgent', status: STATUS.TODO },
    // Proximos dias
    { title: 'Treino na academia', description: '', date: iso(1), start_time: '07:00', end_time: '08:00', category_id: catId('Saude'), priority: 'medium', status: STATUS.TODO },
    { title: 'Estudar React avancado', description: 'Hooks e performance.', date: iso(2), start_time: '20:00', end_time: '21:30', category_id: catId('Estudo'), priority: 'low', status: STATUS.TODO },
    // Historico concluido: alimenta a sequencia (streak) e a meta da semana.
    { title: 'Revisao diaria', description: '', date: iso(-1), start_time: '18:00', end_time: '18:15', category_id: catId('Trabalho'), priority: 'low', status: STATUS.DONE },
    { title: 'Caminhada', description: '', date: iso(-2), start_time: '07:00', end_time: '07:40', category_id: catId('Saude'), priority: 'low', status: STATUS.DONE },
    { title: 'Ler um capitulo', description: '', date: iso(-3), start_time: '21:00', end_time: '21:30', category_id: catId('Estudo'), priority: 'low', status: STATUS.DONE },
    // Habito recorrente (mesmo dia da semana): sugere repetir hoje.
    { title: 'Treino na academia', description: '', date: iso(-7), start_time: '07:00', end_time: '08:00', category_id: catId('Saude'), priority: 'medium', status: STATUS.DONE },
    { title: 'Treino na academia', description: '', date: iso(-14), start_time: '07:00', end_time: '08:00', category_id: catId('Saude'), priority: 'medium', status: STATUS.DONE },
    // Atrasada real (pendente com data passada)
    { title: 'Pagar contas do mes', description: '', date: iso(-1), start_time: '09:00', end_time: '09:20', category_id: catId('Financeiro'), priority: 'urgent', status: STATUS.TODO },
  ].map((t) => ({
    id: uid(),
    workspace_id: ws,
    created_by: DEMO_USER.id,
    assignee_id: DEMO_USER.id,
    delegated_by: null,
    delegated_at: null,
    link: '',
    notes: '',
    alert_enabled: false,
    alert_type: 'in_app',
    alert_minutes_before: 15,
    alert_sent: false,
    reschedule_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...t,
  }))

  return {
    profiles: [{ ...DEMO_USER, default_workspace_id: ws }],
    workspaces: [DEMO_WORKSPACE],
    workspace_members: [
      {
        id: uid(),
        workspace_id: ws,
        user_id: DEMO_USER.id,
        role: WORKSPACE_ROLES.OWNER,
        invited_by: DEMO_USER.id,
        created_at: new Date().toISOString(),
      },
    ],
    categories,
    tasks,
    inbox_items: [],
    inbox_checklist_items: [],
    inbox_events: [],
    links: [],
    reminders: [],
    activity_logs: [],
    delegations: [],
    ai_conversations: [],
    ai_messages: [],
    ai_actions: [],
    integrations: [],
    notifications: [],
  }
}

function read() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) {
      const initial = seed()
      localStorage.setItem(KEY, JSON.stringify(initial))
      return initial
    }
    return JSON.parse(raw)
  } catch {
    return seed()
  }
}

// A COTA DO NAVEGADOR E FINITA, e desde que o modo demo guarda binario de
// anexo (data-URL em `capture_asset_blobs`) ela deixou de ser teorica: o teto
// tipico e ~5 MB para o site INTEIRO, e base64 ainda infla o arquivo em ~33%.
//
// O erro continua sendo LANCADO — engoli-lo faria o produto dizer "salvo"
// sobre algo que nao foi salvo, que e a pior falha possivel num lugar chamado
// Memoria. O que muda e que ele passa a ser reconhecivel (`.quota === true`) e
// a vir com uma frase que explica o que fazer.
export class CotaExcedidaError extends Error {
  constructor(causa) {
    super('O armazenamento local do navegador está cheio. Remova algum anexo ou conteúdo antigo para liberar espaço.')
    this.name = 'CotaExcedidaError'
    this.quota = true
    this.causa = causa
  }
}

// `QuotaExceededError` nao tem um codigo unico entre navegadores: Chrome usa
// o nome, Safari usa 22, Firefox usa 1014. Reconhecer os tres evita que o
// mesmo problema apareca como mensagem crua num aparelho e tratada no outro.
export function ehErroDeCota(err) {
  if (!err) return false
  return (
    err.name === 'QuotaExceededError' ||
    err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    err.code === 22 ||
    err.code === 1014
  )
}

function write(db) {
  try {
    localStorage.setItem(KEY, JSON.stringify(db))
  } catch (err) {
    if (ehErroDeCota(err)) throw new CotaExcedidaError(err)
    throw err
  }
  return db
}

export const localStore = {
  DEMO_USER,
  DEMO_WORKSPACE,
  getDb: read,
  saveDb: write,
  reset() {
    localStorage.removeItem(KEY)
    return read()
  },
  table(name) {
    const db = read()
    return db[name] ?? []
  },
  setTable(name, rows) {
    const db = read()
    db[name] = rows
    write(db)
    return rows
  },
}
