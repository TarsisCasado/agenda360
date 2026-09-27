// ---------------------------------------------------------------------------
// IA DO PROTOTIPO — simulada, e assumidamente simulada.
//
// Nada aqui entende portugues. Sao respostas fixas com um atraso curto para
// que os ESTADOS da conversa (pensando -> proposta -> confirmado) possam ser
// avaliados. Nenhuma chamada de rede, nenhum provider, nenhum modelo.
//
// O que este arquivo existe para provar e o CONTRATO de interacao:
// a interpretacao e uma SUGESTAO secundaria, nunca um pedagio. Guardar
// funciona sem ela, e ela nunca aplica nada sozinha.
// ---------------------------------------------------------------------------

export const espera = (ms = 420) => new Promise((r) => setTimeout(r, ms))

const HORA = /(\d{1,2})(?:[:h](\d{2}))?\s*(h|horas|da manhã|da manha|da tarde|da noite)?/i

// Reconhecimento deliberadamente ingenuo: o objetivo e produzir uma sugestao
// plausivel para a demonstracao, nao acertar linguagem natural.
export function interpretar(texto, { hoje, amanha } = {}) {
  const t = String(texto || '').trim()
  if (!t) return null

  if (/^https?:\/\//i.test(t)) {
    return {
      especie: 'referencia',
      frase: 'Isso parece um link.',
      acao: 'Guardar como referência',
      dados: { titulo: t },
    }
  }

  const pareceCompromisso = /(reuni|almoç|almoc|consulta|dentista|encontro|call|visita)/i.test(t)
  const m = t.match(HORA)
  const temHora = Boolean(m && m[1] && Number(m[1]) <= 23)
  const data = /amanh/i.test(t) ? amanha : hoje

  if (pareceCompromisso && temHora) {
    const h = String(Number(m[1])).padStart(2, '0')
    const min = m[2] || '00'
    return {
      especie: 'compromisso',
      frase: `Isso parece um compromisso ${/amanh/i.test(t) ? 'amanhã' : 'hoje'} às ${h}:${min}.`,
      acao: 'Criar compromisso',
      dados: { titulo: limparTitulo(t), data, inicio: `${h}:${min}`, fim: somarUmaHora(`${h}:${min}`) },
    }
  }

  if (/(lembrar|revisar|retornar|conferir|enviar|preparar|ligar|combinar|fazer)/i.test(t)) {
    return {
      especie: 'tarefa',
      frase: 'Isso parece uma tarefa.',
      acao: 'Criar tarefa',
      dados: { titulo: limparTitulo(t) },
    }
  }

  return null // sem sugestao: a captura continua valendo
}

