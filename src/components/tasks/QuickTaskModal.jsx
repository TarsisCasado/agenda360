import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import Modal from '../ui/Modal'
import { useAuth } from '../../context/AuthContext'
import { useWorkspace } from '../../context/WorkspaceContext'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'
import { taskService } from '../../services/taskService'
import {
  STATUS_ORDER,
  STATUS_META,
  PRIORITY,
  PRIORITY_META,
  ALERT_TYPES,
  ALERT_TYPE_LABELS,
} from '../../lib/constants'
import { toISODate } from '../../lib/date'
import { cx } from '../../lib/utils'

// Formulario simplificado para criacao rapida (otimizado para mobile).
// O formulario completo (TaskModal) continua disponivel para edicao detalhada.
// Inclui os MESMOS campos de alerta/lembrete do TaskModal (Push, minutos antes)
// pelo MESMO caminho de dados (taskService.create -> reminderService): o mobile
// nao pode ficar sem criar lembretes.
const empty = (defaults = {}) => ({
  title: '',
  date: toISODate(new Date()),
  start_time: '',
  category_id: '',
  priority: PRIORITY.MEDIUM,
  status: 'todo',
  link: '',
  notes: '',
  alert_enabled: false,
  alert_type: ALERT_TYPES.IN_APP,
  alert_minutes_before: 15,
  ...defaults,
})

export default function QuickTaskModal({ open, onClose, defaults, onSaved }) {
  const { user } = useAuth()
  const { workspaceId } = useWorkspace()
  const { categories, reload } = useData()
  const { toast } = useToast()
  const [form, setForm] = useState(empty())
  const [saving, setSaving] = useState(false)
  const [showOptional, setShowOptional] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(empty(defaults))
      setShowOptional(false)
    }
  }, [open, defaults])

  const set = (key) => (e) => {
    const value = e?.target?.type === 'checkbox' ? e.target.checked : e.target.value
    setForm((f) => ({ ...f, [key]: value }))
  }

  // "Sem data": limpa data e hora (sem horarios orfaos). Ao desmarcar, volta
  // a data padrao (hoje).
  const noDate = !form.date
  const toggleNoDate = (e) => {
    if (e.target.checked) {
      setForm((f) => ({ ...f, date: '', start_time: '' }))
    } else {
      setForm((f) => ({ ...f, date: toISODate(new Date()) }))
    }
  }

  const submit = async () => {
    if (!form.title.trim()) {
      toast('Informe um titulo', 'error')
      return
    }
    // Alerta exige data + horario para calcular o lembrete (mesma regra do
    // TaskModal; nao inventamos horario padrao).
    if (form.alert_enabled && !form.date) {
      toast('Defina uma data e um horario para ativar o lembrete.', 'error')
      return
    }
    if (form.alert_enabled && !form.start_time) {
      toast('Defina um horario para ativar o lembrete.', 'error')
      return
    }
    setSaving(true)
    try {
      const saved = await taskService.create(workspaceId, user.id, {
        ...form,
        date: form.date || null,
        category_id: form.category_id || null,
        start_time: form.start_time || null,
        alert_minutes_before: Number(form.alert_minutes_before) || 0,
      })
      if (saved?.reminder_sync_failed) {
        toast('Atividade salva, mas o lembrete nao pode ser agendado.', 'error')
      } else {
        toast('Atividade criada')
      }
      reload()
      onSaved?.(saved)
      onClose()
    } catch (err) {
      toast('Erro: ' + err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nova atividade"
      size="md"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={submit} disabled={saving}>
            {saving ? 'Salvando...' : 'Criar'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label">Titulo *</label>
          <input
            className="input"
            value={form.title}
            onChange={set('title')}
            placeholder="O que precisa ser feito?"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Data</label>
            <input
              type="date"
              className="input"
              value={form.date}
              onChange={set('date')}
              disabled={noDate}
            />
          </div>
          <div>
            <label className="label">Hora</label>
            <input
              type="time"
              className="input"
              value={form.start_time}
              onChange={set('start_time')}
              disabled={noDate}
            />
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={noDate}
            onChange={toggleNoDate}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          Sem data
        </label>

        <div>
          <label className="label">Categoria</label>
          <select className="input" value={form.category_id} onChange={set('category_id')}>
            <option value="">Sem categoria</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Prioridade em botoes grandes (facil no toque) */}
        <div>
          <label className="label">Prioridade</label>
          <div className="grid grid-cols-4 gap-2">
            {Object.entries(PRIORITY_META).map(([key, meta]) => (
              <button
                key={key}
                type="button"
                onClick={() => setForm((f) => ({ ...f, priority: key }))}
                className={cx(
                  'rounded-lg border py-2 text-xs font-semibold transition-colors',
                  form.priority === key
                    ? 'border-transparent text-white'
                    : 'border-slate-200 text-slate-500 dark:border-slate-700',
                )}
                style={
                  form.priority === key ? { backgroundColor: meta.color } : undefined
                }
              >
                {meta.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Status</label>
          <select className="input" value={form.status} onChange={set('status')}>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </select>
        </div>

        {/* Alerta / lembrete (mesmo caminho de dados do TaskModal) */}
        <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              checked={form.alert_enabled}
              onChange={set('alert_enabled')}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            Ativar alerta / lembrete
          </label>
          {form.alert_enabled && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="label">Tipo</label>
                <select className="input" value={form.alert_type} onChange={set('alert_type')}>
                  {Object.entries(ALERT_TYPE_LABELS).map(([key, label]) => (
                    <option key={key} value={key} disabled={key === ALERT_TYPES.WHATSAPP}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Minutos antes</label>
                <input
                  type="number"
                  min="0"
                  className="input"
                  value={form.alert_minutes_before}
                  onChange={set('alert_minutes_before')}
                />
              </div>
            </div>
          )}
        </div>

        {/* Campos opcionais recolhidos por padrao */}
        <button
          type="button"
          onClick={() => setShowOptional((v) => !v)}
          className="flex w-full items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm font-medium text-slate-600 dark:bg-slate-800/60 dark:text-slate-300"
        >
          Link e observacao (opcional)
          {showOptional ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {showOptional && (
          <div className="space-y-3">
            <div>
              <label className="label">Link</label>
              <input
                className="input"
                value={form.link}
                onChange={set('link')}
                placeholder="https://..."
              />
            </div>
            <div>
              <label className="label">Observacao</label>
              <textarea
                className="input min-h-[60px]"
                value={form.notes}
                onChange={set('notes')}
              />
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
