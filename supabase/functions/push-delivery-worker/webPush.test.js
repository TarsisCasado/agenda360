import { describe, it, expect } from 'vitest'
import { generateVapidKeys, buildVapidAuthHeader, encryptPayload, sendWebPush } from './webPush.ts'

// ===========================================================================
// Testes de webPush.ts — validam o protocolo por AUTO-CONSISTENCIA:
//   - VAPID: o JWT gerado e verificado com a MESMA chave publica (ECDSA/P-256).
//   - Payload: decifra com uma implementacao independente do lado RECEPTOR
//     (a mesma matematica que um navegador real faria), provando que o
//     formato aes128gcm (RFC 8188) e a derivacao HKDF (RFC 8291) batem.
// ===========================================================================

function b64urlToBytes(b64url) {
  const padded = b64url.replace(/-/g, '+').replace(/_/g, '/')
  const pad = '='.repeat((4 - (padded.length % 4)) % 4)
  const bin = atob(padded + pad)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}
function bytesToB64url(bytes) {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function utf8(s) {
  return new TextEncoder().encode(s)
}
function concat(...parts) {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const p of parts) {
    out.set(p, off)
    off += p.length
  }
  return out
}
async function hkdf(ikm, salt, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8)
  return new Uint8Array(bits)
}

// Gera uma "subscription" de teste: par ECDH (fica do lado do "navegador") + auth secret.
async function fakeSubscription() {
  const uaKeyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const uaPublicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', uaKeyPair.publicKey))
  const authSecret = crypto.getRandomValues(new Uint8Array(16))
  return {
    uaKeyPair,
    subscription: {
      endpoint: 'https://push.example.com/abc123',
      p256dh: bytesToB64url(uaPublicRaw),
      auth: bytesToB64url(authSecret),
    },
  }
}

// Implementacao do lado RECEPTOR (RFC 8291 §3.2 + RFC 8188), independente do
// codigo de producao, usada so para provar que o formato gerado e decifravel.
async function decryptAsReceiver(body, uaPrivateKey, authSecretB64url) {
  const authSecret = b64urlToBytes(authSecretB64url)
  const salt = body.slice(0, 16)
  const rs = (body[16] << 24) | (body[17] << 16) | (body[18] << 8) | body[19]
  const idlen = body[20]
  const asPublicRaw = body.slice(21, 21 + idlen)
  const ciphertext = body.slice(21 + idlen, 21 + idlen + rs)

  const asPublicKey = await crypto.subtle.importKey('raw', asPublicRaw, { name: 'ECDH', namedCurve: 'P-256' }, true, [])
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asPublicKey }, uaPrivateKey, 256))

  const uaPublicRaw = new Uint8Array(
    await crypto.subtle.exportKey('raw', await deriveMatchingPublicKey(uaPrivateKey)),
  )
  const keyInfo = concat(utf8('WebPush: info'), new Uint8Array([0]), uaPublicRaw, asPublicRaw)
  const ikm = await hkdf(ecdhSecret, authSecret, keyInfo, 32)

  const cek = await hkdf(ikm, salt, concat(utf8('Content-Encoding: aes128gcm'), new Uint8Array([0])), 16)
  const nonce = await hkdf(ikm, salt, concat(utf8('Content-Encoding: nonce'), new Uint8Array([0])), 12)

  const cekKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt'])
  const plainWithDelim = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, cekKey, ciphertext),
  )
  // remove o delimitador final (0x02 = ultimo registro)
  return plainWithDelim.slice(0, -1)
}

// Node/Deno nao expoem a chave publica a partir so da privada; guardamos o par
// original no teste (helper trivial de re-derivacao nao seria possivel em
// producao real, mas aqui simulamos re-exportando do MESMO CryptoKeyPair).
let lastUaKeyPair = null
async function deriveMatchingPublicKey(_priv) {
  return lastUaKeyPair.publicKey
}

