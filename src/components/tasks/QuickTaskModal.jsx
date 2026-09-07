import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import Modal from '../ui/Modal'
import { CANAL_PADRAO, validarAlerta } from '../../lib/alertRules'
import { TextInput, TextArea, Select, Checkbox } from '../ui/Form'
import AlertaRows from './AlertaRows'
import { useAuth } from '../../context/AuthContext'
import { useWorkspace } from '../../context/WorkspaceContext'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'
import { taskService } from '../../services/taskService'
import { STATUS_ORDER, STATUS_META, PRIORITY, PRIORITY_META } from '../../lib/constants'
import { toISODate } from '../../lib/date'
import { cx } from '../../lib/utils'

// Formulario simplificado para criacao rapida (otimizado para mobile).
// O formulario completo (TaskModal) continua disponivel para edicao detalhada.
// Inclui os MESMOS campos de alerta/lembrete do TaskModal (Push, minutos antes)
// pelo MESMO caminho de dados (taskService.create -> reminderService): o mobile
// nao pode ficar sem criar lembretes.
const empty = (defaults = {}) => ({
  title: '',
  date: toISODate(new Date()),
  start_time: '',
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

export default function QuickTaskModal({ open, onClose, defaults, onSaved }) {
  const { user } = useAuth()
  const { workspaceId } = useWorkspace()
  const { categories, reload } = useData()
  const { toast } = useToast()
  const [form, setForm] = useState(empty())
  const [saving, setSaving] = useState(false)
  const [showOptional, setShowOptional] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(empty(defaults))
      setShowOptional(false)
    }
  }, [open, defaults])

  const set = (key) => (e) => {
    const value = e?.target?.type === 'checkbox' ? e.target.checked : e.target.value
    setForm((f) => ({ ...f, [key]: value }))
  }

  // "Sem data": limpa data e hora (sem horarios orfaos). Ao desmarcar, volta
  // a data padrao (hoje).
  const noDate = !form.date
  const toggleNoDate = (e) => {
    if (e.target.checked) {
      setForm((f) => ({ ...f, date: '', start_time: '' }))
    } else {
      setForm((f) => ({ ...f, date: toISODate(new Date()) }))
    }
  }

  const submit = async () => {
    if (!form.title.trim()) {
      toast('Informe um titulo', 'error')
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
      const saved = await taskService.create(workspaceId, user.id, {
        ...form,
        date: form.date || null,
        category_id: form.category_id || null,
        start_time: form.start_time || null,
        alert_minutes_before: Number(form.alert_minutes_before) || 0,
      })
      if (saved?.reminder_sync_failed) {
        toast('Atividade salva, mas o lembrete nao pode ser agendado.', 'error')
      } else {
        toast('Atividade criada')
      }
      reload()
      onSaved?.(saved)
      onClose()
    } catch (err) {
      toast('Erro: ' + err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nova atividade"
      size="md"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={submit} disabled={saving}>
            {saving ? 'Salvando...' : 'Criar'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {/* CP5.7 — mesmos controles do DS usados na Central de links, nas
            Configuracoes e no formulario completo. */}
        <TextInput
          label="Título *"
          value={form.title}
          onChange={set('title')}
          placeholder="O que precisa ser feito?"
        />

        <div className="grid grid-cols-2 gap-3">
          <TextInput type="date" label="Data" value={form.date} onChange={set('date')} disabled={noDate} />
          <TextInput type="time" label="Hora" value={form.start_time} onChange={set('start_time')} disabled={noDate} />
        </div>

        <Checkbox label="Sem data" checked={noDate} onChange={toggleNoDate} />

        <Select label="Categoria" value={form.category_id} onChange={set('category_id')}>
          <option value="">Sem categoria</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>

        {/* Prioridade em botoes grandes (facil no toque) */}
        <div>
          <span className="label">Prioridade</span>
          <div className="grid grid-cols-4 gap-2">
            {Object.entries(PRIORITY_META).map(([key, meta]) => (
              <button
                key={key}
                type="button"
                onClick={() => setForm((f) => ({ ...f, priority: key }))}
                className={cx(
                  'min-h-[40px] rounded-control text-[12px] font-semibold transition-colors',
                  form.priority === key ? 'text-white' : 'bg-surface-2 text-secondary',
                )}
                style={form.priority === key ? { backgroundColor: meta.color } : undefined}
              >
                {meta.label}
              </button>
            ))}
          </div>
        </div>

        <Select label="Status" value={form.status} onChange={set('status')}>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>{STATUS_META[s].label}</option>
          ))}
        </Select>

        {/* Alerta: MESMA peca do formulario completo (AlertaRows). Este
            trecho era uma copia identica do TaskModal — duas copias da mesma
            regra e como as duas portas comecam a divergir sem ninguem decidir
            que deviam divergir. O caminho de dados nao muda. */}
        <AlertaRows form={form} set={set} />

        {/* Campos opcionais recolhidos por padrao */}
        <button
          type="button"
          onClick={() => setShowOptional((v) => !v)}
          className="flex min-h-[44px] w-full items-center justify-between rounded-control bg-surface-2 px-3 text-[14px] font-medium text-secondary transition-colors active:bg-surface-3"
        >
          Link e observação (opcional)
          {showOptional ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {showOptional && (
          <div className="space-y-3">
            <TextInput label="Link" value={form.link} onChange={set('link')} placeholder="https://..." inputMode="url" />
            <TextArea label="Observação" rows={2} value={form.notes} onChange={set('notes')} />
          </div>
        )}
      </div>
    </Modal>
  )
}
