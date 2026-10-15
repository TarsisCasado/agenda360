// ---------------------------------------------------------------------------
// PLURAL PT-BR.
//
// Concatenar sufixo no template ("anotação" + "ões") produz palavra quebrada
// ("anotaçãoões"). Aqui a regra e simples e explicita: quem chama informa as
// DUAS formas da palavra, e o helper escolhe uma. Nenhuma string e montada por
// pedacos.
//
// Convencao de contagem em pt-BR: 0 e plural ("0 anotações"), 1 e singular.
// ---------------------------------------------------------------------------
export function plural(count, one, many) {
  return Math.abs(Number(count) || 0) === 1 ? one : many
}

// "3 anotações" / "1 anotação" / "0 anotações".
export function pluralize(count, one, many) {
  const n = Number(count) || 0
  return `${n} ${plural(n, one, many)}`
}
