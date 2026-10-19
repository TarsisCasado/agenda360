// ---------------------------------------------------------------------------
// LIMPEZA DE METADADO DE PNG — pura, sobre bytes, sem DOM e sem rede.
//
// -------------------- POR QUE ISTO EXISTE ----------------------------------
//
// No UX-M2.1 ficou um buraco declarado: uma foto JPEG ou HEIC e redesenhada
// num canvas, e o redesenho descarta o EXIF junto com o GPS. PNG nao passa por
// ali — reencodar PNG para JPEG costuma AUMENTAR o arquivo (captura de tela
// tem area chapada) e perde a transparencia. Entao o PNG era preservado
// intacto... com o que viesse dentro dele.
//
// E PNG carrega metadado. O chunk `eXIf` guarda exatamente a mesma estrutura
// do JPEG, GPS incluso. `tEXt`, `iTXt` e `zTXt` sao texto livre, onde editores
// escrevem desde o nome do software ate comentarios da pessoa. `tIME` e a hora
// da ultima modificacao.
//
// -------------------- POR QUE CIRURGIA, E NAO REENCODE ---------------------
//
// PNG e uma sequencia de blocos autocontidos: [tamanho][tipo][dados][CRC].
// Jogar fora um bloco inteiro nao afeta nenhum outro — o CRC de cada um cobre
// so a si mesmo. Entao da para REMOVER o metadado sem tocar num unico pixel:
// o resultado e bit a bit identico no que importa, continua sendo PNG, continua
// com transparencia e continua sem perda. Reencodar seria trocar qualidade por
// privacidade sem necessidade nenhuma.
//
// -------------------- DENYLIST AQUI, E NAO ALLOWLIST -----------------------
//
// Em tipo de ARQUIVO a regra do produto e allowlist, porque o conjunto do que
// e perigoso e aberto. Aqui e o contrário: o conjunto do que carrega metadado
// sensivel e pequeno, fechado e nomeado pela especificacao. Uma allowlist de
// chunks descartaria `gAMA`, `cHRM`, `sRGB`, `iCCP` e `pHYs` — que nao sao
// metadado, sao COR e ESCALA. Jogar fora o perfil de cor de uma foto muda como
// ela aparece, que e dano visivel para resolver um risco que esses blocos nao
// tem.
// ---------------------------------------------------------------------------

export const ASSINATURA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

// Os blocos que saem. Nomes conforme a especificacao PNG (sao sensiveis a
// maiuscula: o 5o bit de cada letra carrega significado no formato).
export const CHUNKS_DE_METADADO = ['eXIf', 'tEXt', 'iTXt', 'zTXt', 'tIME']

export const MOTIVO_PNG = {
  NAO_E_PNG: 'nao_e_png',
  TRUNCADO: 'truncado',
  SEM_IHDR: 'sem_ihdr',
  SEM_IEND: 'sem_iend',
}

const MENSAGEM = {
  [MOTIVO_PNG.NAO_E_PNG]: 'Este arquivo não é um PNG válido.',
  [MOTIVO_PNG.TRUNCADO]: 'Este PNG está incompleto ou corrompido.',
  [MOTIVO_PNG.SEM_IHDR]: 'Este PNG está malformado (cabeçalho ausente).',
  [MOTIVO_PNG.SEM_IEND]: 'Este PNG está incompleto (marca de fim ausente).',
}

const ehAssinaturaPng = (b) =>
  b && b.length >= 8 && ASSINATURA_PNG.every((v, i) => b[i] === v)

const tipoEm = (bytes, pos) =>
  String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3])

const falha = (motivo) => ({ ok: false, motivo, mensagem: MENSAGEM[motivo] })

/**
 * Percorre os blocos de um PNG. Puro e tolerante a nada: qualquer
 * inconsistencia de tamanho vira recusa, em vez de leitura fora dos limites.
 */
export function lerChunks(bytes) {
  if (!ehAssinaturaPng(bytes)) return falha(MOTIVO_PNG.NAO_E_PNG)

  const chunks = []
  let pos = 8
  while (pos < bytes.length) {
    // [4 tamanho][4 tipo][dados][4 CRC] — 12 bytes de moldura por bloco.
    if (pos + 8 > bytes.length) return falha(MOTIVO_PNG.TRUNCADO)
    const tamanho =
      (bytes[pos] << 24 >>> 0) + (bytes[pos + 1] << 16) + (bytes[pos + 2] << 8) + bytes[pos + 3]
    const tipo = tipoEm(bytes, pos + 4)
    const fim = pos + 12 + tamanho
    // `fim` menor que o inicio denuncia tamanho absurdo (estouro de 32 bits).
    if (!Number.isSafeInteger(fim) || fim > bytes.length || fim < pos) {
      return falha(MOTIVO_PNG.TRUNCADO)
    }
    chunks.push({ tipo, inicio: pos, fim, tamanho })
    pos = fim
    if (tipo === 'IEND') break
  }

  if (!chunks.length || chunks[0].tipo !== 'IHDR') return falha(MOTIVO_PNG.SEM_IHDR)
  if (!chunks.some((c) => c.tipo === 'IEND')) return falha(MOTIVO_PNG.SEM_IEND)
  return { ok: true, chunks }
}

/**
 * Devolve o PNG sem os blocos de metadado.
 *
 * Sucesso: { ok: true, bytes, removidos: [...], mudou: boolean }
 * Recusa:  { ok: false, motivo, mensagem }  — e o chamador NAO envia o arquivo.
 *
 * Os blocos preservados sao copiados BYTE A BYTE, com o CRC original. Nenhum
 * pixel e recalculado, entao nao ha como esta funcao degradar a imagem.
 */
export function limparPng(bytes) {
  const leitura = lerChunks(bytes)
  if (!leitura.ok) return leitura

  const manter = []
  const removidos = []
  for (const c of leitura.chunks) {
    if (CHUNKS_DE_METADADO.includes(c.tipo)) removidos.push(c.tipo)
    else manter.push(c)
  }

  if (!removidos.length) {
    // Nada a fazer: devolve o original, sem copiar nada a toa.
    return { ok: true, bytes, removidos: [], mudou: false }
  }

  const total = 8 + manter.reduce((n, c) => n + (c.fim - c.inicio), 0)
  const saida = new Uint8Array(total)
  saida.set(bytes.subarray(0, 8), 0)
  let destino = 8
  for (const c of manter) {
    saida.set(bytes.subarray(c.inicio, c.fim), destino)
    destino += c.fim - c.inicio
  }
  return { ok: true, bytes: saida, removidos, mudou: true }
}

/**
 * A ponta impura, e mínima: le o Blob, limpa e devolve um Blob novo.
 * `null` quando o PNG nao e integro — o chamador transforma isso em recusa.
 */
export async function limparBlobPng(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const r = limparPng(bytes)
  if (!r.ok) return r
  if (!r.mudou) return { ok: true, blob, removidos: [], mudou: false }
  return {
    ok: true,
    blob: new Blob([r.bytes], { type: 'image/png' }),
    removidos: r.removidos,
    mudou: true,
  }
}
