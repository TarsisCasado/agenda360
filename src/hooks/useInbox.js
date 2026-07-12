import { useEffect, useState, useCallback } from 'react'
import { inboxService } from '../services/inboxService'
import { useWorkspace } from '../context/WorkspaceContext'

// Carrega as notas da Caixa de Entrada do workspace atual, filtrando por status
// ('inbox' | 'to_think' | 'archived' | null = todos).
// Segue o padrao de useTasks: expoe loading/error e nunca deixa loading eterno.
export function useInbox({ status = null } = {}) {
  const { workspaceId } = useWorkspace()
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!workspaceId) return
    setLoading(true)
    setError(null)
    try {
      const data = await inboxService.list(workspaceId, { status })
      setNotes(data)
    } catch (err) {
      console.error('[useInbox] falha ao carregar notas:', err?.message || err)
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [workspaceId, status])

  useEffect(() => {
    load()
  }, [load])

  return { notes, loading, error, reload: load, setNotes }
}
