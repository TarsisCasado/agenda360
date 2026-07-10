// ---------------------------------------------------------------------------
// Feature Flags — configuracao centralizada (sem tabela nesta etapa).
// Todas desativadas por padrao, exceto o que ja existe hoje (o Assistente).
// Permite entregar modulos "dormindo" em producao e ativa-los gradualmente.
// ---------------------------------------------------------------------------

export const FLAGS = {
  ASSISTANT: 'assistant', // tela do Assistente (JA existe hoje) -> ligado
  AI_REMOTE: 'ai.remote', // usar provider real de IA (OpenAI/Anthropic) -> desligado
  VOICE: 'voice', // entrada por audio -> desligado
  PUSH: 'push', // notificacoes push -> desligado
  DAILY_SUMMARY: 'daily_summary', // resumo diario -> desligado
}

const DEFAULTS = {
  [FLAGS.ASSISTANT]: true,
  [FLAGS.AI_REMOTE]: false,
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
