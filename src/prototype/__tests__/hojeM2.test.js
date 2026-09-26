import { describe, it, expect } from 'vitest'
import { estadoInicial } from '../store/reducer'
import {
  destaqueDoMomento, decisoesDoDia, rotuloDeDecisao, semData,
  janelaLivre, sugestoesDaJanela, esperandoDesde,
  QUANTAS_DECISOES, QUANTAS_SUGESTOES, JANELA_MINIMA,
} from '../store/hojeM2'
import { AGORA_DEMO, ESTADO } from '../mock/dados'

// ---------------------------------------------------------------------------
// UX-M2 — AS REGRAS DA COMPOSICAO APROVADA.
//
// O que se guarda aqui e a promessa do primeiro viewport: UM destaque, DUAS
// decisoes, UMA linha de "sem data" e uma sugestao que so fala com janela
// real. Se alguma quebrar, a tela volta a ser uma pilha de modulos — e volta
// em silencio, porque continua "funcionando".
//
// -------------------- O QUE MUDOU DESDE O UX-M1 ----------------------------
//
// O piloto anterior tinha `filaDeHoje`, `decisaoPrincipal` e `restoDoDia`, e o
// teste dele garantia coisas que DEIXARAM de valer de proposito:
//
//   . "mostra no maximo tres [tarefas para fazer]" — a home aprovada nao tem
//     secao de tarefas do dia: o que ela lista sao DECISOES, e o corte e dois;
//   . "a devolvida ganha a frente" — a ordem passou a ser por TEMPO DE ESPERA,
//     que vale igual para todos os tipos e dispensa a excecao por tipo;
//   . "o destaque nao se repete no resto do dia" — nao ha mais "resto do dia"
//     na home; a linha do tempo e o conteudo da Agenda.
//
// O visual NAO se testa aqui: o ambiente e Node, sem DOM. Composicao,
// hierarquia e ritmo sao julgados no QA visual, e no iPhone por uma pessoa.
// ---------------------------------------------------------------------------
const HOJE = new Date('2026-09-14T09:00:00') // segunda
const inicial = () => estadoInicial(HOJE)

describe('UX-M2 · o destaque é UM objeto', () => {
  it('às 08:40 o destaque é o próximo compromisso, não o dia inteiro', () => {
    const d = destaqueDoMomento(inicial(), AGORA_DEMO)
    expect(d.item).toBeTruthy()
    expect(d.emCurso).toBe(false)
    expect(d.item.inicio).toBe('09:00')
  })

  it('a contagem até ele é real, em minutos', () => {
    expect(destaqueDoMomento(inicial(), AGORA_DEMO).faltam).toBe(20)
  })

  it('durante o compromisso, ele é "agora" e não há contagem', () => {
    const d = destaqueDoMomento(inicial(), '09:30')
    expect(d.emCurso).toBe(true)
    expect(d.faltam).toBeNull()
  })

  it('depois do último compromisso não há destaque inventado', () => {
    expect(destaqueDoMomento(inicial(), '23:30').item).toBeNull()
  })
})

