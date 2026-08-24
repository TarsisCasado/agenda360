import { useState } from 'react'
import { Menu, Moon, Sun, LogOut, Plus, User, Search } from 'lucide-react'
import { useTheme } from '../../context/ThemeContext'
import { useAuth } from '../../context/AuthContext'
import { useEscapeKey } from '../../hooks/useEscapeKey'
import { ROLE_LABELS } from '../../lib/constants'
import AlertCenter from '../notifications/AlertCenter'

// ---------------------------------------------------------------------------
// TOPBAR — quase invisivel no mobile.
//
// A identidade do app ja esta na navegacao inferior e no titulo de cada tela,
// entao aqui basta: [menu] · marca discreta · [alertas][perfil]. Sem borda
// dura: a separacao vem do blur + hairline so quando ha conteudo por baixo.
// ---------------------------------------------------------------------------
export default function Topbar({ onMenu, onNewTask, onOpenPalette }) {
  const { theme, toggleTheme } = useTheme()
  const { user, signOut, isDemo } = useAuth()
  const [userMenu, setUserMenu] = useState(false)
  useEscapeKey(userMenu, () => setUserMenu(false))

  const ProfileButton = (
    <div className="relative">
      <button
        onClick={() => setUserMenu((v) => !v)}
        className="press flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-secondary"
        aria-label="Conta"
      >
        <User size={17} />
      </button>
      {userMenu && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setUserMenu(false)} />
          <div className="floating animate-scale-in absolute right-0 z-20 mt-2 w-64 p-1.5">
            <div className="px-3 py-2">
              <p className="truncate text-[15px] font-semibold text-primary">{user?.full_name}</p>
              <p className="text-caption truncate">{user?.email}</p>
              {isDemo && (
                <span className="chip mt-2 bg-surface-2 text-secondary">Modo demo</span>
              )}
              {!isDemo && (
                <span className="chip mt-2 bg-accent-soft text-accent-text">
                  {ROLE_LABELS[user?.role] || user?.role}
                </span>
              )}
            </div>
            <div className="my-1 border-t hair" />
            <button
              onClick={() => {
                setUserMenu(false)
                onOpenPalette?.()
              }}
              className="flex w-full items-center gap-2.5 rounded-control px-3 py-2 text-[14px] text-secondary transition-colors active:bg-surface-2"
            >
              <Search size={16} /> Buscar
              <kbd className="text-caption ml-auto rounded border hair px-1.5 font-semibold">⌘K</kbd>
            </button>
            <button
              onClick={toggleTheme}
              className="flex w-full items-center gap-2.5 rounded-control px-3 py-2 text-[14px] text-secondary transition-colors active:bg-surface-2"
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              {theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
            </button>
            <button
              onClick={signOut}
              className="flex w-full items-center gap-2.5 rounded-control px-3 py-2 text-[14px] font-medium text-danger transition-colors active:bg-surface-2"
            >
              <LogOut size={16} /> Sair
            </button>
          </div>
        </>
      )}
    </div>
  )

  return (
    <header className="sticky top-0 z-20 bg-canvas/85 pt-safe backdrop-blur-xl">
      {/* MOBILE */}
      <div className="flex items-center gap-1 px-2 py-1.5 lg:hidden">
        <button onClick={onMenu} className="icon-btn" aria-label="Menu">
          <Menu size={20} />
        </button>
        <div className="flex-1 text-center">
          <span className="text-[13px] font-semibold tracking-wide text-muted">Agenda 360</span>
        </div>
        <AlertCenter />
        {ProfileButton}
      </div>

      {/* DESKTOP */}
      <div className="hidden items-center gap-3 px-6 py-3 lg:flex">
        <button
          onClick={onOpenPalette}
          aria-label="Buscar"
          className="interactive flex w-full max-w-sm items-center gap-2 rounded-control bg-surface-2 px-3.5 py-2 text-[14px] text-muted hover:bg-surface-3"
        >
          <Search size={15} className="shrink-0" />
          <span className="truncate">Buscar tarefas, ideias, comandos…</span>
          <kbd className="ml-auto rounded border hair px-1.5 text-[10px] font-semibold">⌘K</kbd>
        </button>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={onNewTask} className="btn-primary press">
            <Plus size={16} /> Nova atividade
          </button>
          <AlertCenter />
          {ProfileButton}
        </div>
      </div>
    </header>
  )
}
