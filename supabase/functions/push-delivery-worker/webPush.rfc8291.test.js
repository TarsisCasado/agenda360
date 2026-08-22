import { describe, it, expect } from 'vitest'
import { encryptPayload, hkdf } from './webPush.ts'

// ===========================================================================
// CONFORMIDADE com RFC 8291 Apendice A (vetor de teste OFICIAL, publicado no
// texto da RFC — nao inventado por nos).
//
// POR QUE ESTE TESTE EXISTE: o teste em webPush.test.js (round-trip) cifra E
// decifra com a MESMA implementacao nossa — isso prova so AUTOCONSISTENCIA,
// nao conformidade com o padrao real que o Safari usa. Um erro sistematico
// (ex.: ordem trocada de ua_public/as_public no "info", ou salt/IKM
// invertidos no HKDF) passaria despercebido nesse teste porque o "receptor"
// do teste replica o MESMO raciocinio (possivelmente errado) do "emissor".
//
// Este teste fecha essa lacuna: usa as chaves, salt e o resultado EXATOS
// publicados no Apendice A da RFC 8291 (obtidos de
// https://www.rfc-editor.org/rfc/rfc8291.txt) e verifica que nossa
// implementacao reproduz CADA valor intermediario e o corpo final BYTE A
// BYTE — nao so que "decifra o que cifrou".
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

// -------------------- Vetores oficiais (RFC 8291 Apendice A) ---------------
const VEC = {
  plaintext: 'V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24',
  as_public: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  as_private: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  ua_public: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  auth_secret: 'BTBZMqHH6r4Tts7J_aSIgg',
  // Intermediarios publicados (para diagnostico fino se algo divergir).
  ecdh_secret: 'kyrL1jIIOHEzg3sM2ZWRHDRB62YACZhhSlknJ672kSs',
  ikm: 'S4lYMb_L0FxCeq0WhDx813KgSYqU26kOyzWUdsXYyrg', // RFC chama isso de "IKM" (nossa 2a HKDF usa este valor)
  prk: '09_eUZGrsvxChDCGRCdkLiDXrReGOEVeSCdCcPBSJSc',
  cek: 'oIhVW04MRdy2XN9CiKLxTg',
  nonce: '4h_95klXJ5E_qnoN',
  body: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
}

async function importEcdhKeyPairFromRaw(publicB64url, privateB64url) {
  const pub = b64urlToBytes(publicB64url)
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: bytesToB64url(pub.slice(1, 33)),
    y: bytesToB64url(pub.slice(33, 65)),
    d: privateB64url,
    ext: true,
  }
  const privateKey = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])
  const publicKey = await crypto.subtle.importKey(
    'raw',
    pub,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    [],
  )
  return { privateKey, publicKey }
}

describe('webPush — CONFORMIDADE com RFC 8291 Apendice A (vetor oficial)', () => {
  it('reproduz ecdh_secret, IKM, PRK, CEK e NONCE publicados na RFC', async () => {
    // Reproduz manualmente os 2 estagios de HKDF com a MESMA funcao hkdf()
    // usada em producao, para comparar cada intermediario com o vetor oficial.
    const asPair = await importEcdhKeyPairFromRaw(VEC.as_public, VEC.as_private)
    const uaPublicKey = await crypto.subtle.importKey(
      'raw',
      b64urlToBytes(VEC.ua_public),
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      [],
    )
    const ecdhSecret = new Uint8Array(
      await crypto.subtle.deriveBits({ name: 'ECDH', public: uaPublicKey }, asPair.privateKey, 256),
    )
    expect(bytesToB64url(ecdhSecret)).toBe(VEC.ecdh_secret)

    const keyInfo = new Uint8Array([
      ...utf8('WebPush: info'),
      0,
      ...b64urlToBytes(VEC.ua_public),
      ...b64urlToBytes(VEC.as_public),
    ])
    const ikm = await hkdf(ecdhSecret, b64urlToBytes(VEC.auth_secret), keyInfo, 32)
    expect(bytesToB64url(ikm)).toBe(VEC.ikm)

    const salt = b64urlToBytes(VEC.salt)
    const cek = await hkdf(ikm, salt, new Uint8Array([...utf8('Content-Encoding: aes128gcm'), 0]), 16)
    expect(bytesToB64url(cek)).toBe(VEC.cek)

    const nonce = await hkdf(ikm, salt, new Uint8Array([...utf8('Content-Encoding: nonce'), 0]), 12)
    expect(bytesToB64url(nonce)).toBe(VEC.nonce)
  })

  it('encryptPayload() com os inputs oficiais produz o CORPO HTTP publicado, byte a byte', async () => {
    const ephemeralKeyPair = await importEcdhKeyPairFromRaw(VEC.as_public, VEC.as_private)
    const salt = b64urlToBytes(VEC.salt)
    const plaintext = b64urlToBytes(VEC.plaintext)

    const body = await encryptPayload(plaintext, VEC.ua_public, VEC.auth_secret, { salt, ephemeralKeyPair })

    expect(bytesToB64url(body)).toBe(VEC.body)
  })
})
