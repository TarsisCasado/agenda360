import { describe, it, expect } from 'vitest'
import { estadoInicial } from '../store/reducer'
import {
  destaqueDoMomento, filaDeHoje, decisaoPrincipal, sugestaoDaJanela, restoDoDia,
  QUANTAS_TAREFAS, JANELA_MINIMA,
} from '../store/hojeM1'
import { AGORA_DEMO, RESPONSABILIDADE } from '../mock/dados'

// ---------------------------------------------------------------------------
// UX-M1 — AS REGRAS DO PILOTO.
//
// O que se guarda aqui e a promessa do primeiro viewport: UM destaque, TRES
// tarefas, UMA decisao, e nenhuma repeticao entre eles. Se alguma dessas
// quebrar, a tela volta a ser a pilha de modulos que este piloto veio
// substituir — e volta em silencio, porque continua "funcionando".
//
// O visual NAO se testa aqui: o ambiente e Node, sem DOM. Composicao,
// hierarquia e ritmo sao julgados no QA visual, e no iPhone por uma pessoa.
// ---------------------------------------------------------------------------
const HOJE = new Date('2026-09-14T09:00:00') // segunda
const inicial = () => estadoInicial(HOJE)

describe('UX-M1 · o destaque é UM objeto', () => {
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

describe('UX-M1 · para você fazer é SELEÇÃO', () => {
  it('mostra no máximo três', () => {
    const f = filaDeHoje(inicial())
    expect(f.visiveis.length).toBeLessThanOrEqual(QUANTAS_TAREFAS)
    expect(f.visiveis.length).toBe(QUANTAS_TAREFAS)
  })

  it('o corte é de apresentação: a lista inteira continua acessível', () => {
    const f = filaDeHoje(inicial())
    expect(f.todas.length).toBeGreaterThan(f.visiveis.length)
    expect(f.sobram).toBe(f.todas.length - f.visiveis.length)
  })

  it('prazo vencido vem primeiro — exceção antes de rotina', () => {
    const f = filaDeHoje(inicial())
    expect(f.ehVencida(f.visiveis[0])).toBe(true)
  })

  it('nenhuma tarefa aparece duas vezes na fila', () => {
    const ids = filaDeHoje(inicial()).todas.map((t) => t.id)
    expect(ids).toEqual([...new Set(ids)])
  })

  it('o que está com outra pessoa NÃO entra na minha fila', () => {
    const e = inicial()
    const f = filaDeHoje(e)
    const eu = e.pessoas.find((p) => p.eu).id
    for (const t of f.todas) expect(t.responsavelId || eu).toBe(eu)
  })

  it('concluída não ocupa vaga', () => {
    const e = inicial()
    const f = filaDeHoje(e)
    expect(f.todas.every((t) => t.estado !== 'feito')).toBe(true)
  })
})

describe('UX-M1 · precisa de você é UMA situação', () => {
  it('a devolvida ganha a frente', () => {
    const d = decisaoPrincipal(inicial())
    expect(d.primeira.responsabilidade).toBe(RESPONSABILIDADE.DEVOLVIDA)
  })

  it('o resto fica atrás de uma linha, e a contagem confere', () => {
    const d = decisaoPrincipal(inicial())
    expect(d.outras.length).toBe(d.total - 1)
    expect(d.outras.some((t) => t.id === d.primeira.id)).toBe(false)
  })
})

describe('UX-M1 · a sugestão só fala quando tem o que dizer', () => {
  it('com janela e candidato, propõe', () => {
    const e = inicial()
    const d = destaqueDoMomento(e, AGORA_DEMO)
    const s = sugestaoDaJanela(e, d, filaDeHoje(e))
    expect(s).not.toBeNull()
    expect(s.minutos).toBe(20)
    expect(s.ate).toBe('09:00')
  })

  it('o candidato NUNCA é algo que já tem horário reservado hoje', () => {
    const e = inicial()
    const d = destaqueDoMomento(e, AGORA_DEMO)
    const s = sugestaoDaJanela(e, d, filaDeHoje(e))
    expect(s.candidato.reserva?.data).not.toBe(e.hoje)
  })

  it('janela curta demais NÃO vira sugestão', () => {
    const e = inicial()
    const d = destaqueDoMomento(e, '08:55')
    expect(d.faltam).toBeLessThan(JANELA_MINIMA)
    expect(sugestaoDaJanela(e, d, filaDeHoje(e))).toBeNull()
  })

  it('sem destaque não há janela — e nada é inventado', () => {
    const e = inicial()
    const d = destaqueDoMomento(e, '23:30')
    expect(sugestaoDaJanela(e, d, filaDeHoje(e))).toBeNull()
  })
})

describe('UX-M1 · um item, um lugar', () => {
  it('o destaque NÃO se repete no resto do dia', () => {
    const e = inicial()
    const d = destaqueDoMomento(e, AGORA_DEMO)
    const resto = restoDoDia(e, d.item, filaDeHoje(e).visiveis)
    expect(resto.some((x) => x.id === d.item.id)).toBe(false)
  })

  it('o que está em "para você fazer" não reaparece abaixo da dobra', () => {
    const e = inicial()
    const f = filaDeHoje(e)
    const resto = restoDoDia(e, destaqueDoMomento(e, AGORA_DEMO).item, f.visiveis)
    const idsResto = resto.map((x) => x.tarefaId).filter(Boolean)
    for (const t of f.visiveis) {
      // Exceção honesta: uma tarefa COM horário reservado aparece na linha do
      // tempo porque ali ela é um bloco de tempo, não uma pendência. Sem
      // horário, não pode estar nos dois lugares.
      if (t.reserva?.data === e.hoje) continue
      expect(idsResto).not.toContain(t.id)
    }
  })

  it('o resto do dia sai em ordem, e o que não tem hora vem por último', () => {
    const e = inicial()
    const resto = restoDoDia(e, destaqueDoMomento(e, AGORA_DEMO).item, filaDeHoje(e).visiveis)
    const ordens = resto.map((x) => x.ordem)
    expect([...ordens].sort()).toEqual(ordens)
  })
})
