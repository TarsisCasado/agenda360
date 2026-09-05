import { cx } from '../../lib/utils'

// ---------------------------------------------------------------------------
// A MOLDURA DE UMA PAGINA — largura, cabecalho e ritmo, um lugar so.
//
// O problema que isto resolve (CP5.7): navegando pelo produto, o titulo de cada
// tela comecava numa coluna diferente. Hoje era uma coluna centrada de 672px,
// Tarefas ocupava a largura toda, Central de links comecava colada na margem
// esquerda e Ideias parecia centralizada. Nada disso era decisao: era o
// acumulo de telas escritas em epocas diferentes. O olho le isso como
// "aplicativos diferentes" antes de ler qualquer conteudo.
//
// LARGURA POR TIPO DE TELA, nao um max-width unico para tudo. O que decide a
// largura e a NATUREZA da tela:
//
//   focus      Hoje, Copiloto. Uma coisa de cada vez. Coluna de leitura, que
//              vira duas zonas no monitor grande em vez de esticar a linha.
//   workspace  Tarefas, Agenda (semana/mes). Aqui o espaco E a ferramenta:
//              quatro colunas ou sete dias precisam da largura inteira.
//   content    Ideias, Caixa de entrada. Texto que se le e se escreve; linha
//              longa demais cansa.
//   form       Central de links, Configuracoes. Formulario com resultado ao
//              lado: larga o suficiente para as duas coisas conviverem, nunca
//              a ponto de o campo virar uma faixa de ponta a ponta.
//
// A pagina fica CENTRADA no eixo da area util (menos a `workspace`, que usa
// tudo). Centrar todas no mesmo eixo e o que faz a troca de tela parecer
// continuacao, e nao salto.
// ---------------------------------------------------------------------------
// A moldura tem duas medidas: a EXTERNA, que e o eixo em que a pagina se
// centra, e a INTERNA, que e a linha de leitura. Elas coincidem quase sempre;
// separa-las serve a `content`, onde a coluna de texto precisa ser estreita
// (linha longa cansa) mas o titulo tem de comecar na MESMA coluna das outras
// telas. Sem isso, ir de Hoje para Ideias empurrava o titulo 128px para a
// direita — o tipo de salto que se sente sem saber nomear.
const LARGURAS = {
  focus: ['max-w-2xl xl:max-w-5xl', null],
  workspace: ['max-w-none', null],
  content: ['max-w-5xl', 'max-w-2xl'],
  form: ['max-w-5xl', null],
}

export function Page({ width = 'content', className, children }) {
  const [fora, dentro] = LARGURAS[width] || LARGURAS.content
  return (
    <div className={cx('mx-auto w-full', fora, className)}>
      {dentro ? <div className={cx('w-full', dentro)}>{children}</div> : children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// CABECALHO — o mesmo ritmo em todas as telas.
//
// titulo (text-display) -> contexto (text-caption, 4px abaixo) -> conteudo
// (20px abaixo). `actions` fica na mesma linha do titulo, alinhado pela base:
// e uma acao DAQUELA tela, nao uma barra de ferramentas.
// ---------------------------------------------------------------------------
export function PageHeader({ title, subtitle, actions, className }) {
  return (
    // O `px-2` nao e capricho: as telas de referencia (Hoje, Agenda, Copiloto)
    // ja recuavam o cabecalho 8px para alinhar com o TEXTO das linhas, que tem
    // esse respiro interno. Sem ele, os titulos das telas migradas ficariam 8px
    // a esquerda dos aprovados — e "quase alinhado" e pior que desalinhado.
    <header className={cx('mb-5 flex items-end justify-between gap-3 px-2', className)}>
      <div className="min-w-0">
        <h1 className="text-display truncate">{title}</h1>
        {subtitle && <p className="text-caption mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  )
}
