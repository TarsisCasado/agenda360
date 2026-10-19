import { uid } from '../lib/utils'
import { captureAssetService } from './captureAssetService'
import { inboxService } from './inboxService'
import { inboxAttachmentService } from './inboxAttachmentService'
import { prepararAnexo } from '../lib/anexoImagem'
import { EXPIRACAO_URL_SEGUNDOS, urlExpirada } from '../lib/anexoPolitica'

// ---------------------------------------------------------------------------
// captureService — ORQUESTRADOR OFICIAL do dominio Capture (composition root).
//
// E o UNICO ponto publico autorizado a criar uma captura com asset. Nenhum
// componente deve falar direto com captureAssetService / inboxService /
// inboxAttachmentService — sempre via captureService (ARCHITECTURE.md
// ADR-04/10/11). Este servico NAO conhece taskService/conversionService.
//
// Consistencia SEM transacao/RPC (decisao desta etapa): compensacao na
// APLICACAO. Ordem e desfazimento:
//   1) upload do binario           — falhou => nada a desfazer (sem InboxItem);
//   2) cria o InboxItem            — falhou => remove o binario;
//   3) persiste o descritor        — falhou => remove o InboxItem e o binario.
// Objetivo: nunca deixar orfaos.
// ---------------------------------------------------------------------------

// Canais reconhecidos (ADR glossario) — referencia do que existira no futuro.
export const CAPTURE_CHANNELS = [
  'text',
  'assistant',
  'voice',
  'photo',
  'ocr',
  'pdf',
  'audio',
  'email',
  'whatsapp',
  'google_calendar',
  'api',
  'share',
  'file',
]

// Canais efetivamente SUPORTADOS por esta etapa (com adapter + origin
// persistivel). So 'photo' agora; pdf/audio/... entram quando seus adapters e
// origins existirem. Aceitar aqui um canal que o inboxService ainda nao
// persiste causaria coercao silenciosa para 'manual' — por isso restringimos.
export const CAPTURE_CHANNELS_SUPPORTED = ['photo']

// ---------------------------------------------------------------------------
// A GUARDA DE WORKSPACE PARA O STORAGE.
//
// O caminho de um asset e `<workspace>/<item>/<arquivo>`, e a policy do bucket
// confere o primeiro segmento. Mas a policy protege o SERVIDOR; esta funcao
// protege contra o nosso proprio codigo pedir a remocao de um objeto que nao e
// deste espaco — por descritor vindo de uma lista errada, de um cache velho ou
// de um parametro trocado.
//
// Uma exclusao e irreversivel. Conferir duas vezes custa uma comparacao de
// string.
// ---------------------------------------------------------------------------
export function mesmoWorkspace(workspaceId, descriptor) {
  const caminho = String(descriptor?.storage_path || '')
  const primeiro = caminho.split('/')[0]
  return (
    !!workspaceId
    && !!primeiro
    && primeiro === String(workspaceId)
    && (descriptor.workspace_id === undefined || descriptor.workspace_id === workspaceId)
  )
}

function assertMesmoWorkspace(workspaceId, descriptor) {
  if (!mesmoWorkspace(workspaceId, descriptor)) {
    const err = new Error('Este anexo não pertence a este espaço de trabalho.')
    err.motivo = 'fora_do_workspace'
    throw err
  }
}

// Remocao best-effort: a compensacao nunca pode mascarar o erro original.
async function safeRemoveAsset(descriptor) {
  try {
    await captureAssetService.remove(descriptor)
    return true
  } catch (err) {
    console.warn('[captureService] falha ao remover asset na compensacao:', err?.message || err)
    return false
  }
}
async function safeRemoveItem(note) {
  try {
    await inboxService.remove(note)
  } catch (err) {
    console.warn('[captureService] falha ao remover InboxItem na compensacao:', err?.message || err)
  }
}

