import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { recoverRunningRounds, tickRoom } from '../src/rounds/ticker.ts'
import { buildTestApp, DEEP_STOCK, order, resetDatabase, roundAction, setupRoom, startRound, THIN_STOCK } from './helpers.ts'

let app: FastifyInstance

beforeAll(async () => {
  app = await buildTestApp()
})
afterAll(async () => {
  await app.close()
})
beforeEach(async () => {
  await resetDatabase(app)
})

const place = (team: Record<string, string>, stockId: string, intent: 'buy' | 'sell' | 'short' | 'cover', qty: number) =>
  app.inject({ method: 'POST', url: '/api/orders', cookies: team, payload: order(stockId, intent, qty) })
const market = async (team: Record<string, string>) => (await app.inject({ method: 'GET', url: '/api/market', cookies: team })).json().data
const midOf = async (team: Record<string, string>, ticker: string) =>
  (await market(team)).stocks.find((s: { ticker: string }) => s.ticker === ticker).mid as number

/** Ticks the room in 5-second steps (the per-tick cap) from the round's last tick. */
async function advance(roomId: string, seconds: number): Promise<void> {
  const round = await app.db.round.findFirstOrThrow({ where: { roomId: BigInt(roomId) }, orderBy: { sequence: 'desc' } })
  let now = round.lastTickAt?.getTime() ?? Date.now()
  for (let left = seconds; left > 0; left -= 5) {
    now += Math.min(5, left) * 1000
    await tickRoom(app.db, BigInt(roomId), new Date(now))
  }
}

describe('rounds and the server clock', () => {
  it('refuses orders until a round is running', async () => {
    const { teams, stocks } = await setupRoom(app, { round: false })
    const response = await place(teams[0]!, stocks.THIN!, 'buy', 1)
    expect(response.statusCode).toBe(409)
    expect(response.json().error.code).toBe('market_closed')
  })

  it('shows the running round and its remaining active time', async () => {
    const { teams } = await setupRoom(app)
    const { round } = await market(teams[0]!)
    expect(round).toMatchObject({ sequence: 1, kind: 'practice', status: 'running', durationMs: 1_200_000 })
    expect(round.remainingMs).toBeGreaterThan(1_190_000)
  })

  it('stops trading and the countdown while paused, then resumes', async () => {
    const { teams, stocks, host, roomId } = await setupRoom(app)
    await roundAction(app, host, roomId, 'pause')
    expect((await place(teams[0]!, stocks.THIN!, 'buy', 1)).statusCode).toBe(409)
    await advance(roomId, 30)
    expect((await market(teams[0]!)).round.status).toBe('paused')
    await roundAction(app, host, roomId, 'resume')
    expect((await place(teams[0]!, stocks.THIN!, 'buy', 1)).statusCode).toBe(200)
  })

  it('ends the round at its cutoff and closes trading', async () => {
    const { teams, stocks, host, roomId } = await setupRoom(app, { round: false })
    await startRound(app, host, roomId, 0.1) // 6 seconds
    await advance(roomId, 10)
    expect((await market(teams[0]!)).round).toMatchObject({ status: 'ended', remainingMs: 0 })
    expect((await place(teams[0]!, stocks.THIN!, 'buy', 1)).statusCode).toBe(409)
  })

  it('fades demand pressure by half over one half-life of active time', async () => {
    const { teams, stocks, roomId } = await setupRoom(app)
    await place(teams[0]!, stocks.THIN!, 'buy', 1000)
    const before = (await app.db.stock.findFirstOrThrow({ where: { ticker: 'THIN' } })).pressure
    await advance(roomId, 240) // default half-life: 4 active minutes
    const after = (await app.db.stock.findFirstOrThrow({ where: { ticker: 'THIN' } })).pressure
    expect(after).toBeCloseTo(before / 2, 9)
  })

  it('pauses running rounds after a restart instead of counting downtime', async () => {
    const { roomId } = await setupRoom(app)
    await recoverRunningRounds(app.db)
    const round = await app.db.round.findFirstOrThrow({ where: { roomId: BigInt(roomId) } })
    expect(round.status).toBe('paused')
  })
})

