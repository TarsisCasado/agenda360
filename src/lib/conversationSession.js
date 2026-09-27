// ---------------------------------------------------------------------------
// QUAL CONVERSA ESTA ABERTA — o ponteiro que faltava.
//
// A regressao do CP5.7.1 nao era perda de dados. As mensagens estavam em
// `ai_messages` e o rascunho vivo em `ai_conversations.context.pending` — nos
// dois modos, demo e Supabase. O que se perdia no F5 era o ENDERECO: o id da
// conversa vivia so num `useRef` do Copiloto, e um refresh zera a memoria do
// React. Sem o id, a tela nao tinha como pedir de volta o que ja estava salvo,
// e o turno seguinte abria uma conversa nova — quebrando tambem o multi-turno.
//
// Entao este modulo guarda UMA coisa: o id da conversa aberta, por workspace.
// Nao guarda mensagem, nao guarda rascunho, nao guarda proposta. Isso continua
// no seu lugar; aqui fica so o ponteiro. Ele e local de proposito: e a resposta
// a "que conversa esta aberta NESTE aparelho", que e uma pergunta do aparelho,
// nao do banco.
//
// Nao confundir com lib/captureVault.js: o cofre protege o TEXTO de uma captura
// que ainda nao virou nada. Este aqui aponta para uma conversa que ja existe.
// Duas coisas diferentes, dois modulos.
// ---------------------------------------------------------------------------

const CHAVE = 'agenda360.copiloto.conversa'

// Uma conversa esquecida ha dias nao e continuidade, e susto: abrir o Copiloto
// e reencontrar um rascunho de terca sem contexto nenhum e pior que abrir
// limpo. Depois disso, comeca do zero (o historico continua no banco).
export const VALIDADE_HORAS = 24

export function guardarConversa(conversationId, { workspaceId = null } = {}) {
  if (!conversationId) return null
  const registro = { id: conversationId, workspaceId, at: new Date().toISOString() }
  try {
    localStorage.setItem(CHAVE, JSON.stringify(registro))
  } catch {
    // Sem armazenamento a conversa segue viva na tela; so nao sobrevive ao F5.
    return null
  }
  return registro
}

export function esquecerConversa() {
  try {
    localStorage.removeItem(CHAVE)
  } catch {
    /* nada a fazer */
  }
}

// O id da conversa aberta, ou null. Devolve null tambem quando e de outro
// workspace — retomar em "Casa" a conversa de "Trabalho" seria pior que abrir
// vazio.
export function conversaAberta({ workspaceId = null, agora = new Date() } = {}) {
  let registro
  try {
    const raw = localStorage.getItem(CHAVE)
    if (!raw) return null
    registro = JSON.parse(raw)
  } catch {
    return null
  }
  if (!registro?.id) return null
  if (registro.workspaceId && workspaceId && registro.workspaceId !== workspaceId) return null
  const idade = (agora.getTime() - new Date(registro.at || 0).getTime()) / 36e5
  if (!Number.isFinite(idade) || idade > VALIDADE_HORAS) {
    esquecerConversa()
    return null
  }
  return registro.id
}
