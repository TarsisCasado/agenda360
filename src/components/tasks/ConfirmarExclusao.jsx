import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import Modal from '../ui/Modal'
import { useAuth } from '../../context/AuthContext'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'
import { taskService } from '../../services/taskService'
import { tipoDeAtividade } from '../../lib/activityKind'

// ---------------------------------------------------------------------------
// EXCLUIR ATIVIDADE — a confirmacao, em UM lugar so (CP5.9.1).
//
// A exclusao ja existia no dominio e ja estava completa: `taskService.remove`
// apaga a atividade, limpa os lembretes (reminderService.onTaskDeleted no modo
// demo; ON DELETE CASCADE no Supabase) e registra no log. O que faltava era
// como CHEGAR nela — vivia atras do menu "..." de um card, presente so no Mes e
// no Kanban, e confirmava com o `window.confirm` do navegador: uma caixa do
// sistema operacional no meio de um app desenhado, sem o titulo da atividade,
// com "OK" como acao padrao.
//
// Este componente NAO reimplementa exclusao. Ele so pergunta, e chama a mesma
// operacao de dominio. Toda tela que exclui passa por aqui — era esse o risco
// de "uma exclusao diferente por tela".
//
// Duas decisoes que valem a pena registrar:
//
//   1. O TITULO APARECE. Confirmar "Excluir esta atividade?" e pedir para a
//      pessoa apostar na propria memoria de qual item ela clicou;
//   2. CANCELAR E A ACAO SEGURA — foco inicial, posicao de descanso e peso
//      visual. Excluir e vermelho porque destroi, nao para chamar atencao.
// ---------------------------------------------------------------------------
export default function ConfirmarExclusao({ open, task, onClose, onDeleted }) {
  const { user } = useAuth()
  const { reload } = useData()
  const { toast } = useToast()
  const [excluindo, setExcluindo] = useState(false)

  if (!task) return null
  const tipo = tipoDeAtividade(task)

  const excluir = async () => {
    setExcluindo(true)
    try {
      // A MESMA operacao de dominio de sempre: ela ja cuida dos lembretes.
      await taskService.remove(user.id, task)
      toast(`${tipo.rotulo} excluída`)
      reload()
      onDeleted?.(task)
      onClose()
    } catch (err) {
      toast('Erro ao excluir: ' + err.message, 'error')
    } finally {
      setExcluindo(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Excluir ${tipo.rotulo.toLowerCase()}?`}
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={excluindo}>
            Cancelar
          </button>
          <button className="btn-danger" onClick={excluir} disabled={excluindo}>
            {excluindo ? 'Excluindo…' : 'Excluir'}
          </button>
        </>
      }
    >
      <div className="flex gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger">
          <AlertTriangle size={18} />
        </span>
        <div className="min-w-0">
          {/* O titulo da atividade, dito por extenso: confirmar sem ele e
              pedir para a pessoa apostar em qual item ela clicou. */}
          <p className="text-item break-words">{task.title}</p>
          <p className="text-caption mt-1.5">
            {task.alert_enabled && task.start_time
              ? 'O aviso agendado também será cancelado. Não dá para desfazer.'
              : 'Não dá para desfazer.'}
          </p>
        </div>
      </div>
    </Modal>
  )
}
