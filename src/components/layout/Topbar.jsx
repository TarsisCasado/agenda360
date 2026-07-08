import { useState } from 'react'
import { Menu, Moon, Sun, LogOut, Plus, User } from 'lucide-react'
import { useTheme } from '../../context/ThemeContext'
import { useAuth } from '../../context/AuthContext'
import { ROLE_LABELS } from '../../lib/constants'

export default function Topbar({ onMenu, onNewTask }) {
  const { theme, toggleTheme } = useTheme()
  const { user, signOut, isDemo } = useAuth()
  const [userMenu, setUserMenu] = useState(false)

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
      <button
        onClick={onMenu}
        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden dark:hover:bg-slate-800"
      >
        <Menu size={20} />
      </button>

      <div className="flex-1">
        {isDemo && (
          <span className="chip bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
            Modo demo (dados locais) — configure o Supabase para persistir
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button onClick={onNewTask} className="btn-primary hidden sm:inline-flex">
          <Plus size={16} /> Nova atividade
        </button>
        <button
          onClick={onNewTask}
          className="btn-primary p-2 sm:hidden"
          aria-label="Nova atividade"
        >
          <Plus size={18} />
        </button>

        <button
          onClick={toggleTheme}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="Alternar tema"
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <div className="relative">
          <button
            onClick={() => setUserMenu((v) => !v)}
            className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
              <User size={16} />
            </div>
          </button>
          {userMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setUserMenu(false)} />
              <div className="absolute right-0 z-20 mt-2 w-60 rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                <div className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">
                  <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {user?.full_name}
                  </p>
                  <p className="truncate text-xs text-slate-400">{user?.email}</p>
                  <span className="chip mt-1 bg-brand-50 text-brand-600 dark:bg-brand-900/30">
                    {ROLE_LABELS[user?.role] || user?.role}
                  </span>
                </div>
                <button
                  onClick={signOut}
                  className="mt-1 flex w-full items-center gap-2 rounded px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                >
                  <LogOut size={16} /> Sair
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
