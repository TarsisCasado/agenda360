// ---------------------------------------------------------------------------
// Armazenamento local (MODO DEMO) - usado quando o Supabase nao esta configurado.
// Simula as tabelas do banco no localStorage do navegador, permitindo testar
// toda a aplicacao sem backend. A API dos services e a mesma nos dois modos.
// ---------------------------------------------------------------------------
import { DEFAULT_CATEGORIES, ROLES, STATUS } from '../lib/constants'
import { uid } from '../lib/utils'
import { toISODate, addDays } from '../lib/date'

const KEY = 'agenda360.db.v1'

const DEMO_USER = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'demo@agenda360.app',
  full_name: 'Usuario Demo',
  role: ROLES.ADMIN,
}

function seed() {
  const today = new Date()
  const iso = (offset) => toISODate(addDays(today, offset))

  const categories = DEFAULT_CATEGORIES.map((c) => ({
    id: uid(),
    user_id: DEMO_USER.id,
    name: c.name,
    color: c.color,
    is_default: true,
    created_at: new Date().toISOString(),
  }))

  const catId = (name) => categories.find((c) => c.name === name)?.id ?? null

  const tasks = [
    {
      title: 'Planejar a semana',
      description: 'Revisar pendencias e montar prioridades.',
      date: iso(0),
      start_time: '08:00',
      end_time: '08:30',
      category_id: catId('Trabalho'),
      priority: 'high',
      status: STATUS.TODO,
    },
    {
      title: 'Reuniao de alinhamento da equipe',
      description: 'Sprint review semanal.',
      date: iso(0),
      start_time: '10:00',
      end_time: '11:00',
      category_id: catId('Reuniao'),
      priority: 'medium',
      status: STATUS.IN_PROGRESS,
    },
    {
      title: 'Treino na academia',
      description: '',
      date: iso(1),
      start_time: '07:00',
      end_time: '08:00',
      category_id: catId('Saude'),
      priority: 'medium',
      status: STATUS.TODO,
    },
    {
      title: 'Estudar React avancado',
      description: 'Hooks e performance.',
      date: iso(2),
      start_time: '20:00',
      end_time: '21:30',
      category_id: catId('Estudo'),
      priority: 'low',
      status: STATUS.TODO,
    },
    {
      title: 'Pagar contas do mes',
      description: '',
      date: iso(-1),
      start_time: '09:00',
      end_time: '09:20',
      category_id: catId('Financeiro'),
      priority: 'urgent',
      status: STATUS.MISSED,
    },
  ].map((t) => ({
    id: uid(),
    user_id: DEMO_USER.id,
    owner_id: DEMO_USER.id,
    assignee_id: DEMO_USER.id,
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
    profiles: [DEMO_USER],
    categories,
    tasks,
    links: [],
    reminders: [],
    activity_logs: [],
    delegations: [],
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
