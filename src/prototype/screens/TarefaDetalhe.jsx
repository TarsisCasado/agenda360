import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Sparkles, CornerUpLeft, Ban, BellOff, Bell, UserPlus } from 'lucide-react'
import { useProto, useAcoes, useDesktop } from '../store/contexto'
import { tarefaPorId, memoriaPorId } from '../store/reducer'
import { ESTADO, RESPONSABILIDADE, EU, rotuloDeData, rotuloDeMomento, somarDias, iso, nomeDoDia, diaCurto, numeroDoDia, inicioDaSemana } from '../mock/dados'
import { sugerirPassos, espera } from '../mock/ia'
import { Secao, Botao, Chip, Marcar, Folha, Area } from '../parts/base'
import { Pessoa, SeloResponsabilidade, LinhaDeDelegacao, EscolherPessoa } from '../parts/pessoas'
import { MenuAcoes } from '../parts/movel'
import { descreverAlerta, referenciaDe } from '../mock/alerta'
import TarefaForm from '../forms/TarefaForm'
import { cx } from '../../lib/utils'

// ---------------------------------------------------------------------------
// DETALHE DA TAREFA — onde moram as duas decisoes que o produto nao pode
// confundir:
//
//   FAZER EM TAL DIA   escolho o dia. Nao reserva hora nenhuma.
//   RESERVAR HORARIO   escolho um intervalo e o protejo na agenda.
//
// Sao coisas diferentes na cabeca de quem usa, entao sao controles diferentes
// na tela. Retirar o horario reservado nao conclui, nao exclui e nao tira o
// dia: para tirar o dia existe outro botao, dito com todas as letras.
//
// E, quando a tarefa nasceu de uma nota, a ORIGEM fica visivel e navegavel —
// e a nota continua la, inteira.
// ---------------------------------------------------------------------------
export default function TarefaDetalhe() {
  const { id } = useParams()
  const navegar = useNavigate()
  const { estado } = useProto()
  const acoes = useAcoes()
  const desktop = useDesktop()
  const t = tarefaPorId(estado, id)
  const [sugestoes, setSugestoes] = useState(null)
  const [selecionadas, setSelecionadas] = useState([])
  const [pensando, setPensando] = useState(false)
  const [escolhendoHora, setEscolhendoHora] = useState(false)
  const [editando, setEditando] = useState(false)
  const [delegando, setDelegando] = useState(false)
  const [devolvendo, setDevolvendo] = useState(false)
  const [bloqueando, setBloqueando] = useState(false)

  if (!t) {
    return (
      <div className="px-entra">
        <p className="text-secondary">Tarefa não encontrada.</p>
        <Link to="/prototipo/tarefas" className="mt-3 inline-block text-accent-text">Voltar</Link>
      </div>
    )
  }

  const origem = t.origemId ? memoriaPorId(estado, t.origemId) : null
  const seg = inicioDaSemana(new Date(`${estado.hoje}T12:00:00`))
  const dias = Array.from({ length: 7 }, (_, i) => iso(somarDias(seg, i)))

  const pedirPassos = async () => {
    setPensando(true)
    await espera(650)
    const s = sugerirPassos(t.titulo)
    setSugestoes(s)
    setSelecionadas(s)   // vem tudo marcado, mas nada e aplicado sem confirmar
    setPensando(false)
  }

  const alternar = (p) =>
    setSelecionadas((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]))

  return (
    <div className="px-entra">
      <button onClick={() => navegar(-1)} className="press -ml-1 mb-5 flex items-center gap-1.5 text-[13.5px] text-muted">
        <ArrowLeft size={16} /> Voltar
      </button>

      <div className="flex items-start gap-3">
        <Marcar
          feito={t.estado === ESTADO.FEITO}
          label="Concluir"
          onClick={() => acoes.mudarEstado(t.id, t.estado === ESTADO.FEITO ? ESTADO.A_FAZER : ESTADO.FEITO)}
        />
        <h1 className={cx('min-w-0 flex-1 text-[20px] font-semibold leading-snug', t.estado === ESTADO.FEITO && 'line-through opacity-60')}>
          {t.titulo}
        </h1>
        <Botao variante="secundario" className="flex-none px-3 py-1.5" onClick={() => setEditando(true)}>
          Editar
        </Botao>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Chip on={t.estado === ESTADO.FAZENDO}
          onClick={() => acoes.mudarEstado(t.id, t.estado === ESTADO.FAZENDO ? ESTADO.A_FAZER : ESTADO.FAZENDO)}>
          {t.estado === ESTADO.FAZENDO ? 'Em andamento' : 'A fazer'}
        </Chip>
        {t.contexto && <Chip>{t.contexto}</Chip>}
        {t.prioridade === 'alta' && <Chip>Prioridade alta</Chip>}
        {!t.planejadaPara && !t.prazo && <Chip>Sem data</Chip>}
      </div>

      {t.descricao && (
        <p className="mt-3 max-w-[62ch] whitespace-pre-line text-[14.5px] leading-relaxed text-secondary">
          {t.descricao}
        </p>
      )}

      {/* ORIGEM — a nota que gerou esta tarefa continua existindo. */}
      {origem && (
        <Link
          to={`/prototipo/memoria/${origem.id}`}
          className="press mt-5 flex items-center gap-2.5 rounded-row border border-hairline bg-surface-2 px-4 py-3 transition hover:border-accent"
        >
          <CornerUpLeft size={16} className="flex-none text-accent-text" />
          <span className="min-w-0">
            <span className="px-secao block">Origem</span>
            <span className="mt-0.5 block truncate text-[14.5px]">{origem.titulo}</span>
          </span>
        </Link>
      )}

      {/* 1) RESPONSABILIDADE vem cedo: "de quem é isto?" é a primeira pergunta
             de qualquer tarefa que passa por mais de uma pessoa, e ela muda o
             sentido de tudo que vem depois. --------------------------------- */}
      <Responsabilidade
        t={t}
        acoes={acoes}
        aoDelegar={() => setDelegando(true)}
        aoDevolver={() => setDevolvendo(true)}
        aoBloquear={() => setBloqueando(true)}
      />

      {/* 2) O DIA -------------------------------------------------------- */}
      <Secao titulo="Quando fazer">
        <p className="mb-2.5 text-[13px] leading-relaxed text-muted">
          {desktop
            ? 'Escolher o dia não reserva horário — é só o dia em que você pretende fazer.'
            : 'Só o dia; o horário é a seção seguinte.'}
        </p>
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
          {dias.map((d) => (
            <button
              key={d}
              onClick={() => acoes.planejarPara(t.id, d)}
              className={cx(
                'press flex min-w-[52px] flex-col items-center gap-0.5 rounded-row border px-2 py-2 transition',
                t.planejadaPara === d
                  ? 'border-transparent bg-accent-soft font-semibold text-accent-text'
                  : 'border-hairline text-secondary hover:border-accent',
              )}
            >
              <span className="text-[10.5px] uppercase tracking-wider">{diaCurto(d)}</span>
              <span className="px-hora text-[15px]">{numeroDoDia(d)}</span>
            </button>
          ))}
        </div>
        {t.planejadaPara && (
          <p className="mt-2.5 flex flex-wrap items-center gap-x-3 text-[13.5px] text-secondary">
            <span>Fazer {nomeDoDia(t.planejadaPara) === nomeDoDia(estado.hoje) && t.planejadaPara === estado.hoje ? 'hoje' : `na ${nomeDoDia(t.planejadaPara)}`}.</span>
            <button onClick={() => acoes.retirarPlanejamento(t.id)} className="press text-[13px] text-muted hover:text-accent-text">
              Tirar o dia
            </button>
          </p>
        )}
      </Secao>

      {/* 3) O HORARIO — decisao separada ---------------------------------- */}
      <Secao titulo="Horário reservado">
        {t.reserva ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="text-[15px]">
              <span className="px-hora font-semibold">{t.reserva.inicio}–{t.reserva.fim}</span>
              <span className="text-secondary"> · {rotuloDeData(t.reserva.data, estado.hoje)}</span>
            </p>
            <button
              onClick={() => acoes.retirarReserva(t.id)}
              className="press text-[13px] text-muted hover:text-accent-text"
            >
              Retirar horário reservado
            </button>
            <p className="w-full text-[12.5px] text-faint">
              Retirar o horário não conclui nem apaga a tarefa — ela continua {t.estado === ESTADO.FAZENDO ? 'em andamento' : 'na lista'}.
            </p>
          </div>
        ) : escolhendoHora ? (
          <div className="flex flex-wrap items-center gap-2">
            {['09:00', '11:00', '14:00', '16:00'].map((h) => (
              <button
                key={h}
                onClick={() => { acoes.reservarHorario(t.id, t.planejadaPara || estado.hoje, h, maisUma(h)); setEscolhendoHora(false) }}
                className="press rounded-control border border-hairline px-3 py-1.5 text-[13.5px] hover:border-accent"
              >
                <span className="px-hora">{h}–{maisUma(h)}</span>
              </button>
            ))}
            <button onClick={() => setEscolhendoHora(false)} className="press text-[13px] text-muted">cancelar</button>
          </div>
        ) : (
          <div>
            <p className="mb-2.5 text-[13px] leading-relaxed text-muted">
              Nenhum tempo protegido para esta tarefa.
            </p>
            <Botao variante="secundario" onClick={() => setEscolhendoHora(true)}>Reservar horário</Botao>
          </div>
        )}
      </Secao>

      {/* 4) O ALERTA — e sempre relativo a ALGUMA COISA -------------------- */}
      <Secao titulo="Alerta">
        <p className="text-[14px]">
          {t.alerta ? (
            <span className="font-medium">{descreverAlerta(t.alerta, referenciaDe(t))}</span>
          ) : (
            <span className="text-muted">Sem alerta</span>
          )}
        </p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-faint">
          {desktop && (referenciaDe(t)
            ? 'Alerta relativo acompanha a referência: mudar o horário move o lembrete junto. '
            : 'Esta tarefa não tem horário nem prazo — um alerta aqui precisaria de data e hora específicas. ')}
          Configure em <strong className="font-semibold">Editar</strong>.
        </p>
      </Secao>

      {/* 5) IA CONTEXTUAL — propoe; aplica so o que for selecionado ------- */}
      <Secao titulo="Próximos passos">
        {t.subtarefas.length > 0 && (
          <div className="mb-3">
            {t.subtarefas.map((s) => (
              <div key={s.id} className="px-linha items-start">
                <Marcar feito={s.feito} label={s.titulo} onClick={() => acoes.alternarSubtarefa(t.id, s.id)} />
                <span className={cx('flex-1 text-[14.5px]', s.feito && 'line-through opacity-60')}>{s.titulo}</span>
              </div>
            ))}
          </div>
        )}

        {!sugestoes && (
          <div className="flex flex-wrap gap-2">
            <Botao variante="secundario" onClick={pedirPassos} disabled={pensando}>
              <Sparkles size={15} /> {pensando ? 'Pensando…' : 'Sugerir próximos passos'}
            </Botao>
            {/* Quando a sugestão curta não basta, a MESMA assistência abre em
                conversa — levando o contexto junto, não recomeçando do zero. */}
            <Botao variante="fantasma" onClick={() => navegar(`/prototipo/copiloto?contexto=tarefa&id=${t.id}`)}>
              Conversar sobre esta tarefa
            </Botao>
          </div>
        )}

        {sugestoes && (
          <div className="px-proposta px-entra mt-1 p-4">
            <p className="text-[13.5px] text-secondary">
              Separei o que eu faria. Escolha o que serve — nada entra sem você confirmar.
            </p>
            <div className="mt-3">
              {sugestoes.map((p) => (
                <button
                  key={p}
                  onClick={() => alternar(p)}
                  className="px-linha w-full items-start text-left"
                >
                  <span className={cx(
                    'mt-0.5 grid h-[18px] w-[18px] flex-none place-items-center rounded-[6px] border',
                    selecionadas.includes(p) ? 'border-accent bg-accent text-white' : 'border-hairline',
                  )}>
                    {selecionadas.includes(p) && (
                      <svg viewBox="0 0 12 12" className="h-3 w-3"><path d="M2.5 6.2 4.7 8.4 9.5 3.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    )}
                  </span>
                  <span className="flex-1 text-[14.5px]">{p}</span>
                </button>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Botao
                variante="primario"
                disabled={!selecionadas.length}
                className={cx(!selecionadas.length && 'opacity-40')}
                onClick={() => { acoes.adicionarSubtarefas(t.id, selecionadas); setSugestoes(null) }}
              >
                Adicionar {selecionadas.length} {selecionadas.length === 1 ? 'passo' : 'passos'}
              </Botao>
              <Botao variante="fantasma" onClick={() => setSugestoes(null)}>Descartar sugestão</Botao>
            </div>
          </div>
        )}
      </Secao>

      {/* 6) ATIVIDADE — o histórico completo, inclusive o que não notificou -- */}
      <Atividade t={t} hoje={estado.hoje} />

      <TarefaForm aberta={editando} aoFechar={() => setEditando(false)} tarefa={t} />
      <EscolherPessoa
        aberta={delegando}
        aoFechar={() => setDelegando(false)}
        t={t}
        aoEscolher={(id) => { acoes.delegar(t.id, id); setDelegando(false) }}
      />
      <Devolver
        aberta={devolvendo}
        aoFechar={() => setDevolvendo(false)}
        t={t}
        aoDevolver={(motivo) => { acoes.devolver(t.id, motivo); setDevolvendo(false) }}
      />
      <RegistrarBloqueio
        aberta={bloqueando}
        aoFechar={() => setBloqueando(false)}
        t={t}
        aoRegistrar={(motivo) => { acoes.bloquear(t.id, motivo); setBloqueando(false) }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// RESPONSABILIDADE — "quem assumiu isto?" nunca e "em que pe esta?".
//
// Por isso esta secao existe separada das colunas: aceitar nao move de coluna,
// e mover de coluna nao aceita nada. Uma tarefa pode estar EM ANDAMENTO e
// AGUARDANDO ACEITE ao mesmo tempo — soa estranho ate perceber que sao duas
// perguntas diferentes feitas a duas pessoas diferentes.
//
// Um responsavel principal por vez neste checkpoint. Delegar de novo troca o
// nome na MESMA tarefa; nao nasce copia nenhuma.
// ---------------------------------------------------------------------------
function Responsabilidade({ t, acoes, aoDelegar, aoDevolver, aoBloquear }) {
  const desktop = useDesktop()
  const meu = (t.responsavelId || EU) === EU
  const delegadaPorMim = t.delegadorId === EU && !meu
  const recebida = meu && t.delegadorId && t.delegadorId !== EU
  const devolvida = t.responsabilidade === RESPONSABILIDADE.DEVOLVIDA

  return (
    <Secao titulo="Responsável">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Pessoa id={t.responsavelId} comNome />
        <SeloResponsabilidade t={t} />
        {t.bloqueio && (
          <span className="px-selo px-selo-bloqueada"><Ban size={10} /> {t.bloqueio}</span>
        )}
      </div>

      <LinhaDeDelegacao t={t} className="mt-1.5 block" />

      {devolvida && t.motivoDevolucao && (
        <p className="mt-2.5 rounded-row border border-danger/30 bg-danger/[0.06] px-3.5 py-2.5 text-[13.5px] leading-relaxed text-secondary">
          <strong className="font-semibold text-primary">Motivo da devolução:</strong> {t.motivoDevolucao}
        </p>
      )}

      {/* No telefone só as decisões de RESPONSABILIDADE ficam à vista; bloqueio
          e acompanhar entram no menu. Cinco botões e um parágrafo explicando
          notificação eram meia tela antes de "quando fazer". */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {/* Recebida e ainda sem resposta: as duas saídas, lado a lado. */}
        {recebida && t.responsabilidade === RESPONSABILIDADE.AGUARDANDO && (
          <>
            <Botao variante="primario" onClick={() => acoes.aceitar(t.id)}>Aceitar</Botao>
            <Botao variante="secundario" onClick={aoDevolver}>Devolver…</Botao>
          </>
        )}
        {recebida && t.responsabilidade === RESPONSABILIDADE.ACEITA && (
          <Botao variante="secundario" onClick={aoDevolver}>Devolver…</Botao>
        )}
        {devolvida && meu && (
          <Botao variante="primario" onClick={() => acoes.retomar(t.id)}>Assumir de volta</Botao>
        )}
        <Botao variante="secundario" onClick={aoDelegar}>
          <UserPlus size={15} /> {delegadaPorMim ? 'Trocar responsável' : 'Delegar…'}
        </Botao>

        {desktop ? (
          <>
            <Botao variante="fantasma" onClick={aoBloquear}>
              <Ban size={15} /> {t.bloqueio ? 'Rever bloqueio' : 'Registrar bloqueio'}
            </Botao>
            <Botao variante="fantasma" className="ml-auto" onClick={() => acoes.alternarAcompanhar(t.id)}>
              {t.acompanhando ? <><BellOff size={15} /> Silenciar</> : <><Bell size={15} /> Acompanhar</>}
            </Botao>
          </>
        ) : (
          <MenuAcoes
            titulo="Responsabilidade"
            subtitulo={t.titulo}
            rotulo="Mais ações de responsabilidade"
            acoes={[
              {
                rotulo: t.bloqueio ? 'Rever bloqueio' : 'Registrar bloqueio',
                icone: Ban,
                fazer: aoBloquear,
              },
              {
                rotulo: t.acompanhando ? 'Silenciar esta tarefa' : 'Acompanhar esta tarefa',
                icone: t.acompanhando ? BellOff : Bell,
                fazer: () => acoes.alternarAcompanhar(t.id),
              },
            ]}
          />
        )}
      </div>

      {desktop && (
        <p className="mt-2 text-[12px] leading-relaxed text-faint">
          {t.acompanhando
            ? 'Você recebe notificação dos eventos relevantes desta tarefa. O histórico registra tudo de qualquer forma.'
            : 'Silenciada: os eventos continuam no histórico abaixo, mas não interrompem você.'}
        </p>
      )}
      {!desktop && !t.acompanhando && (
        <p className="mt-2 text-[12px] text-faint">Silenciada — continua no histórico.</p>
      )}
    </Secao>
  )
}

// ---------------------------------------------------------------------------
// ATIVIDADE — autor, evento, momento.
//
// E aqui que a diferenca entre HISTORICO e NOTIFICACAO fica visivel: tudo entra
// nesta lista, inclusive "moveu A fazer → Em andamento", que nao interrompeu
// ninguem. Quem quiser conferir o caminho da tarefa tem o caminho inteiro.
// ---------------------------------------------------------------------------
const FRASE = {
  delegou: 'delegou', atribuiu: 'atribuiu', aceitou: 'aceitou', devolveu: 'devolveu',
  moveu: 'moveu', bloqueou: 'bloqueou', desbloqueou: 'desbloqueou', comentou: 'comentou',
  concluiu: 'concluiu', reagendou: 'reagendou', retomou: 'assumiu de volta',
  'alterou o prazo': 'alterou o prazo',
}

function Atividade({ t, hoje }) {
  const eventos = [...(t.atividade || [])].sort((a, b) => b.quando.localeCompare(a.quando))
  return (
    <Secao titulo="Atividade">
      {eventos.length === 0 ? (
        <p className="text-[13.5px] text-muted">Nada registrado ainda.</p>
      ) : (
        eventos.map((e) => (
          <div key={e.id} className="px-linha items-start gap-2.5 py-2">
            <Pessoa id={e.autorId} />
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] leading-snug">
                <NomeDoAutor id={e.autorId} /> {FRASE[e.evento] || e.evento}
                {e.detalhe && !['comentou', 'devolveu', 'bloqueou'].includes(e.evento) && (
                  <span className="text-secondary"> {e.detalhe}</span>
                )}
              </span>
              {['comentou', 'devolveu', 'bloqueou'].includes(e.evento) && e.detalhe && (
                <span className="mt-0.5 block text-[13px] leading-snug text-secondary">“{e.detalhe}”</span>
              )}
              <span className="px-motivo mt-0.5 block">{rotuloDeMomento(e.quando, hoje)}</span>
            </span>
          </div>
        ))
      )}
    </Secao>
  )
}

function NomeDoAutor({ id }) {
  const { estado } = useProto()
  const p = (estado.pessoas || []).find((x) => x.id === id)
  return <strong className="font-semibold">{p?.eu ? 'Você' : p?.nome || 'Alguém'}</strong>
}

// --- folhas de decisão -------------------------------------------------------
// DEVOLVER EXIGE MOTIVO — e o botão fica desabilitado até haver um. Devolver em
// silêncio transfere o problema sem transferir a informação.
function Devolver({ aberta, aoFechar, t, aoDevolver }) {
  const [motivo, setMotivo] = useState('')
  useEffect(() => { if (aberta) setMotivo('') }, [aberta])
  if (!aberta) return null
  return (
    <Folha
      aberta
      aoFechar={aoFechar}
      titulo="Devolver a tarefa"
      subtitulo={t.titulo}
      largura="max-w-[460px]"
      rodape={
        <>
          <Botao variante="primario" disabled={!motivo.trim()} onClick={() => aoDevolver(motivo)}>
            Devolver
          </Botao>
          <Botao variante="fantasma" onClick={aoFechar}>Cancelar</Botao>
        </>
      }
    >
      <p className="mb-3 text-[13.5px] leading-relaxed text-secondary">
        Devolver cria uma decisão visível para quem delegou. O motivo é obrigatório —
        sem ele a tarefa volta sem dizer o que travou.
      </p>
      <Area
        autoFocus
        rows={4}
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="O que impediu? O que você precisa para seguir?"
      />
      {!motivo.trim() && <p className="mt-2 text-[12px] text-faint">Escreva o motivo para poder devolver.</p>}
    </Folha>
  )
}

function RegistrarBloqueio({ aberta, aoFechar, t, aoRegistrar }) {
  const [motivo, setMotivo] = useState('')
  useEffect(() => { if (aberta) setMotivo(t.bloqueio || '') }, [aberta, t.bloqueio])
  if (!aberta) return null
  return (
    <Folha
      aberta
      aoFechar={aoFechar}
      titulo="Bloqueio"
      subtitulo={t.titulo}
      largura="max-w-[460px]"
      rodape={
        <>
          <Botao variante="primario" disabled={!motivo.trim()} onClick={() => aoRegistrar(motivo)}>
            Registrar
          </Botao>
          {t.bloqueio && (
            <Botao variante="secundario" onClick={() => aoRegistrar('')}>Remover bloqueio</Botao>
          )}
          <Botao variante="fantasma" onClick={aoFechar}>Cancelar</Botao>
        </>
      }
    >
      <p className="mb-3 text-[13.5px] leading-relaxed text-secondary">
        Bloqueio é uma condição, não uma coluna: a tarefa continua onde está e
        ganha um impedimento declarado.
      </p>
      <Area
        autoFocus
        rows={3}
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Ex.: aguardando documento do RH"
      />
    </Folha>
  )
}

function maisUma(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
