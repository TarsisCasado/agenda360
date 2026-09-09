// ---------------------------------------------------------------------------
// Provider LOCAL de interpretacao (roda 100% offline, sem chave/rede).
//
// Este arquivo e apenas o ADAPTADOR do provider ao contrato do
// providerManager. A interpretacao real vive em `../nlu/localNlu`, que
// consome as camadas deterministicas (temporal/title/normalize).
//
// Por que separado: o dia em que `ai.remote` for ligada, o que muda e SO a
// origem da interpretacao — a resolucao de datas, a politica de slots, a
// validacao e a confirmacao continuam as mesmas, fora do provider.
//
// Contrato devolvido:
//   { intent, confidence, needs_clarification, clarification, data, ambiguities }
// ---------------------------------------------------------------------------
import { interpretLocal } from '../nlu/localNlu'

export function mockInterpret(text, context = {}) {
  return interpretLocal(text, context)
}

export { interpretLocal }
