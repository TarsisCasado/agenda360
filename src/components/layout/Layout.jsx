import { useState, useEffect, useCallback } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import BottomNav from './BottomNav'
import TaskModal from '../tasks/TaskModal'
import QuickTaskModal from '../tasks/QuickTaskModal'
import CommandPalette from '../command/CommandPalette'
import OnboardingFlow from '../onboarding/OnboardingFlow'
import WorkspaceMissing from '../workspace/WorkspaceMissing'
import { useWorkspace } from '../../context/WorkspaceContext'
import { isOnboarded } from '../../lib/preferences'
import { workspaceGate } from '../../lib/uiState'

export default function Layout() {
  const { workspaceId, workspaces, loading: wsLoading } = useWorkspace()
  const gate = workspaceGate({ loading: wsLoading, workspaces })
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [fullTaskOpen, setFullTaskOpen] = useState(false)
  const [quickTaskOpen, setQuickTaskOpen] = useState(false)
  const [quickDefaults, setQuickDefaults] = useState(undefined)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)

  // Onboarding conversacional no primeiro acesso (uma vez por workspace).
  useEffect(() => {
    if (workspaceId) setShowOnboarding(!isOnboarded(workspaceId))
  }, [workspaceId])

  const openQuickTask = useCallback((defaults) => {
    setQuickDefaults(defaults)
    setQuickTaskOpen(true)
  }, [])

  // Atalho global da Command Palette (Cmd/Ctrl + K)
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-slate-50 dark:bg-slate-950">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar
          onMenu={() => setSidebarOpen(true)}
          onNewTask={() => setFullTaskOpen(true)}
          onOpenPalette={() => setPaletteOpen(true)}
        />
        <main className="flex-1 overflow-y-auto px-4 pb-28 pt-5 sm:px-6 lg:px-10 lg:pb-10">
          {/* Portao de workspace: sem workspace -> estado de recuperacao (nunca
              loading eterno nem excecao). 'loading'/'ready' seguem para as rotas. */}
          {gate === 'empty' ? <WorkspaceMissing /> : <Outlet />}
        </main>
      </div>

      {/* Menu inferior fixo com Captura central (mobile) */}
      <BottomNav onCreate={() => openQuickTask(undefined)} />

      {/* Command Palette (Cmd/Ctrl + K) */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNewTask={openQuickTask}
      />

      {/* Formulario completo (desktop / topbar) */}
      <TaskModal open={fullTaskOpen} onClose={() => setFullTaskOpen(false)} task={null} />
      {/* Formulario rapido (FAB mobile / palette) */}
      <QuickTaskModal
        open={quickTaskOpen}
        defaults={quickDefaults}
        onClose={() => setQuickTaskOpen(false)}
      />

      {/* Onboarding conversacional (primeiro acesso) */}
      {showOnboarding && <OnboardingFlow onDone={() => setShowOnboarding(false)} />}
    </div>
  )
}
