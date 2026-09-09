import { PropGroup, PropSelect, PropSwitch } from '../ui/Form'
import { PEDIR_HORARIO } from '../../lib/alertRules'
import { ALERT_TYPES, ALERT_TYPE_LABELS } from '../../lib/constants'

// ---------------------------------------------------------------------------
// AVISAR ANTES — a propriedade progressiva, em UM lugar so.
//
// Este trecho existia duas vezes, identico, no TaskModal e no QuickTaskModal:
// mesma caixa cinza aninhada, mesmo par de campos, mesma frase de erro. Duas
// copias da mesma regra e como as duas portas comecam a divergir sem ninguem
// decidir que deviam divergir — foi exatamente isso que o CP5.6 corrigiu na
// captura. Aqui a correcao e a mesma, na forma.
//
// O QUE MUDA E SO A FORMA. A regra do CP5.8.1 continua inteira e continua
// morando em lib/alertRules.js: o alerta exige horario, a frase e a mesma em
// todas as portas, e nada e inventado. Este componente nao valida nada — ele
// so mostra.
//
// Desligado: uma linha. Ligado: mais duas linhas NO MESMO bloco — nao um card
// cinza dentro do formulario, que era o "formulario dentro de formulario".
// ---------------------------------------------------------------------------

// Antecedencia em opcoes nomeadas, nao num campo numerico com setinhas: "10
// minutos antes" e uma escolha entre poucas, nao um numero arbitrario que a
// pessoa precisa digitar. O valor gravado continua sendo o mesmo numero.
const ANTECEDENCIAS = [
  [0, 'Na hora'],
  [5, '5 minutos antes'],
  [10, '10 minutos antes'],
  [15, '15 minutos antes'],
  [30, '30 minutos antes'],
  [60, '1 hora antes'],
  [120, '2 horas antes'],
  [1440, '1 dia antes'],
]

// Uma atividade antiga pode ter um valor fora da lista (7, 45...). Trocar por
// um preset seria alterar em silencio um alerta que a pessoa configurou, entao
// o valor atual entra na lista como uma opcao a mais.
export function opcoesAntecedencia(atual) {
  const n = Number(atual)
  if (!Number.isFinite(n) || ANTECEDENCIAS.some(([v]) => v === n)) return ANTECEDENCIAS
  return [...ANTECEDENCIAS, [n, `${n} minutos antes`]].sort((a, b) => a[0] - b[0])
}

export default function AlertaRows({ form, set, className }) {
  const ligado = Boolean(form.alert_enabled)
  const semHorario = ligado && !form.start_time

  return (
    <div className={className}>
      <PropGroup>
        <PropSwitch label="Avisar antes" checked={ligado} onChange={set('alert_enabled')} />
        {ligado && (
          <PropSelect label="Canal" value={form.alert_type} onChange={set('alert_type')}>
            {Object.entries(ALERT_TYPE_LABELS).map(([key, label]) => (
              <option key={key} value={key} disabled={key === ALERT_TYPES.WHATSAPP}>
                {label}
              </option>
            ))}
          </PropSelect>
        )}
        {ligado && (
          <PropSelect
            label="Antecedência"
            value={String(form.alert_minutes_before ?? 0)}
            onChange={set('alert_minutes_before')}
          >
            {opcoesAntecedencia(form.alert_minutes_before).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>{rotulo}</option>
            ))}
          </PropSelect>
        )}
      </PropGroup>
      {/* Dito ANTES de tentar salvar: o aviso precisa de um instante, e
          inventar 09:00 seria pior que nao avisar (CP5.8.1). */}
      {semHorario && (
        <p className="mt-1.5 px-1 text-[12px] leading-snug text-danger">{PEDIR_HORARIO}</p>
      )}
    </div>
  )
}