describe('host news', () => {
  const publish = (host: Record<string, string>, roomId: string, payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: `/api/host/rooms/${roomId}/news`, cookies: host, payload })

  it('moves the anchor by the shock: worked example +8% takes ₹100 to ₹108', async () => {
    const { teams, stocks, host, roomId } = await setupRoom(app, { rules: { newsPauseMs: 0 } })
    const response = await publish(host, roomId, {
      headline: 'Refinery fire',
      kind: 'mechanical',
      impacts: { [stocks.THIN!]: 0.08 },
      mode: 'publish',
    })
    expect(response.statusCode).toBe(200)
    expect(await midOf(teams[0]!, 'THIN')).toBeCloseTo(108, 9)
    expect(await midOf(teams[0]!, 'DEEP')).toBe(100)
  })

  it('pauses trading in affected stocks briefly after mechanical news', async () => {
    const { teams, stocks, host, roomId } = await setupRoom(app)
    await publish(host, roomId, { headline: 'Shock', kind: 'mechanical', impacts: { [stocks.THIN!]: 0.05 }, mode: 'publish' })
    const blocked = await place(teams[0]!, stocks.THIN!, 'buy', 1)
    expect(blocked.statusCode).toBe(409)
    expect(blocked.json().error.code).toBe('news_pause')
    expect((await place(teams[0]!, stocks.DEEP!, 'buy', 1)).statusCode).toBe(200)
  })

  it('never shows participants impacts or unpublished drafts', async () => {
    const { teams, stocks, host, roomId } = await setupRoom(app, { rules: { newsPauseMs: 0 } })
    await publish(host, roomId, { headline: 'Secret draft', kind: 'mechanical', impacts: { [stocks.THIN!]: 0.5 }, mode: 'draft' })
    await publish(host, roomId, { headline: 'Rumour', body: 'Unconfirmed.', kind: 'information', mode: 'publish' })
    const news = (await app.inject({ method: 'GET', url: '/api/news', cookies: teams[0]! })).json().data
    expect(news).toHaveLength(1)
    expect(news[0]).toEqual({ id: expect.any(String), headline: 'Rumour', body: 'Unconfirmed.', sourceLabel: null, publishedAt: expect.any(String) })
    expect(JSON.stringify(news)).not.toContain('impacts')
    expect(await midOf(teams[0]!, 'THIN')).toBe(100)
  })

  it('halts a stock whose news shock crosses its band', async () => {
    const { teams, stocks, host, roomId } = await setupRoom(app, { rules: { newsPauseMs: 0 } })
    await publish(host, roomId, { headline: 'Takeover', kind: 'mechanical', impacts: { [stocks.THIN!]: 0.3 }, mode: 'publish' })
    const thin = (await market(teams[0]!)).stocks.find((s: { ticker: string }) => s.ticker === 'THIN')
    expect(thin).toMatchObject({ halted: true, mid: expect.closeTo(130, 6) })
    const response = await place(teams[0]!, stocks.THIN!, 'buy', 1)
    expect(response.json().data.order).toMatchObject({ status: 'rejected', rejectReason: 'halted' })
  })

  it('fires scheduled news when the round reaches its minute', async () => {
    const { teams, stocks, host, roomId } = await setupRoom(app, { rules: { newsPauseMs: 0 } })
    await publish(host, roomId, {
      headline: 'Scheduled',
      kind: 'mechanical',
      impacts: { [stocks.THIN!]: 0.1 },
      mode: 'schedule',
      scheduleAtMinute: 0.25,
    })
    await advance(roomId, 10)
    expect(await midOf(teams[0]!, 'THIN')).toBe(100)
    await advance(roomId, 10)
    expect(await midOf(teams[0]!, 'THIN')).toBeCloseTo(110, 9)
  })
})

