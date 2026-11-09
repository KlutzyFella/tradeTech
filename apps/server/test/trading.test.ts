import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp, order, resetDatabase, setupRoom } from './helpers.ts'

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

const STARTING_PAISE = 100_000_000

async function portfolio(team: Record<string, string>) {
  const response = await app.inject({ method: 'GET', url: '/api/portfolio', cookies: team })
  return response.json().data
}

describe('placing orders', () => {
  it('fills the worked-example buy and persists cash, position, ledger and the new quote', async () => {
    const { teams, stocks } = await setupRoom(app)
    const response = await app.inject({ method: 'POST', url: '/api/orders', cookies: teams[0]!, payload: order(stocks.THIN!, 'buy', 1000) })

    expect(response.statusCode).toBe(200)
    expect(response.json().data).toMatchObject({ replayed: false, order: { status: 'filled', cashDeltaPaise: -10_065_243 } })

    const book = await portfolio(teams[0]!)
    expect(book.cashPaise).toBe(STARTING_PAISE - 10_065_243)
    expect(book.positions).toMatchObject([{ ticker: 'THIN', quantity: 1000, costBasisPaise: 10_065_243 }])

    const market = (await app.inject({ method: 'GET', url: '/api/market', cookies: teams[0]! })).json().data
    expect(market.stocks.find((s: { ticker: string }) => s.ticker === 'THIN').mid).toBeCloseTo(101.005017, 6)
    expect(await app.db.ledgerEntry.count({ where: { cause: 'fill' } })).toBe(1)
  })

  it('executes a duplicate request once and replays the stored result', async () => {
    const { teams, stocks } = await setupRoom(app)
    const payload = order(stocks.THIN!, 'buy', 100)
    const first = await app.inject({ method: 'POST', url: '/api/orders', cookies: teams[0]!, payload })
    const retry = await app.inject({ method: 'POST', url: '/api/orders', cookies: teams[0]!, payload })

    expect(retry.statusCode).toBe(200)
    expect(retry.json().data.replayed).toBe(true)
    expect(retry.json().data.order.id).toBe(first.json().data.order.id)
    expect(await app.db.order.count()).toBe(1)
    expect(await app.db.ledgerEntry.count({ where: { cause: 'fill' } })).toBe(1)
  })

  it('refuses a reused requestId with a different body', async () => {
    const { teams, stocks } = await setupRoom(app)
    const requestId = randomUUID()
    await app.inject({ method: 'POST', url: '/api/orders', cookies: teams[0]!, payload: order(stocks.THIN!, 'buy', 100, { requestId }) })
    const conflict = await app.inject({ method: 'POST', url: '/api/orders', cookies: teams[0]!, payload: order(stocks.THIN!, 'buy', 200, { requestId }) })
    expect(conflict.statusCode).toBe(409)
    expect(conflict.json().error.code).toBe('idempotency_conflict')
  })

  it('never lets simultaneous orders overspend one team’s cash', async () => {
    const { teams, stocks } = await setupRoom(app, { rules: { maxPositionFraction: 1, maxGrossExposure: 1 } })
    // Each order costs ~₹6 lakh; only one can fit in ₹10 lakh.
    const results = await Promise.all([
      app.inject({ method: 'POST', url: '/api/orders', cookies: teams[0]!, payload: order(stocks.DEEP!, 'buy', 6000) }),
      app.inject({ method: 'POST', url: '/api/orders', cookies: teams[0]!, payload: order(stocks.DEEP!, 'buy', 6000) }),
    ])
    const statuses = results.map((r) => r.json().data.order.status).sort()
    expect(statuses).toEqual(['filled', 'rejected'])
    expect((await portfolio(teams[0]!)).cashPaise).toBeGreaterThanOrEqual(0)
  })

  it('reconciles short then cover: borrow is released and only costs are lost', async () => {
    const { teams, stocks } = await setupRoom(app)
    await app.inject({ method: 'POST', url: '/api/orders', cookies: teams[0]!, payload: order(stocks.DEEP!, 'short', 1000) })
    const shorted = await portfolio(teams[0]!)
    expect(shorted.positions[0].quantity).toBe(-1000)
    expect(shorted.restrictedCashPaise).toBeGreaterThan(0)

    await app.inject({ method: 'POST', url: '/api/orders', cookies: teams[0]!, payload: order(stocks.DEEP!, 'cover', 1000) })
    const flat = await portfolio(teams[0]!)
    expect(flat.positions).toEqual([])
    expect(flat.cashPaise).toBeLessThan(STARTING_PAISE)
    expect(flat.cashPaise).toBeGreaterThan(STARTING_PAISE - 50_000) // ~₹300 of spread+fee
    const stock = await app.db.stock.findFirstOrThrow({ where: { ticker: 'DEEP' } })
    expect(stock.borrowUsed).toBe(0)
  })

  it('persists a rule rejection with its reason', async () => {
    const { teams, stocks } = await setupRoom(app)
    const response = await app.inject({ method: 'POST', url: '/api/orders', cookies: teams[0]!, payload: order(stocks.THIN!, 'sell', 5) })
    expect(response.statusCode).toBe(200)
    expect(response.json().data.order).toMatchObject({ status: 'rejected', rejectReason: 'wrong_intent' })
    expect(await app.db.ledgerEntry.count({ where: { cause: 'fill' } })).toBe(0)
  })

  it('refuses orders while the room is not open for trading', async () => {
    const { teams, stocks } = await setupRoom(app, { status: 'draft' })
    const response = await app.inject({ method: 'POST', url: '/api/orders', cookies: teams[0]!, payload: order(stocks.THIN!, 'buy', 1) })
    expect(response.statusCode).toBe(409)
    expect(response.json().error.code).toBe('market_closed')
  })

  it('limits each team to one accepted order per interval', async () => {
    const { teams, stocks } = await setupRoom(app, { rules: { minOrderIntervalMs: 60_000 } })
    await app.inject({ method: 'POST', url: '/api/orders', cookies: teams[0]!, payload: order(stocks.THIN!, 'buy', 1) })
    const second = await app.inject({ method: 'POST', url: '/api/orders', cookies: teams[0]!, payload: order(stocks.THIN!, 'buy', 1) })
    expect(second.statusCode).toBe(429)
  })

  it('previews an order without persisting anything', async () => {
    const { teams, stocks } = await setupRoom(app)
    const { requestId: _, ...ticket } = order(stocks.THIN!, 'buy', 1000)
    const response = await app.inject({ method: 'POST', url: '/api/orders/preview', cookies: teams[0]!, payload: ticket })
    expect(response.json().data).toMatchObject({ ok: true, cashDeltaPaise: -10_065_243 })
    expect(await app.db.order.count()).toBe(0)
  })

  it('lists the team’s own order history newest first', async () => {
    const { teams, stocks } = await setupRoom(app, { teams: 2 })
    await app.inject({ method: 'POST', url: '/api/orders', cookies: teams[0]!, payload: order(stocks.THIN!, 'buy', 1) })
    await app.inject({ method: 'POST', url: '/api/orders', cookies: teams[1]!, payload: order(stocks.THIN!, 'buy', 2) })
    const mine = (await app.inject({ method: 'GET', url: '/api/orders', cookies: teams[0]! })).json().data
    expect(mine).toHaveLength(1)
    expect(mine[0].quantity).toBe(1)
  })
})

