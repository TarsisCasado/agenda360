import { useState, useEffect } from 'react'
import { Share2 } from 'lucide-react'
import Modal from '../ui/Modal'
import { useAuth } from '../../context/AuthContext'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'
import { taskService } from '../../services/taskService'

// Delegacao de atividade. Na V1 (foco pessoal) informamos o nome/e-mail do
// responsavel; a estrutura de delegacao entre usuarios da equipe ja existe no
// backend (tabela delegations + assignee_id).
export default function DelegateModal({ open, onClose, task, onDone }) {
  const { user } = useAuth()
  const { reload } = useData()
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) setName('')
  }, [open])

  const apply = async () => {
    if (!task) return
    if (!name.trim()) {
      toast('Informe para quem delegar', 'error')
      return
    }
    setSaving(true)
    try {
      // Sem gestao de equipe ainda: registramos como delegado ao proprio user,
      // guardando o nome do responsavel no historico.
      await taskService.delegate(user.id, task, user.id, name.trim())
      toast(`Delegada para ${name.trim()}`)
      reload()
      onDone?.()
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
      title="Delegar atividade"
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={apply} disabled={saving}>
            <Share2 size={16} /> Delegar
          </button>
        </>
      }
    >
      {task && (
        <p className="mb-4 text-sm text-slate-500">
          Delegar{' '}
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            {task.title}
          </span>
          .
        </p>
      )}
      <label className="label">Responsavel</label>
      <input
        className="input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nome ou e-mail"
        autoFocus
      />
      <p className="mt-2 text-xs text-slate-400">
        A atividade fica com status <strong>Delegado</strong> e o responsavel e
        registrado no historico.
      </p>
    </Modal>
  )
}
