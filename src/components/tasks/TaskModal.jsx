import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Inbox as InboxIcon } from 'lucide-react'
import Modal from '../ui/Modal'
import { CANAL_PADRAO, validarAlerta, PEDIR_HORARIO } from '../../lib/alertRules'
import { TextInput, TextArea, Select, Checkbox } from '../ui/Form'
import { useAuth } from '../../context/AuthContext'
import { useWorkspace } from '../../context/WorkspaceContext'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'
import { taskService } from '../../services/taskService'
import { inboxTaskLinkService } from '../../services/inboxTaskLinkService'
import {
  STATUS_ORDER,
  STATUS_META,
  PRIORITY,
  PRIORITY_META,
  ALERT_TYPES,
  ALERT_TYPE_LABELS,
} from '../../lib/constants'
import { toISODate } from '../../lib/date'

const empty = (defaults = {}) => ({
  title: '',
  description: '',
  date: toISODate(new Date()),
  start_time: '',
  end_time: '',
  category_id: '',
  priority: PRIORITY.MEDIUM,
  status: 'todo',
  link: '',
  notes: '',
  alert_enabled: false,
  alert_type: CANAL_PADRAO,
  alert_minutes_before: 15,
  ...defaults,
})

// `onCreate` (opcional) injeta a persistencia na CRIACAO — usado pela conversao
// Inbox -> Task para criar a Task (origin 'inbox') e o vinculo. Se ausente, usa
// taskService.create. TaskModal permanece generico (sem redesign).
export default function TaskModal({ open, onClose, task, defaults, onSaved, onCreate }) {
  const { user } = useAuth()
  const { workspaceId } = useWorkspace()
  const { categories, reload } = useData()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [form, setForm] = useState(empty())
  const [saving, setSaving] = useState(false)
  // Vinculo com a Caixa de Entrada (quando a Task veio de uma captura).
  const [inboxLink, setInboxLink] = useState(null)
  const isEdit = Boolean(task)

  useEffect(() => {
    if (!open) return
    if (task) {
      setForm({
        ...empty(),
        ...task,
        category_id: task.category_id || '',
        start_time: task.start_time || '',
        end_time: task.end_time || '',
      })
    } else {
      setForm(empty(defaults))
    }
  }, [open, task, defaults])

  // Origem "Inbox": ao editar uma Task com origin 'inbox', busca o vinculo para
  // oferecer o atalho "abrir a captura relacionada". Discreto e best-effort.
  useEffect(() => {
    if (!open || !task || task.origin !== 'inbox' || !workspaceId) {
      setInboxLink(null)
      return
    }
    let alive = true
    inboxTaskLinkService
      .getByTask(workspaceId, task.id)
      .then((l) => { if (alive) setInboxLink(l) })
      .catch(() => { if (alive) setInboxLink(null) })
    return () => { alive = false }
  }, [open, task, workspaceId])

  const openOrigin = () => {
    if (!inboxLink) return
    onClose()
    navigate(`/caixa?item=${inboxLink.inbox_item_id}`)
  }

  const set = (key) => (e) => {
    const value = e?.target?.type === 'checkbox' ? e.target.checked : e.target.value
    setForm((f) => ({ ...f, [key]: value }))
  }

  // "Sem data": atividade sem data nao pode ter horarios orfaos. Ao marcar,
  // limpa date/start_time/end_time; ao desmarcar, volta a data padrao (hoje).
  const noDate = !form.date
  const toggleNoDate = (e) => {
    if (e.target.checked) {
      setForm((f) => ({ ...f, date: '', start_time: '', end_time: '' }))
    } else {
      setForm((f) => ({ ...f, date: toISODate(new Date()) }))
    }
  }

  const submit = async () => {
    if (!form.title.trim()) {
      toast('Informe um titulo para a atividade', 'error')
      return
    }
    // A REGRA DO ALERTA vem de lib/alertRules.js — a MESMA de todas as portas
    // de entrada, com a mesma frase. Antes cada formulario tinha o seu texto.
    const alerta = validarAlerta({ ...form, start_time: form.start_time || null, date: form.date || null })
    if (!alerta.ok) {
      toast(alerta.mensagem, 'error')
      return
    }
    setSaving(true)
    try {
      const payload = {
        ...form,
        date: form.date || null,
        category_id: form.category_id || null,
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        alert_minutes_before: Number(form.alert_minutes_before) || 0,
      }
      let saved
      if (isEdit) {
        saved = await taskService.update(user.id, task, payload)
      } else if (onCreate) {
        // Fluxo injetado (ex.: conversao Inbox -> Task cria a Task + o vinculo).
        saved = await onCreate(workspaceId, user.id, payload)
      } else {
        saved = await taskService.create(workspaceId, user.id, payload)
      }
      if (saved?.reminder_sync_failed) {
        // Task foi salva; apenas o agendamento do lembrete falhou (surfavel).
        toast('Atividade salva, mas o lembrete nao pode ser agendado.', 'error')
      } else {
        toast(isEdit ? 'Atividade atualizada' : 'Atividade criada')
      }
      reload()
      onSaved?.(saved)
      onClose()
    } catch (err) {
      toast('Erro ao salvar: ' + err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar atividade' : 'Nova atividade'}
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={submit} disabled={saving}>
            {saving ? 'Salvando...' : isEdit ? 'Salvar' : 'Criar'}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Origem discreta: Task criada a partir de uma captura da Caixa. */}
        {inboxLink && (
          <div className="sm:col-span-2">
            <button
              type="button"
              onClick={openOrigin}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-600 transition-colors hover:bg-brand-100 dark:bg-brand-900/30 dark:text-brand-300"
              title="Abrir a captura na Caixa de Entrada"
            >
              <InboxIcon size={13} /> Origem: Caixa de Entrada
            </button>
          </div>
        )}
        {/* CP5.7 — os campos passam a ser os do DS (rotulo ligado por id, anel
            de foco unico, select e caixa de marcacao com a nossa moldura). Era
            a ultima superficie visivel do produto com controle de navegador
            cru no meio de uma tela desenhada. */}
        <TextInput
          className="sm:col-span-2"
          label="Título *"
          value={form.title}
          onChange={set('title')}
          placeholder="Ex: Reunião de alinhamento"
        />

        <TextArea
          className="sm:col-span-2"
          label="Descrição"
          rows={3}
          value={form.description}
          onChange={set('description')}
          placeholder="Detalhes da atividade"
        />

        <div>
          <TextInput type="date" label="Data" value={form.date} onChange={set('date')} disabled={noDate} />
          <Checkbox label="Sem data" checked={noDate} onChange={toggleNoDate} className="mt-1" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <TextInput type="time" label="Início" value={form.start_time} onChange={set('start_time')} disabled={noDate} />
          <TextInput type="time" label="Fim" value={form.end_time} onChange={set('end_time')} disabled={noDate} />
        </div>

        <Select label="Categoria" value={form.category_id} onChange={set('category_id')}>
          <option value="">Sem categoria</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
        <Select label="Prioridade" value={form.priority} onChange={set('priority')}>
          {Object.entries(PRIORITY_META).map(([key, meta]) => (
            <option key={key} value={key}>{meta.label}</option>
          ))}
        </Select>

        <Select label="Status" value={form.status} onChange={set('status')}>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>{STATUS_META[s].label}</option>
          ))}
        </Select>
        <TextInput
          label="Link relacionado"
          value={form.link}
          onChange={set('link')}
          placeholder="https://..."
          inputMode="url"
        />

        <TextArea
          className="sm:col-span-2"
          label="Observações"
          rows={2}
          value={form.notes}
          onChange={set('notes')}
        />

        {/* Alertas: bloco rebaixado, sem borda — uma caixa a menos. */}
        <div className="surface-sunken sm:col-span-2 px-3 pb-3 pt-1">
          <Checkbox
            label="Avisar antes"
            checked={form.alert_enabled}
            onChange={set('alert_enabled')}
          />
          {/* Dito ANTES de tentar salvar: o aviso precisa de um instante, e
              inventar 09:00 seria pior que nao avisar. */}
          {form.alert_enabled && !form.start_time && (
            <p className="text-[12px] leading-snug text-danger">{PEDIR_HORARIO}</p>
          )}
          {form.alert_enabled && (
            <div className="grid grid-cols-2 gap-3">
              <Select label="Como" value={form.alert_type} onChange={set('alert_type')}>
                {Object.entries(ALERT_TYPE_LABELS).map(([key, label]) => (
                  <option key={key} value={key} disabled={key === ALERT_TYPES.WHATSAPP}>
                    {label}
                  </option>
                ))}
              </Select>
              <TextInput
                type="number"
                min="0"
                label="Minutos antes"
                value={form.alert_minutes_before}
                onChange={set('alert_minutes_before')}
              />
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