describe('halts', () => {
  it('lets the host halt and reopen a stock, re-centring the band', async () => {
    const { teams, stocks, host, roomId } = await setupRoom(app)
    const halt = (halted: boolean, rebaseBand = false) =>
      app.inject({ method: 'POST', url: `/api/host/rooms/${roomId}/stocks/${stocks.THIN}/halt`, cookies: host, payload: { halted, rebaseBand } })
    await halt(true)
    expect((await place(teams[0]!, stocks.THIN!, 'buy', 1)).json().data.order.rejectReason).toBe('halted')
    await halt(false, true)
    expect((await place(teams[0]!, stocks.THIN!, 'buy', 1)).json().data.order.status).toBe('filled')
  })
})

describe('maintenance liquidation', () => {
  // Long ₹7L of DEEP funded by a ₹7L DEEP2 short: legal at entry (gross ≤ 3× equity),
  // but equity ₹10L < 75% of gross ₹14L, so it fails maintenance on the next tick.
  const loose = { maxPositionFraction: 1, maxShortFraction: 1, maxGrossExposure: 3, collateralRatio: 1 }
  const stocks = [DEEP_STOCK, { ...DEEP_STOCK, ticker: 'DEEP2' }]

  async function leveragedBook() {
    const room = await setupRoom(app, { rules: loose, stocks })
    expect((await place(room.teams[0]!, room.stocks.DEEP!, 'buy', 7000)).json().data.order.status).toBe('filled')
    expect((await place(room.teams[0]!, room.stocks.DEEP2!, 'short', 7000)).json().data.order.status).toBe('filled')
    return room
  }

  it('closes a failing team’s whole portfolio along the curve on the next tick', async () => {
    const { teams, roomId } = await leveragedBook()
    await advance(roomId, 1)

    const book = (await app.inject({ method: 'GET', url: '/api/portfolio', cookies: teams[0]! })).json().data
    expect(book.positions).toEqual([])
    const orders = (await app.inject({ method: 'GET', url: '/api/orders', cookies: teams[0]! })).json().data
    expect(orders.slice(0, 2).map((o: { intent: string; quantity: number }) => [o.intent, o.quantity]).sort()).toEqual([
      ['cover', 7000],
      ['sell', 7000],
    ])
    expect(await app.db.ledgerEntry.count({ where: { cause: 'liquidation' } })).toBe(2)
    expect((await app.db.stock.findFirstOrThrow({ where: { ticker: 'DEEP2' } })).borrowUsed).toBe(0)
  })

  it('defers liquidation in a halted stock until it reopens', async () => {
    const { teams, stocks: ids, host, roomId } = await leveragedBook()
    await app.inject({ method: 'POST', url: `/api/host/rooms/${roomId}/stocks/${ids.DEEP2}/halt`, cookies: host, payload: { halted: true } })
    await advance(roomId, 1)
    const book = (await app.inject({ method: 'GET', url: '/api/portfolio', cookies: teams[0]! })).json().data
    expect(book.positions.map((p: { ticker: string; quantity: number }) => [p.ticker, p.quantity])).toEqual([['DEEP2', -7000]])
  })
})

describe('host leaderboard', () => {
  it('ranks teams by liquidation value, best first', async () => {
    const { teams, stocks, host, roomId } = await setupRoom(app, { teams: 3, rules: { newsPauseMs: 0 }, stocks: [THIN_STOCK] })
    await place(teams[1]!, stocks.THIN!, 'buy', 1000)
    await app.inject({
      method: 'POST',
      url: `/api/host/rooms/${roomId}/news`,
      cookies: host,
      payload: { headline: 'Up', kind: 'mechanical', impacts: { [stocks.THIN!]: 0.08 }, mode: 'publish' },
    })
    const board = (await app.inject({ method: 'GET', url: `/api/host/rooms/${roomId}/leaderboard`, cookies: host })).json().data
    expect(board.map((e: { name: string; rank: number }) => [e.name, e.rank])).toEqual([
      ['Team 2', 1],
      ['Team 1', 2],
      ['Team 3', 2],
    ])
  })
})
