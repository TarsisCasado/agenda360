import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  Plus,
  Sun,
  Inbox,
  CalendarDays,
  KanbanSquare,
  Calendar,
  Link2,
  Sparkles,
  BarChart3,
  Settings as SettingsIcon,
  CheckSquare,
  ExternalLink,
  CornerDownLeft,
} from 'lucide-react'
import { useWorkspace } from '../../context/WorkspaceContext'
import { taskService } from '../../services/taskService'
import { linkService } from '../../services/linkService'
import { STATUS_META } from '../../lib/constants'
import { formatShort } from '../../lib/date'
import { cx, sanitizeUrl } from '../../lib/utils'

const NAV = [
  { id: 'nav-hoje', label: 'Hoje', icon: Sun, to: '/' },
  { id: 'nav-caixa', label: 'Caixa de Entrada', icon: Inbox, to: '/caixa' },
  { id: 'nav-dia', label: 'Agenda do dia', icon: CalendarDays, to: '/dia' },
  { id: 'nav-semana', label: 'Kanban semanal', icon: KanbanSquare, to: '/semana' },
  { id: 'nav-mes', label: 'Calendario', icon: Calendar, to: '/mes' },
  { id: 'nav-links', label: 'Central de links', icon: Link2, to: '/links' },
  { id: 'nav-ia', label: 'Assistente IA', icon: Sparkles, to: '/assistente' },
  { id: 'nav-rel', label: 'Relatorios', icon: BarChart3, to: '/relatorios' },
  { id: 'nav-cfg', label: 'Configuracoes', icon: SettingsIcon, to: '/config' },
]

const norm = (s) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

export default function CommandPalette({ open, onClose, onNewTask }) {
  const { workspaceId } = useWorkspace()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [tasks, setTasks] = useState([])
  const [links, setLinks] = useState([])
  const inputRef = useRef(null)
  const listRef = useRef(null)

  // Carrega dados do workspace ao abrir (busca client-side).
  useEffect(() => {
    if (!open || !workspaceId) return
    setQuery('')
    setActive(0)
    let alive = true
    Promise.all([
      taskService.list(workspaceId, {}),
      linkService.list(workspaceId),
    ])
      .then(([t, l]) => {
        if (!alive) return
        setTasks(t)
        setLinks(l)
      })
      .catch((err) => {
        if (!alive) return
        console.error('[CommandPalette] falha ao carregar dados:', err?.message || err)
      })
    return () => {
      alive = false
    }
  }, [open, workspaceId])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30)
  }, [open])

  const run = useCallback(
    (action) => {
      onClose()
      action()
    },
    [onClose],
  )

  // Monta a lista achatada de itens selecionaveis conforme a busca.
  const groups = useMemo(() => {
    const q = norm(query)
    const g = []

    // Criar
    g.push({
      title: 'Criar',
      items: [
        {
          id: 'new-task',
          icon: Plus,
          label: q ? `Criar tarefa: "${query}"` : 'Nova tarefa',
          run: () => onNewTask(q ? { title: query } : undefined),
        },
      ],
    })

    // Navegar
    const navItems = NAV.filter((n) => !q || norm(n.label).includes(q)).map((n) => ({
      id: n.id,
      icon: n.icon,
      label: n.label,
      hint: 'Ir para',
      run: () => navigate(n.to),
    }))
    if (navItems.length) g.push({ title: 'Navegar', items: navItems })

    // Tarefas
    if (q) {
      const taskItems = tasks
        .filter((t) => norm(t.title).includes(q) || norm(t.notes).includes(q))
        .slice(0, 6)
        .map((t) => ({
          id: 'task-' + t.id,
          icon: CheckSquare,
          dot: STATUS_META[t.status]?.dot,
          label: t.title,
          // Sem data: rotulo proprio e navegacao para "Hoje" (onde a secao
          // "Sem data" a exibe), evitando /dia?date=null.
          hint: t.date ? formatShort(t.date) : 'Sem data',
          run: () => navigate(t.date ? `/dia?date=${t.date}` : '/'),
        }))
      if (taskItems.length) g.push({ title: 'Tarefas', items: taskItems })

      const linkItems = links
        .filter((l) => norm(l.title).includes(q) || norm(l.url).includes(q))
        .slice(0, 5)
        .map((l) => ({
          id: 'link-' + l.id,
          icon: ExternalLink,
          label: l.title || l.url,
          hint: 'Abrir link',
          run: () => {
            const safe = sanitizeUrl(l.url)
            if (safe) window.open(safe, '_blank', 'noopener')
          },
        }))
      if (linkItems.length) g.push({ title: 'Links', items: linkItems })
    }

    return g
  }, [query, tasks, links, navigate, onNewTask])

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups])

  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, flat.length - 1)))
  }, [flat.length])

  const onKeyDown = (e) => {
    if (e.key === 'Escape') return onClose()
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => (a + 1) % flat.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => (a - 1 + flat.length) % flat.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = flat[active]
      if (item) run(item.run)
    }
  }

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${active}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!open) return null

  let idx = -1
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-start justify-center px-4 pt-[12vh]">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="card relative z-10 w-full max-w-xl overflow-hidden p-0 shadow-2xl animate-scale-in">
        {/* Busca */}
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 dark:border-slate-800">
          <Search size={18} className="text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Buscar tarefas, links ou navegar..."
            className="w-full bg-transparent py-3.5 text-base text-slate-800 placeholder-slate-400 focus:outline-none dark:text-slate-100"
          />
          <kbd className="hidden rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-400 dark:border-slate-700 sm:block">
            ESC
          </kbd>
        </div>

        {/* Resultados */}
        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2">
          {flat.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-3 py-10 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800">
                <Search size={18} />
              </div>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-300">
                {`Nada encontrado para "${query}"`}
              </p>
              <p className="text-xs text-slate-400">Tente outro termo ou navegue pelo menu.</p>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.title} className="mb-1">
                <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {group.title}
                </p>
                {group.items.map((item) => {
                  idx += 1
                  const i = idx
                  const Icon = item.icon
                  return (
                    <button
                      key={item.id}
                      data-idx={i}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => run(item.run)}
                      className={cx(
                        'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm',
                        i === active
                          ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-200'
                          : 'text-slate-700 dark:text-slate-200',
                      )}
                    >
                      {item.dot ? (
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: item.dot }}
                        />
                      ) : (
                        <Icon size={16} className="shrink-0 text-slate-400" />
                      )}
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.hint && (
                        <span className="shrink-0 text-xs text-slate-400">{item.hint}</span>
                      )}
                      {i === active && (
                        <CornerDownLeft size={13} className="shrink-0 text-slate-400" />
                      )}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
