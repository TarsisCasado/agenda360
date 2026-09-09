import { TURN_KIND, KIND } from './interpretation'

// ---------------------------------------------------------------------------
// NORMALIZACAO (CP6.1) — do que o interpretador ENTENDEU para o que o dominio
// CONSOME.
//
// A fronteira mais importante deste checkpoint e esta. `parseInterpretation`
// garante que o output tem a FORMA certa; aqui garante-se que ele faz SENTIDO
// no Agenda 360 — e as duas coisas sao deliberadamente separadas, porque a
// primeira vale para qualquer produto e a segunda so vale para este.
//
// Nada aqui grava. Isto produz o patch que a maquina de estados vai aplicar ao
// rascunho, e o rascunho ainda tera de passar por slots, por alertRules e pela
// confirmacao humana antes de virar linha no banco.
//
// TRES TRADUCOES, e o motivo de cada uma:
//
//   1. `category_hint` -> `category_id`. O modelo ouviu "reunião" e nao tem
//      como saber o id. A resolucao e nossa, contra as categorias REAIS do
//      workspace: se nao casar, o campo simplesmente nao entra — inventar id e
//      pior que nao categorizar;
//
//   2. `kind` some. O CP5.9.1 auditou e provou que nao existe coluna
//      `type`/`kind`: a especie e derivada de `start_time`. Entao `kind` nao
//      vira campo — vira uma EXIGENCIA registrada (`requires`), que a camada
//      de slots usa para saber que um compromisso sem dia esta incompleto;
//
//   3. hora do AVISO -> antecedencia. "reuniao as 9h, me avisa as 8:30" e uma
//      frase que nenhum campo do banco representa: `alert_minutes_before` e um
//      intervalo, nao um relogio. A conta e trivial e deterministica, e e nossa
//      — pedir ao modelo que ja devolva 30 seria pedir que ele faca aritmetica
//      de horario, que e onde modelos erram calados.
// ---------------------------------------------------------------------------

// Um aviso posterior ao inicio nao existe: se a conta der negativa, a frase foi
// entendida errado (ou a pessoa se enganou) e o valor e descartado em vez de
// virar um lembrete absurdo.
export function minutosEntre(horaAviso, horaInicio) {
  const m = (t) => {
    if (typeof t !== 'string') return null
    const [h, min] = t.split(':').map(Number)
    if (!Number.isFinite(h) || !Number.isFinite(min)) return null
    return h * 60 + min
  }
  const a = m(horaAviso)
  const i = m(horaInicio)
  if (a === null || i === null) return null
  const diff = i - a
  return diff >= 0 ? diff : null
}

function resolverCategoria(hint, categorias = []) {
  if (!hint) return null
  const alvo = String(hint).trim().toLowerCase()
  if (!alvo) return null
  const exata = categorias.find((c) => String(c.name || '').toLowerCase() === alvo)
  if (exata) return exata.id
  // Casamento por prefixo cobre "reuni" / "reunião" e acentuacao perdida na
  // transcricao. Ambiguo (dois casam) NAO escolhe: nao categorizar e melhor que
  // categorizar errado.
  const parciais = categorias.filter((c) => {
    const n = String(c.name || '').toLowerCase()
    return n.startsWith(alvo) || alvo.startsWith(n)
  })
  return parciais.length === 1 ? parciais[0].id : null
}

/**
 * normalizeInterpretation(interp, { categories, draft })
 *   -> { patch, requires, notes }
 *
 * `patch`    campos prontos para o rascunho (so o que o dominio consome).
 * `requires` exigencias semanticas que nao sao campos ('dia' para compromisso).
 * `notes`    o que foi traduzido ou descartado, para o QA poder ver.
 */
export function normalizeInterpretation(interp, { categories = [], draft = null } = {}) {
  const patch = {}
  const requires = []
  const notes = []
  const origem = interp?.patch || {}

  for (const [k, v] of Object.entries(origem)) {
    if (k === 'kind' || k === 'category_hint') continue
    patch[k] = v
  }

  // 1) Categoria por nome -> id do workspace.
  if (origem.category_hint) {
    const id = resolverCategoria(origem.category_hint, categories)
    if (id) {
      patch.category_id = id
      notes.push(`categoria "${origem.category_hint}" resolvida`)
    } else {
      notes.push(`categoria "${origem.category_hint}" nao existe neste workspace — ignorada`)
    }
  }

  // 2) Especie declarada: exigencia, nao campo.
  if (origem.kind === KIND.COMPROMISSO) {
    requires.push('dia')
    notes.push('declarado como compromisso: exige dia')
  }

  // 3) Hora do aviso -> antecedencia, quando ha um inicio para ancorar.
  //    O inicio pode vir do proprio turno ou do rascunho vivo: "me avisa as
  //    8:30" so faz sentido contra a reuniao que ja esta na tela.
  if (origem.alert_at_time && !('alert_minutes_before' in origem)) {
    const inicio = origem.start_time ?? draft?.data?.start_time ?? null
    const mins = minutosEntre(origem.alert_at_time, inicio)
    if (mins !== null) {
      patch.alert_minutes_before = mins
      patch.alert_enabled = true
      notes.push(`aviso as ${origem.alert_at_time} = ${mins} min antes de ${inicio}`)
    } else {
      notes.push(`aviso as ${origem.alert_at_time} sem inicio para ancorar — ignorado`)
    }
    delete patch.alert_at_time
  }

  // 4) Pedir antecedencia E ligar o alerta sao a mesma frase ("me avisa meia
  //    hora antes"). Quem diz o intervalo quer o aviso.
  if ('alert_minutes_before' in patch && patch.alert_enabled === undefined) {
    patch.alert_enabled = true
  }

  return { patch, requires, notes }
}

// Um turno so pode ALTERAR o rascunho se disser que fala dele E trouxer algo
// para alterar. Um `revise` de patch vazio nao e revisao: e ruido, e ruido nao
// mexe no que a pessoa esta olhando.
export function isRevisionOf(interp, draft) {
  if (!draft) return false
  if (interp?.turn_kind !== TURN_KIND.REVISE) return false
  if (!interp.refers_to_draft) return false
  // `patch` no contrato cru; `data` depois que a ponte normaliza para a forma
  // que o runtime consome (CP6.4). E a mesma coisa com dois nomes, e aceitar os
  // dois evita que a ponte tenha de reconstruir o objeto so para esta pergunta.
  const campos = interp.patch ?? interp.data
  return Object.keys(campos || {}).length > 0
}
