import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { categoryService } from '../services/categoryService'
import { useWorkspace } from './WorkspaceContext'

// Compartilha categorias (usadas em varias telas) e um contador de "reload"
// que as paginas observam para recarregar suas listas apos mudancas.
const DataContext = createContext(null)

export function DataProvider({ children }) {
  const { workspaceId } = useWorkspace()
  const [categories, setCategories] = useState([])
  const [reloadKey, setReloadKey] = useState(0)
  const [loading, setLoading] = useState(true)

  const loadCategories = useCallback(async () => {
    if (!workspaceId) return
    const cats = await categoryService.list(workspaceId)
    setCategories(cats)
    setLoading(false)
  }, [workspaceId])

  useEffect(() => {
    loadCategories()
  }, [loadCategories, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  const categoryById = useCallback(
    (id) => categories.find((c) => c.id === id) || null,
    [categories],
  )
  const categoryByName = useCallback(
    (name) =>
      categories.find((c) => c.name.toLowerCase() === String(name).toLowerCase()) ||
      null,
    [categories],
  )

  return (
    <DataContext.Provider
      value={{
        categories,
        loading,
        reload,
        reloadKey,
        loadCategories,
        categoryById,
        categoryByName,
      }}
    >
      {children}
    </DataContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData deve ser usado dentro de DataProvider')
  return ctx
}
