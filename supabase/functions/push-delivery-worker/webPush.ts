// ===========================================================================
// webPush.ts — Web Push (RFC 8030) puro, SEM dependencias externas.
// ---------------------------------------------------------------------------
// Implementa apenas com Web Crypto API (`crypto.subtle`, disponivel identica
// em Deno e em Node >=19, portanto testavel em Vitest/Node e executavel na
// Edge Function/Deno sem nenhuma import de rede/npm):
//   - VAPID (RFC 8292): JWT assinado ES256 + chave publica no header
//     Authorization.
//   - Cifra do payload (RFC 8291 sobre RFC 8188 aes128gcm): ECDH efemero com
//     a chave publica da subscription (p256dh) + HKDF-SHA-256 + AES-128-GCM.
//
// Por que sem lib (`web-push` etc.): a lib npm depende de `node:crypto`
// (Buffer/KeyObject) e de HTTP client proprios; via esm.sh isso e fragil em
// runtime Deno. A W3C Web Crypto API cobre 100% do que o protocolo exige e e
// padrao em ambos os runtimes — zero superficie de import externo.
// ===========================================================================

// -------------------- base64url (sem padding) -----------------------------
function bytesToBase64url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlToBytes(b64url: string): Uint8Array {
  const padded = b64url.replace(/-/g, '+').replace(/_/g, '/')
  const pad = '='.repeat((4 - (padded.length % 4)) % 4)
  const bin = atob(padded + pad)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

// -------------------- HKDF (RFC 5869) via Web Crypto -----------------------
// `deriveBits` com algoritmo 'HKDF' faz extract+expand num unico call. Chamar
// 2x com o MESMO (ikm, salt) e `info` diferente reproduz corretamente o
// mesmo PRK internamente (extract depende so de salt+ikm) — e o que RFC 8291
// e RFC 8188 exigem (2 expands sobre o mesmo PRK).
// Exportada apenas para o teste de conformidade contra os vetores oficiais
// da RFC 8291 Apendice A (webPush.rfc8291.test.js) — nao usada fora de testes.
export async function hkdf(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    length * 8,
  )
  return new Uint8Array(bits)
}

// ===========================================================================
// VAPID (RFC 8292)
// ===========================================================================

export interface VapidKeys {
  publicKey: string // base64url, 65 bytes (0x04 || x || y) — PUBLICA, vai no frontend
  privateKey: string // base64url, 32 bytes (d) — SECRETA, so no backend
}

// Gera um par de chaves VAPID novo (P-256). Usado APENAS na etapa de
// operacionalizacao (uma vez), nunca em runtime da Function.
export async function generateVapidKeys(): Promise<VapidKeys> {
  const keyPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])
  const publicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey))
  const privateJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey)
  if (!privateJwk.d) throw new Error('falha ao exportar chave privada VAPID')
  return { publicKey: bytesToBase64url(publicRaw), privateKey: privateJwk.d }
}

// Reconstroi a CryptoKey de assinatura a partir das duas metades base64url.
// x/y vem da chave PUBLICA (nao secreta); d vem da PRIVADA (secreta).
async function importVapidPrivateKey(publicKey: string, privateKey: string): Promise<CryptoKey> {
  const pub = base64urlToBytes(publicKey)
  if (pub.length !== 65 || pub[0] !== 0x04) {
    throw new Error('VAPID public key invalida (esperado ponto P-256 nao comprimido, 65 bytes)')
  }
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    x: bytesToBase64url(pub.slice(1, 33)),
    y: bytesToBase64url(pub.slice(33, 65)),
    d: privateKey,
    ext: true,
  }
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
}

