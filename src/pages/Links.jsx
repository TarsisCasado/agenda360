import { useEffect, useState, useCallback } from 'react'
import { Link2, Plus, Trash2, ExternalLink, Wand2 } from 'lucide-react'
import { PageHeader, EmptyState } from '../components/ui/Common'
import { TaskListSkeleton } from '../components/ui/Skeleton'
import { useAuth } from '../context/AuthContext'
import { useWorkspace } from '../context/WorkspaceContext'
import { useData } from '../context/DataContext'
import { useToast } from '../context/ToastContext'
import { linkService } from '../services/linkService'
import { taskService } from '../services/taskService'
import {
  LINK_ACTIONS,
  LINK_ACTION_LABELS,
  STATUS,
} from '../lib/constants'
import { titleFromUrl, isValidUrl, sanitizeUrl, guard } from '../lib/utils'
import { toISODate } from '../lib/date'

// Mapeia a acao desejada do link -> categoria sugerida da tarefa gerada.
const ACTION_TO_CATEGORY = {
  [LINK_ACTIONS.TASK]: 'Trabalho',
  [LINK_ACTIONS.MEETING]: 'Reuniao',
  [LINK_ACTIONS.IDEA]: 'Ideia',
  [LINK_ACTIONS.PROJECT]: 'Projeto',
  [LINK_ACTIONS.REMINDER]: 'Pessoal',
  [LINK_ACTIONS.FUTURE_AGENDA]: 'Ideia',
}

export default function Links() {
  const { user } = useAuth()
  const { workspaceId } = useWorkspace()
  const { categoryByName, reload } = useData()
  const { toast } = useToast()
  const [links, setLinks] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    url: '',
    title: '',
    note: '',
    desired_action: LINK_ACTIONS.TASK,
    createTask: true,
  })

  const load = useCallback(async () => {
    if (!workspaceId) return
    setLoading(true)
    const { data, error } = await guard(linkService.list(workspaceId))
    if (error) console.error('[Links] falha ao carregar links:', error?.message || error)
    else setLinks(data)
    setLoading(false)
  }, [workspaceId])

  useEffect(() => {
    load()
  }, [load])

  const onUrlChange = (e) => {
    const url = e.target.value
    setForm((f) => ({
      ...f,
      url,
      title: f.title || (isValidUrl(url) ? titleFromUrl(url) : ''),
    }))
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!isValidUrl(form.url)) {
      toast('Informe uma URL valida', 'error')
      return
    }
    try {
      const title = form.title.trim() || titleFromUrl(form.url)
      const link = await linkService.create(workspaceId, user.id, {
        url: form.url,
        title,
        note: form.note,
        desired_action: form.desired_action,
      })

      if (form.createTask) {
        const catName = ACTION_TO_CATEGORY[form.desired_action]
        const category = categoryByName(catName)
        const task = await taskService.create(workspaceId, user.id, {
          title: `[${LINK_ACTION_LABELS[form.desired_action]}] ${title}`,
          description: form.note,
          date: toISODate(new Date()),
          link: form.url,
          category_id: category?.id || null,
          status: STATUS.TODO,
          priority:
            form.desired_action === LINK_ACTIONS.MEETING ? 'high' : 'medium',
        })
        await linkService.attachTask(link.id, task.id)
        reload()
        toast('Link salvo e atividade criada')
      } else {
        toast('Link salvo')
      }

      setForm({
        url: '',
        title: '',
        note: '',
        desired_action: LINK_ACTIONS.TASK,
        createTask: true,
      })
      load()
    } catch (err) {
      toast('Erro: ' + err.message, 'error')
    }
  }

  const remove = async (id) => {
    await linkService.remove(id)
    toast('Link removido')
    load()
  }

  return (
    <div>
      <PageHeader
        title="Central de links"
        subtitle="Cole qualquer link e transforme em tarefa, reuniao, ideia, projeto ou lembrete."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Formulario */}
        <form onSubmit={submit} className="card space-y-4 p-5 lg:col-span-2">
          <div className="flex items-center gap-2 text-brand-600">
            <Wand2 size={18} />
            <h2 className="font-bold">Novo link</h2>
          </div>
          <div>
            <label className="label">URL</label>
            <input
              className="input"
              value={form.url}
              onChange={onUrlChange}
              placeholder="https://instagram.com/..."
            />
          </div>
          <div>
            <label className="label">Titulo</label>
            <input
              className="input"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Gerado automaticamente ou manual"
            />
          </div>
          <div>
            <label className="label">Observacao</label>
            <textarea
              className="input min-h-[60px]"
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Transformar em</label>
            <select
              className="input"
              value={form.desired_action}
              onChange={(e) =>
                setForm((f) => ({ ...f, desired_action: e.target.value }))
              }
            >
              {Object.entries(LINK_ACTION_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={form.createTask}
              onChange={(e) =>
                setForm((f) => ({ ...f, createTask: e.target.checked }))
              }
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            Criar atividade vinculada automaticamente
          </label>
          <button type="submit" className="btn-primary w-full">
            <Plus size={16} /> Salvar link
          </button>
        </form>

        {/* Lista */}
        <div className="lg:col-span-3">
          {loading ? (
            <TaskListSkeleton count={3} />
          ) : links.length === 0 ? (
            <EmptyState
              icon={Link2}
              title="Nenhum link salvo"
              description="Cole um link ao lado para comecar sua central de referencias."
            />
          ) : (
            <div className="space-y-3">
              {links.map((l) => (
                <div key={l.id} className="card flex items-start gap-3 p-4">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-900/30">
                    <Link2 size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-800 dark:text-slate-100">
                      {l.title}
                    </p>
                    {sanitizeUrl(l.url) ? (
                      <a
                        href={sanitizeUrl(l.url)}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 truncate text-xs text-brand-600 hover:underline"
                      >
                        {l.url} <ExternalLink size={11} />
                      </a>
                    ) : (
                      <span className="flex items-center gap-1 truncate text-xs text-slate-400" title="Link inseguro (bloqueado)">
                        {l.url}
                      </span>
                    )}
                    {l.note && (
                      <p className="mt-1 text-sm text-slate-500">{l.note}</p>
                    )}
                    <div className="mt-2 flex items-center gap-2">
                      <span className="chip bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {LINK_ACTION_LABELS[l.desired_action] || l.desired_action}
                      </span>
                      {l.task_id && (
                        <span className="chip bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30">
                          atividade vinculada
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => remove(l.id)}
                    className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
