// ---------------------------------------------------------------------------
// Erros padronizados do Agent Runtime / Tool Registry.
// Todo erro do agente carrega um `code` estavel (para a UI e os testes) e um
// `details` opcional. Nunca vaza stack de servico cru para a camada de IA.
// ---------------------------------------------------------------------------

export const ErrorCodes = {
  UNKNOWN_INTENT: 'unknown_intent', // intent fora da allowlist
  TOOL_DISABLED: 'tool_disabled', // desativada por feature flag
  INVALID_PAYLOAD: 'invalid_payload', // falha de validacao de schema
  CONFIRMATION_REQUIRED: 'confirmation_required', // acao sensivel sem confirmacao
  FORBIDDEN_WORKSPACE: 'forbidden_workspace', // identidade/workspace ausente ou invalido
  NOT_FOUND: 'not_found', // recurso (ex.: tarefa) inexistente no workspace
  EXECUTION_FAILED: 'execution_failed', // falha inesperada no service
}

export class AgentError extends Error {
  constructor(code, message, details = null) {
    super(message || code)
    this.name = 'AgentError'
    this.code = code
    this.details = details
  }
}

export const isAgentError = (e) => e instanceof AgentError
