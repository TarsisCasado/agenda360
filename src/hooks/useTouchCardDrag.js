import { useEffect, useRef, useState } from 'react'

// ---------------------------------------------------------------------------
// ARRASTAR UM CARTAO COM O DEDO (CP5.4.1) — atalho, nunca a unica via.
//
// POR QUE NAO POINTER EVENTS PUROS
//   Pointer Events existem no Safari do iOS e a API e mais limpa, mas eles NAO
//   dao o que este gesto precisa: impedir o scroll depois que o dedo ja encostou.
//   Com Pointer Events quem decide isso e `touch-action`, um valor de CSS que o
//   iOS le no INICIO do gesto — mudar para `none` depois do long press nao afeta
//   o toque em andamento. Deixar `touch-action: none` fixo no cartao resolveria
//   o arrasto e quebraria o scroll vertical da coluna, que e o gesto mais usado
//   da tela.
//
//   Com Touch Events o controle e por evento: um listener `touchmove` NAO
//   passivo pode chamar `preventDefault()` a partir do instante em que o long
//   press ativa. Funciona no iOS por uma condicao que a maquina de estados
//   abaixo garante: o navegador so ignora o `preventDefault` depois de JA ter
//   comecado a rolar, e nos so ativamos enquanto o dedo ficou dentro da folga
//   de 10px — ou seja, antes de qualquer rolagem comecar. E a mesma tecnica que
//   as bibliotecas de arrasto usam no iOS, sem trazer a biblioteca.
//
// COMO OS CINCO GESTOS CONVIVEM
//   toque curto        o timer e cancelado no `touchend`; o clique segue e abre
//                      a tarefa;
//   deslize horizontal passa dos 10px antes dos 380ms -> timer cancelado, o
//                      pager rola nativamente;
//   scroll vertical    idem, e o navegador ainda dispara `touchcancel` ao
//                      assumir a rolagem, que tambem cancela;
//   `•••`              excluido na origem: long press sobre ele nao pega o
//                      cartao, e o toque abre a folha "Mover para";
//   long press + drag  380ms parado -> a partir dai o dedo move o cartao.
//
//   A ordem importa: o cancelamento e sempre por MOVIMENTO ou por
//   `touchcancel`, nunca por adivinhacao de direcao. Nao ha heuristica de
//   angulo, que e onde esse tipo de gesto costuma ficar fragil.
//
// 380ms E DELIBERADO
//   300ms dispara sozinho quando o dedo hesita antes de rolar. 500ms empata com
//   o long press do proprio iOS (menu de selecao/callout) e a disputa aparece na
//   tela. 380ms fica acima da hesitacao normal e abaixo do gesto do sistema.
//
// O QUE ESTE HOOK NAO FAZ
//   Nao decide para onde a tarefa vai e nao grava nada: devolve "solte a tarefa
//   X na coluna Y" e quem resolve e a MESMA funcao que ja atende o arrasto do
//   desktop e a folha "Mover para". Nao existe uma terceira regra de
//   movimentacao.
// ---------------------------------------------------------------------------

export const SEGURAR_MS = 380
export const FOLGA_PX = 10
// Faixa junto a borda que leva o quadro para a coluna vizinha durante o arrasto.
const ZONA_BORDA_PX = 64
// Respiro entre avancos: sem ele, encostar na borda atravessaria as quatro
// colunas num piscar. Com ele da para atravessar varias sem soltar o cartao,
// uma de cada vez.
const ESPERA_AVANCO_MS = 620

const seletorColuna = '[data-testid^="board-column-"]'

function chaveDaColuna(node) {
  const col = node?.closest?.(seletorColuna)
  return col ? col.dataset.testid.replace('board-column-', '') : null
}

// Vibra so onde existe: o Safari do iOS nao expoe nenhuma API de vibracao a
// paginas web, entao no iPhone o retorno de "peguei" e visual — por isso ele
// precisa ser claro.
function tremer() {
  try {
    navigator.vibrate?.(12)
  } catch {
    /* ambiente sem suporte: o retorno visual basta */
  }
}

