// ---------------------------------------------------------------------------
// AS OPCOES DE "AVISAR ANTES".
//
// Morava em `components/tasks/AlertaRows.jsx`. Saiu de la por uma razao de
// ferramenta e nao de desenho: um arquivo que exporta um COMPONENTE e tambem
// uma funcao comum quebra o Fast Refresh do React, e o lint avisava isso desde
// o CP5.9 (`react-refresh/only-export-components`). Com o aviso de pe,
// `npm run lint` saia diferente de zero, e um lint que sempre falha deixa de
// ser um sinal — foi o que o C2.4 veio consertar, antes de ligar a CI.
//
// A REGRA NAO MUDOU, nem o conteudo da lista. A validacao do alerta continua
// em `lib/alertRules.js`; aqui so vivem as opcoes e seus rotulos.
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