// Monta o header `Authorization: vapid t=<jwt>, k=<publicKey>` para UM endpoint.
// `aud` e sempre a ORIGIN do endpoint (exigencia do push service).
export async function buildVapidAuthHeader(opts: {
  endpoint: string
  subject: string // 'mailto:...' ou 'https://...' (RFC 8292)
  vapid: VapidKeys
  ttlSeconds?: number
}): Promise<string> {
  const aud = new URL(opts.endpoint).origin
  const exp = Math.floor(Date.now() / 1000) + Math.min(opts.ttlSeconds ?? 12 * 60 * 60, 24 * 60 * 60)
  const header = { typ: 'JWT', alg: 'ES256' }
  const claims = { aud, exp, sub: opts.subject }
  const unsigned = `${bytesToBase64url(utf8(JSON.stringify(header)))}.${bytesToBase64url(utf8(JSON.stringify(claims)))}`
  const key = await importVapidPrivateKey(opts.vapid.publicKey, opts.vapid.privateKey)
  // Web Crypto ECDSA produz o formato IEEE P1363 (r||s) — exatamente o que JWS ES256 exige (sem DER).
  const sigBuf = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(unsigned))
  const jwt = `${unsigned}.${bytesToBase64url(new Uint8Array(sigBuf))}`
  return `vapid t=${jwt}, k=${opts.vapid.publicKey}`
}

// ===========================================================================
// Cifra do payload — RFC 8291 (ECDH+HKDF) sobre RFC 8188 (aes128gcm)
// ===========================================================================

// `p256dh`/`auth` vem da PushSubscription do navegador (subscription.toJSON().keys).
// `testOverrides` existe SOMENTE para o teste de conformidade RFC 8291
// Apendice A (webPush.rfc8291.test.js), que precisa fixar a chave efemera e o
// salt (o Apendice A publica valores fixos) para reproduzir o vetor oficial
// byte a byte. Em producao nunca e passado: chave efemera e salt SEMPRE
// aleatorios por mensagem.
export async function encryptPayload(
  payload: Uint8Array,
  p256dh: string,
  authSecretB64url: string,
  testOverrides?: { salt?: Uint8Array; ephemeralKeyPair?: CryptoKeyPair },
): Promise<Uint8Array> {
  const uaPublicRaw = base64urlToBytes(p256dh)
  if (uaPublicRaw.length !== 65) throw new Error('p256dh invalida (esperado 65 bytes)')
  const authSecret = base64urlToBytes(authSecretB64url)

  const uaPublicKey = await crypto.subtle.importKey(
    'raw',
    uaPublicRaw,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    [],
  )
  // Chave efemera do servidor de aplicacao (as_) — UMA por mensagem (RFC 8291 §3.1).
  const asKeyPair =
    testOverrides?.ephemeralKeyPair ??
    (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']))
  const asPublicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', asKeyPair.publicKey))

  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaPublicKey }, asKeyPair.privateKey, 256),
  )

  // IKM da cifra: extract com salt=auth_secret, expand com info ligando as duas chaves publicas.
  const keyInfo = concatBytes(utf8('WebPush: info'), new Uint8Array([0]), uaPublicRaw, asPublicRaw)
  const ikm = await hkdf(ecdhSecret, authSecret, keyInfo, 32)

  const salt = testOverrides?.salt ?? crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(ikm, salt, concatBytes(utf8('Content-Encoding: aes128gcm'), new Uint8Array([0])), 16)
  const nonce = await hkdf(ikm, salt, concatBytes(utf8('Content-Encoding: nonce'), new Uint8Array([0])), 12)

  // Registro UNICO (delimitador 0x02 = ultimo registro; RFC 8188 §2).
  const plaintext = concatBytes(payload, new Uint8Array([2]))
  const cekKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, cekKey, plaintext),
  )

  // Header do content-coding aes128gcm: salt(16) || rs(4, big-endian) || idlen(1) || keyid(idlen).
  // `rs` (record size) e o valor CONVENCIONAL 4096 — o MESMO usado no exemplo
  // oficial da RFC 8291 Apendice A e por praticamente toda implementacao de
  // referencia (ex.: lib `web-push`). NAO usar ciphertext.length aqui: um
  // teste de conformidade byte-a-byte contra o vetor oficial da RFC (ver
  // webPush.rfc8291.test.js) provou que rs=ciphertext.length e a UNICA
  // divergencia da nossa cifra frente ao vetor publicado — todo o resto
  // (ECDH, HKDF, AEAD) bate exatamente. RFC 8188 nao proibe rs=tamanho exato,
  // mas decodificadores reais (WebKit/Safari) podem tratar
  // "restam exatamente rs bytes" como caso-limite mal-suportado, silenciando
  // a notificacao mesmo com o Push Service (Apple) aceitando o envio (2xx).
  const rs = Math.max(4096, ciphertext.length)
  const header = concatBytes(
    salt,
    new Uint8Array([(rs >>> 24) & 0xff, (rs >>> 16) & 0xff, (rs >>> 8) & 0xff, rs & 0xff]),
    new Uint8Array([asPublicRaw.length]),
    asPublicRaw,
  )
  return concatBytes(header, ciphertext)
}