export const captureService = {
  CAPTURE_CHANNELS,

  // Cria uma captura com asset. Retorna um objeto unico representando-a.
  async capture(workspaceId, userId, { file, channel } = {}) {
    // 2) Validacao de entrada.
    if (!workspaceId) throw new Error('workspaceId obrigatorio.')
    if (!userId) throw new Error('userId obrigatorio.')
    if (!file || typeof file.arrayBuffer !== 'function') {
      throw new Error('Arquivo invalido (esperado Blob/File).')
    }
    if (!CAPTURE_CHANNELS_SUPPORTED.includes(channel)) {
      throw new Error(`Canal de captura nao suportado nesta etapa: ${channel}`)
    }

    // Pre-gera o id da captura para compor o path do asset ANTES de existir a
    // linha do InboxItem (permite a ordem upload -> item -> descritor).
    const inboxItemId = uid()

    // 3) Upload do binario. Se falhar, propaga sem criar nada mais.
    const descriptor = await captureAssetService.upload(workspaceId, { inboxItemId, file })

    // 4) Cria o InboxItem (usando o id pre-gerado). Se falhar, remove o binario.
    let item
    try {
      // Persiste explicitamente a origem = canal da captura (reusa
      // inbox_items.origin; nenhum campo novo no banco).
      item = await inboxService.create(workspaceId, userId, { id: inboxItemId, type: 'note', origin: channel })
    } catch (err) {
      await safeRemoveAsset(descriptor)
      throw err
    }

    // 5) Persiste o descritor. Se falhar, remove InboxItem e binario.
    let attachment
    try {
      attachment = await inboxAttachmentService.create(workspaceId, userId, {
        inbox_item_id: inboxItemId,
        ...descriptor,
      })
    } catch (err) {
      await safeRemoveItem(item)
      await safeRemoveAsset(descriptor)
      throw err
    }

    // 6) Objeto unico da captura criada.
    return { id: inboxItemId, workspaceId, channel, item, attachment }
  },

  // -------------------------------------------------------------------------
  // LEITURA (UX-M1). Nada abaixo grava, envia ou remove nada.
  //
  // Por que mora AQUI e nao na tela: exibir um asset exige DUAS pecas — o
  // descritor (inboxAttachmentService) e a URL de visualizacao
  // (captureAssetService, assinada no Supabase e data-URL no demo). Compor as
  // duas e exatamente o papel deste servico (ADR-04/10/11). Uma tela que
  // falasse direto com os dois passaria a conhecer bucket e path, que sao
  // detalhe de armazenamento.
  // -------------------------------------------------------------------------

  // Descritores de varios InboxItems de uma vez: { inbox_item_id: [...] }.
  // Uma leitura, nao N.
  async anexosDeItens(workspaceId, inboxItemIds = []) {
    if (!workspaceId) return {}
    return inboxAttachmentService.mapByInboxItems(workspaceId, inboxItemIds)
  },

  // URL de visualizacao de UM asset. Deliberadamente sob demanda: no Supabase
  // cada URL assinada e uma ida a rede, entao gerar as de uma lista inteira ao
  // abrir a tela custaria dezenas de chamadas para imagens que ninguem olhou.
  // Quem abre o item paga por ele.
  //
  // Devolve null em vez de lancar: um anexo que nao abre nao pode derrubar a
  // leitura do que estava escrito ao lado dele.
  async urlDeAnexo(descriptor) {
    try {
      return await captureAssetService.getViewUrl(descriptor)
    } catch (err) {
      console.warn('[captureService] falha ao obter URL do anexo:', err?.message || err)
      return null
    }
  },

  // A MESMA URL, com a hora em que ela morre (UX-M2.3).
  //
  // A assinada do Storage vale uma hora. Quem deixa o detalhe aberto mais que
  // isso ve a imagem parar de carregar, e o componente nao tem como saber por
  // que. Devolver o prazo junto permite renovar ANTES de quebrar — e
  // `urlExpirada` (puro, em anexoPolitica) decide com margem, porque o relogio
  // do aparelho nao bate com o do servidor.
  //
  // `urlDeAnexo` continua devolvendo string: e contrato publico desde o UX-M1
  // e duas telas dependem dele.
  async urlDeAnexoComValidade(descriptor, { expiresIn = EXPIRACAO_URL_SEGUNDOS, baixar = false } = {}) {
    const pedidaEm = Date.now()
    let url = null
    try {
      url = await captureAssetService.getViewUrl(descriptor, { expiresIn, baixar })
    } catch (err) {
      console.warn('[captureService] falha ao obter URL do anexo:', err?.message || err)
    }
    if (!url) return { url: null, expiraEm: null, valida: false }
    return {
      url,
      expiraEm: pedidaEm + expiresIn * 1000,
      valida: true,
    }
  },

  // Conveniencia para o componente: so vai a rede se de fato precisar.
  async renovarUrlSePreciso(descriptor, atual, opcoes = {}) {
    if (atual?.url && !urlExpirada(atual.expiraEm)) return atual
    return this.urlDeAnexoComValidade(descriptor, opcoes)
  },

  // =========================================================================
  // ANEXAR A UM ITEM QUE JA EXISTE (UX-M2.3).
  //
  // A diferenca para `capture()` e o ponto inteiro desta operacao: `capture()`
  // CRIA uma nota para pendurar a foto. Aqui a nota ja existe, foi escrita por
  // alguem, e tem de continuar exatamente como estava — o anexo e uma linha em
  // outra tabela apontando para ela. Nada do conteudo original e lido,
  // reescrito ou tocado.
  //
  // ORDEM E COMPENSACAO, as mesmas do `capture()` menos um passo:
  //   1) valida o destino      — falhou => nada aconteceu;
  //   2) prepara o arquivo     — falhou => nada aconteceu (puro, sem rede);
  //   3) envia o binario       — falhou => nada a desfazer;
  //   4) grava o descritor     — falhou => remove o binario.
  //
  // O item NAO e modificado em nenhum dos quatro. Nem `updated_at`.
  // =========================================================================
  async anexarAItem(
    workspaceId, userId,
    { inboxItemId, file, preparo = {}, onEtapa, cancelado } = {},
  ) {
    // As ETAPAS sao anunciadas porque a tela precisa dizer a verdade sobre o
    // que esta acontecendo. "Preparando" e "Enviando" demoram coisas
    // diferentes — numa foto de 12 MP o preparo e o que leva tempo, no 4G e o
    // envio — e um spinner generico esconde justamente isso.
    const etapa = (nome) => { try { onEtapa?.(nome) } catch { /* a tela nao derruba o envio */ } }
    etapa('validando')
    if (!workspaceId) throw new Error('workspaceId obrigatorio.')
    if (!userId) throw new Error('userId obrigatorio.')
    if (!inboxItemId) throw new Error('inboxItemId obrigatorio.')
    if (!file || typeof file.arrayBuffer !== 'function') {
      throw new Error('Arquivo invalido (esperado Blob/File).')
    }

    // 1) O DESTINO. `get` e escopado por workspace, entao um id de outro
    // espaco responde igual a um id que nao existe: "nao encontrei". Quem nao
    // pode ver nao descobre que existe.
    const item = await inboxService.get(workspaceId, inboxItemId)
    if (!item) {
      const err = new Error('Não encontrei esta nota para anexar o arquivo.')
      err.motivo = 'item_inexistente'
      throw err
    }

    // 2) PREPARO. Tira metadado, encolhe foto, recusa HEIC nao convertido e
    // PNG corrompido. Puro o suficiente para falhar antes de qualquer rede.
    etapa('preparando')
    const pronto = await prepararAnexo(file, preparo)
    if (!pronto.ok) {
      const err = new Error(pronto.mensagem)
      err.motivo = pronto.motivo
      throw err
    }

    // 3) BINARIO. `upload` revalida tipo, tamanho e assinatura sobre o arquivo
    // JA PREPARADO — que e outro arquivo, com outro tamanho e as vezes outro
    // tipo. Validar so a entrada deixaria passar o que o preparo produziu.
    // DESISTIR AINDA E POSSIVEL AQUI, e so aqui. Ate este ponto nada saiu da
    // maquina: validar e preparar sao puros. Um passo adiante o binario ja
    // viajou, e "cancelar" passaria a significar apagar o que acabou de subir
    // — que e como se FABRICA orfao, nao como se evita.
    if (cancelado?.()) return { cancelado: true, attachment: null, item }

    etapa('enviando')
    const descriptor = await captureAssetService.upload(workspaceId, {
      inboxItemId,
      file: pronto.arquivo,
    })

    // 4) DESCRITOR. Se falhar, o binario sai — senao fica um orfao invisivel.
    etapa('gravando')
    let attachment
    try {
      attachment = await inboxAttachmentService.create(workspaceId, userId, {
        inbox_item_id: inboxItemId,
        ...descriptor,
        width: pronto.largura || null,
        height: pronto.altura || null,
      })
    } catch (err) {
      await safeRemoveAsset(descriptor)
      throw err
    }

    etapa('pronto')
    return {
      attachment,
      item,
      convertida: !!pronto.convertida,
      removidos: pronto.removidos || [],
      aviso: pronto.aviso || '',
    }
  },

  // =========================================================================
  // REMOVER UM ANEXO — sem encostar na nota.
  //
  // A ORDEM E DELIBERADA: linha primeiro, binario depois.
  //
  // Se o binario falhar depois da linha, sobra um arquivo orfao: invisivel,
  // barato, e removivel depois. Se fosse o contrario, sobraria uma LINHA
  // apontando para o nada — isto e, um anexo quebrado na tela de quem confiou
  // que estava guardado. Desperdicar bytes e melhor que exibir ruina.
  // =========================================================================
  async removerAnexo(workspaceId, descriptor) {
    if (!workspaceId) throw new Error('workspaceId obrigatorio.')
    if (!descriptor?.id) throw new Error('descritor de anexo invalido.')

    assertMesmoWorkspace(workspaceId, descriptor)

    await inboxAttachmentService.remove(workspaceId, descriptor.id)
    const binarioSaiu = await safeRemoveAsset(descriptor)
    // `orfaoPossivel` nao e detalhe interno: e a diferenca entre "sumiu" e
    // "sumiu da tela, mas ainda ocupa espaco". Quem chama merece saber.
    return { removido: true, orfaoPossivel: !binarioSaiu }
  },

  // =========================================================================
  // EXCLUIR UMA NOTA QUE TEM ANEXOS.
  //
  // O PROBLEMA QUE ISTO RESOLVE, e que estava documentado em
  // `inboxService.js`: a FK `on delete cascade` apaga o DESCRITOR quando a
  // nota some, e o binario fica no bucket para sempre, sem nada que o
  // referencie. Enquanto nada subia, era teoria. A partir do momento em que
  // anexar existe, toda nota apagada com foto deixaria lixo permanente.
  //
  // Binarios primeiro, nota depois. Se um binario resistir, a exclusao da nota
  // SEGUE: a pessoa pediu para apagar a nota, e um arquivo teimoso no bucket
  // nao pode impedir isso. O que nao se faz e varrer o bucket por conta
  // propria — nenhuma rotina destrutiva em lote mora aqui.
  // =========================================================================
  async excluirItemComAnexos(workspaceId, note) {
    if (!workspaceId) throw new Error('workspaceId obrigatorio.')
    if (!note?.id) throw new Error('nota invalida.')

    const mapa = await inboxAttachmentService
      .mapByInboxItems(workspaceId, [note.id])
      .catch(() => ({}))
    const anexos = mapa[note.id] || []

    let binariosRemovidos = 0
    let binariosResistentes = 0
    for (const a of anexos) {
      // Mesma guarda do remover: nunca apagar objeto de outro workspace, nem
      // que o descritor diga o contrario.
      if (!mesmoWorkspace(workspaceId, a)) continue
      if (await safeRemoveAsset(a)) binariosRemovidos += 1
      else binariosResistentes += 1
    }

    // A nota sai de qualquer jeito: foi isso que a pessoa pediu. Um binario
    // teimoso vira orfao conhecido, nao uma exclusao que nao aconteceu.
    await inboxService.remove(note)
    return { anexos: anexos.length, binariosRemovidos, binariosResistentes }
  },
}
