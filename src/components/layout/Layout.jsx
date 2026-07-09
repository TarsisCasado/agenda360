import { useState, useEffect, useCallback } from 'react'
import { Outlet } from 'react-router-dom'
import { Plus } from 'lucide-react'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import BottomNav from './BottomNav'
import TaskModal from '../tasks/TaskModal'
import QuickTaskModal from '../tasks/QuickTaskModal'
import CommandPalette from '../command/CommandPalette'

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [fullTaskOpen, setFullTaskOpen] = useState(false)
  const [quickTaskOpen, setQuickTaskOpen] = useState(false)
  const [quickDefaults, setQuickDefaults] = useState(undefined)
  const [paletteOpen, setPaletteOpen] = useState(false)

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
        <main className="flex-1 overflow-y-auto px-4 pb-24 pt-5 sm:px-6 lg:px-8 lg:pb-8">
          <Outlet />
        </main>
      </div>

      {/* Botao flutuante de criacao rapida (mobile) */}
      <button
        onClick={() => openQuickTask(undefined)}
        className="fab press lg:hidden"
        aria-label="Nova atividade"
      >
        <Plus size={26} />
      </button>

      {/* Menu inferior fixo (mobile) */}
      <BottomNav />

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
    </div>
  )
}
