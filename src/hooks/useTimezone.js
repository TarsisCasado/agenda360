import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { profileService } from '../services/profileService'
import { detectarFuso, deveSincronizar, FUSO_PADRAO } from '../lib/timezone'

// ---------------------------------------------------------------------------
// O fuso do usuario, sincronizado UMA vez por sessao — em silencio quando e
// seguro, nunca por cima de uma escolha.
//
// Por que sincronizar sozinho: o default da coluna e America/Sao_Paulo. Para
// quem esta em Fortaleza isso e invisivel na tela e visivel no lembrete, que
// chegaria na hora errada sem nenhum sinal de que algo esta errado. O
// aparelho ja sabe o fuso certo; perguntar seria transferir para o usuario um
// problema que o sistema pode resolver.
//
// Por que so quando e seguro: `deveSincronizar` (lib/timezone) exige que o
// guardado esteja ausente ou seja exatamente o default. Um fuso ja escolhido
// nao muda porque a pessoa viajou.
// ---------------------------------------------------------------------------
export function useTimezone() {
  const { user } = useAuth()
  const [timezone, setTimezone] = useState(null)
  const [sincronizado, setSincronizado] = useState(false)

  const carregar = useCallback(async () => {
    if (!user?.id) return
    let guardado = null
    try {
      guardado = await profileService.getTimezone(user.id)
    } catch (err) {
      console.warn('[useTimezone] nao consegui ler o fuso:', err?.message || err)
      return
    }
    const detectado = detectarFuso()
    if (deveSincronizar(guardado, detectado)) {
      try {
        const r = await profileService.setTimezone(user.id, detectado)
        if (r.ok) {
          setTimezone(detectado)
          setSincronizado(true)
          return
        }
      } catch (err) {
        // Falhar aqui NAO quebra nada: o motor continua com o valor guardado.
        console.warn('[useTimezone] nao consegui sincronizar o fuso:', err?.message || err)
      }
    }
    setTimezone(guardado || detectado || FUSO_PADRAO)
  }, [user?.id])

  useEffect(() => {
    carregar()
  }, [carregar])

  return { timezone, sincronizado, recarregar: carregar }
}
