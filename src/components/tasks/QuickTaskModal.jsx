import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
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
} from '../../lib/constants'
import { toISODate } from '../../lib/date'
import { cx } from '../../lib/utils'

// Formulario simplificado para criacao rapida (otimizado para mobile).
// O formulario completo (TaskModal) continua disponivel para edicao detalhada.
const empty = (defaults = {}) => ({
  title: '',
  date: toISODate(new Date()),
  start_time: '',
  category_id: '',
  priority: PRIORITY.MEDIUM,
  status: 'todo',
  link: '',
  notes: '',
  ...defaults,
})

export default function QuickTaskModal({ open, onClose, defaults, onSaved }) {
  const { user } = useAuth()
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

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const submit = async () => {
    if (!form.title.trim()) {
      toast('Informe um titulo', 'error')
      return
    }
    setSaving(true)
    try {
      const saved = await taskService.create(user.id, {
        ...form,
        category_id: form.category_id || null,
        start_time: form.start_time || null,
      })
      toast('Atividade criada')
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
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Data</label>
            <input type="date" className="input" value={form.date} onChange={set('date')} />
          </div>
          <div>
            <label className="label">Hora</label>
            <input
              type="time"
              className="input"
              value={form.start_time}
              onChange={set('start_time')}
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
