// ---------------------------------------------------------------------------
// CONTRATO CANONICO DE INTERPRETACAO — v1 (CP6.1), COMPARTILHADO (CP6.2).
//
// ONDE ESTE ARQUIVO MORA, E POR QUE.
//
// Duas definicoes do mesmo contrato — uma no front, outra na Edge Function —
// divergem. Nao "podem divergir": divergem, e em silencio, no dia em que
// alguem acrescentar um campo de um lado so. Entao ha UMA definicao, e ela mora
// aqui, no unico lugar que os dois ambientes alcancam.
//
// O obstaculo era um so: este arquivo importava `PRIORITY`/`STATUS` de
// `src/lib/constants` sem extensao, e Deno exige extensao explicita. Duas
// saidas: reescrever o especificador, ou tirar o import. Tirar e melhor —
// um contrato sem dependencia nenhuma e importavel por qualquer runtime, hoje
// e daqui a tres anos, sem negociar com bundler.
//
// O preco e que os valores de prioridade e status aparecem aqui como listas
// literais. Isso seria duplicacao invisivel, entao NAO fica por conta de
// ninguem lembrar: `contract.compat.test.js` compara estas listas com
// `lib/constants` e fica vermelho quando o dominio muda e o contrato nao. A
// duplicacao existe, e declarada, e vigiada.
//
// `src/agent/contracts/interpretation.js` continua existindo como reexport, e
// nenhum import do front precisou mudar.
// ---------------------------------------------------------------------------
// CONTRATO CANONICO DE INTERPRETACAO (CP6.1) — v1.
//
// Este e o unico formato que a maquina de estados do Copiloto aceita, venha a
// interpretacao de onde vier: do NLU local de hoje, de um LLM amanha, de uma
// transcricao de audio depois. Um provider novo escreve um adaptador que
// devolve ISTO; nada mais no produto precisa saber quem interpretou.
//
// TRES SEPARACOES QUE O CONTRATO EXISTE PARA MANTER:
//
//   1. COMPREENDER != DECIDIR. O interpretador diz o que entendeu; quem decide
//      se aquilo e valido e o dominio. O modelo pode devolver
//      `alert_minutes_before: 30` numa frase sem horario nenhum — e correto que
//      devolva, porque a pessoa disse isso. Cabe ao Agenda 360 (alertRules,
//      CP5.8.1) recusar o aviso sem instante, nao ao interpretador;
//
//   2. SEMANTICA != PERSISTENCIA. `kind: 'compromisso'` NAO e uma coluna. O
//      CP5.9.1 auditou e provou: nao existe `type`/`kind` em `tasks`, a
//      distincao e derivada de `start_time`. Aqui `kind` viaja como INTENCAO
//      declarada — util para o dominio saber que a pessoa quis um compromisso —
//      e nunca chega ao banco;
//
//   3. OUTPUT DE PROVIDER E DADO HOSTIL. Tudo que entra por `parseInterpretation`
//      e tratado como texto de origem desconhecida: intent fora da allowlist
//      vira `unknown`, campo desconhecido e DESCARTADO (nao rejeita o turno
//      inteiro — um modelo que inventa um campo a mais nao pode derrubar uma
//      captura boa), e valor com tipo errado some sem contaminar o patch.
//
// VERSIONADO de proposito: quando o formato mudar, `version` muda junto e um
// adaptador antigo continua identificavel em vez de falhar em silencio.
// ---------------------------------------------------------------------------

export const CONTRACT_VERSION = 1

// O que este turno FAZ. E a pergunta que o `turnClassifier` responde hoje por
// heuristica (delta/residuo/ato de fala) e que um modelo responde direto.
export const TURN_KIND = {
  CREATE: 'create',
  REVISE: 'revise',
  CONFIRM: 'confirm',
  CANCEL: 'cancel',
  QUERY: 'query',
  UNKNOWN: 'unknown',
}
const TURN_KINDS = new Set(Object.values(TURN_KIND))

// Allowlist ESTRITA. E a mesma lista da Edge Function `ai-interpret`; qualquer
// coisa fora dela nao e "quase certa", e `unknown`.
export const ALLOWED_INTENTS = new Set([
  'create_task', 'update_task', 'reschedule_task', 'complete_task', 'mark_missed',
  'cancel_task', 'delete_task', 'search_tasks', 'create_link', 'list_schedule',
])

// A especie que a pessoa DECLAROU querer. Semantica, nunca persistida.
export const KIND = { TAREFA: 'tarefa', COMPROMISSO: 'compromisso' }
const KINDS = new Set(Object.values(KIND))

// Espelham lib/constants (PRIORITY / STATUS). Vigiados por contract.compat.test.js
// — se o dominio ganhar um valor e este arquivo nao, o teste quebra.
export const PRIORITIES = ['low', 'medium', 'high', 'urgent']
export const STATUSES = [
  'todo', 'in_progress', 'done', 'missed',
  'delegated', 'not_needed', 'rescheduled', 'cancelled',
]

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