describe('webPush — VAPID (RFC 8292)', () => {
  it('gera um par de chaves valido (publica 65 bytes, privada presente)', async () => {
    const keys = await generateVapidKeys()
    expect(b64urlToBytes(keys.publicKey).length).toBe(65)
    expect(b64urlToBytes(keys.publicKey)[0]).toBe(0x04)
    expect(typeof keys.privateKey).toBe('string')
    expect(keys.privateKey.length).toBeGreaterThan(0)
  })

  it('o JWT gerado tem 3 partes, alg=ES256 e assinatura valida pela chave publica', async () => {
    const vapid = await generateVapidKeys()
    const header = await buildVapidAuthHeader({
      endpoint: 'https://push.example.com/xyz',
      subject: 'mailto:ops@agenda360.app',
      vapid,
    })
    expect(header.startsWith('vapid t=')).toBe(true)
    expect(header).toContain(`k=${vapid.publicKey}`)

    const jwt = header.slice('vapid t='.length, header.indexOf(', k='))
    const [h, p, s] = jwt.split('.')
    expect(h && p && s).toBeTruthy()

    const claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(p)))
    expect(claims.aud).toBe('https://push.example.com')
    expect(claims.sub).toBe('mailto:ops@agenda360.app')
    expect(claims.exp).toBeGreaterThan(Math.floor(Date.now() / 1000))

    const pubRaw = b64urlToBytes(vapid.publicKey)
    const pubKey = await crypto.subtle.importKey(
      'raw',
      pubRaw,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    )
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      pubKey,
      b64urlToBytes(s),
      utf8(`${h}.${p}`),
    )
    expect(valid).toBe(true)
  })
})

describe('webPush — cifra do payload (RFC 8291 / RFC 8188 aes128gcm)', () => {
  it('o corpo cifrado e decifravel pelo lado receptor e recupera o JSON original', async () => {
    const { uaKeyPair, subscription } = await fakeSubscription()
    lastUaKeyPair = uaKeyPair

    const payloadObj = { title: 'Agenda 360', body: 'Reuniao gerencial em 10 minutos' }
    const body = await encryptPayload(utf8(JSON.stringify(payloadObj)), subscription.p256dh, subscription.auth)

    const plain = await decryptAsReceiver(body, uaKeyPair.privateKey, subscription.auth)
    expect(JSON.parse(new TextDecoder().decode(plain))).toEqual(payloadObj)
  })

  it('duas cifras da mesma mensagem produzem corpos diferentes (salt/chave efemera por envio)', async () => {
    const { subscription } = await fakeSubscription()
    const a = await encryptPayload(utf8('{"x":1}'), subscription.p256dh, subscription.auth)
    const b = await encryptPayload(utf8('{"x":1}'), subscription.p256dh, subscription.auth)
    expect(bytesToB64url(a)).not.toBe(bytesToB64url(b))
  })
})

describe('webPush — sendWebPush (HTTP)', () => {
  it('envia POST com os headers exigidos e Content-Encoding aes128gcm', async () => {
    const { subscription } = await fakeSubscription()
    const vapid = await generateVapidKeys()
    let captured = null
    const fetchImpl = async (url, init) => {
      captured = { url, init }
      return new Response(null, { status: 201 })
    }
    const result = await sendWebPush(
      subscription,
      { title: 'Agenda 360', body: 'teste' },
      { ...vapid, subject: 'mailto:ops@agenda360.app' },
      { fetchImpl },
    )
    expect(result.ok).toBe(true)
    expect(result.status).toBe(201)
    expect(result.expired).toBe(false)
    expect(captured.url).toBe(subscription.endpoint)
    expect(captured.init.headers['Content-Encoding']).toBe('aes128gcm')
    expect(captured.init.headers['Content-Type']).toBe('application/octet-stream')
    expect(captured.init.headers.Authorization).toMatch(/^vapid t=.+, k=.+$/)
    expect(captured.init.headers.Urgency).toBe('high')
    expect(captured.init.body).toBeInstanceOf(Uint8Array)
  })

  it('marca expired=true em 404 e 410; false em outros erros', async () => {
    const { subscription } = await fakeSubscription()
    const vapid = await generateVapidKeys()
    for (const status of [404, 410]) {
      const result = await sendWebPush(
        subscription,
        { title: 't' },
        { ...vapid, subject: 'mailto:ops@agenda360.app' },
        { fetchImpl: async () => new Response(null, { status }) },
      )
      expect(result.expired).toBe(true)
      expect(result.ok).toBe(false)
    }
    const serverError = await sendWebPush(
      subscription,
      { title: 't' },
      { ...vapid, subject: 'mailto:ops@agenda360.app' },
      { fetchImpl: async () => new Response(null, { status: 500 }) },
    )
    expect(serverError.expired).toBe(false)
    expect(serverError.ok).toBe(false)
  })

  it('captura falha de rede sem marcar expired', async () => {
    const { subscription } = await fakeSubscription()
    const vapid = await generateVapidKeys()
    const result = await sendWebPush(
      subscription,
      { title: 't' },
      { ...vapid, subject: 'mailto:ops@agenda360.app' },
      { fetchImpl: async () => { throw new Error('network down') } },
    )
    expect(result.ok).toBe(false)
    expect(result.expired).toBe(false)
    expect(result.error).toContain('network down')
  })
})
