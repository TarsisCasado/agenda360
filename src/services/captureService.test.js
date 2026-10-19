import { describe, it, expect, beforeEach, vi } from 'vitest'

// MODO DEMO: services reais sobre localStore (upload -> data-URL local).
vi.mock('../lib/supabaseClient', () => ({ supabase: null, isSupabaseConfigured: false }))
vi.mock('./logService', () => ({
  logService: { record: vi.fn().mockResolvedValue(null), list: vi.fn() },
}))

import { captureService } from './captureService'
import { captureAssetService } from './captureAssetService'
import { inboxService } from './inboxService'
import { inboxAttachmentService } from './inboxAttachmentService'
import { localStore } from './localStore'

beforeEach(() => {
  const store = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  })
  vi.restoreAllMocks()
})

const WS = '00000000-0000-4000-8000-0000000000b1'
const USER = '00000000-0000-4000-8000-000000000001'
const photo = () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' })

// Contadores das tabelas relevantes (para provar "sem orfaos").
const counts = () => ({
  items: localStore.table('inbox_items').length,
  atts: localStore.table('inbox_attachments').length,
  blobs: localStore.table('capture_asset_blobs').length,
})

describe('captureService — orquestracao (demo)', () => {
  it('sucesso: cria item + descritor + binario e retorna a captura unica', async () => {
    const cap = await captureService.capture(WS, USER, { file: photo(), channel: 'photo' })
    expect(cap.id).toBeTruthy()
    expect(cap.channel).toBe('photo')
    expect(cap.item.id).toBe(cap.id) // InboxItem usa o id pre-gerado
    expect(cap.item.status).toBe('inbox')
    expect(cap.attachment.inbox_item_id).toBe(cap.id)
    expect(cap.attachment.kind).toBe('image')
    expect(cap.attachment.storage_bucket).toBe('captures')
    // persistido de verdade
    expect(counts()).toEqual({ items: 1, atts: 1, blobs: 1 })
    // binario recuperavel
    expect(await captureAssetService.getViewUrl(cap.attachment)).toMatch(/^data:image\/png/)
    // descritor listavel pelo item
    expect(await inboxAttachmentService.listByInboxItem(WS, cap.id)).toHaveLength(1)
  })

  it('canal photo persiste InboxItem.origin = photo', async () => {
    const cap = await captureService.capture(WS, USER, { file: photo(), channel: 'photo' })
    expect(cap.item.origin).toBe('photo')
  })

  it('rejeita canal ainda nao suportado nesta etapa (ex.: pdf)', async () => {
    await expect(captureService.capture(WS, USER, { file: photo(), channel: 'pdf' }))
      .rejects.toThrow(/nao suportado/i)
    expect(counts()).toEqual({ items: 0, atts: 0, blobs: 0 })
  })

  it('validacao: rejeita canal invalido, arquivo invalido e ids ausentes', async () => {
    await expect(captureService.capture(WS, USER, { file: photo(), channel: 'nope' })).rejects.toThrow(/canal/i)
    await expect(captureService.capture(WS, USER, { file: null, channel: 'photo' })).rejects.toThrow(/arquivo/i)
    await expect(captureService.capture(null, USER, { file: photo(), channel: 'photo' })).rejects.toThrow(/workspaceId/)
    await expect(captureService.capture(WS, null, { file: photo(), channel: 'photo' })).rejects.toThrow(/userId/)
    expect(counts()).toEqual({ items: 0, atts: 0, blobs: 0 }) // nada criado
  })
})

