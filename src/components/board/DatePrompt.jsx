import { useEffect, useState } from 'react'
import Modal from '../ui/Modal'
import { toISODate, addDays } from '../../lib/date'

// ---------------------------------------------------------------------------
// "A fazer" EXIGE UM DIA — e o quadro nao inventa nenhum.
//
// Dois caminhos chegam aqui, e por um motivo so:
//   MOVER   `patchForColumn` devolve `needsDate` ao levar uma tarefa sem data
//           para "A fazer";
//   CRIAR   escrever direto na coluna "A fazer".
//
// O caso CRIAR e correcao de uma decisao errada do CP5.3. La, digitar em
// "A fazer" criava a tarefa em HOJE, e o placeholder ("Nova tarefa para hoje…")
// servia de aviso. O product owner apontou o erro conceitual: ESTADO
// OPERACIONAL e DIMENSAO TEMPORAL sao coisas diferentes. "A fazer" quer dizer
// "agendado", nao "hoje" — declarar a suposicao num placeholder nao a torna
// menos suposicao. Agora pergunta, nas duas portas.
//
// Nao usa o RescheduleModal de proposito: reagendar marca `rescheduled` e
// incrementa `reschedule_count`. Dar data pela PRIMEIRA vez nao e reagendar, e
// contaminaria a metrica de reagendamento.
//
// No iPhone isto ja chega como folha inferior: o `Modal` e `items-end` com
// canto superior arredondado e safe-area no rodape abaixo de 640px — nao e um
// dialogo de desktop espremido.
// ---------------------------------------------------------------------------
export default function DatePrompt({ open, titulo, acao = 'mover', onClose, onConfirm }) {
  const [date, setDate] = useState('')

  useEffect(() => {
    if (open) setDate(toISODate(new Date()))
  }, [open])

  const atalhos = [
    { label: 'Hoje', value: toISODate(new Date()) },
    { label: 'Amanhã', value: toISODate(addDays(new Date(), 1)) },
  ]
  const criando = acao === 'criar'

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
            {criando ? 'Criar em A fazer' : 'Mover para A fazer'}
          </button>
        </>
      }
    >
      <p className="text-body mb-4">
        <span className="font-semibold text-primary">{titulo}</span>{' '}
        {criando ? 'entra em “A fazer”, que é o que está agendado' : 'ainda não tem data, e “A fazer” é o que está agendado'}
        . Escolha o dia.
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
