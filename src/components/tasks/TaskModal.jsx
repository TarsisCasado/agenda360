import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Inbox as InboxIcon, Trash2 } from 'lucide-react'
import Modal from '../ui/Modal'
import { CANAL_PADRAO, validarAlerta } from '../../lib/alertRules'
import {
  TitleInput,
  BareTextArea,
  PropGroup,
  PropSelect,
  PropInput,
  SlotField,
  SectionLabel,
} from '../ui/Form'
import AlertaRows from './AlertaRows'
import ConfirmarExclusao from './ConfirmarExclusao'
import { useAuth } from '../../context/AuthContext'
import { useWorkspace } from '../../context/WorkspaceContext'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'
import { taskService } from '../../services/taskService'
import { inboxTaskLinkService } from '../../services/inboxTaskLinkService'
import { STATUS_ORDER, STATUS_META, PRIORITY, PRIORITY_META } from '../../lib/constants'
import { toISODate } from '../../lib/date'
import { tipoDeAtividade, COMPROMISSO } from '../../lib/activityKind'

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
// `kind` (CP5.9.1): quando a pessoa escolheu DIRETO o que criar, o editor abre
// dizendo o nome do que ela escolheu e — no caso do compromisso — ja com o dia
// preenchido e o horario esperando. Nao existe tipo novo no banco: `kind` so
// decide o rotulo e o foco. Ver lib/activityKind.js.
export default function TaskModal({ open, onClose, task, defaults, kind, onSaved, onCreate }) {
  const { user } = useAuth()
  const { workspaceId } = useWorkspace()
  const { categories, reload } = useData()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [form, setForm] = useState(empty())
  const [saving, setSaving] = useState(false)
  // Vinculo com a Caixa de Entrada (quando a Task veio de uma captura).
  const [inboxLink, setInboxLink] = useState(null)
  const [confirmarExclusao, setConfirmarExclusao] = useState(false)
  const isEdit = Boolean(task)
  // Ao EDITAR, a especie vem da propria atividade (start_time). Ao CRIAR, vem
  // da escolha da pessoa. Mesma regra derivada, dois momentos.
  const especie = isEdit ? tipoDeAtividade(task) : kind

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
    // COMPROMISSO exige dia (CP5.9.1): hora sem dia nao existe na agenda — a
    // mesma regra que agent/slots ja aplica na captura. Nao vale so esconder a
    // caixa "sem data": se a pessoa apagar o dia a mao, o compromisso viraria
    // uma tarefa em silencio, e ela escolheu criar um compromisso.
    if (especie?.id === COMPROMISSO.id && !form.date) {
      toast('Um compromisso precisa de um dia.', 'error')
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
      title={
        isEdit
          ? `Editar ${especie ? especie.rotulo.toLowerCase() : 'atividade'}`
          : especie?.titulo || 'Nova atividade'
      }
      size="lg"
      footer={
        <>
          {/* Excluir e destrutivo, entao NAO disputa espaco com Salvar: fica do
              outro lado do rodape, sem preenchimento, discreto. So existe ao
              editar — nao se exclui o que ainda nao foi criado. */}
          {isEdit && (
            <button
              className="btn-ghost press mr-auto text-danger"
              onClick={() => setConfirmarExclusao(true)}
              disabled={saving}
            >
              <Trash2 size={15} /> Excluir
            </button>
          )}
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={submit} disabled={saving}>
            {saving ? 'Salvando...' : isEdit ? 'Salvar' : 'Criar'}
          </button>
        </>
      }
    >
      {/* ---------------------------------------------------------------
          CP5.9 — o editor deixa de ser um cadastro.

          Antes: doze propriedades, doze retangulos cinza empilhados, cada um
          com rotulo em cima. O Titulo tinha exatamente o mesmo peso visual da
          Observacao, e a Data ficava enorme ao lado de dois campos pequenos
          porque calhava de ocupar uma coluna inteira do grid.

          Agora tres formas, e so tres:
            . o que se ESCREVE nao tem moldura (titulo dominante, resto abaixo);
            . o que PERTENCE AO MESMO CONCEITO divide uma caixa (Data/Inicio/Fim);
            . o que se ESCOLHE e linha dentro de um bloco agrupado.

          Nenhuma regra de dominio muda aqui: mesmos campos, mesmo `form`,
          mesmo `submit`, mesma validacao de alerta do CP5.8.1.
          --------------------------------------------------------------- */}
      <div className="space-y-5">
        {/* Origem: metadata discreta ACIMA do titulo — informa de onde a
            atividade veio sem competir com ele. */}
        {inboxLink && (
          <button
            type="button"
            onClick={openOrigin}
            className="press -mt-1 inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted transition-colors hover:text-accent"
            title="Abrir a captura na Caixa de Entrada"
          >
            <InboxIcon size={13} /> Origem: Caixa de Entrada
          </button>
        )}

        {/* O QUE SE ESCREVE — sem moldura. */}
        <div className="space-y-1">
          <TitleInput
            aria-label="Título da atividade"
            value={form.title}
            onChange={set('title')}
            placeholder="Título da atividade"
          />
          <BareTextArea
            aria-label="Descrição"
            value={form.description}
            onChange={set('description')}
            placeholder="Adicionar descrição…"
          />
        </div>

        {/* QUANDO — Data, Inicio e Fim pertencem ao mesmo conceito, entao
            dividem UMA caixa. A largura passa a dizer algo: a data pede mais
            espaco que uma hora, e nao o triplo por acidente de grid. */}
        <section>
          <SectionLabel>Quando</SectionLabel>
          <div className="group-box focus-ring grid grid-cols-[1.35fr_1fr_1fr] divide-x divide-hairline/60">
            <SlotField
              type="date"
              label="Data"
              value={form.date}
              onChange={set('date')}
              disabled={noDate}
            />
            <SlotField
              type="time"
              label="Início"
              value={form.start_time}
              onChange={set('start_time')}
              disabled={noDate}
            />
            <SlotField
              type="time"
              label="Fim"
              value={form.end_time}
              onChange={set('end_time')}
              disabled={noDate}
            />
          </div>
          {/* "Sem data" e um modo do grupo acima, nao um campo irmao: fica
              colado nele, discreto, e continua com alvo de 44px. Nao aparece
              para um compromisso — oferecer "sem data" para algo que acontece
              numa hora e oferecer um estado invalido. */}
          <label
            hidden={especie?.id === COMPROMISSO.id}
            className="mt-1 flex min-h-[44px] cursor-pointer select-none items-center gap-2 px-1"
          >
            <input
              type="checkbox"
              className="peer sr-only"
              checked={noDate}
              onChange={toggleNoDate}
            />
            <span className="check-box h-[18px] w-[18px]" aria-hidden>
              <Check size={12} strokeWidth={3} />
            </span>
            <span className="text-[13px] text-secondary">Atividade sem data</span>
          </label>
        </section>

        {/* PROPRIEDADES — uma caixa no lugar de quatro. Rotulo a esquerda,
            valor a direita: propriedade de um objeto, nao campo de cadastro. */}
        <section>
          <SectionLabel>Propriedades</SectionLabel>
          <PropGroup>
            <PropSelect label="Categoria" value={form.category_id} onChange={set('category_id')}>
              <option value="">Sem categoria</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </PropSelect>
            <PropSelect label="Prioridade" value={form.priority} onChange={set('priority')}>
              {Object.entries(PRIORITY_META).map(([key, meta]) => (
                <option key={key} value={key}>{meta.label}</option>
              ))}
            </PropSelect>
            <PropSelect label="Status" value={form.status} onChange={set('status')}>
              {STATUS_ORDER.map((st) => (
                <option key={st} value={st}>{STATUS_META[st].label}</option>
              ))}
            </PropSelect>
            <PropInput
              label="Link"
              value={form.link}
              onChange={set('link')}
              placeholder="https://…"
              inputMode="url"
            />
          </PropGroup>
        </section>

        {/* ALERTA — mesma peca usada na criacao rapida (components/tasks/
            AlertaRows). Desligado e uma linha; ligado revela mais duas no
            MESMO bloco. */}
        <section>
          <SectionLabel>Alerta</SectionLabel>
          <AlertaRows form={form} set={set} />
        </section>

        {/* Observacoes: o texto mais secundario do editor, por ultimo e sem
            moldura — separado do resto por um hairline em vez de uma caixa. */}
        <section className="border-t hair pt-3">
          <BareTextArea
            aria-label="Observações"
            value={form.notes}
            onChange={set('notes')}
            placeholder="Observações…"
          />
        </section>
      </div>

      {/* A MESMA confirmacao de todas as telas, sobre a MESMA operacao de
          dominio (taskService.remove), que ja cuida dos lembretes. */}
      <ConfirmarExclusao
        open={confirmarExclusao}
        task={task}
        onClose={() => setConfirmarExclusao(false)}
        onDeleted={() => { onSaved?.(null); onClose() }}
      />
    </Modal>
  )
}