describe('captureService — compensacao (sem orfaos)', () => {
  it('upload falha: nao cria InboxItem nem descritor (nada a compensar)', async () => {
    vi.spyOn(captureAssetService, 'upload').mockRejectedValueOnce(new Error('storage indisponivel'))
    await expect(captureService.capture(WS, USER, { file: photo(), channel: 'photo' }))
      .rejects.toThrow('storage indisponivel')
    expect(counts()).toEqual({ items: 0, atts: 0, blobs: 0 })
  })

  it('InboxItem falha: remove o binario (sem item, sem descritor, sem blob)', async () => {
    const removeSpy = vi.spyOn(captureAssetService, 'remove')
    vi.spyOn(inboxService, 'create').mockRejectedValueOnce(new Error('inbox indisponivel'))
    await expect(captureService.capture(WS, USER, { file: photo(), channel: 'photo' }))
      .rejects.toThrow('inbox indisponivel')
    expect(removeSpy).toHaveBeenCalledTimes(1) // binario removido
    expect(counts()).toEqual({ items: 0, atts: 0, blobs: 0 })
  })

  it('descritor falha: remove InboxItem e binario (compensacao completa)', async () => {
    const removeAsset = vi.spyOn(captureAssetService, 'remove')
    const removeItem = vi.spyOn(inboxService, 'remove')
    vi.spyOn(inboxAttachmentService, 'create').mockRejectedValueOnce(new Error('descritor indisponivel'))
    await expect(captureService.capture(WS, USER, { file: photo(), channel: 'photo' }))
      .rejects.toThrow('descritor indisponivel')
    expect(removeItem).toHaveBeenCalledTimes(1) // InboxItem desfeito
    expect(removeAsset).toHaveBeenCalledTimes(1) // binario removido
    expect(counts()).toEqual({ items: 0, atts: 0, blobs: 0 }) // nenhum orfao
  })

  it('compensacao best-effort nao mascara o erro original', async () => {
    vi.spyOn(inboxAttachmentService, 'create').mockRejectedValueOnce(new Error('erro original'))
    // mesmo se a limpeza falhar, o erro original e propagado
    vi.spyOn(captureAssetService, 'remove').mockRejectedValueOnce(new Error('cleanup falhou'))
    await expect(captureService.capture(WS, USER, { file: photo(), channel: 'photo' }))
      .rejects.toThrow('erro original')
  })
})

