import { useEffect, useState, useCallback } from 'react'
import { taskService } from '../services/taskService'
import { useWorkspace } from '../context/WorkspaceContext'
import { useData } from '../context/DataContext'
import { toISODate, addDays, isTaskOverdue } from '../lib/date'
import { STATUS } from '../lib/constants'
import { guard } from '../lib/utils'

// Calcula os alertas in-app do usuario:
//  - atividades atrasadas (pendentes com horario vencido)
//  - lembretes de hoje (atividades com alerta ativo)
// Recarrega junto com o reloadKey global.
export function useAlerts() {
  const { workspaceId } = useWorkspace()
  const { reloadKey } = useData()
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!workspaceId) return
    const today = toISODate(new Date())
    const start = toISODate(addDays(new Date(), -30))
    const { data: tasks, error } = await guard(
      taskService.list(workspaceId, { start, end: today }),
    )
    if (error) {
      console.error('[useAlerts] falha ao carregar alertas:', error?.message || error)
      setLoading(false)
      return
    }

    const overdue = tasks
      .filter((t) => isTaskOverdue(t))
      .map((t) => ({ id: 'ov-' + t.id, type: 'overdue', task: t }))

    const reminders = tasks
      .filter(
        (t) =>
          t.date === today &&
          t.alert_enabled &&
          [STATUS.TODO, STATUS.IN_PROGRESS].includes(t.status),
      )
      .map((t) => ({ id: 'rm-' + t.id, type: 'reminder', task: t }))

    setAlerts([...overdue, ...reminders])
    setLoading(false)
  }, [workspaceId])

  useEffect(() => {
    load()
  }, [load, reloadKey])

  return { alerts, count: alerts.length, loading, reload: load }
}
