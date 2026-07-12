import { describe, it, expect } from 'vitest'
import { isValidUrl, sanitizeUrl, guard, percent } from './utils'

describe('C1 — seguranca de URLs', () => {
  it('isValidUrl aceita http/https', () => {
    expect(isValidUrl('https://exemplo.com')).toBe(true)
    expect(isValidUrl('http://exemplo.com/x?y=1')).toBe(true)
  })

  it('isValidUrl bloqueia esquemas perigosos e invalidos', () => {
    expect(isValidUrl('javascript:alert(1)')).toBe(false)
    expect(isValidUrl('JavaScript:alert(1)')).toBe(false)
    expect(isValidUrl('data:text/html,<script>alert(1)</script>')).toBe(false)
    expect(isValidUrl('vbscript:msgbox(1)')).toBe(false)
    expect(isValidUrl('file:///etc/passwd')).toBe(false)
    expect(isValidUrl('instagram.com/x')).toBe(false) // sem esquema
    expect(isValidUrl('')).toBe(false)
  })

  it('sanitizeUrl retorna a URL apenas se for http(s) segura', () => {
    expect(sanitizeUrl('https://exemplo.com')).toBe('https://exemplo.com')
    expect(sanitizeUrl('  https://exemplo.com  ')).toBe('https://exemplo.com') // trim
    expect(sanitizeUrl('javascript:alert(1)')).toBe('')
    expect(sanitizeUrl('data:text/html,x')).toBe('')
    expect(sanitizeUrl('')).toBe('')
    expect(sanitizeUrl(null)).toBe('')
    expect(sanitizeUrl(undefined)).toBe('')
  })
})

describe('A4 — guard (nunca rejeita)', () => {
  it('resolve com data em caso de sucesso', async () => {
    const r = await guard(Promise.resolve(42))
    expect(r).toEqual({ data: 42, error: null })
  })

  it('captura o erro sem lancar em caso de falha', async () => {
    const boom = new Error('falhou')
    const r = await guard(Promise.reject(boom))
    expect(r.data).toBeNull()
    expect(r.error).toBe(boom)
  })

  it('aceita promessa ja rejeitada sem estourar', async () => {
    await expect(guard(Promise.reject(new Error('x')))).resolves.toBeDefined()
  })
})

describe('percent (sanity)', () => {
  it('nao divide por zero', () => {
    expect(percent(1, 0)).toBe(0)
    expect(percent(1, 2)).toBe(50)
  })
})
