// ---------------------------------------------------------------------------
// ALERTA — um lembrete SEMPRE se apoia em alguma coisa.
//
// "15 min antes" nao quer dizer nada sozinho: antes do que? Um compromisso tem
// hora de comeco; uma tarefa pode ter horario reservado, ou so um prazo, ou
// nada. Sao referencias diferentes, e o produto tem de dizer QUAL esta usando.
//
// Por isso o alerta guarda o DESLOCAMENTO e a REFERENCIA, nunca um instante
// congelado:
//
//   { minutos: 15, referencia: 'compromisso' }   15 min antes do compromisso
//   { minutos: 60, referencia: 'prazo' }         1 hora antes do prazo
//   { em: '2026-09-15T07:30' }                   horario especifico
//
// Consequencia direta, e e a regra que o UX1.2 pediu: mover o compromisso move
// o alerta relativo junto, porque ele e calculado a partir da referencia atual.
// O alerta especifico NAO se desloca — foi escolhido a dedo, e mexer nele sem
// avisar seria trair a escolha.
//
// Multiplos alertas ficam de fora deste checkpoint, de proposito.
// ---------------------------------------------------------------------------

export const OPCOES_RELATIVAS = [
  { minutos: 0, label: 'Na hora' },
  { minutos: 5, label: '5 min antes' },
  { minutos: 15, label: '15 min antes' },
  { minutos: 30, label: '30 min antes' },
  { minutos: 60, label: '1 hora antes' },
  { minutos: 120, label: '2 horas antes' },
  { minutos: 1440, label: '1 dia antes' },
]

const NOME_REFERENCIA = {
  compromisso: 'do compromisso',
  reserva: 'do horário reservado',
  prazo: 'do prazo',
}

// A referencia temporal DISPONIVEL para um item, na ordem em que faz sentido:
// um horario marcado ganha de um prazo, porque e mais preciso.
export function referenciaDe(item = {}) {
  if (item.inicio && item.data) return { tipo: 'compromisso', data: item.data, hora: item.inicio }
  if (item.reserva) return { tipo: 'reserva', data: item.reserva.data, hora: item.reserva.inicio }
  if (item.prazo) return { tipo: 'prazo', data: item.prazo, hora: '09:00' }
  return null
}

const emMinutos = (hhmm) => {
  const [h, m] = String(hhmm || '00:00').split(':').map(Number)
  return h * 60 + m
}
const paraHora = (total) => {
  const t = ((total % 1440) + 1440) % 1440
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

// Quando o alerta dispara, DADA a referencia de agora. Nada e guardado: se o
// compromisso mudar de hora, este calculo devolve outro instante sozinho.
export function momentoDoAlerta(alerta, referencia) {
  if (!alerta) return null
  if (alerta.em) {
    const [data, hora] = String(alerta.em).split('T')
    return { data, hora, especifico: true }
  }
  if (!referencia) return null
  const total = emMinutos(referencia.hora) - (alerta.minutos || 0)
  // Atravessou a meia-noite para tras: e o dia anterior.
  return {
    data: referencia.data,
    hora: paraHora(total),
    diaAnterior: total < 0,
    especifico: false,
  }
}

// O resumo compacto que fica no formulario. Curto de proposito — tocar abre a
// configuracao inteira.
export function descreverAlerta(alerta, referencia) {
  if (!alerta) return 'sem alerta'
  if (alerta.em) {
    const [data, hora] = String(alerta.em).split('T')
    return `${hora} de ${data.slice(8, 10)}/${data.slice(5, 7)}`
  }
  const base = OPCOES_RELATIVAS.find((o) => o.minutos === alerta.minutos)?.label || `${alerta.minutos} min antes`
  const ref = NOME_REFERENCIA[alerta.referencia || referencia?.tipo]
  return ref ? `${base} ${ref}` : base
}

// Rotulo curtissimo para caber num cartao ("15 min", "na hora", "07:30").
export function alertaCurto(alerta) {
  if (!alerta) return null
  if (alerta.em) return String(alerta.em).split('T')[1]
  if (!alerta.minutos) return 'na hora'
  if (alerta.minutos >= 1440) return `${alerta.minutos / 1440} d`
  if (alerta.minutos >= 60) return `${alerta.minutos / 60} h`
  return `${alerta.minutos} min`
}
