// Concatena classes condicionalmente (mini utilitario estilo clsx).
export function cx(...args) {
  return args
    .flat()
    .filter(Boolean)
    .join(' ')
}

// Gera id compativel com o Postgres (uuid) para o modo demo.
export function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// Tenta extrair um titulo legivel a partir de uma URL.
export function titleFromUrl(rawUrl) {
  try {
    const u = new URL(rawUrl)
    const host = u.hostname.replace(/^www\./, '')
    const known = {
      'instagram.com': 'Post no Instagram',
      'youtube.com': 'Video no YouTube',
      'youtu.be': 'Video no YouTube',
      'github.com': 'Repositorio no GitHub',
      'drive.google.com': 'Arquivo no Google Drive',
      'docs.google.com': 'Documento Google',
      'linkedin.com': 'Perfil / Post no LinkedIn',
    }
    if (known[host]) return known[host]
    const path = u.pathname.split('/').filter(Boolean)[0]
    return path ? `${host} - ${path}` : host
  } catch {
    return 'Link'
  }
}

export function isValidUrl(value) {
  try {
    return Boolean(new URL(value))
  } catch {
    return false
  }
}

export function percent(part, total) {
  if (!total) return 0
  return Math.round((part / total) * 100)
}

export function groupBy(list, keyFn) {
  return list.reduce((acc, item) => {
    const key = keyFn(item)
    if (!acc[key]) acc[key] = []
    acc[key].push(item)
    return acc
  }, {})
}