function limparTitulo(t) {
  // Sem \b nas palavras acentuadas: em JS o limite de palavra so conhece
  // [A-Za-z0-9_], entao "amanhã\b" nunca casa — e o titulo sairia com o
  // "amanhã às" dentro. Aqui o limite e o espaco, que e o que existe de fato.
  const limpo = t
    .replace(/(^|\s)(amanhã|amanha|hoje|às|as)(?=\s|$)/gi, ' ')
    .replace(HORA, ' ')
    .replace(/(^|\s)(lembrar de|preciso|quero)(?=\s|$)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const base = limpo || t
  return base.charAt(0).toUpperCase() + base.slice(1)
}

function somarUmaHora(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// Decomposicao de uma tarefa grande (jornada F).
export function sugerirPassos(titulo = '') {
  if (/apresenta/i.test(titulo)) {
    return [
      'Levantar números de giro do trimestre',
      'Escolher os 3 pontos que importam para a diretoria',
      'Montar o esqueleto dos slides',
      'Pedir os dados de repasse ao financeiro',
      'Ensaiar uma vez em voz alta',
    ]
  }
  return [
    'Listar o que precisa ser decidido',
    'Falar com quem depende disso',
    'Definir o primeiro passo concreto',
  ]
}

// Plano da semana (jornada G) — mudancas PROPOSTAS, nunca aplicadas.
export function planejarSemana(estado, terca) {
  return {
    resumo:
      'Sua terça está aberta à tarde e você tem duas coisas paradas esperando decisão. ' +
      'Eu faria assim:',
    mudancas: [
      {
        rotulo: 'Reservar terça, 14:00–15:00, para discutir o padrão de preparação',
        acao: { tipo: 'reservarHorario', id: 't-gerentes', data: terca, inicio: '14:00', fim: '15:00' },
      },
      {
        rotulo: 'Fazer a apresentação do trimestre na quinta',
        acao: { tipo: 'planejarPara', id: 't-apresentacao', data: estado.quinta },
      },
      {
        rotulo: 'Puxar a documentação do consórcio para hoje',
        acao: { tipo: 'escolherParaHoje', id: 't-consorcio', valor: true },
      },
    ],
  }
}

// ---------------------------------------------------------------------------
// O COPILOTO AMPLIADO — respostas DETERMINISTICAS.
//
// Este arquivo nao entende portugues e nao tenta. Ele reconhece alguns padroes
// para que a CONVERSA possa ser avaliada: os estados (pensando -> resposta ou
// proposta -> revisao -> confirmacao), a diferenca entre CONSULTAR e ESCREVER,
// e o fato de que fontes da Memoria podem ser abertas.
//
// A regra de produto que isto existe para demonstrar:
//
//   PERGUNTA NAO PEDE CONFIRMACAO. ESCRITA PEDE, SEMPRE.
//
// Consultar o que esta atrasado nao muda nada, entao responde direto. Reservar
// um horario muda a agenda de alguem, entao vira PROPOSTA e espera.
// ---------------------------------------------------------------------------
export const ATALHOS = [
  'Organizar meu dia',
  'Planejar minha semana',
  'O que está atrasado?',
  'Encontrar algo que anotei',
]

export function responder(texto, estado, contexto) {
  const t = String(texto || '').toLowerCase()
  const hoje = estado.hoje

  // --- CONSULTAS: respondem direto, nao escrevem nada ----------------------
  if (/atrasad|vencid|venceu/.test(t)) {
    const lista = estado.tarefas.filter((x) => x.estado !== 'feito' && x.prazo && x.prazo < hoje)
    const bloqueadas = estado.tarefas.filter((x) => x.bloqueio)
    return {
      especie: 'resposta',
      texto: lista.length
        ? `Há ${lista.length} com prazo vencido: ${lista.map((x) => `“${x.titulo}”`).join(', ')}.` +
          (bloqueadas.length
            ? ` Fora isso, ${bloqueadas.length} está bloqueada: “${bloqueadas[0].titulo}” — ${bloqueadas[0].bloqueio}.`
            : '')
        : 'Nada com prazo vencido no momento.',
      referencias: lista.map((x) => ({ tipo: 'tarefa', id: x.id, titulo: x.titulo })),
    }
  }

  if (/anotei|anotad|nota|memória|memoria|guardei|encontrar|onde está|onde esta/.test(t)) {
    const fontes = estado.memoria.filter((m) => !m.arquivada).slice(0, 3)
    return {
      especie: 'resposta',
      texto:
        'Achei isto no que você guardou. As fontes ficam abertas — você confere de onde veio ' +
        'antes de acreditar em mim.',
      fontes: fontes.map((m) => ({ tipo: 'memoria', id: m.id, titulo: m.titulo, resumo: m.resumo })),
    }
  }

  if (/quem|delegad|rubens|carla|jorge|marina/.test(t)) {
    const fora = estado.tarefas.filter((x) => x.delegadorId === 'p-tarsis' && x.responsavelId !== 'p-tarsis')
    return {
      especie: 'resposta',
      texto: fora.length
        ? `Você tem ${fora.length} ${fora.length === 1 ? 'atividade' : 'atividades'} com outras pessoas: ` +
          fora.map((x) => `“${x.titulo}”`).join(', ') + '.'
        : 'Nada sob responsabilidade de outra pessoa agora.',
      referencias: fora.map((x) => ({ tipo: 'tarefa', id: x.id, titulo: x.titulo })),
    }
  }

  // --- PROPOSTAS: mexem no estado, entao esperam confirmacao ---------------
  if (/organizar.*dia|meu dia|hoje/.test(t)) {
    return {
      especie: 'proposta',
      resumo:
        'Sua manhã tem 20 minutos livres antes da reunião e a tarde está aberta depois das 15h. ' +
        'Eu faria assim:',
      mudancas: [
        {
          rotulo: 'Puxar a documentação do consórcio para hoje (está vencida há dias)',
          acao: { tipo: 'escolherParaHoje', id: 't-consorcio', valor: true },
        },
        {
          rotulo: 'Reservar 15:30–16:00 para retornar o Porcino',
          acao: { tipo: 'reservarHorario', id: 't-porcino', data: estado.hoje, inicio: '15:30', fim: '16:00' },
        },
      ],
    }
  }

  if (/semana|planejar/.test(t)) {
    return { especie: 'proposta', ...planejarSemana(estado, estado.terca) }
  }

  if (contexto?.tipo === 'tarefa' && /passo|quebrar|começar|comecar|dividir/.test(t)) {
    const alvo = estado.tarefas.find((x) => x.id === contexto.id)
    return {
      especie: 'proposta',
      resumo: `Separei o que eu faria em “${alvo?.titulo}”:`,
      mudancas: sugerirPassos(alvo?.titulo).map((p) => ({
        rotulo: p,
        acao: { tipo: 'adicionarSubtarefas', id: contexto.id, titulos: [p] },
      })),
    }
  }

  // --- sem correspondencia: o mock ADMITE que e mock ----------------------
  return {
    especie: 'resposta',
    texto:
      'Neste protótipo eu respondo a um conjunto fixo de pedidos — não há modelo de ' +
      'linguagem por trás. Tente “organizar meu dia”, “planejar minha semana”, ' +
      '“o que está atrasado?” ou “encontrar algo que anotei”.',
  }
}

// REVISAR altera a MESMA proposta, em vez de criar outra. É a diferença entre
// "não é bem isso" e "esquece, começa de novo".
export function revisar(proposta, pedido) {
  const t = String(pedido || '').toLowerCase()
  if (/tarde|depois|mais tarde/.test(t)) {
    return {
      ...proposta,
      revisada: 'movi o que tinha horário para mais tarde',
      mudancas: proposta.mudancas.map((m) =>
        m.acao.tipo === 'reservarHorario'
          ? { ...m, rotulo: m.rotulo.replace(/\d{2}:\d{2}–\d{2}:\d{2}/, '16:30–17:00'), acao: { ...m.acao, inicio: '16:30', fim: '17:00' } }
          : m,
      ),
    }
  }
  if (/menos|só|so o|apenas|simples/.test(t)) {
    return {
      ...proposta,
      revisada: 'deixei só a mudança mais importante',
      mudancas: proposta.mudancas.slice(0, 1),
    }
  }
  return {
    ...proposta,
    revisada: 'não entendi o ajuste, então mantive a proposta como estava — desmarque o que não serve',
  }
}
