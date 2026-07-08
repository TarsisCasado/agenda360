import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import TaskModal from '../tasks/TaskModal'

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [newTaskOpen, setNewTaskOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar
          onMenu={() => setSidebarOpen(true)}
          onNewTask={() => setNewTaskOpen(true)}
        />
        <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>

      <TaskModal
        open={newTaskOpen}
        onClose={() => setNewTaskOpen(false)}
        task={null}
      />
    </div>
  )
}
