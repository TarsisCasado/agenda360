import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { localStore, ehErroDeCota, CotaExcedidaError } from './localStore'
import { uid } from '../lib/utils'
import {
  MAX_BYTES, MIMES_ACEITOS, MIMES_NO_BUCKET, ACCEPT,
  validarArquivo, kindDe, extensaoDe, normalizarMime, podeSubir,
} from '../lib/anexoPolitica'

// ---------------------------------------------------------------------------
// captureAssetService — PORT de armazenamento de ASSETS do dominio Capture.
//
// Papel (Sprint 1 / Etapa 1): guardar/consultar/remover o BINARIO de um asset
// de captura (foto agora; PDF/audio/arquivo depois). NAO persiste metadados no
// banco (a tabela inbox_attachments e a orquestracao chegam nas Etapas 2/3);
// NAO conhece tasks nem interpreta conteudo (sem OCR/IA/processamento).
//
// Ports & Adapters (ARCHITECTURE.md ADR-10): duas implementacoes atras da mesma
// API — Supabase Storage (producao) e localStore/data-URL (modo demo) — para
// manter paridade demo/Supabase.
//
// Modelagem GENERICA desde ja (decisao do produto): `kind` cobre image | pdf |
// audio | file, ainda que a Sprint 1 use apenas `image`.
// ---------------------------------------------------------------------------

// Bucket privado unico para todos os assets de captura.
export const CAPTURE_BUCKET = 'captures'

// Tipos de asset reconhecidos pelo dominio (generico p/ midias futuras).
export const CAPTURE_ASSET_KINDS = ['image', 'pdf', 'audio', 'file']

// Teto de tamanho por asset, agora definido em UM lugar so (anexoPolitica).
// O nome antigo continua exportado porque e contrato publico deste modulo.
export const MAX_ASSET_BYTES = MAX_BYTES

// Reexportados para quem monta o seletor de arquivo (UX-M2.4) nao precisar
// conhecer a politica por dentro.
export { MIMES_ACEITOS, MIMES_NO_BUCKET, ACCEPT }

// Tabela local (modo demo) que guarda o binario como data-URL, indexado por path.
const DEMO_BLOB_TABLE = 'capture_asset_blobs'

// Classifica o mime no `kind` do dominio. Puro. Delegado a allowlist: antes
// isto era um prefixo (`image/*` -> image), o que classificava alegremente um
// `image/svg+xml` como imagem.
export function kindForMime(mime = '') {
  return kindDe(mime)
}

function extForMime(mime = '') {
  return extensaoDe(mime)
}

// ---------------------------------------------------------------------------
// A PORTA DE ENTRADA.
//
// Antes daqui so se exigia "tem mime" e "cabe em 10 MB" — qualquer tipo
// passava. Agora a decisao inteira mora em `validarArquivo`, que e pura e
// testada a parte; este servico so a aplica e traduz em excecao.
//
// O MODO IMPORTA: no demo o binario vira data-URL dentro do localStorage, cuja
// cota e do site inteiro. Por isso o teto de la e menor, e a recusa acontece
// ANTES de ler o arquivo — em vez de descobrir no meio do envio.
// ---------------------------------------------------------------------------
function assertValidFile(file, { bytes = null } = {}) {
  if (!file || typeof file.arrayBuffer !== 'function') {
    throw new Error('Arquivo invalido (esperado Blob/File).')
  }
  const veredito = validarArquivo(
    { type: file.type, size: file.size },
    { demo: !isSupabaseConfigured, bytes },
  )
  if (!veredito.ok) {
    const err = new Error(veredito.mensagem)
    err.motivo = veredito.motivo
    throw err
  }
  return veredito
}

// Os primeiros bytes, para a conferencia de assinatura. Devolve null quando o
// objeto nao sabe fatiar (fixtures de teste, streams): sem bytes a politica
// simplesmente nao aplica essa camada, em vez de recusar por falta de prova.
async function primeirosBytes(file, n = 16) {
  if (!file || typeof file.slice !== 'function') return null
  try {
    return new Uint8Array(await file.slice(0, n).arrayBuffer())
  } catch {
    return null
  }
}

// ArrayBuffer -> base64 portavel (browser e node). Chunk evita estourar a pilha.
function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf)
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

