import { useEffect, useState, useCallback } from 'react'
import { taskService } from '../services/taskService'
import { useWorkspace } from '../context/WorkspaceContext'
import { useData } from '../context/DataContext'

// Carrega as atividades do workspace atual dentro de um intervalo de datas.
// Recarrega automaticamente quando o reloadKey global muda.
export function useTasks(range = {}) {
  const { workspaceId } = useWorkspace()
  const { reloadKey } = useData()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)

  const { start, end } = range

  const load = useCallback(async () => {
    if (!workspaceId) return
    setLoading(true)
    try {
      const data = await taskService.list(workspaceId, { start, end })
      setTasks(data)
    } finally {
      setLoading(false)
    }
  }, [workspaceId, start, end])

  useEffect(() => {
    load()
  }, [load, reloadKey])

  return { tasks, loading, reload: load, setTasks }
}
