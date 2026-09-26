const CHAVE = 'agenda360.sidebar.recolhida'

// ---------------------------------------------------------------------------
// A PREFERENCIA DE LARGURA DA BARRA LATERAL (CP5.10).
//
// Local por natureza: e uma escolha de conforto DESTE aparelho, nesta tela.
// Quem usa o desktop de 27" e o notebook de 13" nao quer a mesma largura nos
// dois, entao sincronizar entre dispositivos seria transformar uma preferencia
// em incomodo. Nao vai para o Supabase, nao precisa de conta.
//
// A leitura e SINCRONA e acontece no primeiro render (ver Sidebar). Se fosse
// num efeito, a barra pintaria expandida e encolheria logo depois — o flash que
// denuncia que o estado guardado chegou tarde.
//
// Tudo em try/catch: um navegador com armazenamento bloqueado (aba anonima,
// site data desligado) devolve o padrao em vez de derrubar o shell inteiro.
// ---------------------------------------------------------------------------
export function lerRecolhida() {
  try {
    return localStorage.getItem(CHAVE) === '1'
  } catch {
    return false
  }
}

export function guardarRecolhida(recolhida) {
  try {
    localStorage.setItem(CHAVE, recolhida ? '1' : '0')
  } catch {
    /* preferencia de conforto: se nao da para guardar, nao da. */
  }
}
