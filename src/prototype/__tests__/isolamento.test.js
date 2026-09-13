import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// ---------------------------------------------------------------------------
// A GUARDA DO ISOLAMENTO.
//
// O prototipo so e seguro enquanto for mesmo isolado, e isolamento e o tipo de
// promessa que se perde em silencio: basta um `import` de conveniencia, num dia
// apressado, para o prototipo passar a ler — ou escrever — dado real.
//
// Este teste torna esse deslize impossivel de passar despercebido. Ele nao
// confia em disciplina: le os arquivos.
// ---------------------------------------------------------------------------
const RAIZ = new URL('..', import.meta.url).pathname

const PROIBIDOS = [
  { padrao: /from\s+['"].*services\//, motivo: 'serviços reais (Supabase)' },
  { padrao: /from\s+['"].*supabaseClient/, motivo: 'cliente Supabase' },
  { padrao: /from\s+['"].*\/agent\//, motivo: 'camada do agente / IA real' },
  { padrao: /from\s+['"].*DataContext/, motivo: 'contexto de dados reais' },
  { padrao: /from\s+['"].*WorkspaceContext/, motivo: 'workspace real' },
  { padrao: /from\s+['"].*AuthContext/, motivo: 'autenticação real' },
  { padrao: /\blocalStorage\b/, motivo: 'localStorage (pode colidir com o produto)' },
  { padrao: /\bsessionStorage\b/, motivo: 'sessionStorage' },
  { padrao: /\bfetch\s*\(/, motivo: 'chamada de rede' },
  { padrao: /\bXMLHttpRequest\b/, motivo: 'chamada de rede' },
]

// Comentarios sao texto, nao codigo: um cabecalho que EXPLICA "sem
// localStorage" nao pode ser lido como uso de localStorage. Removem-se apenas
// as linhas inteiras de comentario e os blocos — nunca o meio de uma linha,
// para nao mutilar URLs dentro de strings e criar um falso negativo.
function semComentarios(codigo) {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((linha) => !/^\s*(\/\/|\*)/.test(linha))
    .join('\n')
}

function arquivos(dir) {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) return arquivos(caminho)
    return /\.(js|jsx)$/.test(nome) ? [caminho] : []
  })
}

describe('protótipo · isolamento', () => {
  const lista = arquivos(RAIZ).filter((f) => !f.includes('__tests__'))

  it('encontra os arquivos do protótipo', () => {
    expect(lista.length).toBeGreaterThan(10)
  })

  it.each(PROIBIDOS)('nenhum arquivo importa $motivo', ({ padrao, motivo }) => {
    const infratores = lista.filter((f) => padrao.test(semComentarios(readFileSync(f, 'utf8'))))
    expect(infratores, `${motivo} em: ${infratores.join(', ')}`).toEqual([])
  })

  it('o produto atual só ganhou a rota nova — nada foi removido', () => {
    const app = readFileSync(join(RAIZ, '..', 'App.jsx'), 'utf8')
    expect(app).toContain('/prototipo/*')
    // As rotas que existiam continuam existindo.
    for (const rota of ['tarefas', 'ideias', 'caixa', 'dia', 'links', 'assistente', 'relatorios', 'config']) {
      expect(app).toContain(`path="${rota}"`)
    }
  })
})
