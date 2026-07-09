import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { workspaceService } from '../services/workspaceService'
import { useAuth } from './AuthContext'

// Gerencia o WORKSPACE ATUAL (tenant). Toda a aplicacao passou a operar dentro
// de um workspace; este contexto expoe o workspace selecionado e a lista dos
// workspaces do usuario, permitindo trocar entre eles no futuro.
const WorkspaceContext = createContext(null)
const STORAGE_KEY = 'agenda360.currentWorkspace'

export function WorkspaceProvider({ children }) {
  const { user } = useAuth()
  const [workspaces, setWorkspaces] = useState([])
  const [currentId, setCurrentId] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const list = await workspaceService.listForUser(user.id)
      setWorkspaces(list)

      const saved = localStorage.getItem(STORAGE_KEY)
      const preferred =
        list.find((w) => w.id === saved) ||
        list.find((w) => w.id === user.default_workspace_id) ||
        list.find((w) => w.is_personal) ||
        list[0]
      setCurrentId(preferred?.id ?? null)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    load()
  }, [load])

  const setWorkspace = useCallback((id) => {
    setCurrentId(id)
    localStorage.setItem(STORAGE_KEY, id)
  }, [])

  const workspace = workspaces.find((w) => w.id === currentId) || null

  return (
    <WorkspaceContext.Provider
      value={{
        workspace,
        workspaceId: workspace?.id ?? null,
        workspaces,
        role: workspace?.role ?? null,
        loading,
        setWorkspace,
        reloadWorkspaces: load,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useWorkspace() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace deve ser usado dentro de WorkspaceProvider')
  return ctx
}
