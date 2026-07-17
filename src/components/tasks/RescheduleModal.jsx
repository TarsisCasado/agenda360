import { useState, useEffect } from 'react'
import { CalendarClock } from 'lucide-react'
import Modal from '../ui/Modal'
import { useAuth } from '../../context/AuthContext'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'
import { taskService } from '../../services/taskService'
import { toISODate, addDays, formatShort } from '../../lib/date'

// Reagendamento rapido com atalhos + escolha de data.
export default function RescheduleModal({ open, onClose, task, onDone }) {
  const { user } = useAuth()
  const { reload } = useData()
  const { toast } = useToast()
  const [date, setDate] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    // Atividade sem data tambem pode ser agendada aqui: começa com campo vazio.
    if (open && task) setDate(task.date || '')
  }, [open, task])

  const shortcuts = [
    { label: 'Amanha', date: toISODate(addDays(new Date(), 1)) },
    { label: 'Em 2 dias', date: toISODate(addDays(new Date(), 2)) },
    { label: 'Proxima semana', date: toISODate(addDays(new Date(), 7)) },
  ]

  const apply = async (targetDate) => {
    if (!task) return
    setSaving(true)
    try {
      await taskService.reschedule(user.id, task, targetDate)
      toast(`Reagendada para ${formatShort(targetDate)}`)
      reload()
      onDone?.()
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
      title="Reagendar atividade"
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={() => apply(date)} disabled={saving || !date}>
            <CalendarClock size={16} /> Reagendar
          </button>
        </>
      }
    >
      {task && (
        <p className="mb-4 text-sm text-slate-500">
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            {task.title}
          </span>{' '}
          {task.date ? `— atualmente em ${formatShort(task.date)}.` : '— ainda sem data.'}
        </p>
      )}
      <div className="mb-4 flex flex-wrap gap-2">
        {shortcuts.map((s) => (
          <button
            key={s.label}
            onClick={() => setDate(s.date)}
            className={
              'btn-secondary text-sm ' +
              (date === s.date ? 'ring-2 ring-brand-500/50' : '')
            }
          >
            {s.label}
          </button>
        ))}
      </div>
      <label className="label">Escolher data</label>
      <input
        type="date"
        className="input"
        value={date}
        onChange={(e) => setDate(e.target.value)}
      />
    </Modal>
  )
}