// ---------------------------------------------------------------------------
// CAMPOS DO PATCH — e SO estes.
//
// Cada um existe porque o dominio sabe consumi-lo. Nao ha campo aqui esperando
// que alguem um dia o implemente: um contrato que promete mais do que o produto
// entrega e uma forma de mentir para o modelo, e ele acredita.
//
// `null` e um VALOR, nao ausencia: "tira a data" e `date: null`, e precisa
// chegar ao dominio como apagamento. Por isso `nullable`.
// ---------------------------------------------------------------------------
const PATCH_FIELDS = {
  title: { type: 'string', max: 300 },
  description: { type: 'string', max: 2000 },
  date: { type: 'date', nullable: true },
  start_time: { type: 'time', nullable: true },
  end_time: { type: 'time', nullable: true },
  // Semantico: nunca vai ao banco (ver separacao 2 no topo).
  kind: { type: 'enum', values: KINDS },
  alert_enabled: { type: 'boolean' },
  // Minutos ANTES do inicio. O dominio decide se ha instante suficiente para
  // virar lembrete de verdade (CP5.8.1); aqui so se garante que e um numero
  // possivel. Teto de uma semana: "me avisa com um ano de antecedencia" e mais
  // provavel ser erro do modelo que pedido real.
  alert_minutes_before: { type: 'int', min: 0, max: 10080 },
  // O RELOGIO do aviso, quando a pessoa fala assim: "reuniao as 9h, me avisa as
  // 8:30". Nenhuma coluna guarda isto — `alert_minutes_before` e um intervalo.
  // Viaja no contrato porque e o que foi dito, e a normalizacao converte para
  // antecedencia ancorando no inicio. Nunca chega ao dominio com este nome.
  alert_at_time: { type: 'time' },
  // O modelo NAO conhece ids de categoria. Ele devolve o nome que ouviu; a
  // resolucao para `category_id` e deterministica e acontece na normalizacao,
  // contra as categorias reais do workspace.
  category_hint: { type: 'string', max: 120 },
  priority: { type: 'enum', values: new Set(PRIORITIES) },
  status: { type: 'enum', values: new Set(STATUSES) },
  link: { type: 'string', max: 2000 },
  notes: { type: 'string', max: 2000 },
  // Alvos de intencoes que agem sobre algo que ja existe.
  task_id: { type: 'string', max: 64 },
  query: { type: 'string', max: 300 },
  url: { type: 'string', max: 2000 },
}

export const PATCH_FIELD_NAMES = Object.freeze(Object.keys(PATCH_FIELDS))

// Os campos que o dominio aceita APAGAR — derivados de `nullable` acima, nunca
// escritos a mao. O protocolo do provider (CP6.3.7) publica esta lista como o
// enum de `clear`; se um campo ganhar ou perder `nullable`, os dois lados se
// movem juntos e um teste de paridade guarda o resto.
export const CLEARABLE_FIELD_NAMES = Object.freeze(
  Object.entries(PATCH_FIELDS).filter(([, spec]) => spec.nullable).map(([nome]) => nome),
)

function coerceField(spec, value) {
  if (value === null) return spec.nullable ? { ok: true, value: null } : { ok: false }
  switch (spec.type) {
    case 'string': {
      if (typeof value !== 'string') return { ok: false }
      const v = value.trim()
      if (!v) return { ok: false }
      return { ok: true, value: v.slice(0, spec.max) }
    }
    case 'date':
      return typeof value === 'string' && DATE_RE.test(value) ? { ok: true, value } : { ok: false }
    case 'time':
      return typeof value === 'string' && TIME_RE.test(value) ? { ok: true, value } : { ok: false }
    case 'boolean':
      return typeof value === 'boolean' ? { ok: true, value } : { ok: false }
    case 'int': {
      if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) return { ok: false }
      if (value < spec.min || value > spec.max) return { ok: false }
      return { ok: true, value }
    }
    case 'enum':
      return typeof value === 'string' && spec.values.has(value) ? { ok: true, value } : { ok: false }
    default:
      return { ok: false }
  }
}

