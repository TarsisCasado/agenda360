import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { localStore } from './localStore'
import { uid } from '../lib/utils'

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

// Teto de tamanho por asset. Vale para os dois modos; no modo demo (data-URL em
// localStorage) e especialmente importante para nao estourar a cota do browser.
export const MAX_ASSET_BYTES = 10 * 1024 * 1024 // 10 MB

// Tabela local (modo demo) que guarda o binario como data-URL, indexado por path.
const DEMO_BLOB_TABLE = 'capture_asset_blobs'

const EXT_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/mp4': 'm4a',
  'audio/webm': 'weba',
}

// Classifica o mime no `kind` do dominio. Puro.
export function kindForMime(mime = '') {
  if (mime.startsWith('image/')) return 'image'
  if (mime === 'application/pdf') return 'pdf'
  if (mime.startsWith('audio/')) return 'audio'
  return 'file'
}

function extForMime(mime = '') {
  if (EXT_BY_MIME[mime]) return EXT_BY_MIME[mime]
  const sub = String(mime).split('/')[1]
  const clean = sub ? sub.replace(/[^a-z0-9]/gi, '') : ''
  return clean || 'bin'
}

// Valida o objeto de arquivo (Blob/File). Nao depende de FileReader.
function assertValidFile(file) {
  if (!file || typeof file.arrayBuffer !== 'function') {
    throw new Error('Arquivo invalido (esperado Blob/File).')
  }
  if (!file.type) throw new Error('Tipo (mime) do arquivo ausente.')
  if (typeof file.size === 'number' && file.size > MAX_ASSET_BYTES) {
    throw new Error(`Arquivo excede o limite de ${MAX_ASSET_BYTES} bytes.`)
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
    assertValidFile(file)

    const kind = kindForMime(file.type)
    const path = `${workspaceId}/${inboxItemId}/${uid()}.${extForMime(file.type)}`
    const descriptor = {
      kind,
      storage_bucket: CAPTURE_BUCKET,
      storage_path: path,
      mime: file.type,
      bytes: typeof file.size === 'number' ? file.size : null,
    }

    if (!isSupabaseConfigured) {
      // Demo: guarda como data-URL no localStore (paridade de leitura via URL).
      const dataUrl = `data:${file.type};base64,${arrayBufferToBase64(await file.arrayBuffer())}`
      localStore.setTable(DEMO_BLOB_TABLE, [
        ...localStore.table(DEMO_BLOB_TABLE),
        { path, dataUrl, mime: file.type, bytes: descriptor.bytes },
      ])
      return descriptor
    }

    const { error } = await supabase.storage
      .from(CAPTURE_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false })
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