// ===========================================================================
// Envio HTTP
// ===========================================================================

export interface PushSubscriptionLike {
  endpoint: string
  p256dh: string
  auth: string
}

// Headers de resposta do Push Service (Apple/Chrome/Mozilla) sao DIAGNOSTICO
// puro — nunca contem segredo (nao e nosso VAPID nem a subscription; e a
// resposta HTTP de QUEM recebeu o envio). Uteis para provar que o Push
// Service aceitou (2xx) vs so retornou um HTTP generico sem processar nada.
const DIAGNOSTIC_RESPONSE_HEADERS = ['content-length', 'date', 'apns-id', 'location', 'link']

export interface SendResult {
  ok: boolean
  status: number
  expired: boolean // true em 404/410 -> subscription deve ser desativada
  error?: string
  responseHeaders?: Record<string, string> // DIAGNOSTICO temporario (ver deliver.ts)
  responseBodySnippet?: string // DIAGNOSTICO temporario; truncado, so em falha
}

// `fetchImpl` injetavel para testes (Node sem rede real).
export async function sendWebPush(
  subscription: PushSubscriptionLike,
  payload: Record<string, unknown>,
  vapid: VapidKeys & { subject: string },
  opts: { ttlSeconds?: number; fetchImpl?: typeof fetch } = {},
): Promise<SendResult> {
  const doFetch = opts.fetchImpl ?? fetch
  try {
    const body = await encryptPayload(utf8(JSON.stringify(payload)), subscription.p256dh, subscription.auth)
    const authHeader = await buildVapidAuthHeader({
      endpoint: subscription.endpoint,
      subject: vapid.subject,
      vapid,
      ttlSeconds: opts.ttlSeconds,
    })
    const res = await doFetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        // RFC 8030: opcional, mas toda implementacao de referencia (ex.: lib
        // `web-push`) sempre envia (default 'normal'). Lembretes sao por
        // natureza sensiveis a tempo ("em 10 minutos"), entao usamos 'high'
        // — semantica explicita do RFC para "entregar assim que possivel,
        // mesmo as custas de bateria do dispositivo".
        Urgency: 'high',
        TTL: String(opts.ttlSeconds ?? 24 * 60 * 60),
        Authorization: authHeader,
      },
      body,
    })
    const responseHeaders: Record<string, string> = {}
    for (const name of DIAGNOSTIC_RESPONSE_HEADERS) {
      const value = res.headers.get(name)
      if (value) responseHeaders[name] = value
    }
    // Corpo so e lido (e truncado) quando NAO deu 2xx — em sucesso o Push
    // Service normalmente responde vazio; ler sempre custaria uma leitura
    // de rede desnecessaria no caminho feliz.
    let responseBodySnippet: string | undefined
    if (!res.ok) {
      try {
        responseBodySnippet = (await res.text()).slice(0, 300)
      } catch {
        // corpo indisponivel/ja consumido: segue sem o snippet, nao e fatal.
      }
    }
    return {
      ok: res.ok,
      status: res.status,
      expired: res.status === 404 || res.status === 410,
      responseHeaders,
      responseBodySnippet,
    }
  } catch (err) {
    // Falha de rede/DNS: nunca 'expired' (nao sabemos o estado da subscription).
    return { ok: false, status: 0, expired: false, error: String((err as Error)?.message || err) }
  }
}
