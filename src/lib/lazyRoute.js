import { lazy } from 'react'

// ---------------------------------------------------------------------------
// CARREGAMENTO DE ROTA RESISTENTE A DEPLOY.
//
// O problema que este arquivo existe para resolver (incidente do CP5.1.1):
//
//   Cada build gera nomes de arquivo com hash NOVO para todos os chunks —
//   inclusive para paginas que ninguem tocou, porque o hash cobre o grafo de
//   dependencias. Uma aba (ou um PWA instalado) que ficou aberta com o bundle
//   ANTIGO continua pedindo "Tasks-Y0JJYeb7.js". Depois do deploy esse arquivo
//   nao existe mais no servidor: `import()` rejeita, o Suspense estoura e o
//   ErrorBoundary da rota mostra "Nao foi possivel abrir esta tela".
//
//   Como "Hoje" e import ESTATICO (ja esta no bundle principal, em memoria),
//   ela continua abrindo — e so as rotas lazy quebram. Foi exatamente esse o
//   sintoma relatado no QA.
//
// A correcao: uma falha de import de chunk quase sempre significa "esta pagina
// esta rodando codigo de um deploy que nao existe mais". Recarregar UMA vez
// busca o index.html novo e resolve. A trava em sessionStorage impede laco
// quando a causa for outra (rede caida, chunk corrompido) — nesse caso o erro
// sobe normalmente para o ErrorBoundary, como antes.
// ---------------------------------------------------------------------------
const RELOAD_FLAG = 'agenda360.chunkReload'

function readFlag() {
  try {
    return sessionStorage.getItem(RELOAD_FLAG)
  } catch {
    return null // Safari privado / storage bloqueado: sem trava, sem reload.
  }
}

function writeFlag() {
  try {
    sessionStorage.setItem(RELOAD_FLAG, String(Date.now()))
    return true
  } catch {
    return false
  }
}

function clearFlag() {
  try {
    sessionStorage.removeItem(RELOAD_FLAG)
  } catch {
    /* nada a fazer */
  }
}

// lazyRoute(() => import('./pages/X')) — mesmo contrato de React.lazy.
export function lazyRoute(loader) {
  return lazy(() =>
    loader().then(
      (mod) => {
        // Chegou um chunk: o deploy atual esta integro, a trava pode sair.
        clearFlag()
        return mod
      },
      (err) => {
        if (typeof window === 'undefined' || readFlag()) throw err
        if (!writeFlag()) throw err
        window.location.reload()
        // A pagina esta sendo trocada: nunca resolve, para o React nao
        // renderizar um estado de erro no meio do reload.
        return new Promise(() => {})
      },
    ),
  )
}
