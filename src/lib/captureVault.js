// ---------------------------------------------------------------------------
// COFRE DA CAPTURA — a regra mais importante da superficie: NUNCA PERDER UMA
// CAPTURA.
//
// O que o usuario digitou existe ANTES de o sistema entender. Se a
// interpretacao falhar, o provider cair, a conexao morrer, a intencao nao
// estiver clara — ou se a folha simplesmente fechar no meio — o texto nao pode
// evaporar. Interpretacao e um servico; a captura e um fato.
//
// Por isso o texto vai para o armazenamento LOCAL no instante em que a
// interpretacao comeca, e sai de la somente quando a captura virou artefato
// (confirmada, ou guardada na Caixa) ou quando o proprio usuario descartou.
//
// Local e de proposito: nao depende de rede, nao depende de provider, nao
// depende de Supabase. Sobrevive a um refresh e ao fechamento da aba.
//
// UM slot, nao uma fila: a captura pendente e a ultima que ficou sem destino.
// Uma fila pediria uma tela para administra-la, e administrar capturas
// perdidas nao e o produto — recupera-las e.
// ---------------------------------------------------------------------------

const CHAVE = 'agenda360.captura.pendente'

// Uma captura de tres semanas atras nao e recuperacao, e assombro: ela volta
// sem contexto e o usuario nao reconhece mais o que quis dizer.
export const VALIDADE_HORAS = 72

export function guardarCaptura(texto, { workspaceId = null } = {}) {
  const t = String(texto ?? '').trim()
  if (!t) return null
  const registro = { texto: t, workspaceId, at: new Date().toISOString() }
  try {
    localStorage.setItem(CHAVE, JSON.stringify(registro))
  } catch {
    // Sem armazenamento (modo privado cheio, quota) a captura ainda vive no
    // campo e na conversa. Falhar aqui em silencio e melhor que derrubar a
    // folha no meio de uma captura.
    return null
  }
  return registro
}

export function limparCaptura() {
  try {
    localStorage.removeItem(CHAVE)
  } catch {
    /* nada a fazer: nao ha o que limpar se nao ha armazenamento */
  }
}

// A captura pendente, se houver uma que valha oferecer. Devolve null tambem
// quando ela e de outro workspace: trazer para o workspace "Casa" o que foi
// escrito em "Trabalho" seria pior que perder.
export function capturaPendente({ workspaceId = null, agora = new Date() } = {}) {
  let registro
  try {
    const raw = localStorage.getItem(CHAVE)
    if (!raw) return null
    registro = JSON.parse(raw)
  } catch {
    return null
  }
  if (!registro?.texto) return null
  if (registro.workspaceId && workspaceId && registro.workspaceId !== workspaceId) return null
  const idade = (agora.getTime() - new Date(registro.at || 0).getTime()) / 36e5
  if (!Number.isFinite(idade) || idade > VALIDADE_HORAS) {
    limparCaptura()
    return null
  }
  return registro
}