// ---------------------------------------------------------------------------
// parseInterpretation — a fronteira. Nada entra na maquina de estados sem
// passar por aqui.
//
// Devolve SEMPRE um objeto valido: um provider quebrado produz um turno
// `unknown`, nunca uma excecao que derruba a conversa. A captura ja esta salva
// no cofre (CP5.6) antes de qualquer interpretacao; perder o turno nao pode
// significar perder o texto.
//
// `rejected` lista o que foi descartado e por que — e o que permite testar que
// um campo hostil foi mesmo recusado, em vez de ter passado despercebido.
// ---------------------------------------------------------------------------
// -------------------- MODO `wire` (CP6.3.7) --------------------------------
//
// O esquema enviado ao provider passou a exigir TODOS os campos do patch, cada
// um aceitando `null`. Isso resolve o defeito real medido no QA — um patch
// `{ title, url }` satisfazia o esquema antigo, entao omitir `start_time` e
// `alert_minutes_before` era resposta VALIDA — mas cria uma colisao: se todo
// campo e obrigatorio, "ausente" deixa de existir, e `null` passaria a
// significar duas coisas.
//
// Entao o fio tem uma regra so, e ela e diferente da do contrato:
//
//   FIO (provider)                        CONTRATO (dominio)
//   null                       ------>    campo ausente   (nao alterar)
//   valor                      ------>    valor           (definir)
//   nome em `clear`            ------>    null            (APAGAR)
//
// `clear` e detalhe de protocolo: e traduzido aqui e NUNCA sobrevive ao
// contrato. Quem consome continua vendo os mesmos tres estados de sempre.
//
// `wire` e opt-in de proposito. O adaptador local nao fala este protocolo, e
// para ele `null` continua significando apagamento — mudar isso seria alterar
// a semantica do dominio para consertar um problema que e do provider.
// ---------------------------------------------------------------------------
export function parseInterpretation(raw, { provider = 'unknown', wire = false } = {}) {
  const rejected = []
  const base = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  if (base !== raw) rejected.push({ field: '(raiz)', reason: 'nao e um objeto' })

  let turn_kind = TURN_KINDS.has(base.turn_kind) ? base.turn_kind : null
  if (base.turn_kind !== undefined && !turn_kind) {
    rejected.push({ field: 'turn_kind', reason: 'fora do contrato' })
  }

  let intent = null
  if (typeof base.intent === 'string' && base.intent !== 'unknown') {
    if (ALLOWED_INTENTS.has(base.intent)) intent = base.intent
    else rejected.push({ field: 'intent', reason: 'fora da allowlist' })
  }

  // Sem turn_kind explicito, deduz do intent: um adaptador simples (o local de
  // hoje) nao precisa aprender vocabulario novo para continuar funcionando.
  if (!turn_kind) turn_kind = intent ? TURN_KIND.CREATE : TURN_KIND.UNKNOWN

  let confidence = 0
  if (typeof base.confidence === 'number' && Number.isFinite(base.confidence)) {
    confidence = Math.max(0, Math.min(1, base.confidence))
  } else if (base.confidence !== undefined) {
    rejected.push({ field: 'confidence', reason: 'nao e numero' })
  }

  const patch = {}
  const rawPatch = base.patch && typeof base.patch === 'object' && !Array.isArray(base.patch) ? base.patch : {}
  if (base.patch !== undefined && base.patch !== rawPatch) {
    rejected.push({ field: 'patch', reason: 'nao e um objeto' })
  }
  // No fio, `clear` viaja DENTRO do patch e e a unica chave que nao e campo.
  const clear = wire && Array.isArray(rawPatch.clear) ? rawPatch.clear : null
  if (wire && rawPatch.clear !== undefined && !clear) {
    rejected.push({ field: 'patch.clear', reason: 'nao e uma lista' })
  }

  for (const [key, value] of Object.entries(rawPatch)) {
    if (wire && key === 'clear') continue
    // No fio, `null` e "a frase nao falou disso" — nao e apagamento, e nao e
    // erro. Sai calado, como sairia um campo ausente.
    if (wire && value === null) continue
    const spec = PATCH_FIELDS[key]
    if (!spec) {
      // Campo desconhecido nao derruba o turno: some, e fica registrado.
      rejected.push({ field: `patch.${key}`, reason: 'campo fora do contrato' })
      continue
    }
    const r = coerceField(spec, value)
    if (!r.ok) {
      rejected.push({ field: `patch.${key}`, reason: 'valor invalido' })
      continue
    }
    patch[key] = r.value
  }

  // O apagamento chega por `clear`, depois dos valores: se o modelo mandar
  // valor E apagamento para o mesmo campo, apagar e a instrucao mais explicita
  // das duas — foi escrita numa lista que so serve para isso.
  if (clear) {
    for (const nome of clear) {
      if (typeof nome !== 'string' || !CLEARABLE_FIELD_NAMES.includes(nome)) {
        rejected.push({ field: 'patch.clear', reason: 'campo nao anulavel' })
        continue
      }
      patch[nome] = null
    }
  }

  const ambiguities = Array.isArray(base.ambiguities)
    ? base.ambiguities.filter((a) => typeof a === 'string').slice(0, 8)
    : []

  const clarification =
    typeof base.clarification === 'string' && base.clarification.trim()
      ? base.clarification.trim().slice(0, 500)
      : null

  return {
    version: CONTRACT_VERSION,
    provider: typeof provider === 'string' ? provider : 'unknown',
    turn_kind,
    // Um turno so fala do rascunho se DISSER que fala. Na duvida, nao fala —
    // e o lado seguro: tratar frase nova como revisao contaminaria a atividade
    // que a pessoa esta olhando.
    refers_to_draft: base.refers_to_draft === true,
    intent,
    confidence,
    patch,
    needs_clarification: Boolean(base.needs_clarification) || turn_kind === TURN_KIND.UNKNOWN,
    clarification,
    ambiguities,
    rejected,
  }
}

// Um turno que nao produz nada — o que sobra quando o provider falha por
// completo. Existe para que a falha tenha uma FORMA, em vez de um `null` que
// cada chamador trata do seu jeito.
export function emptyInterpretation({ provider = 'unknown', clarification = null } = {}) {
  return parseInterpretation({ turn_kind: TURN_KIND.UNKNOWN, clarification }, { provider })
}
