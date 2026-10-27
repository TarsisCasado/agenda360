/* eslint-env node */
// ---------------------------------------------------------------------------
// A SUITE INTEIRA RODOU? — a verificacao que faltava.
//
// O C2.2 encontrou o buraco: o Playwright estava instalado no container por
// acaso, sem constar do package.json. Onde ele existia, 1761 testes rodavam;
// onde nao existia, rodavam 1455 — e NINGUEM era avisado, porque `vitest run`
// sai zero quando simplesmente nao ha o que coletar num arquivo que ele nunca
// procurou. Uma rede de seguranca que encolhe em silencio e pior que nenhuma,
// porque ela da confianca.
//
// Entao a conferencia nao e por um numero cravado (que envelhece a cada
// checkpoint e vira ruido): e por PRESENCA. Todo arquivo de teste que existe
// no disco tem de aparecer no relatorio. Se um sumir, isto quebra e diz qual.
// ---------------------------------------------------------------------------
import fs from 'node:fs'
import path from 'node:path'

const RAIZ = process.cwd()
const RELATORIO = path.join(RAIZ, '.vitest-report.json')

// Os mesmos padroes de `vitest.config.js:include`. Se um mudar, o outro tem de
// mudar junto — e o teste de presenca abaixo e quem avisa.
const ALVOS = [
  { dir: 'src', ext: ['.test.js', '.test.jsx'] },
  { dir: 'supabase/functions', ext: ['.test.js', '.test.ts'] },
]

function varrer(dir, ext, achados = []) {
  const completo = path.join(RAIZ, dir)
  if (!fs.existsSync(completo)) return achados
  for (const e of fs.readdirSync(completo, { withFileTypes: true })) {
    const rel = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === 'node_modules') continue
      varrer(rel, ext, achados)
    } else if (ext.some((x) => e.name.endsWith(x))) {
      achados.push(rel)
    }
  }
  return achados
}

if (!fs.existsSync(RELATORIO)) {
  console.error(`[verifica-suites] ${path.basename(RELATORIO)} nao existe. Rode "npm run test:ci" antes.`)
  process.exit(1)
}

const relatorio = JSON.parse(fs.readFileSync(RELATORIO, 'utf8'))
const executados = new Set(
  (relatorio.testResults || []).map((r) => path.relative(RAIZ, r.name)),
)

const noDisco = ALVOS.flatMap(({ dir, ext }) => varrer(dir, ext))
const ausentes = noDisco.filter((f) => !executados.has(f))
const smoke = noDisco.filter((f) => f.includes('__smoke__'))
const smokeAusentes = ausentes.filter((f) => f.includes('__smoke__'))

console.log(`[verifica-suites] arquivos de teste no disco : ${noDisco.length}`)
console.log(`[verifica-suites] arquivos no relatorio      : ${executados.size}`)
console.log(`[verifica-suites] suites de smoke no disco   : ${smoke.length}`)
console.log(`[verifica-suites] testes executados          : ${relatorio.numTotalTests ?? '?'}`)
console.log(`[verifica-suites] testes aprovados           : ${relatorio.numPassedTests ?? '?'}`)

if (ausentes.length) {
  console.error('\n[verifica-suites] SUITES QUE NAO RODARAM:')
  for (const f of ausentes) console.error(`  - ${f}`)
  if (smokeAusentes.length) {
    console.error('\n  Suites de smoke entre as ausentes. A causa mais comum e o navegador')
    console.error('  do Playwright nao estar instalado: rode `npx playwright install chromium`.')
  }
  process.exit(1)
}

if (relatorio.numFailedTests > 0 || relatorio.success === false) {
  console.error(`\n[verifica-suites] ${relatorio.numFailedTests} teste(s) falharam.`)
  process.exit(1)
}

console.log('\n[verifica-suites] OK — toda suite do disco rodou e passou.')
