import { decayPressure } from '@tradetech/engine'
import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import type { PrismaClient } from '../generated/prisma/client.ts'
import { publishNewsItem } from '../news/news-service.ts'
import { signal } from '../plugins/realtime.ts'
import { enforceMaintenance } from '../risk/liquidation.ts'
import { withRoomLock } from '../rooms/room-lock.ts'
import { MAX_TICK_MS } from './clock.ts'
import { transitionRound } from './round-service.ts'

/** Pressure below this is treated as fully faded. */
const PRESSURE_EPSILON = 1e-9

export interface TickResult {
  readonly ran: boolean
  readonly pressureMoved: boolean
  readonly newsPublished: number
  readonly liquidatedTeams: readonly bigint[]
  readonly roundEnded: boolean
}

const IDLE: TickResult = { ran: false, pressureMoved: false, newsPublished: 0, liquidatedTeams: [], roundEnded: false }

/**
 * One deterministic step of the room's active clock, as the room's single
 * writer. Order of effects at a boundary (blueprint §10): scheduled market
 * events first, then maintenance, then the cutoff. Orders already accepted
 * under the lock precede this tick; none are accepted after the cutoff.
 */
export async function tickRoom(db: PrismaClient, roomId: bigint, now: Date): Promise<TickResult> {
  return withRoomLock(db, roomId, async (tx) => {
    const round = await tx.round.findFirst({ where: { roomId, status: 'running' } })
    if (!round || !round.lastTickAt) return IDLE
    const dt = Math.min(MAX_TICK_MS, Math.max(0, now.getTime() - round.lastTickAt.getTime()))
    const elapsed = Math.min(round.durationMs, round.activeElapsedMs + dt)

    let pressureMoved = false
    const stocks = await tx.stock.findMany({ where: { roomId, halted: false, NOT: { pressure: 0 } } })
    for (const stock of stocks) {
      const decayed = decayPressure(stock.pressure, dt / 60_000, stock.halfLifeMin)
      await tx.stock.update({ where: { id: stock.id }, data: { pressure: Math.abs(decayed) < PRESSURE_EPSILON ? 0 : decayed } })
      pressureMoved = true
    }

    const due = await tx.newsItem.findMany({
      where: { roomId, roundId: round.id, status: 'scheduled', scheduledAtMs: { lte: elapsed } },
      orderBy: [{ scheduledAtMs: 'asc' }, { id: 'asc' }],
    })
    for (const item of due) await publishNewsItem(tx, item, now)

    const liquidatedTeams = await enforceMaintenance(tx, roomId, now)

    const roundEnded = elapsed >= round.durationMs
    await tx.round.update({ where: { id: round.id }, data: { activeElapsedMs: elapsed, lastTickAt: now } })
    if (roundEnded) await transitionRound(tx, { ...round, activeElapsedMs: elapsed, lastTickAt: now }, 'ended', now)

    return { ran: true, pressureMoved, newsPublished: due.length, liquidatedTeams, roundEnded }
  })
}

/**
 * After a restart, running rounds resume paused: downtime is never counted
 * as active time, and the host resumes explicitly (blueprint §10).
 */
export async function recoverRunningRounds(db: PrismaClient, now = new Date()): Promise<number> {
  // A round ticked within the last few seconds is being driven by another
  // live instance (rolling deploy, second server): leave it running.
  const staleBefore = new Date(now.getTime() - 2 * MAX_TICK_MS)
  const running = await db.round.findMany({
    where: { status: 'running', OR: [{ lastTickAt: null }, { lastTickAt: { lt: staleBefore } }] },
  })
  for (const round of running) {
    await withRoomLock(db, round.roomId, async (tx) => {
      const fresh = await tx.round.findUniqueOrThrow({ where: { id: round.id } })
      if (fresh.status !== 'running') return
      // Only time up to the last recorded tick counts.
      await transitionRound(tx, { ...fresh, lastTickAt: null }, 'paused', now)
    })
  }
  return running.length
}

interface TickerOptions {
  intervalMs: number
}

/** Drives the clock for every room with a running round and announces committed changes. */
const ticker: FastifyPluginAsync<TickerOptions> = async (app, opts) => {
  let timer: NodeJS.Timeout | undefined
  let busy = false
  let beat = 0

  const runOnce = async (): Promise<void> => {
    if (busy) return
    busy = true
    beat += 1
    try {
      const rooms = await app.db.round.findMany({ where: { status: 'running' }, select: { roomId: true } })
      for (const { roomId } of rooms) {
        // Isolate rooms: one room's failure must not stop every other room's clock.
        let result: TickResult
        try {
          result = await tickRoom(app.db, roomId, new Date())
        } catch (error: unknown) {
          app.log.error({ err: error, roomId: roomId.toString() }, 'room tick failed')
          continue
        }
        // Pressure fades continuously; announce it every few beats to bound refetch load.
        if (result.newsPublished > 0 || result.roundEnded || result.liquidatedTeams.length > 0 || (result.pressureMoved && beat % 3 === 0)) {
          app.signalMarketChanged(roomId)
        }
        if (result.newsPublished > 0) signal(app, `room:${roomId}`, 'news:published', {})
        if (result.roundEnded) signal(app, `room:${roomId}`, 'room:status', {})
        for (const teamId of result.liquidatedTeams) signal(app, `team:${teamId}`, 'orders:changed', { liquidated: true })
      }
    } catch (error: unknown) {
      app.log.error({ err: error }, 'tick failed')
    } finally {
      busy = false
    }
  }

  app.addHook('onReady', async () => {
    const recovered = await recoverRunningRounds(app.db)
    if (recovered > 0) app.log.warn({ recovered }, 'paused rounds that were running before restart')
    timer = setInterval(() => void runOnce(), opts.intervalMs)
  })
  app.addHook('onClose', async () => {
    if (timer) clearInterval(timer)
  })
}

export const tickerPlugin = fp(ticker, { name: 'ticker', dependencies: ['db', 'realtime'] })