export const captureAssetService = {
  CAPTURE_BUCKET,
  kindForMime,

  // Envia o binario. Retorna um DESCRITOR (snake_case = colunas futuras de
  // inbox_attachments) SEM tocar no banco: { kind, storage_bucket,
  // storage_path, mime, bytes }. A persistencia do metadado fica para a Etapa 3.
  async upload(workspaceId, { inboxItemId, file } = {}) {
    if (!workspaceId) throw new Error('workspaceId obrigatorio.')
    if (!inboxItemId) throw new Error('inboxItemId obrigatorio.')

    // DUAS PASSADAS, de proposito. A primeira e so sobre tipo e tamanho e nao
    // le byte nenhum: um arquivo de 40 MB tem de ser recusado sem ser aberto.
    // A segunda confere a assinatura — e so acontece depois que o arquivo ja
    // provou ser de um tipo aceito e de tamanho aceitavel.
    assertValidFile(file)
    assertValidFile(file, { bytes: await primeirosBytes(file) })

    const mime = normalizarMime(file.type)

    // ----------------------------------------------------------------------
    // O QUE O BUCKET NAO ACEITA NAO SAI DAQUI.
    //
    // `captures` foi configurado no UX-M2.2 com 23 tipos, e HEIC/HEIF nao
    // estao entre eles: a foto do iPhone so e guardada depois de convertida em
    // JPEG, porque o original carrega EXIF com GPS. O servidor ja recusaria —
    // recusar aqui troca um 400 cru por uma frase que diz o que fazer.
    // ----------------------------------------------------------------------
    if (!podeSubir(mime)) {
      const err = new Error(
        'Esta foto está no formato original do iPhone (HEIC) e precisa ser convertida antes de ser anexada.',
      )
      err.motivo = 'formato_nao_permitido_no_bucket'
      throw err
    }

    // ----------------------------------------------------------------------
    // O MIME QUE CHEGA AO STORAGE E O DO BLOB, NAO O DA OPCAO.
    //
    // Verificado no `@supabase/storage-js` 2.110.1: quando o corpo e um Blob,
    // ele vai dentro de um FormData e a opcao `contentType` NAO e aplicada —
    // o cabecalho da parte vem do `type` do proprio Blob. Entao um arquivo com
    // `text/plain;charset=utf-8` chegaria com o charset colado, e o
    // `allowed_mime_types` do bucket poderia recusa-lo.
    //
    // Reembrulhar com o mime ja normalizado faz o que o servidor ve ser
    // exatamente a string da allowlist, sem depender de o Storage ser leniente
    // ao comparar.
    // ----------------------------------------------------------------------
    const corpo = mime !== file.type && typeof Blob !== 'undefined' && file instanceof Blob
      ? new Blob([file], { type: mime })
      : file

    const kind = kindForMime(mime)
    const path = `${workspaceId}/${inboxItemId}/${uid()}.${extForMime(mime)}`
    const descriptor = {
      kind,
      storage_bucket: CAPTURE_BUCKET,
      storage_path: path,
      mime,
      bytes: typeof file.size === 'number' ? file.size : null,
    }

    if (!isSupabaseConfigured) {
      // Demo: guarda como data-URL no localStore (paridade de leitura via URL).
      const dataUrl = `data:${mime};base64,${arrayBufferToBase64(await corpo.arrayBuffer())}`
      try {
        localStore.setTable(DEMO_BLOB_TABLE, [
          ...localStore.table(DEMO_BLOB_TABLE),
          { path, dataUrl, mime, bytes: descriptor.bytes },
        ])
      } catch (err) {
        // A cota do navegador estourou apesar do teto do modo demo — o balde e
        // compartilhado com notas, tarefas e links, entao ele pode ja estar
        // cheio por outro motivo. Vira uma frase que diz o que fazer, nunca um
        // `QuotaExceededError` cru na cara da pessoa.
        if (err instanceof CotaExcedidaError || ehErroDeCota(err)) {
          const cota = err instanceof CotaExcedidaError ? err : new CotaExcedidaError(err)
          cota.motivo = 'cota_excedida'
          throw cota
        }
        throw err
      }
      return descriptor
    }

    const { error } = await supabase.storage
      .from(CAPTURE_BUCKET)
      // `contentType` continua sendo passado por clareza e porque VALE para
      // corpos que nao sao Blob (ArrayBuffer, stream). Para Blob, quem manda e
      // o `type` de `corpo`, ja normalizado acima.
      .upload(path, corpo, { contentType: mime, upsert: false })
    if (error) throw error
    return descriptor
  },

  // URL para exibir o asset. Demo: data-URL. Supabase: URL assinada (bucket
  // privado) com validade `expiresIn` (segundos). Retorna null se nao existir.
  async getViewUrl({ storage_bucket = CAPTURE_BUCKET, storage_path } = {}, { expiresIn = 3600 } = {}) {
    if (!storage_path) return null
    if (!isSupabaseConfigured) {
      const row = localStore.table(DEMO_BLOB_TABLE).find((r) => r.path === storage_path)
      return row ? row.dataUrl : null
    }
    const { data, error } = await supabase.storage
      .from(storage_bucket)
      .createSignedUrl(storage_path, expiresIn)
    if (error) throw error
    return data?.signedUrl ?? null
  },

  // Remove o binario. Usado na compensacao (Etapa 3) e no delete de captura.
  // Best-effort do ponto de vista do chamador; aqui propaga erro real.
  async remove({ storage_bucket = CAPTURE_BUCKET, storage_path } = {}) {
    if (!storage_path) return
    if (!isSupabaseConfigured) {
      localStore.setTable(
        DEMO_BLOB_TABLE,
        localStore.table(DEMO_BLOB_TABLE).filter((r) => r.path !== storage_path),
      )
      return
    }
    const { error } = await supabase.storage.from(storage_bucket).remove([storage_path])
    if (error) throw error
  },
}
