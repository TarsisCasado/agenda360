import { useState } from 'react'
import { Menu, Moon, Sun, LogOut, Plus, User, Search } from 'lucide-react'
import { useTheme } from '../../context/ThemeContext'
import { useAuth } from '../../context/AuthContext'
import { useEscapeKey } from '../../hooks/useEscapeKey'
import { ROLE_LABELS } from '../../lib/constants'
import AlertCenter from '../notifications/AlertCenter'

// Header V2 — enxuto no mobile. Composicao: [menu] · Agenda 360 · [sino][perfil].
// Tema e Busca saem da barra e viram acoes no menu de perfil (menos disputa
// horizontal, fim da sobreposicao logo/busca/sino).
export default function Topbar({ onMenu, onNewTask, onOpenPalette }) {
  const { theme, toggleTheme } = useTheme()
  const { user, signOut, isDemo } = useAuth()
  const [userMenu, setUserMenu] = useState(false)
  useEscapeKey(userMenu, () => setUserMenu(false))

  const ProfileButton = (
    <div className="relative">
      <button
        onClick={() => setUserMenu((v) => !v)}
        className="press flex items-center rounded-full p-0.5 ring-1 ring-slate-200 hover:ring-slate-300 dark:ring-slate-700"
        aria-label="Conta"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
          <User size={16} />
        </div>
      </button>
      {userMenu && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setUserMenu(false)} />
          <div className="elevated absolute right-0 z-20 mt-2 w-64 p-1.5">
            <div className="border-b hair px-3 py-2">
              <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{user?.full_name}</p>
              <p className="truncate text-xs text-slate-400">{user?.email}</p>
              <span className="chip mt-1.5 bg-brand-50 text-brand-600 dark:bg-brand-900/30">
                {ROLE_LABELS[user?.role] || user?.role}
              </span>
            </div>
            <button onClick={() => { setUserMenu(false); onOpenPalette?.() }} className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800">
              <Search size={16} /> Buscar <kbd className="ml-auto rounded border hair px-1.5 text-[10px] font-semibold text-slate-400">⌘K</kbd>
            </button>
            <button onClick={() => { toggleTheme() }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800">
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />} {theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
            </button>
            <button onClick={signOut} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40">
              <LogOut size={16} /> Sair
            </button>
          </div>
        </>
      )}
    </div>
  )

  return (
    <header className="sticky top-0 z-20 border-b hair bg-white/80 pt-safe backdrop-blur-lg dark:bg-slate-950/70">
      {/* MOBILE: menu · marca central · sino + perfil */}
      <div className="flex items-center gap-2 px-3 py-2.5 lg:hidden">
        <button onClick={onMenu} className="press rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Menu">
          <Menu size={20} />
        </button>
        <div className="flex-1 text-center">
          <span className="text-[15px] font-extrabold tracking-tight text-slate-800 dark:text-slate-100">Agenda 360</span>
        </div>
        <AlertCenter />
        {ProfileButton}
      </div>

      {/* DESKTOP: busca ampla + acao + sino + perfil */}
      <div className="hidden items-center gap-3 px-6 py-3 lg:flex">
        <button
          onClick={onOpenPalette}
          aria-label="Buscar"
          className="interactive flex w-full max-w-xs items-center gap-2 rounded-xl bg-slate-100/80 px-3.5 py-2 text-sm text-slate-400 hover:bg-slate-200/70 dark:bg-slate-900 dark:hover:bg-slate-800"
        >
          <Search size={15} /> <span>Buscar tarefas, ideias, comandos…</span>
          <kbd className="ml-auto rounded border hair px-1.5 text-[10px] font-semibold">⌘K</kbd>
        </button>
        {isDemo && (
          <span className="chip bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">Modo demo</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={onNewTask} className="btn-primary"><Plus size={16} /> Nova atividade</button>
          <AlertCenter />
          {ProfileButton}
        </div>
      </div>
    </header>
  )
}
