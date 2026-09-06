import { describe, it, expect } from 'vitest'
import { opcoesAntecedencia } from '../AlertaRows'

// ---------------------------------------------------------------------------
// CP5.9 — a antecedencia deixou de ser um campo numerico com setinhas e virou
// uma escolha nomeada ("15 minutos antes"). A troca so e segura se ela NUNCA
// alterar em silencio um alerta ja configurado: uma atividade antiga pode ter
// 7 ou 45 minutos, valores que nao estao na lista de presets.
// ---------------------------------------------------------------------------
describe('antecedencia do alerta', () => {
  it('"Na hora" existe e vale 0 — o caso testado no dispositivo real', () => {
    expect(opcoesAntecedencia(0)).toContainEqual([0, 'Na hora'])
  })

  it('um valor fora da lista NAO e descartado: entra como opcao', () => {
    const lista = opcoesAntecedencia(7)
    expect(lista).toContainEqual([7, '7 minutos antes'])
    // e no lugar certo da ordem (entre 5 e 10), nao no fim.
    const valores = lista.map(([v]) => v)
    expect(valores.indexOf(7)).toBe(valores.indexOf(5) + 1)
  })

  it('um valor que ja e preset nao vira opcao duplicada', () => {
    const valores = opcoesAntecedencia(15).map(([v]) => v)
    expect(valores.filter((v) => v === 15)).toHaveLength(1)
  })

  it('valor ausente/invalido nao inventa opcao nenhuma', () => {
    expect(opcoesAntecedencia(undefined).map(([v]) => v)).not.toContain(NaN)
    expect(opcoesAntecedencia('abc')).toHaveLength(8)
  })
})
