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