// ---------------------------------------------------------------------------
// UX-M1 — A LEITURA. Mesma garantia de sempre do dominio Capture: quem exibe
// nao fala com bucket nem com tabela, fala com este servico. E, sobretudo:
// LER NAO ESCREVE.
// ---------------------------------------------------------------------------
describe('captureService — leitura de anexos (UX-M1)', () => {
  it('traz os descritores de varios itens numa consulta so', async () => {
    const a = await captureService.capture(WS, USER, { file: photo(), channel: 'photo' })
    const b = await captureService.capture(WS, USER, { file: photo(), channel: 'photo' })
    const mapa = await captureService.anexosDeItens(WS, [a.id, b.id])
    expect(Object.keys(mapa).sort()).toEqual([a.id, b.id].sort())
    expect(mapa[a.id]).toHaveLength(1)
    expect(mapa[a.id][0].storage_bucket).toBe('captures')
  })

  it('ler nao cria, nao altera e nao remove nada', async () => {
    const a = await captureService.capture(WS, USER, { file: photo(), channel: 'photo' })
    const antes = counts()
    await captureService.anexosDeItens(WS, [a.id])
    await captureService.urlDeAnexo((await captureService.anexosDeItens(WS, [a.id]))[a.id][0])
    expect(counts()).toEqual(antes)
  })

  it('devolve a URL de exibicao do binario guardado', async () => {
    const a = await captureService.capture(WS, USER, { file: photo(), channel: 'photo' })
    const [descritor] = (await captureService.anexosDeItens(WS, [a.id]))[a.id]
    expect(await captureService.urlDeAnexo(descritor)).toMatch(/^data:image\/png;base64,/)
  })

  // A razao de existir do `try/catch`: a migration 0009 e de execucao MANUAL,
  // entao o ambiente pode legitimamente nao ter a tabela nem o bucket. Um
  // anexo que nao abre nao pode derrubar a leitura do que estava escrito ao
  // lado dele.
  it('URL indisponivel vira null, nao excecao', async () => {
    vi.spyOn(captureAssetService, 'getViewUrl').mockRejectedValueOnce(new Error('bucket ausente'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await captureService.urlDeAnexo({ storage_path: 'x/y.png' })).toBe(null)
  })

  it('sem workspace, devolve mapa vazio sem consultar nada', async () => {
    const consulta = vi.spyOn(inboxAttachmentService, 'mapByInboxItems')
    expect(await captureService.anexosDeItens(null, ['qualquer'])).toEqual({})
    expect(consulta).not.toHaveBeenCalled()
  })
})

// ===========================================================================
// UX-M2.3 — ANEXAR A UM ITEM QUE JA EXISTE.
//
// O que separa isto de `capture()` e o que mais importa: a nota JA EXISTE e
// tem de sair ilesa. Varios testes abaixo conferem o conteudo original DEPOIS
// da operacao, porque "preservar o conteudo" e verificavel, nao declaravel.
// ===========================================================================
import { inboxAttachmentService as anexos } from './inboxAttachmentService'
import { localStore as store } from './localStore'
import { MIMES_NO_BUCKET, MAX_BYTES } from '../lib/anexoPolitica'

const png = (bytes) => new Blob([new Uint8Array(bytes)], { type: 'image/png' })
// PNG 1x1 real, com CRC valido — o limpador recusa qualquer coisa malformada.
const PNG_LIMPO = [
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0, 0x90, 0x77, 0x53, 0xde,
  0, 0, 0, 9, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x62, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01,
  0x0b, 0xe7, 0x02, 0xfe,
  0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]
// O mesmo PNG com um bloco eXIf (onde mora o GPS) enfiado depois do IHDR.
const PNG_COM_GPS = [
  ...PNG_LIMPO.slice(0, 33),
  0, 0, 0, 8, 0x65, 0x58, 0x49, 0x66, 0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
  0x4a, 0x4a, 0x4a, 0x4a,
  ...PNG_LIMPO.slice(33),
]

async function criarNota(titulo = 'Proposta do cliente', conteudo = 'trouxe no balcao') {
  const nota = await inboxService.create(WS, USER, { title: titulo, content: conteudo })
  return nota
}

describe('captureService — anexarAItem (demo)', () => {
  it('anexa a uma nota existente SEM criar outra nota', async () => {
    const nota = await criarNota()
    const antes = store.table('inbox_items').length

    const r = await captureService.anexarAItem(WS, USER, { inboxItemId: nota.id, file: png(PNG_LIMPO) })

    expect(r.attachment.inbox_item_id).toBe(nota.id)
    expect(store.table('inbox_items')).toHaveLength(antes) // nenhuma nota nova
    expect(counts().atts).toBe(1)
    expect(counts().blobs).toBe(1)
  })

  it('o conteúdo original da nota sai ILESO', async () => {
    const nota = await criarNota('Padrão de preparação', 'checklist assinado por quem entrega')
    await captureService.anexarAItem(WS, USER, { inboxItemId: nota.id, file: png(PNG_LIMPO) })

    const depois = await inboxService.get(WS, nota.id)
    expect(depois.title).toBe('Padrão de preparação')
    expect(depois.content).toBe('checklist assinado por quem entrega')
    expect(depois.status).toBe(nota.status)
    expect(depois.type).toBe(nota.type)
  })

  it('o descritor guarda dimensões e bucket certos', async () => {
    const nota = await criarNota()
    const r = await captureService.anexarAItem(WS, USER, { inboxItemId: nota.id, file: png(PNG_LIMPO) })
    expect(r.attachment.storage_bucket).toBe('captures')
    expect(r.attachment.storage_path.startsWith(`${WS}/${nota.id}/`)).toBe(true)
    expect(r.attachment.kind).toBe('image')
  })

  it('o PNG chega ao armazenamento SEM o bloco de GPS', async () => {
    const nota = await criarNota()
    const r = await captureService.anexarAItem(WS, USER, { inboxItemId: nota.id, file: png(PNG_COM_GPS) })
    expect(r.removidos).toEqual(['eXIf'])

    // Prova nos BYTES guardados, nao no relatorio da funcao.
    const url = await captureService.urlDeAnexo(r.attachment)
    const guardado = atob(url.split(',')[1])
    expect(guardado.includes('eXIf')).toBe(false)
    expect(guardado.includes('IHDR')).toBe(true)
    expect(guardado.includes('IDAT')).toBe(true)
  })
})

describe('captureService — anexarAItem: o destino', () => {
  it('recusa item INEXISTENTE sem enviar nada', async () => {
    await expect(
      captureService.anexarAItem(WS, USER, { inboxItemId: 'nao-existe', file: png(PNG_LIMPO) }),
    ).rejects.toThrow(/não encontrei esta nota/i)
    expect(counts()).toEqual({ items: 0, atts: 0, blobs: 0 })
  })

  it('recusa item de OUTRO workspace — e não revela que ele existe', async () => {
    const OUTRO = '00000000-0000-4000-8000-0000000000b2'
    const alheia = await inboxService.create(OUTRO, USER, { title: 'Segredo do outro espaço' })
    const antes = counts()

    await expect(
      captureService.anexarAItem(WS, USER, { inboxItemId: alheia.id, file: png(PNG_LIMPO) }),
    ).rejects.toThrow(/não encontrei esta nota/i)   // mesma frase do inexistente

    expect(counts().atts).toBe(antes.atts)
    expect(counts().blobs).toBe(antes.blobs)
  })

  it('exige workspace, usuário, item e arquivo', async () => {
    const f = png(PNG_LIMPO)
    await expect(captureService.anexarAItem(null, USER, { inboxItemId: 'x', file: f })).rejects.toThrow(/workspaceId/)
    await expect(captureService.anexarAItem(WS, null, { inboxItemId: 'x', file: f })).rejects.toThrow(/userId/)
    await expect(captureService.anexarAItem(WS, USER, { file: f })).rejects.toThrow(/inboxItemId/)
    await expect(captureService.anexarAItem(WS, USER, { inboxItemId: 'x' })).rejects.toThrow(/Arquivo invalido/)
  })
})

describe('captureService — anexarAItem: o que não entra', () => {
  it('MIME fora da allowlist é recusado antes de qualquer rede', async () => {
    const nota = await criarNota()
    for (const mime of ['image/svg+xml', 'text/html', 'application/x-msdownload']) {
      await expect(
        captureService.anexarAItem(WS, USER, {
          inboxItemId: nota.id,
          file: new Blob([new Uint8Array([1, 2, 3])], { type: mime }),
        }),
      ).rejects.toThrow(/não pode ser anexado/i)
    }
    expect(counts().atts).toBe(0)
    expect(counts().blobs).toBe(0)
  })

  it('arquivo acima de 10 MiB é recusado', async () => {
    const nota = await criarNota()
    const gigante = {
      type: 'application/pdf',
      size: MAX_BYTES + 1,
      arrayBuffer: vi.fn(async () => new ArrayBuffer(0)),
    }
    await expect(
      captureService.anexarAItem(WS, USER, { inboxItemId: nota.id, file: gigante }),
    ).rejects.toThrow(/limite/i)
    expect(gigante.arrayBuffer).not.toHaveBeenCalled()  // nem foi aberto
    expect(counts().blobs).toBe(0)
  })

  it('HEIC que o navegador NÃO converteu é recusado, com saída sugerida', async () => {
    // Em node nao ha canvas: `prepararAnexo` nao decodifica e o HEIC continua
    // HEIC — exatamente o cenario do Chrome no desktop.
    const nota = await criarNota()
    const heic = new Blob([new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70])], { type: 'image/heic' })
    await expect(
      captureService.anexarAItem(WS, USER, { inboxItemId: nota.id, file: heic }),
    ).rejects.toThrow(/não consegue convertê-la/i)
    expect(counts().blobs).toBe(0)
  })

  it('PNG corrompido é recusado — não sobe "assim mesmo"', async () => {
    const nota = await criarNota()
    const quebrado = png([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xff, 0xff, 0xff])
    await expect(
      captureService.anexarAItem(WS, USER, { inboxItemId: nota.id, file: quebrado }),
    ).rejects.toThrow(/incompleto ou corrompido/i)
    expect(counts().blobs).toBe(0)
  })

  it('a nota continua intacta depois de toda recusa', async () => {
    const nota = await criarNota('Intacta', 'conteúdo que ninguém tocou')
    const tentativas = [
      new Blob([new Uint8Array([1])], { type: 'text/html' }),
      new Blob([new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70])], { type: 'image/heic' }),
      png([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xff, 0xff, 0xff]),
    ]
    for (const f of tentativas) {
      await captureService.anexarAItem(WS, USER, { inboxItemId: nota.id, file: f }).catch(() => {})
    }
    const depois = await inboxService.get(WS, nota.id)
    expect(depois.title).toBe('Intacta')
    expect(depois.content).toBe('conteúdo que ninguém tocou')
  })
})

