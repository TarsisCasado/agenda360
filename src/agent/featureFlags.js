// ---------------------------------------------------------------------------
// Feature Flags — configuracao centralizada (sem tabela nesta etapa).
// Todas desativadas por padrao, exceto o que ja existe hoje (o Assistente).
// Permite entregar modulos "dormindo" em producao e ativa-los gradualmente.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// AI_REMOTE E LIDA DO AMBIENTE, COM DEFAULT `false` (CP6.4).
//
// Era uma constante: impossivel de ligar sem editar codigo, o que na pratica
// significava que o provider remoto nunca seria exercitado por ninguem.
//
// Agora vem de `VITE_AI_REMOTE`, e SO o literal 'true' liga. Qualquer outra
// coisa — ausente, vazio, '1', 'sim', undefined — e `false`. Um ambiente que
// nao configurou nada continua 100% local, e isso inclui Production.
//
// ISTO NAO E SEGREDO E NAO PODE VIRAR UM. `VITE_*` e compilada no bundle e vai
// para o browser: cabe um booleano, nunca uma chave. A GEMINI_API_KEY continua
// exclusivamente no ambiente do Supabase, onde a Edge Function a le.
//
// A leitura e defensiva porque este modulo tambem roda fora do Vite (testes de
// no, ferramentas): sem `import.meta.env`, o valor e simplesmente `false`.
function envRemoteLigado() {
  try {
    return import.meta.env?.VITE_AI_REMOTE === 'true'
  } catch {
    return false
  }
}

export const FLAGS = {
  ASSISTANT: 'assistant', // tela do Assistente (JA existe hoje) -> ligado
  AI_REMOTE: 'ai.remote', // interpretar via Edge Function `ai-interpret` -> so com VITE_AI_REMOTE=true
  VOICE: 'voice', // entrada por audio -> desligado
  PUSH: 'push', // notificacoes push -> desligado
  DAILY_SUMMARY: 'daily_summary', // resumo diario -> desligado
}

const DEFAULTS = {
  [FLAGS.ASSISTANT]: true,
  [FLAGS.AI_REMOTE]: envRemoteLigado(),
  [FLAGS.VOICE]: false,
  [FLAGS.PUSH]: false,
  [FLAGS.DAILY_SUMMARY]: false,
}

// Fabrica (usada nos testes para sobrescrever flags de forma isolada).
export function createFeatureFlags(overrides = {}) {
  const flags = { ...DEFAULTS, ...overrides }
  return {
    isEnabled: (key) => Boolean(flags[key]),
    all: () => ({ ...flags }),
  }
}

// Instancia padrao da aplicacao.
export const featureFlags = createFeatureFlags()