export function useTouchCardDrag({ pagerRef, enabled, onDrop, onAdvance }) {
  const [estado, setEstado] = useState({ taskId: null, alvo: null })
  // Os callbacks entram por ref para o efeito nao reassinar os listeners a cada
  // render — reassinar no meio de um arrasto o mataria.
  const onDropRef = useRef(onDrop)
  const onAdvanceRef = useRef(onAdvance)
  onDropRef.current = onDrop
  onAdvanceRef.current = onAdvance

  useEffect(() => {
    const pager = pagerRef.current
    if (!enabled || !pager) return

    let timer = 0
    let inicio = null
    let cartao = null
    let taskId = null
    let fantasma = null
    let deslocamento = { x: 0, y: 0 }
    let ativo = false
    let alvoAtual = null
    let ultimoAvanco = 0

    const desmontar = ({ voltando = false } = {}) => {
      clearTimeout(timer)
      timer = 0
      if (fantasma) {
        const alvoDom = cartao?.getBoundingClientRect()
        const g = fantasma
        fantasma = null
        if (voltando && alvoDom) {
          // Desistir tem de parecer desistir: o cartao volta para o lugar em
          // vez de sumir no ar.
          const anim = g.animate(
            [
              { transform: g.style.transform, opacity: 1 },
              { transform: `translate3d(${alvoDom.left}px, ${alvoDom.top}px, 0) scale(1)`, opacity: 0.9 },
            ],
            { duration: 170, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
          )
          anim.onfinish = () => g.remove()
          anim.oncancel = () => g.remove()
        } else {
          g.remove()
        }
      }
      ativo = false
      inicio = null
      cartao = null
      taskId = null
      alvoAtual = null
      setEstado({ taskId: null, alvo: null })
    }

    const ativar = (toque) => {
      if (!cartao) return
      const r = cartao.getBoundingClientRect()
      deslocamento = { x: toque.clientX - r.left, y: toque.clientY - r.top }

      // O fantasma e um CLONE do proprio cartao: aparencia identica sem que o
      // componente do cartao precise saber que existe arrasto. Ele vai para o
      // body porque, dentro da coluna, o `overflow` o cortaria ao atravessar
      // para a coluna vizinha.
      fantasma = cartao.cloneNode(true)
      fantasma.removeAttribute('data-task-id')
      fantasma.setAttribute('aria-hidden', 'true')
      fantasma.classList.add('board-ghost')
      fantasma.style.width = `${r.width}px`
      fantasma.style.height = `${r.height}px`
      fantasma.style.transform = `translate3d(${r.left}px, ${r.top}px, 0) scale(1.03)`
      document.body.appendChild(fantasma)

      ativo = true
      alvoAtual = chaveDaColuna(cartao)
      tremer()
      setEstado({ taskId, alvo: alvoAtual })
    }

    const onTouchStart = (e) => {
      if (e.touches.length !== 1) return
      const alvoDom = e.target
      const node = alvoDom?.closest?.('[data-task-id]')
      if (!node) return
      // O `•••` mora dentro do cartao e tem funcao propria: segurar sobre ele
      // nao pega a tarefa. A folha "Mover para" continua sendo a via principal.
      if (alvoDom.closest('button[aria-label^="Mover"]')) return

      const t = e.touches[0]
      cartao = node
      taskId = node.dataset.taskId
      inicio = { x: t.clientX, y: t.clientY }
      clearTimeout(timer)
      timer = setTimeout(() => ativar(t), SEGURAR_MS)
    }

    const onTouchMove = (e) => {
      if (!inicio) return
      const t = e.touches[0]
      if (!t) return

      if (!ativo) {
        // Antes do limiar, QUALQUER movimento alem da folga entrega o gesto ao
        // navegador: e assim que o deslize entre colunas e o scroll vertical
        // continuam intactos.
        const dx = Math.abs(t.clientX - inicio.x)
        const dy = Math.abs(t.clientY - inicio.y)
        if (dx > FOLGA_PX || dy > FOLGA_PX) desmontar()
        return
      }

      // A partir daqui o dedo e nosso.
      e.preventDefault()
      fantasma.style.transform = `translate3d(${t.clientX - deslocamento.x}px, ${
        t.clientY - deslocamento.y
      }px, 0) scale(1.03)`

      const sob = document.elementFromPoint(t.clientX, t.clientY)
      const chave = chaveDaColuna(sob)
      if (chave !== alvoAtual) {
        alvoAtual = chave
        setEstado({ taskId, alvo: chave })
      }

      // Borda: leva o quadro para a coluna vizinha sem soltar o cartao. Avanco
      // DISCRETO, uma coluna por vez — rolagem continua brigaria com o encaixe
      // (`scroll-snap`) do pager e deixaria o quadro parado entre duas colunas.
      const r = pager.getBoundingClientRect()
      const agora = Date.now()
      if (agora - ultimoAvanco > ESPERA_AVANCO_MS) {
        if (t.clientX > r.right - ZONA_BORDA_PX) {
          ultimoAvanco = agora
          onAdvanceRef.current?.(1)
        } else if (t.clientX < r.left + ZONA_BORDA_PX) {
          ultimoAvanco = agora
          onAdvanceRef.current?.(-1)
        }
      }
    }

    const onTouchEnd = () => {
      if (!ativo) {
        // Foi um toque: deixa o clique seguir e abrir a tarefa.
        desmontar()
        return
      }
      const id = taskId
      const destino = alvoAtual
      // Soltar fora de qualquer coluna nao move nada — e a forma de desistir
      // sem levantar o dedo em cima de um destino errado.
      desmontar({ voltando: !destino })
      if (destino) onDropRef.current?.(id, destino)
    }

    const onTouchCancel = () => desmontar({ voltando: ativo })

    // `passive: false` no move e o ponto todo: sem isso o `preventDefault` e
    // ignorado e o quadro rolaria embaixo do cartao.
    pager.addEventListener('touchstart', onTouchStart, { passive: true })
    pager.addEventListener('touchmove', onTouchMove, { passive: false })
    pager.addEventListener('touchend', onTouchEnd, { passive: true })
    pager.addEventListener('touchcancel', onTouchCancel, { passive: true })
    return () => {
      desmontar()
      pager.removeEventListener('touchstart', onTouchStart)
      pager.removeEventListener('touchmove', onTouchMove)
      pager.removeEventListener('touchend', onTouchEnd)
      pager.removeEventListener('touchcancel', onTouchCancel)
    }
  }, [enabled, pagerRef])

  return estado
}
