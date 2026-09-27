import { useState, useEffect } from 'react'
import { Bell, ChevronRight } from 'lucide-react'
import { OPCOES_RELATIVAS, descreverAlerta, referenciaDe } from '../mock/alerta'
import { Folha, Botao, Chip, Campo, Texto } from './base'
import { cx } from '../../lib/utils'

// ---------------------------------------------------------------------------
// ALERTA — resumo compacto no formulario, configuracao completa ao tocar.
//
// No formulario o alerta nao merece um bloco: ele e uma linha que diz o estado
// ("sem alerta", "15 min antes do compromisso") e abre quando alguem quer
// mexer. Ocupar meia tela com sete opcoes de lembrete desequilibra um
// formulario cujo assunto e outro.
//
// A REFERENCIA fica escrita, sempre. "15 min antes" nao diz nada sozinho; "15
// min antes do horario reservado" diz. E quando nao ha referencia temporal
// nenhuma — tarefa sem prazo e sem horario —, o relativo simplesmente nao esta
// disponivel, e a saida honesta e data e hora especificas.
//
// Multiplos alertas: fora deste checkpoint, de proposito.
// ---------------------------------------------------------------------------
export default function AlertaCampo({ valor, aoMudar, item }) {
  const [aberta, setAberta] = useState(false)
  const referencia = referenciaDe(item)

  return (
    <div>
      <span className="px-rotulo">Alerta</span>
      <button
        type="button"
        onClick={() => setAberta(true)}
        className="press flex w-full items-center gap-2 rounded-control border border-hairline px-3 py-2 text-left text-[13.5px] transition hover:border-accent"
      >
        <Bell size={15} className="flex-none text-muted" />
        <span className={cx('flex-1', !valor && 'text-muted')}>
          {descreverAlerta(valor, referencia)}
        </span>
        <ChevronRight size={15} className="flex-none text-muted" />
      </button>

      <ConfiguracaoDeAlerta
        aberta={aberta}
        aoFechar={() => setAberta(false)}
        valor={valor}
        referencia={referencia}
        aoMudar={(v) => { aoMudar(v); setAberta(false) }}
      />
    </div>
  )
}

function ConfiguracaoDeAlerta({ aberta, aoFechar, valor, referencia, aoMudar }) {
  const [especifico, setEspecifico] = useState(valor?.em || '')

  useEffect(() => { if (aberta) setEspecifico(valor?.em || '') }, [aberta, valor])
  if (!aberta) return null

  const NOME = {
    compromisso: 'do compromisso',
    reserva: 'do horário reservado',
    prazo: 'do prazo',
  }[referencia?.tipo]

  return (
    <Folha aberta aoFechar={aoFechar} titulo="Alerta" largura="max-w-[440px]">
      <button
        type="button"
        onClick={() => aoMudar(null)}
        className={cx(
          'press mb-3 flex w-full items-center rounded-row border px-4 py-2.5 text-[14px] transition',
          !valor ? 'border-accent bg-accent-soft text-accent-text' : 'border-hairline hover:border-accent',
        )}
      >
        Sem alerta
      </button>

      {referencia ? (
        <>
          <p className="px-secao mb-1.5">Relativo {NOME}</p>
          <p className="mb-2 text-[12.5px] leading-relaxed text-muted">
            A referência é <span className="px-hora font-medium text-secondary">{referencia.hora}</span> de{' '}
            {referencia.data.slice(8, 10)}/{referencia.data.slice(5, 7)}. Se ela mudar, o alerta
            relativo acompanha.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {OPCOES_RELATIVAS.map((o) => (
              <Chip
                key={o.minutos}
                on={valor?.minutos === o.minutos && !valor?.em}
                onClick={() => aoMudar({ minutos: o.minutos, referencia: referencia.tipo })}
              >
                {o.label}
              </Chip>
            ))}
          </div>
        </>
      ) : (
        <p className="rounded-row border border-hairline bg-surface-2 px-3.5 py-2.5 text-[13px] leading-relaxed text-secondary">
          Esta atividade não tem horário reservado nem prazo, então não existe
          referência para “antes de”. Use data e hora específicas abaixo.
        </p>
      )}

      <div className="mt-5 border-t border-hairline pt-4">
        <p className="px-secao mb-1.5">Horário específico</p>
        <p className="mb-2 text-[12.5px] leading-relaxed text-muted">
          Um alerta específico não se desloca sozinho: você escolheu aquele instante.
        </p>
        <Campo rotulo="Data e hora">
          <Texto
            type="datetime-local"
            value={especifico}
            onChange={(e) => setEspecifico(e.target.value)}
          />
        </Campo>
        <Botao
          variante="secundario"
          className="mt-2"
          disabled={!especifico}
          onClick={() => aoMudar({ em: especifico.slice(0, 16) })}
        >
          Usar este horário
        </Botao>
      </div>
    </Folha>
  )
}