describe('UX-M2 · precisa de você', () => {
  it('a superfície mostra duas, e diz quantas ficaram', () => {
    const d = decisoesDoDia(inicial())
    expect(d.visiveis.length).toBe(QUANTAS_DECISOES)
    expect(d.sobram).toBe(d.todas.length - QUANTAS_DECISOES)
    expect(d.sobram).toBeGreaterThan(0)
  })

  it('o meu trabalho travado vem antes do pedido dos outros', () => {
    const d = decisoesDoDia(inicial())
    // As duas visíveis são as que estão PARADAS comigo (bloqueada e
    // devolvida); a que a Marina me atribuiu fica atrás de "Ver mais".
    for (const t of d.visiveis) {
      expect(Boolean(t.bloqueio) || t.responsabilidade === 'devolvida').toBe(true)
    }
    expect(d.todas[d.todas.length - 1].responsabilidade).toBe('aguardando')
  })

  it('dentro do grupo, quem espera há mais tempo vem primeiro', () => {
    const travadas = decisoesDoDia(inicial()).visiveis.map(esperandoDesde)
    expect([...travadas].sort()).toEqual(travadas)
  })

  it('nenhuma decisão aparece duas vezes', () => {
    const ids = decisoesDoDia(inicial()).todas.map((t) => t.id)
    expect(ids).toEqual([...new Set(ids)])
  })

  it('concluída não ocupa vaga', () => {
    expect(decisoesDoDia(inicial()).todas.every((t) => t.estado !== ESTADO.FEITO)).toBe(true)
  })

  it('o rótulo diz o que aconteceu e quando — sem inventar atraso', () => {
    const e = inicial()
    const bloqueada = decisoesDoDia(e).todas.find((t) => t.bloqueio)
    const r = rotuloDeDecisao(bloqueada, e.hoje)
    expect(r.alerta).toBe('Bloqueada ontem')
    expect(r.contexto).toBe(bloqueada.contexto)
  })

  it('a devolvida hoje é rotulada como devolvida hoje', () => {
    const e = inicial()
    const devolvida = decisoesDoDia(e).todas.find((t) => t.responsabilidade === 'devolvida')
    expect(rotuloDeDecisao(devolvida, e.hoje).alerta).toBe('Devolvida hoje')
  })
})

describe('UX-M2 · a linha de "sem data"', () => {
  it('só entra tarefa minha, viva e sem nenhuma data', () => {
    const e = inicial()
    const lista = semData(e)
    expect(lista.length).toBeGreaterThan(0)
    for (const t of lista) {
      expect(t.estado).not.toBe(ESTADO.FEITO)
      expect(t.prazo).toBeFalsy()
      expect(t.planejadaPara).toBeFalsy()
      expect(t.paraHoje).toBeFalsy()
      expect(t.reserva).toBeFalsy()
    }
  })

  it('não repete o que já está em "precisa de você"', () => {
    const e = inicial()
    const decisoesIds = decisoesDoDia(e).todas.map((t) => t.id)
    for (const t of semData(e)) expect(decisoesIds).not.toContain(t.id)
  })
})

describe('UX-M2 · a sugestão só fala quando tem o que dizer', () => {
  it('com janela real, existe — e a janela é a de verdade', () => {
    const j = janelaLivre(inicial(), AGORA_DEMO)
    expect(j).not.toBeNull()
    expect(j.minutos).toBe(20)
    expect(j.de).toBe(AGORA_DEMO)
    expect(j.ate).toBe('09:00')
  })

  it('janela curta demais NÃO vira sugestão', () => {
    const e = inicial()
    expect(destaqueDoMomento(e, '08:55').faltam).toBeLessThan(JANELA_MINIMA)
    expect(janelaLivre(e, '08:55')).toBeNull()
  })

  it('durante o compromisso não há janela — e nada é inventado', () => {
    expect(janelaLivre(inicial(), '09:30')).toBeNull()
  })

  it('sem destaque não há janela', () => {
    expect(janelaLivre(inicial(), '23:30')).toBeNull()
  })

  it('oferece no máximo três candidatas', () => {
    expect(sugestoesDaJanela(inicial()).length).toBeLessThanOrEqual(QUANTAS_SUGESTOES)
  })

  it('NUNCA oferece algo que já tem horário reservado hoje', () => {
    const e = inicial()
    for (const t of sugestoesDaJanela(e)) expect(t.reserva?.data).not.toBe(e.hoje)
  })

  it('só oferece tarefa minha e viva', () => {
    const e = inicial()
    const eu = e.pessoas.find((p) => p.eu).id
    for (const t of sugestoesDaJanela(e)) {
      expect(t.responsavelId || eu).toBe(eu)
      expect(t.estado).not.toBe(ESTADO.FEITO)
    }
  })

  it('prazo vencido vem primeiro — exceção antes de rotina', () => {
    const e = inicial()
    const primeira = sugestoesDaJanela(e)[0]
    expect(primeira.prazo && primeira.prazo < e.hoje).toBe(true)
  })
})
