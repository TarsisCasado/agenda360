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
  const [error, setError] = useState(null)

  const { start, end } = range

  const load = useCallback(async () => {
    if (!workspaceId) return
    setLoading(true)
    setError(null)
    try {
      const data = await taskService.list(workspaceId, { start, end })
      setTasks(data)
    } catch (err) {
      // Nunca deixa a tela em loading eterno nem quebra o layout: expoe o erro
      // para a pagina exibir um estado de erro com "Tentar novamente".
      console.error('[useTasks] falha ao carregar atividades:', err?.message || err)
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [workspaceId, start, end])

  useEffect(() => {
    load()
  }, [load, reloadKey])

  return { tasks, loading, error, reload: load, setTasks }
}
