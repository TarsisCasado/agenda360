import { describe, it, expect, beforeEach, vi } from 'vitest'

// MODO DEMO (localStore). Sem rede, sem Supabase, sem worker.
vi.mock('../lib/supabaseClient', () => ({ supabase: null, isSupabaseConfigured: false }))

import { reminderService, computeDesiredReminders } from '../services/reminderService'
import { localStore } from '../services/localStore'
import { computeRemindAt } from '../lib/reminderTime'
import { alertaPrecisaDeHorario, validarAlerta, CANAL_PADRAO, PEDIR_HORARIO } from '../lib/alertRules'
import { ALERT_TYPES, STATUS } from '../lib/constants'
import { baseline, invariante, mudaEm } from './contrato'

// ---------------------------------------------------------------------------
// BASELINE — ALERTAS E LEMBRETES.
//
// AREA CONGELADA. Este arquivo so LE: nao chama worker, nao toca schema, nao
// dispara push. Tudo em modo demo, com o relogio e o fuso controlados.
//
// O que ele fotografa e a fronteira que o C9 vai mexer: hoje a REFERENCIA do
// alerta e implicita — sempre `start_time`. Os testes que dependem disso estao
// marcados [MUDA:C9]. A regra "alerta sem horario nao vira lembrete", que o
// UX1.3.1 promoveu a invariante, ja e verdade hoje e esta marcada como tal.
// ---------------------------------------------------------------------------

const WS = '00000000-0000-4000-8000-0000000000b1'
const USER = '00000000-0000-4000-8000-000000000001'
const OUTRO = '00000000-0000-4000-8000-000000000002'

beforeEach(() => {
  const store = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  })
  localStore.setTable('profiles', [
    { id: USER, timezone: 'America/Sao_Paulo' },
    { id: OUTRO, timezone: 'Asia/Tokyo' },
  ])
  localStore.setTable('reminders', [])
})

const tarefa = (over = {}) => ({
  id: 'task-1',
  workspace_id: WS,
  created_by: USER,
  assignee_id: USER,
  status: STATUS.TODO,
  alert_enabled: true,
  alert_type: ALERT_TYPES.PUSH,
  alert_minutes_before: 15,
  date: '2026-09-23',
  start_time: '09:00',
  ...over,
})

const vivos = () => localStore.table('reminders').filter((r) => !r.sent && !r.cancelled_at)

describe('BASELINE Alertas — quando existe lembrete', () => {
  it(baseline('alerta ligado, com dia e hora: gera exatamente um lembrete'), async () => {
    await reminderService.syncForTask(tarefa(), { actorId: USER })
    expect(vivos().length).toBe(1)
  })

  it(baseline('alerta desligado: nenhum lembrete'), async () => {
    await reminderService.syncForTask(tarefa({ alert_enabled: false }), { actorId: USER })
    expect(vivos().length).toBe(0)
  })

  it(
    invariante('INV-18', 'alerta ligado SEM horario nao vira lembrete — o produto nao inventa hora'),
    async () => {
      await reminderService.syncForTask(tarefa({ start_time: null }), { actorId: USER })
      expect(vivos().length).toBe(0)
      expect(computeDesiredReminders(tarefa({ start_time: null }), 'America/Sao_Paulo', USER)).toEqual([])
    },
  )

  it(baseline('alerta ligado sem DIA tambem nao vira lembrete'), () => {
    expect(computeDesiredReminders(tarefa({ date: null }), 'America/Sao_Paulo', USER)).toEqual([])
  })

  it(invariante('INV-18', 'a regra de alerta pede o horario em vez de assumir um'), () => {
    const semHora = { alert_enabled: true, date: '2026-09-23', start_time: null }
    expect(alertaPrecisaDeHorario(semHora)).toBe(true)
    expect(validarAlerta(semHora)).toMatchObject({
      ok: false,
      motivo: 'sem_horario',
      mensagem: PEDIR_HORARIO,
    })
  })

  it(baseline('o canal padrao do produto e PUSH'), () => {
    expect(CANAL_PADRAO).toBe(ALERT_TYPES.PUSH)
  })
})

