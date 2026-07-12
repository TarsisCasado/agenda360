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

function write(db) {
  localStorage.setItem(KEY, JSON.stringify(db))
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