describe('host setup races', () => {
  it('returns 409, not 500, when two stocks with one ticker are created at once', async () => {
    const { host, roomId } = await setupRoom(app, { status: 'draft' })
    const payload = { ticker: 'TWIN', name: 'Twin', sector: 'X', openingPrice: 10, depth: 1000, borrowPool: 10 }
    const results = await Promise.all([
      app.inject({ method: 'POST', url: `/api/host/rooms/${roomId}/stocks`, cookies: host, payload }),
      app.inject({ method: 'POST', url: `/api/host/rooms/${roomId}/stocks`, cookies: host, payload }),
    ])
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409])
  })

  it('refuses team imports once the room is live', async () => {
    const { host, roomId } = await setupRoom(app)
    await app.inject({ method: 'POST', url: `/api/host/rooms/${roomId}/status`, cookies: host, payload: { status: 'live' } })
    const response = await app.inject({
      method: 'POST',
      url: `/api/host/rooms/${roomId}/teams`,
      cookies: host,
      payload: { teams: [{ name: 'Late', loginName: 'late', password: 'password-late' }] },
    })
    expect(response.statusCode).toBe(409)
  })
})

describe('practice reset', () => {
  it('restores every team’s cash, clears positions and reopens prices', async () => {
    const { teams, stocks, host, roomId } = await setupRoom(app)
    await app.inject({ method: 'POST', url: '/api/orders', cookies: teams[0]!, payload: order(stocks.THIN!, 'buy', 1000) })
    const reset = await app.inject({ method: 'POST', url: `/api/host/rooms/${roomId}/reset-practice`, cookies: host })
    expect(reset.statusCode).toBe(200)

    const book = await portfolio(teams[0]!)
    expect(book.cashPaise).toBe(STARTING_PAISE)
    expect(book.positions).toEqual([])
    const market = (await app.inject({ method: 'GET', url: '/api/market', cookies: teams[0]! })).json().data
    expect(market.stocks.every((s: { mid: number }) => s.mid === 100)).toBe(true)
    expect(await app.db.ledgerEntry.count({ where: { cause: 'practice_reset' } })).toBe(1)
  })

  it('wipes practice trading automatically when the room goes live', async () => {
    const { teams, stocks, host, roomId } = await setupRoom(app)
    await app.inject({ method: 'POST', url: '/api/orders', cookies: teams[0]!, payload: order(stocks.THIN!, 'buy', 1000) })
    await app.inject({ method: 'POST', url: `/api/host/rooms/${roomId}/status`, cookies: host, payload: { status: 'live' } })
    const book = await portfolio(teams[0]!)
    expect(book.cashPaise).toBe(STARTING_PAISE)
    expect(book.positions).toEqual([])
  })

  it('is refused once the room has gone live', async () => {
    const { host, roomId } = await setupRoom(app)
    await app.inject({ method: 'POST', url: `/api/host/rooms/${roomId}/status`, cookies: host, payload: { status: 'live' } })
    const reset = await app.inject({ method: 'POST', url: `/api/host/rooms/${roomId}/reset-practice`, cookies: host })
    expect(reset.statusCode).toBe(409)
  })
})
