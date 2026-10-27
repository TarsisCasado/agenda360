import { describe, it, expect } from 'vitest'
import { MAX_NOME, nomeDeArquivoSeguro, urlComDownload } from './anexoNome'

// ---------------------------------------------------------------------------
// O NOME DO ARQUIVO BAIXADO.
//
// Este nome viaja num cabecalho HTTP (`Content-Disposition`) e depois no
// sistema de arquivos do aparelho. As tres coisas que nao podem passar sao
// separador de caminho, quebra de linha e nome vazio — e e isso que a maior
// parte destes testes afirma.
// ---------------------------------------------------------------------------
describe('nomeDeArquivoSeguro', () => {
  it('usa o titulo da nota, sem acento, com a extensao do mime', () => {
    expect(nomeDeArquivoSeguro('Reunião com o contador', 'image/jpeg'))
      .toBe('Reuniao-com-o-contador.jpg')
    expect(nomeDeArquivoSeguro('Contrato final', 'application/pdf'))
      .toBe('Contrato-final.pdf')
  })

  it('nunca devolve separador de caminho — nem disfarçado', () => {
    for (const perigoso of [
      '../../etc/passwd',
      'pasta/arquivo',
      'pasta\\arquivo',
      '..',
      '../..',
    ]) {
      const nome = nomeDeArquivoSeguro(perigoso, 'image/jpeg')
      expect(nome).not.toMatch(/[/\\]/)
      expect(nome.startsWith('.')).toBe(false)
    }
  })

  it('nunca devolve quebra de linha, que partiria o cabeçalho HTTP em dois', () => {
    const nome = nomeDeArquivoSeguro('nota\r\nContent-Disposition: inline', 'image/jpeg')
    expect(nome).not.toMatch(/[\r\n]/)
  })

  it('título vazio, só emoji ou só pontuação vira um nome genérico utilizável', () => {
    expect(nomeDeArquivoSeguro('', 'image/jpeg')).toBe('anexo.jpg')
    expect(nomeDeArquivoSeguro('   ', 'image/jpeg')).toBe('anexo.jpg')
    expect(nomeDeArquivoSeguro('🙂🙂🙂', 'image/jpeg')).toBe('anexo.jpg')
    expect(nomeDeArquivoSeguro('...', 'image/jpeg')).toBe('anexo.jpg')
    expect(nomeDeArquivoSeguro(null, 'image/jpeg')).toBe('anexo.jpg')
    expect(nomeDeArquivoSeguro(undefined, 'application/pdf')).toBe('anexo.pdf')
  })

  it('corta título longo e não deixa o corte terminar em hífen', () => {
    const nome = nomeDeArquivoSeguro('a'.repeat(300), 'image/jpeg')
    expect(nome.length).toBeLessThanOrEqual(MAX_NOME + 4)
    expect(nome.endsWith('.jpg')).toBe(true)

    const comHifen = nomeDeArquivoSeguro('x'.repeat(MAX_NOME - 1) + ' y', 'image/jpeg')
    expect(comHifen).not.toMatch(/-\.jpg$/)
  })

  it('não duplica a extensão quando o título já termina nela', () => {
    expect(nomeDeArquivoSeguro('foto.jpg', 'image/jpeg')).toBe('foto.jpg')
    expect(nomeDeArquivoSeguro('FOTO.JPG', 'image/jpeg')).toBe('FOTO.JPG')
  })

  it('mime desconhecido ainda produz nome — com a extensão genérica', () => {
    expect(nomeDeArquivoSeguro('coisa', 'application/x-sei-la')).toBe('coisa.bin')
  })
})

// ---------------------------------------------------------------------------
// A URL QUE BAIXA.
//
// O contrato que importa: ela e a MESMA URL assinada, com um parametro a mais.
// Se algum dia este teste passar a aceitar uma URL sem token, a correcao do
// download virou vazamento.
// ---------------------------------------------------------------------------
describe('urlComDownload', () => {
  const ASSINADA = 'https://p.supabase.co/storage/v1/object/sign/captures/ws/it/a.jpg?token=eyJhbGc'

  it('preserva a URL assinada inteira e só acrescenta o parâmetro', () => {
    const url = urlComDownload(ASSINADA, 'Reuniao.jpg')
    expect(url.startsWith(ASSINADA)).toBe(true)
    expect(url).toContain('token=eyJhbGc')
    expect(url).toContain('&download=Reuniao.jpg')
  })

  it('escapa o nome, para o parâmetro não virar outro parâmetro', () => {
    const url = urlComDownload(ASSINADA, 'a&token=roubado.jpg')
    expect(url).toContain('download=a%26token%3Droubado.jpg')
    // Um único `token=` na URL: o do Storage.
    expect(url.match(/token=/g)).toHaveLength(1)
  })

  it('usa `?` quando a URL não tem query, e `&` quando tem', () => {
    expect(urlComDownload('https://x/a.jpg', 'n.jpg')).toContain('?download=')
    expect(urlComDownload('https://x/a.jpg?t=1', 'n.jpg')).toContain('&download=')
  })

  it('não duplica o parâmetro se o Storage já o devolveu', () => {
    const jaTem = ASSINADA + '&download='
    expect(urlComDownload(jaTem, 'n.jpg')).toBe(jaTem)
  })

  it('data-URL sai INTACTA — colar parâmetro nela corromperia o base64', () => {
    // No modo demonstração o conteúdo do arquivo ESTÁ na string. Quem faz o
    // download ali é o atributo `download` do `<a>`, não o parâmetro.
    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='
    expect(urlComDownload(dataUrl, 'foto.png')).toBe(dataUrl)
    expect(urlComDownload('blob:http://x/abc', 'foto.png')).toBe('blob:http://x/abc')
  })

  it('sem URL, devolve null em vez de uma string quebrada', () => {
    expect(urlComDownload(null, 'n.jpg')).toBe(null)
    expect(urlComDownload('', 'n.jpg')).toBe(null)
  })
})