describe('captureService — anexarAItem: compensação', () => {
  it('descritor falha => o binário é removido e não sobra órfão', async () => {
    const nota = await criarNota()
    const removeAsset = vi.spyOn(captureAssetService, 'remove')
    vi.spyOn(anexos, 'create').mockRejectedValueOnce(new Error('descritor indisponivel'))

    await expect(
      captureService.anexarAItem(WS, USER, { inboxItemId: nota.id, file: png(PNG_LIMPO) }),
    ).rejects.toThrow('descritor indisponivel')

    expect(removeAsset).toHaveBeenCalledTimes(1)
    expect(counts().atts).toBe(0)
    expect(counts().blobs).toBe(0)
    // E a nota, que ja existia, continua la.
    expect(await inboxService.get(WS, nota.id)).not.toBeNull()
  })

  it('upload falha => nada a desfazer, e nada sobra', async () => {
    const nota = await criarNota()
    vi.spyOn(captureAssetService, 'upload').mockRejectedValueOnce(new Error('rede caiu'))
    await expect(
      captureService.anexarAItem(WS, USER, { inboxItemId: nota.id, file: png(PNG_LIMPO) }),
    ).rejects.toThrow('rede caiu')
    expect(counts().atts).toBe(0)
    expect(counts().blobs).toBe(0)
  })

  it('a compensação best-effort não mascara o erro original', async () => {
    const nota = await criarNota()
    vi.spyOn(anexos, 'create').mockRejectedValueOnce(new Error('erro original'))
    vi.spyOn(captureAssetService, 'remove').mockRejectedValueOnce(new Error('limpeza falhou'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(
      captureService.anexarAItem(WS, USER, { inboxItemId: nota.id, file: png(PNG_LIMPO) }),
    ).rejects.toThrow('erro original')
  })
})

describe('captureService — remover anexo', () => {
  it('remove o anexo e a nota SOBREVIVE', async () => {
    const nota = await criarNota('Fica', 'o texto continua aqui')
    const { attachment } = await captureService.anexarAItem(WS, USER, {
      inboxItemId: nota.id, file: png(PNG_LIMPO),
    })
    expect(counts()).toMatchObject({ atts: 1, blobs: 1 })

    const r = await captureService.removerAnexo(WS, attachment)
    expect(r.removido).toBe(true)
    expect(r.orfaoPossivel).toBe(false)
    expect(counts()).toMatchObject({ atts: 0, blobs: 0 })

    const depois = await inboxService.get(WS, nota.id)
    expect(depois.title).toBe('Fica')
    expect(depois.content).toBe('o texto continua aqui')
  })

  it('NUNCA apaga objeto de outro workspace', async () => {
    const nota = await criarNota()
    const { attachment } = await captureService.anexarAItem(WS, USER, {
      inboxItemId: nota.id, file: png(PNG_LIMPO),
    })
    const remove = vi.spyOn(captureAssetService, 'remove')
    const OUTRO = '00000000-0000-4000-8000-0000000000b2'

    await expect(captureService.removerAnexo(OUTRO, attachment))
      .rejects.toThrow(/não pertence a este espaço/i)

    // Nem a linha, nem o binario, nem UMA chamada de remocao.
    expect(remove).not.toHaveBeenCalled()
    expect(counts()).toMatchObject({ atts: 1, blobs: 1 })
  })

  it('recusa descritor cujo caminho aponta para fora do workspace', async () => {
    const forjado = {
      id: 'x', workspace_id: WS, storage_bucket: 'captures',
      storage_path: '00000000-0000-4000-8000-0000000000b2/item/foto.png',
    }
    await expect(captureService.removerAnexo(WS, forjado))
      .rejects.toThrow(/não pertence a este espaço/i)
  })

  it('binário teimoso vira órfão DECLARADO, não silêncio', async () => {
    const nota = await criarNota()
    const { attachment } = await captureService.anexarAItem(WS, USER, {
      inboxItemId: nota.id, file: png(PNG_LIMPO),
    })
    vi.spyOn(captureAssetService, 'remove').mockRejectedValueOnce(new Error('storage fora do ar'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const r = await captureService.removerAnexo(WS, attachment)
    expect(r.removido).toBe(true)
    expect(r.orfaoPossivel).toBe(true)   // quem chamou fica sabendo
    expect(counts().atts).toBe(0)        // a linha saiu: nada quebrado na tela
  })
})

describe('captureService — excluir nota que tem anexos', () => {
  it('leva os binários junto, em vez de deixar lixo para sempre', async () => {
    const nota = await criarNota()
    await captureService.anexarAItem(WS, USER, { inboxItemId: nota.id, file: png(PNG_LIMPO) })
    await captureService.anexarAItem(WS, USER, { inboxItemId: nota.id, file: png(PNG_LIMPO) })
    expect(counts()).toMatchObject({ atts: 2, blobs: 2 })

    const r = await captureService.excluirItemComAnexos(WS, nota)
    expect(r).toMatchObject({ anexos: 2, binariosRemovidos: 2, binariosResistentes: 0 })
    expect(counts()).toEqual({ items: 0, atts: 0, blobs: 0 })
  })

  it('a nota sai mesmo se um binário resistir — e o órfão é contado', async () => {
    const nota = await criarNota()
    await captureService.anexarAItem(WS, USER, { inboxItemId: nota.id, file: png(PNG_LIMPO) })
    vi.spyOn(captureAssetService, 'remove').mockRejectedValueOnce(new Error('storage fora do ar'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const r = await captureService.excluirItemComAnexos(WS, nota)
    expect(r.binariosResistentes).toBe(1)
    expect(store.table('inbox_items')).toHaveLength(0)  // a nota saiu assim mesmo
  })

  it('nota sem anexo nenhum é excluída normalmente', async () => {
    const nota = await criarNota()
    const r = await captureService.excluirItemComAnexos(WS, nota)
    expect(r).toMatchObject({ anexos: 0, binariosRemovidos: 0 })
    expect(store.table('inbox_items')).toHaveLength(0)
  })
})

describe('captureService — URLs temporárias', () => {
  it('devolve a URL com a hora em que ela vence', async () => {
    const nota = await criarNota()
    const { attachment } = await captureService.anexarAItem(WS, USER, {
      inboxItemId: nota.id, file: png(PNG_LIMPO),
    })
    const antes = Date.now()
    const r = await captureService.urlDeAnexoComValidade(attachment)
    expect(r.valida).toBe(true)
    expect(r.url).toMatch(/^data:image\/png;base64,/)
    expect(r.expiraEm).toBeGreaterThanOrEqual(antes + 3600 * 1000)
  })

  it('não vai à rede quando a URL ainda vale', async () => {
    const nota = await criarNota()
    const { attachment } = await captureService.anexarAItem(WS, USER, {
      inboxItemId: nota.id, file: png(PNG_LIMPO),
    })
    const atual = { url: 'data:image/png;base64,AAA', expiraEm: Date.now() + 3600 * 1000 }
    const espia = vi.spyOn(captureAssetService, 'getViewUrl')
    const r = await captureService.renovarUrlSePreciso(attachment, atual)
    expect(r).toBe(atual)
    expect(espia).not.toHaveBeenCalled()
  })

  it('renova quando venceu — e quando está PRESTES a vencer', async () => {
    const nota = await criarNota()
    const { attachment } = await captureService.anexarAItem(WS, USER, {
      inboxItemId: nota.id, file: png(PNG_LIMPO),
    })
    const vencida = { url: 'x', expiraEm: Date.now() - 1 }
    expect((await captureService.renovarUrlSePreciso(attachment, vencida)).url).toMatch(/^data:/)
    // Dentro da margem de 60s: renova ANTES de quebrar na mão de quem olha.
    const quaseLa = { url: 'x', expiraEm: Date.now() + 10 * 1000 }
    expect((await captureService.renovarUrlSePreciso(attachment, quaseLa)).url).toMatch(/^data:/)
  })

  it('URL indisponível é reportada, não fingida', async () => {
    vi.spyOn(captureAssetService, 'getViewUrl').mockResolvedValueOnce(null)
    const r = await captureService.urlDeAnexoComValidade({ storage_path: 'x/y/z.png' })
    expect(r).toEqual({ url: null, expiraEm: null, valida: false })
  })
})

describe('captureService — compatibilidade com o bucket do UX-M2.2', () => {
  it('são exatamente 23 tipos, e HEIC/HEIF não estão entre eles', () => {
    expect(MIMES_NO_BUCKET).toHaveLength(23)
    expect(MIMES_NO_BUCKET).not.toContain('image/heic')
    expect(MIMES_NO_BUCKET).not.toContain('image/heif')
  })

  it('a lista do cliente é IDÊNTICA à configurada no bucket', () => {
    // Transcrita do `allowed_mime_types` aplicado no Supabase. Se um dia as
    // duas divergirem, este teste cai antes de alguem descobrir por um 400.
    const NO_SUPABASE = [
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'application/pdf',
      'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave',
      'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/webm', 'audio/ogg',
      'text/plain', 'text/csv',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ]
    expect([...MIMES_NO_BUCKET].sort()).toEqual([...NO_SUPABASE].sort())
  })

  it('todo tipo do bucket é de fato aceito pelo upload', async () => {
    // Os formatos COM assinatura precisam de bytes coerentes: a verificacao do
    // UX-M2.1 recusaria, com razao, um `0x00` dizendo ser JPEG. Quem nao tem
    // assinatura estavel (audio, texto, Office) passa com bytes quaisquer.
    const ASSINATURA = {
      'image/jpeg': [0xff, 0xd8, 0xff],
      'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      'image/gif': [0x47, 0x49, 0x46, 0x38],
      'image/webp': [0x52, 0x49, 0x46, 0x46],
      'application/pdf': [0x25, 0x50, 0x44, 0x46],
    }
    const nota = await criarNota()
    for (const mime of MIMES_NO_BUCKET) {
      const bytes = ASSINATURA[mime] || [0x61, 0x62, 0x63]
      const d = await captureAssetService.upload(WS, {
        inboxItemId: nota.id,
        file: new Blob([new Uint8Array(bytes)], { type: mime }),
      }).catch((e) => e)
      expect(d instanceof Error ? d.message : '', mime).toBe('')
      expect(d.mime, mime).toBe(mime)
    }
  })

  it('e nenhum tipo FORA do bucket passa', async () => {
    for (const mime of ['image/heic', 'image/heif', 'image/svg+xml', 'text/html']) {
      await expect(
        captureAssetService.upload(WS, {
          inboxItemId: 'x', file: new Blob([new Uint8Array([0x61])], { type: mime }),
        }),
        mime,
      ).rejects.toThrow()
    }
  })
})