describe('BASELINE Alertas — estados que mantem ou matam o lembrete', () => {
  it(baseline('estados ativos (todo, em andamento, reagendada, delegada) mantem o lembrete'), () => {
    for (const s of [STATUS.TODO, STATUS.IN_PROGRESS, STATUS.RESCHEDULED, STATUS.DELEGATED]) {
      expect(computeDesiredReminders(tarefa({ status: s }), 'America/Sao_Paulo', USER).length).toBe(1)
    }
  })

  it(
    invariante('INV-nao-lembrar-o-que-acabou', 'estados terminais nao tem lembrete vivo'),
    async () => {
      for (const s of [STATUS.DONE, STATUS.MISSED, STATUS.NOT_NEEDED, STATUS.CANCELLED]) {
        expect(computeDesiredReminders(tarefa({ status: s }), 'America/Sao_Paulo', USER)).toEqual([])
      }
      // E o caminho real: concluir uma tarefa com lembrete o cancela.
      await reminderService.syncForTask(tarefa(), { actorId: USER })
      expect(vivos().length).toBe(1)
      await reminderService.syncForTask(tarefa({ status: STATUS.DONE }), { actorId: USER })
      expect(vivos().length).toBe(0)
    },
  )

  it(baseline('excluir a tarefa cancela os lembretes vivos'), async () => {
    await reminderService.syncForTask(tarefa(), { actorId: USER })
    await reminderService.onTaskDeleted(tarefa())
    expect(vivos().length).toBe(0)
  })
})

describe('BASELINE Alertas — reconciliacao', () => {
  it(baseline('IDEMPOTENTE: sincronizar duas vezes nao duplica o lembrete'), async () => {
    await reminderService.syncForTask(tarefa(), { actorId: USER })
    await reminderService.syncForTask(tarefa(), { actorId: USER })
    await reminderService.syncForTask(tarefa(), { actorId: USER })
    expect(vivos().length).toBe(1)
  })

  it(baseline('mudar o horario ATUALIZA o lembrete em vez de criar outro'), async () => {
    await reminderService.syncForTask(tarefa(), { actorId: USER })
    const antes = vivos()[0].remind_at
    await reminderService.syncForTask(tarefa({ start_time: '15:00' }), { actorId: USER })
    const depois = vivos()
    expect(depois.length).toBe(1)
    expect(depois[0].remind_at).not.toBe(antes)
  })

  it(baseline('mudar a antecedencia troca o lembrete (identidade logica muda)'), async () => {
    await reminderService.syncForTask(tarefa({ alert_minutes_before: 15 }), { actorId: USER })
    await reminderService.syncForTask(tarefa({ alert_minutes_before: 60 }), { actorId: USER })
    const v = vivos()
    expect(v.length).toBe(1)
    expect(v[0].minutes_before).toBe(60)
  })

  it(baseline('delegar troca o destinatario do lembrete'), async () => {
    await reminderService.syncForTask(tarefa(), { actorId: USER })
    expect(vivos()[0].recipient_id).toBe(USER)
    await reminderService.syncForTask(tarefa({ assignee_id: OUTRO }), { actorId: USER })
    const v = vivos()
    expect(v.length).toBe(1)
    expect(v[0].recipient_id).toBe(OUTRO)
  })
})

describe('BASELINE Alertas — a referencia e o calculo', () => {
  it(
    mudaEm(
      'C9',
      'a REFERENCIA do alerta e implicita: sempre `start_time`',
      'o alerta declara sua ancora (compromisso, reserva ou prazo) e pode ser absoluto',
    ),
    () => {
      const d = computeDesiredReminders(tarefa({ start_time: '09:00', alert_minutes_before: 15 }), 'UTC', USER)
      // 09:00 menos 15 min, no fuso do destinatario. Nao ha campo dizendo
      // "antes de que" — a unica ancora possivel e a hora de inicio.
      expect(d[0].remind_at).toBe(new Date(Date.UTC(2026, 8, 23, 8, 45)).toISOString())
      expect(d[0]).not.toHaveProperty('reference')
    },
  )

  it(baseline('o calculo respeita o fuso do DESTINATARIO, nao o do servidor'), () => {
    const sp = computeRemindAt('2026-09-23', '09:00', 15, 'America/Sao_Paulo')
    const tq = computeRemindAt('2026-09-23', '09:00', 15, 'Asia/Tokyo')
    expect(sp).not.toBe(tq)
    // 09:00 em Sao Paulo (UTC-3) = 12:00 UTC; menos 15 min = 11:45 UTC.
    expect(sp).toBe(new Date(Date.UTC(2026, 8, 23, 11, 45)).toISOString())
    // 09:00 em Toquio (UTC+9) = 00:00 UTC; menos 15 min = 23:45 do dia anterior.
    expect(tq).toBe(new Date(Date.UTC(2026, 8, 22, 23, 45)).toISOString())
  })

  it(baseline('sem data ou sem hora, nao ha instante a calcular'), () => {
    expect(computeRemindAt(null, '09:00', 15, 'UTC')).toBeNull()
    expect(computeRemindAt('2026-09-23', null, 15, 'UTC')).toBeNull()
  })

  it(baseline('antecedencia zero e valida: o aviso e na hora'), () => {
    expect(computeRemindAt('2026-09-23', '09:00', 0, 'UTC')).toBe(
      new Date(Date.UTC(2026, 8, 23, 9, 0)).toISOString(),
    )
  })
})
