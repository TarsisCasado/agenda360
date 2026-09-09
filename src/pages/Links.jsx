import { useEffect, useState, useCallback } from 'react'
import { Link2, Plus, Trash2, ExternalLink } from 'lucide-react'
import { EmptyState, ErrorState } from '../components/ui/Common'
import { Page, PageHeader } from '../components/layout/Page'
import { TextInput, TextArea, Select, Checkbox } from '../components/ui/Form'
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
  const [error, setError] = useState(null)
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
    setError(null)
    const { data, error: err } = await guard(linkService.list(workspaceId))
    if (err) {
      console.error('[Links] falha ao carregar links:', err?.message || err)
      setError(err)
    } else {
      setLinks(data)
    }
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

  // O dominio do link, que e o que a pessoa reconhece — a URL inteira e ruido
  // numa linha de lista.
  const host = (url) => {
    try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
  }

  // ---------------------------------------------------------------------------
  // COMPOSICAO (CP5.7). Era um formulario administrativo: caixa com borda,
  // campos cinza pesados, select do sistema, checkbox de navegador e um botao
  // de ponta a ponta. Nada disso era proposital — era Tailwind cru de uma
  // geracao anterior do produto.
  //
  // Agora: FORM + RESULT. No desktop o formulario e uma coluna estreita que
  // acompanha a rolagem e a colecao ocupa o resto; no mobile viram um so
  // fluxo, formulario primeiro. Os controles sao os do DS, entao esta tela usa
  // exatamente os mesmos campos da Captura e das Configuracoes.
  // ---------------------------------------------------------------------------
  return (
    <Page width="form">
      <PageHeader
        title="Links"
        subtitle="Cole um link e ele vira tarefa, ideia ou lembrete"
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5 lg:items-start">
        <form onSubmit={submit} className="space-y-3 sm:surface sm:p-5 lg:sticky lg:top-2 lg:col-span-2">
          <TextInput
            label="Endereço"
            value={form.url}
            onChange={onUrlChange}
            placeholder="https://..."
            inputMode="url"
            autoComplete="off"
          />
          <TextInput
            label="Título"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder={form.url && isValidUrl(form.url) ? titleFromUrl(form.url) : 'Preenchido pelo endereço'}
            hint="Em branco, usamos o nome do site."
          />
          <TextArea
            label="Observação"
            rows={2}
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            placeholder="Por que este link importa?"
          />
          <Select
            label="Transformar em"
            value={form.desired_action}
            onChange={(e) => setForm((f) => ({ ...f, desired_action: e.target.value }))}
          >
            {Object.entries(LINK_ACTION_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </Select>
          <Checkbox
            label="Criar a atividade junto"
            checked={form.createTask}
            onChange={(e) => setForm((f) => ({ ...f, createTask: e.target.checked }))}
          />
          <div className="flex justify-end">
            <button type="submit" className="btn-primary press w-full sm:w-auto">
              <Plus size={16} /> Salvar link
            </button>
          </div>
        </form>

        <div className="lg:col-span-3">
          {loading ? (
            <TaskListSkeleton count={3} />
          ) : error ? (
            <ErrorState onRetry={load} />
          ) : links.length === 0 ? (
            <EmptyState
              icon={Link2}
              title="Nenhum link salvo"
              description="O que você cola aqui vira referência — e, se quiser, atividade."
            />
          ) : (
            <>
              <p className="text-section mb-2 px-1">
                {links.length === 1 ? '1 link' : `${links.length} links`}
              </p>
              <ul className="list-panel">
                {links.map((l) => (
                  <li key={l.id} className="group flex items-start gap-3 px-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold text-primary">{l.title}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                        {sanitizeUrl(l.url) ? (
                          <a
                            href={sanitizeUrl(l.url)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-caption inline-flex items-center gap-1 text-accent-text hover:underline"
                          >
                            {host(l.url)} <ExternalLink size={11} />
                          </a>
                        ) : (
                          <span className="text-caption" title="Link inseguro (bloqueado)">
                            {host(l.url)}
                          </span>
                        )}
                        <span className="text-caption">
                          · {LINK_ACTION_LABELS[l.desired_action] || l.desired_action}
                        </span>
                        {l.task_id && (
                          <span className="chip bg-accent/10 text-accent-text">na sua lista</span>
                        )}
                      </div>
                      {l.note && <p className="mt-1 text-[13px] leading-snug text-secondary">{l.note}</p>}
                    </div>
                    <button
                      onClick={() => remove(l.id)}
                      aria-label={`Remover ${l.title}`}
                      className="icon-btn h-9 w-9 opacity-100 hover:text-danger lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
                    >
                      <Trash2 size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </Page>
  )
}
