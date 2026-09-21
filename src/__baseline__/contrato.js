// ---------------------------------------------------------------------------
// BASELINE DE CARACTERIZACAO (UX1.4 / C3) — como rotular cada teste.
//
// ESTA CAMADA NAO APROVA NADA. Ela e uma FOTOGRAFIA do produto no commit
// imediatamente anterior a migracao 2.0. Um teste daqui verde significa "o
// produto continua fazendo o que fazia", nunca "o produto esta certo".
//
// Por que a distincao importa: parte do comportamento fotografado aqui esta
// ERRADO segundo o contrato UX1.3.1 e vai mudar de proposito. Sem rotulo, o
// proximo checkpoint olharia um teste vermelho e nao saberia se quebrou algo
// ou se cumpriu o combinado. Com rotulo, a resposta esta no nome do teste.
//
// TRES ROTULOS, e so tres:
//
//   [BASELINE]      comportamento atual que deve ser PRESERVADO. Vermelho aqui
//                   e regressao, sempre.
//
//   [INVARIANTE-NN] invariante do UX1.3.1 que JA e verdade hoje. Vermelho aqui
//                   e regressao E quebra de contrato — dois motivos para parar.
//
//   [MUDA:Cn]       comportamento atual que o checkpoint Cn vai mudar de
//                   proposito. Vermelho aqui NAO e necessariamente defeito:
//                   se o checkpoint Cn ja rodou, era esperado, e o teste deve
//                   ser reescrito no mesmo commit que fez a mudanca.
//
// COMO USAR DEPOIS: antes de um checkpoint, para saber o que ele vai derrubar,
//   grep -rn "MUDA:C5" src/__baseline__
// O que aparecer ali e a lista completa do que muda naquele checkpoint.
// ---------------------------------------------------------------------------

// Comportamento atual que deve sobreviver a migracao inteira.
export function baseline(nome) {
  return `[BASELINE] ${nome}`
}

// Invariante do contrato UX1.3.1 que o produto JA cumpre. `inv` e o numero
// ("INV-03"), para o teste apontar de volta ao documento.
export function invariante(inv, nome) {
  return `[${inv}] ${nome}`
}

// Comportamento atual que vai mudar. `checkpoint` e o codigo do plano ("C5").
// O terceiro argumento diz, em uma linha, O QUE vai passar a valer — sem isso
// o rotulo avisa que algo muda e nao diz para o que.
export function mudaEm(checkpoint, nome, passaraAValer) {
  return `[MUDA:${checkpoint}] ${nome} — depois: ${passaraAValer}`
}
