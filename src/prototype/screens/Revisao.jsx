import { useProto } from '../store/contexto'
import { atrasadas, porOrganizar } from '../store/reducer'
import { Secao } from '../parts/base'

// ---------------------------------------------------------------------------
// REVISAO — apenas a direcao, como combinado para o UX1.
//
// A forma importa mais que o conteudo aqui: EVIDENCIA -> INTERPRETACAO ->
// DECISAO. O produto mostra o que observou, diz o que aquilo pode significar e
// devolve a decisao para a pessoa.
//
// Nenhum julgamento: nada de "furou", "falhou", "atrasou de novo". Um numero e
// um numero; o que ele quer dizer, quem sabe e quem viveu a semana.
// ---------------------------------------------------------------------------
export default function Revisao() {
  const { estado } = useProto()
  const vencidas = atrasadas(estado)
  const soltas = porOrganizar(estado)

  const itens = [
    {
      evidencia: `"${estado.tarefas.find((t) => t.id === 't-consorcio')?.titulo}" mudou de dia 4 vezes.`,
      interpretacao: 'Pode ser maior do que parece, ou depender de alguém.',
      decisao: 'Quebrar em passos, delegar ou tirar da lista.',
    },
    {
      evidencia: `${soltas.length} capturas estão guardadas sem organização.`,
      interpretacao: 'A entrada está funcionando; a saída, nem tanto.',
      decisao: 'Reservar 15 minutos para passar por elas.',
    },
    {
      evidencia: 'Dois compromissos se encostam na quinta, às 10:00.',
      interpretacao: 'Um dos dois vai começar atrasado.',
      decisao: 'Mover um ou encurtar o primeiro.',
    },
  ]

  return (
    <div className="px-entra">
      <header>
        <h1 className="px-titulo-tela">Revisão</h1>
        <p className="mt-1 text-[13px] text-muted">Como foi a semana</p>
        <p className="mt-2 text-[13.5px] text-muted">
          {vencidas.length} com prazo vencido · {soltas.length} por organizar
        </p>
      </header>

      <Secao>
        {itens.map((i) => (
          <article key={i.evidencia} className="border-t border-hairline py-5 first:border-t-0 first:pt-2">
            <p className="text-[15px] font-medium leading-snug">{i.evidencia}</p>
            <p className="mt-1.5 text-[14px] leading-relaxed text-secondary">{i.interpretacao}</p>
            <p className="px-motivo mt-2">Você decide: {i.decisao}</p>
          </article>
        ))}
      </Secao>

      <p className="mt-8 text-[12.5px] leading-relaxed text-faint">
        Direção apenas — esta área será desenvolvida depois do UX1.
      </p>
    </div>
  )
}
