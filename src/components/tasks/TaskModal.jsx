import { useEffect, useState } from 'react'
import Modal from '../ui/Modal'
import { useAuth } from '../../context/AuthContext'
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

const empty = (defaults = {}) => ({
  title: '',
  description: '',
  date: toISODate(new Date()),
  start_time: '',
  end_time: '',
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

export default function TaskModal({ open, onClose, task, defaults, onSaved }) {
  const { user } = useAuth()
  const { categories, reload } = useData()
  const { toast } = useToast()
  const [form, setForm] = useState(empty())
  const [saving, setSaving] = useState(false)
  const isEdit = Boolean(task)

  useEffect(() => {
    if (!open) return
    if (task) {
      setForm({
        ...empty(),
        ...task,
        category_id: task.category_id || '',
        start_time: task.start_time || '',
        end_time: task.end_time || '',
      })
    } else {
      setForm(empty(defaults))
    }
  }, [open, task, defaults])

  const set = (key) => (e) => {
    const value = e?.target?.type === 'checkbox' ? e.target.checked : e.target.value
    setForm((f) => ({ ...f, [key]: value }))
  }

  const submit = async () => {
    if (!form.title.trim()) {
      toast('Informe um titulo para a atividade', 'error')
      return
    }
    setSaving(true)
    try {
      const payload = {
        ...form,
        category_id: form.category_id || null,
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        alert_minutes_before: Number(form.alert_minutes_before) || 0,
      }
      let saved
      if (isEdit) {
        saved = await taskService.update(user.id, task.id, payload)
      } else {
        saved = await taskService.create(user.id, payload)
      }
      toast(isEdit ? 'Atividade atualizada' : 'Atividade criada')
      reload()
      onSaved?.(saved)
      onClose()
    } catch (err) {
      toast('Erro ao salvar: ' + err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar atividade' : 'Nova atividade'}
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={submit} disabled={saving}>
            {saving ? 'Salvando...' : isEdit ? 'Salvar' : 'Criar'}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">Titulo *</label>
          <input
            className="input"
            value={form.title}
            onChange={set('title')}
            placeholder="Ex: Reuniao de alinhamento"
            autoFocus
          />
        </div>

        <div className="sm:col-span-2">
          <label className="label">Descricao</label>
          <textarea
            className="input min-h-[70px]"
            value={form.description}
            onChange={set('description')}
            placeholder="Detalhes da atividade"
          />
        </div>

        <div>
          <label className="label">Data</label>
          <input type="date" className="input" value={form.date} onChange={set('date')} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">Inicio</label>
            <input
              type="time"
              className="input"
              value={form.start_time}
              onChange={set('start_time')}
            />
          </div>
          <div>
            <label className="label">Fim</label>
            <input
              type="time"
              className="input"
              value={form.end_time}
              onChange={set('end_time')}
            />
          </div>
        </div>

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
        <div>
          <label className="label">Prioridade</label>
          <select className="input" value={form.priority} onChange={set('priority')}>
            {Object.entries(PRIORITY_META).map(([key, meta]) => (
              <option key={key} value={key}>
                {meta.label}
              </option>
            ))}
          </select>
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
        <div>
          <label className="label">Link relacionado</label>
          <input
            className="input"
            value={form.link}
            onChange={set('link')}
            placeholder="https://..."
          />
        </div>

        <div className="sm:col-span-2">
          <label className="label">Observacoes</label>
          <textarea
            className="input min-h-[60px]"
            value={form.notes}
            onChange={set('notes')}
          />
        </div>

        {/* Alertas */}
        <div className="sm:col-span-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
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
                    <option
                      key={key}
                      value={key}
                      disabled={key === ALERT_TYPES.WHATSAPP}
                    >
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
      </div>
    </Modal>
  )
}
