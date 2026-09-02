import { useEffect, useState } from 'react'
import Modal from '../ui/Modal'
import { toISODate, addDays } from '../../lib/date'

// ---------------------------------------------------------------------------
// "A fazer" EXIGE UM DIA — e o quadro nao inventa nenhum.
//
// `patchForColumn` devolve `needsDate: true` quando alguem move uma tarefa sem
// data para "A fazer". Este e o menor dialogo possivel para resolver isso: dois
// atalhos e um campo. Nada de abrir o editor completo — a pessoa arrastou um
// cartao, nao pediu para editar a tarefa.
//
// Nao usa o RescheduleModal de proposito: reagendar marca `rescheduled` e
// incrementa `reschedule_count`. Dar data pela PRIMEIRA vez nao e reagendar, e
// contaminaria a metrica de reagendamento com tarefas que nunca tiveram data.
// ---------------------------------------------------------------------------
export default function DatePrompt({ open, task, onClose, onConfirm }) {
  const [date, setDate] = useState('')

  useEffect(() => {
    if (open) setDate(toISODate(new Date()))
  }, [open])

  const atalhos = [
    { label: 'Hoje', value: toISODate(new Date()) },
    { label: 'Amanhã', value: toISODate(addDays(new Date(), 1)) },
  ]

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Para quando?"
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" disabled={!date} onClick={() => onConfirm?.(date)}>
            Mover para A fazer
          </button>
        </>
      }
    >
      <p className="text-body mb-4">
        <span className="font-semibold text-primary">{task?.title}</span> ainda não tem data. “A
        fazer” é o que está agendado, então escolha um dia.
      </p>
      <div className="mb-4 flex gap-2">
        {atalhos.map((a) => (
          <button
            key={a.label}
            onClick={() => setDate(a.value)}
            className={
              date === a.value
                ? 'btn-primary flex-1 text-[14px]'
                : 'btn-secondary flex-1 text-[14px]'
            }
          >
            {a.label}
          </button>
        ))}
      </div>
      <label className="label" htmlFor="board-date-prompt">
        Escolher data
      </label>
      <input
        id="board-date-prompt"
        type="date"
        className="input"
        value={date}
        onChange={(e) => setDate(e.target.value)}
      />
    </Modal>
  )
}
