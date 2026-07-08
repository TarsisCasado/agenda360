import { useEffect, useState, useCallback } from 'react'
import { taskService } from '../services/taskService'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'

// Carrega as atividades do usuario dentro de um intervalo de datas.
// Recarrega automaticamente quando o reloadKey global muda.
export function useTasks(range = {}) {
  const { user } = useAuth()
  const { reloadKey } = useData()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)

  const { start, end } = range

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const data = await taskService.list(user.id, { start, end })
      setTasks(data)
    } finally {
      setLoading(false)
    }
  }, [user, start, end])

  useEffect(() => {
    load()
  }, [load, reloadKey])

  return { tasks, loading, reload: load, setTasks }
}
