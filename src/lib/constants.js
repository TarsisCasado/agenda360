// ---------------------------------------------------------------------------
// Constantes e regras de negocio da Agenda Inteligente 360
// ---------------------------------------------------------------------------

// Perfis de usuario
export const ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  COLLABORATOR: 'collaborator',
}

export const ROLE_LABELS = {
  [ROLES.ADMIN]: 'Administrador',
  [ROLES.MANAGER]: 'Gestor',
  [ROLES.COLLABORATOR]: 'Colaborador',
}

// Status das atividades
export const STATUS = {
  TODO: 'todo',
  IN_PROGRESS: 'in_progress',
  DONE: 'done',
  MISSED: 'missed',
  DELEGATED: 'delegated',
  NOT_NEEDED: 'not_needed',
  RESCHEDULED: 'rescheduled',
  CANCELLED: 'cancelled',
}

export const STATUS_META = {
  [STATUS.TODO]: { label: 'A fazer', color: 'slate', dot: '#64748b' },
  [STATUS.IN_PROGRESS]: { label: 'Em andamento', color: 'blue', dot: '#3b82f6' },
  [STATUS.DONE]: { label: 'Feito', color: 'emerald', dot: '#10b981' },
  [STATUS.MISSED]: { label: 'Furei', color: 'red', dot: '#ef4444' },
  [STATUS.DELEGATED]: { label: 'Delegado', color: 'violet', dot: '#8b5cf6' },
  [STATUS.NOT_NEEDED]: { label: 'Nao necessario', color: 'gray', dot: '#9ca3af' },
  [STATUS.RESCHEDULED]: { label: 'Reagendado', color: 'amber', dot: '#f59e0b' },
  [STATUS.CANCELLED]: { label: 'Cancelado', color: 'rose', dot: '#f43f5e' },
}

export const STATUS_ORDER = [
  STATUS.TODO,
  STATUS.IN_PROGRESS,
  STATUS.DONE,
  STATUS.RESCHEDULED,
  STATUS.DELEGATED,
  STATUS.MISSED,
  STATUS.NOT_NEEDED,
  STATUS.CANCELLED,
]

// Prioridades
export const PRIORITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent',
}

export const PRIORITY_META = {
  [PRIORITY.LOW]: { label: 'Baixa', color: '#94a3b8' },
  [PRIORITY.MEDIUM]: { label: 'Media', color: '#3b82f6' },
  [PRIORITY.HIGH]: { label: 'Alta', color: '#f59e0b' },
  [PRIORITY.URGENT]: { label: 'Urgente', color: '#ef4444' },
}

// Categorias padrao (o usuario pode criar novas)
export const DEFAULT_CATEGORIES = [
  { name: 'Pessoal', color: '#6366f1' },
  { name: 'Trabalho', color: '#0ea5e9' },
  { name: 'Reuniao', color: '#8b5cf6' },
  { name: 'Ideia', color: '#f59e0b' },
  { name: 'Projeto', color: '#10b981' },
  { name: 'Familia', color: '#ec4899' },
  { name: 'Saude', color: '#ef4444' },
  { name: 'Estudo', color: '#14b8a6' },
  { name: 'Financeiro', color: '#84cc16' },
  { name: 'Equipe', color: '#f97316' },
]

// Tipos de alerta
export const ALERT_TYPES = {
  IN_APP: 'in_app',
  PUSH: 'push',
  EMAIL: 'email',
  WHATSAPP: 'whatsapp', // preparado para o futuro, ainda nao implementado
}

export const ALERT_TYPE_LABELS = {
  [ALERT_TYPES.IN_APP]: 'No app',
  [ALERT_TYPES.PUSH]: 'Push',
  [ALERT_TYPES.EMAIL]: 'E-mail',
  [ALERT_TYPES.WHATSAPP]: 'WhatsApp (em breve)',
}

// Acoes possiveis ao transformar um link
export const LINK_ACTIONS = {
  TASK: 'task',
  MEETING: 'meeting',
  IDEA: 'idea',
  PROJECT: 'project',
  REMINDER: 'reminder',
  FUTURE_AGENDA: 'future_agenda',
}

export const LINK_ACTION_LABELS = {
  [LINK_ACTIONS.TASK]: 'Tarefa',
  [LINK_ACTIONS.MEETING]: 'Reuniao',
  [LINK_ACTIONS.IDEA]: 'Ideia',
  [LINK_ACTIONS.PROJECT]: 'Projeto',
  [LINK_ACTIONS.REMINDER]: 'Lembrete',
  [LINK_ACTIONS.FUTURE_AGENDA]: 'Pauta futura',
}

// Tipos de evento registrados em activity_logs
export const LOG_ACTIONS = {
  CREATE: 'create',
  UPDATE: 'update',
  STATUS_CHANGE: 'status_change',
  RESCHEDULE: 'reschedule',
  DELEGATE: 'delegate',
  CANCEL: 'cancel',
  COMPLETE: 'complete',
  DELETE: 'delete',
}

export const LOG_ACTION_LABELS = {
  [LOG_ACTIONS.CREATE]: 'Criacao',
  [LOG_ACTIONS.UPDATE]: 'Edicao',
  [LOG_ACTIONS.STATUS_CHANGE]: 'Mudanca de status',
  [LOG_ACTIONS.RESCHEDULE]: 'Reagendamento',
  [LOG_ACTIONS.DELEGATE]: 'Delegacao',
  [LOG_ACTIONS.CANCEL]: 'Cancelamento',
  [LOG_ACTIONS.COMPLETE]: 'Conclusao',
  [LOG_ACTIONS.DELETE]: 'Exclusao',
}

// Dias da semana (segunda a domingo) para o Kanban
export const WEEK_DAYS = [
  { key: 1, short: 'Seg', label: 'Segunda' },
  { key: 2, short: 'Ter', label: 'Terca' },
  { key: 3, short: 'Qua', label: 'Quarta' },
  { key: 4, short: 'Qui', label: 'Quinta' },
  { key: 5, short: 'Sex', label: 'Sexta' },
  { key: 6, short: 'Sab', label: 'Sabado' },
  { key: 0, short: 'Dom', label: 'Domingo' },
]

// Escala horaria da agenda diaria
export const DAY_START_HOUR = 6
export const DAY_END_HOUR = 23
