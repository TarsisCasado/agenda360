import { describe, it, expect } from 'vitest'
import {
  FORMATOS, MIMES_ACEITOS, ACCEPT, MOTIVO,
  MAX_BYTES, MAX_BYTES_DEMO, LADO_MAXIMO,
  MIMES_NO_BUCKET, SO_CONVERTIDO, MAX_BYTES_BUCKET, podeSubir, urlExpirada,
  EXPIRACAO_URL_SEGUNDOS, MARGEM_RENOVACAO_SEGUNDOS,
  validarArquivo, assinaturaConfere, planoDeImagem, dimensaoAlvo,
  ehAceito, ehHeic, ehImagem, kindDe, extensaoDe, podeTerExif,
  normalizarMime, tamanhoLegivel,
} from './anexoPolitica'

const arq = (type, size = 1024) => ({ type, size })

// ===========================================================================
// O QUE ENTRA
// ===========================================================================
describe('anexoPolitica — formatos aceitos', () => {
  it('aceita as imagens que o produto promete', () => {
    for (const m of ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']) {
      expect(validarArquivo(arq(m)).ok, m).toBe(true)
      expect(kindDe(m)).toBe('image')
    }
  })

  it('aceita PDF, áudio, texto e documentos do Office', () => {
    expect(kindDe('application/pdf')).toBe('pdf')
    expect(kindDe('audio/mpeg')).toBe('audio')
    expect(kindDe('text/plain')).toBe('file')
    expect(kindDe('text/csv')).toBe('file')
    expect(kindDe('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('file')
    for (const m of ['application/pdf', 'audio/mpeg', 'text/csv']) {
      expect(validarArquivo(arq(m)).ok, m).toBe(true)
    }
  })

  it('o mime chega normalizado: maiúsculas, espaços e charset não enganam', () => {
    expect(normalizarMime('  IMAGE/JPEG  ')).toBe('image/jpeg')
    expect(normalizarMime('text/plain; charset=utf-8')).toBe('text/plain')
    expect(validarArquivo(arq('  IMAGE/JPEG  ')).ok).toBe(true)
    expect(validarArquivo(arq('text/plain; charset=utf-8')).ok).toBe(true)
  })

  it('cada formato declara kind e extensão — nenhum cai no genérico por engano', () => {
    for (const f of FORMATOS) {
      expect(['image', 'pdf', 'audio', 'file']).toContain(f.kind)
      expect(f.ext).toMatch(/^[a-z0-9]+$/)
      expect(extensaoDe(f.mime)).toBe(f.ext)
    }
    expect(ACCEPT.split(',')).toEqual(MIMES_ACEITOS)
  })
})

// ===========================================================================
// O QUE NAO ENTRA — a razao de existir deste arquivo
// ===========================================================================
describe('anexoPolitica — formatos recusados', () => {
  it('recusa SVG: é XML que executa script', () => {
    const v = validarArquivo(arq('image/svg+xml'))
    expect(v.ok).toBe(false)
    expect(v.motivo).toBe(MOTIVO.FORMATO_RECUSADO)
    // E, principalmente, nao se disfarca de imagem no resto do produto.
    expect(ehImagem('image/svg+xml')).toBe(false)
    expect(kindDe('image/svg+xml')).toBe('file')
  })

  it('recusa HTML, XHTML e XML', () => {
    for (const m of ['text/html', 'application/xhtml+xml', 'text/xml', 'application/xml']) {
      expect(validarArquivo(arq(m)).ok, m).toBe(false)
    }
  })

  it('recusa executáveis e script', () => {
    for (const m of [
      'application/x-msdownload', 'application/x-msdos-program', 'application/vnd.microsoft.portable-executable',
      'application/x-sh', 'application/x-executable', 'application/javascript', 'text/javascript',
      'application/x-httpd-php', 'application/java-archive', 'application/x-apple-diskimage',
    ]) {
      expect(validarArquivo(arq(m)).ok, m).toBe(false)
    }
  })

  it('recusa arquivo sem mime', () => {
    const v = validarArquivo(arq(''))
    expect(v.ok).toBe(false)
    expect(v.motivo).toBe(MOTIVO.SEM_MIME)
    expect(validarArquivo(arq(undefined)).ok).toBe(false)
    expect(validarArquivo(null).motivo).toBe(MOTIVO.SEM_ARQUIVO)
  })

  it('toda recusa vem com frase para a pessoa, nunca só um código', () => {
    for (const m of ['image/svg+xml', 'text/html', 'application/x-msdownload', '']) {
      const v = validarArquivo(arq(m))
      expect(v.ok).toBe(false)
      expect(v.mensagem.length).toBeGreaterThan(20)
    }
  })
})

// ===========================================================================
// LIMITES
// ===========================================================================
describe('anexoPolitica — limites de tamanho', () => {
  it('aceita exatamente no teto e recusa um byte acima', () => {
    expect(validarArquivo(arq('image/jpeg', MAX_BYTES)).ok).toBe(true)
    const v = validarArquivo(arq('image/jpeg', MAX_BYTES + 1))
    expect(v.ok).toBe(false)
    expect(v.motivo).toBe(MOTIVO.ACIMA_DO_LIMITE)
  })

  it('o modo demo tem teto próprio e menor — o balde é o localStorage', () => {
    const grande = arq('image/jpeg', MAX_BYTES_DEMO + 1)
    expect(validarArquivo(grande, { demo: false }).ok).toBe(true)
    const v = validarArquivo(grande, { demo: true })
    expect(v.ok).toBe(false)
    expect(v.motivo).toBe(MOTIVO.ACIMA_DO_LIMITE_DEMO)
    expect(MAX_BYTES_DEMO).toBeLessThan(MAX_BYTES)
  })

  it('recusa arquivo vazio', () => {
    expect(validarArquivo(arq('image/jpeg', 0)).motivo).toBe(MOTIVO.VAZIO)
  })

  it('tamanho desconhecido não bloqueia — não se recusa pelo que não se sabe', () => {
    expect(validarArquivo({ type: 'image/jpeg' }).ok).toBe(true)
  })

  it('tamanho vem legível para a mensagem', () => {
    expect(tamanhoLegivel(512)).toBe('512 bytes')
    expect(tamanhoLegivel(2048)).toBe('2 kB')
    expect(tamanhoLegivel(10 * 1024 * 1024)).toBe('10,0 MB')
  })
})

// ===========================================================================
// ASSINATURA — defesa em profundidade
// ===========================================================================
describe('anexoPolitica — assinatura', () => {
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  const JPEG = [0xff, 0xd8, 0xff, 0xe0]
  const PDF = [0x25, 0x50, 0x44, 0x46]
  const HTML = [0x3c, 0x21, 0x44, 0x4f, 0x43, 0x54, 0x59, 0x50] // <!DOCTYP

  it('aceita quando os bytes confirmam o mime', () => {
    expect(assinaturaConfere(PNG, 'image/png')).toBe(true)
    expect(assinaturaConfere(JPEG, 'image/jpeg')).toBe(true)
    expect(assinaturaConfere(PDF, 'application/pdf')).toBe(true)
  })

  it('recusa HTML disfarçado de imagem — o caso que motiva a verificação', () => {
    expect(assinaturaConfere(HTML, 'image/png')).toBe(false)
    expect(assinaturaConfere(HTML, 'image/jpeg')).toBe(false)
    const v = validarArquivo(arq('image/png'), { bytes: HTML })
    expect(v.ok).toBe(false)
    expect(v.motivo).toBe(MOTIVO.ASSINATURA_DIVERGENTE)
  })

  it('recusa PNG declarado como PDF e vice-versa', () => {
    expect(assinaturaConfere(PNG, 'application/pdf')).toBe(false)
    expect(assinaturaConfere(PDF, 'image/png')).toBe(false)
  })

  it('HEIC é reconhecido pelo ftyp na posição 4, não pelos 4 primeiros bytes', () => {
    const heic = [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]
    expect(assinaturaConfere(heic, 'image/heic')).toBe(true)
    expect(assinaturaConfere(HTML, 'image/heic')).toBe(false)
  })

  it('cala-se quando não há o que contradizer', () => {
    // Sem bytes, com bytes de menos, ou formato sem assinatura estavel.
    expect(assinaturaConfere(null, 'image/png')).toBe(true)
    expect(assinaturaConfere([], 'image/png')).toBe(true)
    expect(assinaturaConfere([0x89, 0x50], 'image/png')).toBe(true)
    expect(assinaturaConfere(HTML, 'text/plain')).toBe(true)
    expect(assinaturaConfere(HTML, 'application/msword')).toBe(true)
  })

  it('tamanho é checado ANTES da assinatura: não se abre um arquivo gigante', () => {
    const v = validarArquivo(arq('image/png', MAX_BYTES + 1), { bytes: HTML })
    expect(v.motivo).toBe(MOTIVO.ACIMA_DO_LIMITE)
  })
})

// ===========================================================================
// PLANO DE PREPARO DA IMAGEM
// ===========================================================================
describe('anexoPolitica — plano de imagem', () => {
  it('foto grande é reduzida, com proporção preservada', () => {
    const p = planoDeImagem('image/jpeg', { largura: 4032, altura: 3024 })
    expect(p.acao).toBe('reduzir')
    expect(p.largura).toBe(LADO_MAXIMO)
    expect(p.altura).toBe(1500)
  })

  it('retrato também respeita o lado MAIOR', () => {
    const p = planoDeImagem('image/jpeg', { largura: 3024, altura: 4032 })
    expect(p.acao).toBe('reduzir')
    expect(p.altura).toBe(LADO_MAXIMO)
    expect(p.largura).toBe(1500)
  })

  it('foto pequena que pode ter EXIF é reencodada mesmo sem reduzir', () => {
    // Privacidade, nao bytes: e aqui que o GPS sai.
    for (const m of ['image/jpeg', 'image/heic', 'image/heif', 'image/webp']) {
      const p = planoDeImagem(m, { largura: 800, altura: 600 })
      expect(p.acao, m).toBe('reencodar')
      expect(p.porque).toBe('remover_exif')
      expect(podeTerExif(m)).toBe(true)
    }
  })

  it('PNG pequeno fica como está — reencodar só pioraria', () => {
    const p = planoDeImagem('image/png', { largura: 800, altura: 600 })
    expect(p.acao).toBe('preservar')
    expect(podeTerExif('image/png')).toBe(false)
  })

  it('GIF NUNCA é reencodado: perderia a animação', () => {
    expect(planoDeImagem('image/gif', { largura: 800, altura: 600 }).acao).toBe('preservar')
    // Nem quando e grande — perder a animacao seria pior que o peso.
    const grande = planoDeImagem('image/gif', { largura: 5000, altura: 5000 })
    expect(grande.acao).toBe('preservar')
    expect(grande.porque).toBe('gif_animacao')
  })

  it('dimensaoAlvo reduz, nunca amplia', () => {
    expect(dimensaoAlvo(4000, 2000, 2000)).toEqual({ largura: 2000, altura: 1000 })
    expect(dimensaoAlvo(800, 600, 2000)).toEqual({ largura: 800, altura: 600 })
    expect(dimensaoAlvo(0, 0, 2000)).toEqual({ largura: 0, altura: 0 })
    // Nunca devolve zero por arredondamento: 1px continua sendo uma imagem.
    expect(dimensaoAlvo(10000, 1, 2000).altura).toBe(1)
  })
})

describe('anexoPolitica — atalhos', () => {
  it('ehAceito, ehImagem e ehHeic respondem pela allowlist', () => {
    expect(ehAceito('image/png')).toBe(true)
    expect(ehAceito('image/svg+xml')).toBe(false)
    expect(ehImagem('image/heic')).toBe(true)
    expect(ehImagem('application/pdf')).toBe(false)
    expect(ehHeic('image/heic')).toBe(true)
    expect(ehHeic('IMAGE/HEIF')).toBe(true)
    expect(ehHeic('image/jpeg')).toBe(false)
  })
})

// ===========================================================================
// UX-M2.3 — AS DUAS LISTAS, E A DISTANCIA ENTRE ELAS
// ===========================================================================
describe('anexoPolitica — escolher não é o mesmo que guardar', () => {
  it('são 25 formatos escolhíveis e 23 guardáveis', () => {
    expect(MIMES_ACEITOS).toHaveLength(25)
    expect(MIMES_NO_BUCKET).toHaveLength(23)
  })

  it('a diferença são exatamente HEIC e HEIF', () => {
    const fora = MIMES_ACEITOS.filter((m) => !MIMES_NO_BUCKET.includes(m))
    expect(fora.sort()).toEqual(['image/heic', 'image/heif'])
    expect(SO_CONVERTIDO.sort()).toEqual(['image/heic', 'image/heif'])
  })

  it('HEIC pode ser ESCOLHIDO mas não pode ser GUARDADO', () => {
    // A porta de entrada aceita — e preciso aceitar para poder converter.
    expect(validarArquivo(arq('image/heic')).ok).toBe(true)
    // O destino recusa: o original ainda tem o GPS dentro.
    expect(podeSubir('image/heic')).toBe(false)
    expect(podeSubir('image/heif')).toBe(false)
    // Convertido, passa.
    expect(podeSubir('image/jpeg')).toBe(true)
  })

  it('podeSubir normaliza antes de decidir', () => {
    expect(podeSubir('  IMAGE/JPEG ')).toBe(true)
    expect(podeSubir('text/plain; charset=utf-8')).toBe(true)
    expect(podeSubir('image/svg+xml')).toBe(false)
    expect(podeSubir('')).toBe(false)
  })

  it('os formatos de áudio do iPhone entraram', () => {
    for (const m of ['audio/x-m4a', 'audio/mp3', 'audio/wave']) {
      expect(validarArquivo(arq(m)).ok, m).toBe(true)
      expect(podeSubir(m), m).toBe(true)
      expect(kindDe(m), m).toBe('audio')
    }
  })

  it('o teto do cliente e o do bucket são o MESMO número', () => {
    // Se divergirem, um arquivo passa aqui e morre na rede — ou pior, passa na
    // rede e e recusado aqui, e ninguem entende por que.
    expect(MAX_BYTES).toBe(MAX_BYTES_BUCKET)
    expect(MAX_BYTES_BUCKET).toBe(10485760)
  })
})

describe('anexoPolitica — validade da URL assinada', () => {
  const AGORA = 1_800_000_000_000

  it('uma hora é o prazo, e 60s é a margem', () => {
    expect(EXPIRACAO_URL_SEGUNDOS).toBe(3600)
    expect(MARGEM_RENOVACAO_SEGUNDOS).toBe(60)
  })

  it('válida enquanto falta mais que a margem', () => {
    expect(urlExpirada(AGORA + 10 * 60 * 1000, AGORA)).toBe(false)
  })

  it('vencida quando já passou', () => {
    expect(urlExpirada(AGORA - 1, AGORA)).toBe(true)
  })

  it('tratada como vencida DENTRO da margem — renova antes de quebrar', () => {
    expect(urlExpirada(AGORA + 59 * 1000, AGORA)).toBe(true)
    expect(urlExpirada(AGORA + 61 * 1000, AGORA)).toBe(false)
  })

  it('sem prazo, ou com prazo ilegível, trata como vencida', () => {
    // O erro seguro e renovar a toa, nunca exibir imagem quebrada.
    expect(urlExpirada(null, AGORA)).toBe(true)
    expect(urlExpirada(undefined, AGORA)).toBe(true)
    expect(urlExpirada('amanhã', AGORA)).toBe(true)
    expect(urlExpirada(0, AGORA)).toBe(true)
  })

  it('aceita ISO além de epoch', () => {
    expect(urlExpirada(new Date(AGORA + 3600 * 1000).toISOString(), AGORA)).toBe(false)
  })
})
