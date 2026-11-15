import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp, order, resetDatabase, roundAction, setupRoom } from './helpers.ts'

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

const preview = (cookies: Record<string, string>, stockId: string, intent: string, quantity: number) =>
  app.inject({ method: 'POST', url: '/api/orders/preview', cookies, payload: { stockId, intent, quantity } })

describe('order ticket preview', () => {
  it('breaks a fill into market price, impact, spread and fee that add up to the cash', async () => {
    const { stocks, teams } = await setupRoom(app)
    const res = await preview(teams[0]!, stocks.THIN!, 'buy', 1000)
    const p = res.json().data
    expect(p).toMatchObject({ ok: true, marketPrice: 100 })
    expect(p.fillPrice).toBeGreaterThan(100)
    const notionalPaise = p.fillPrice * 1000 * 100
    expect(p.spreadCostPaise).toBe(Math.round(0.001 * notionalPaise))
    expect(p.feeCostPaise).toBe(Math.round(0.0005 * notionalPaise))
    // Each part is rounded for display; together they are within a couple of paise of the authoritative total.
    expect(Math.abs(-p.cashDeltaPaise - (notionalPaise + p.spreadCostPaise + p.feeCostPaise))).toBeLessThanOrEqual(2)
  })

  it('offers the shares held when a sell is too large', async () => {
    const { stocks, teams } = await setupRoom(app)
    await app.inject({ method: 'POST', url: '/api/orders', cookies: teams[0]!, payload: order(stocks.DEEP!, 'buy', 100) })
    const p = (await preview(teams[0]!, stocks.DEEP!, 'sell', 500)).json().data
    expect(p).toMatchObject({ ok: false, reason: 'crosses_zero', maxQuantity: 100 })
  })

  it('still estimates while the round is paused, but orders wait for the round', async () => {
    const { roomId, host, stocks, teams } = await setupRoom(app)
    await roundAction(app, host, roomId, 'pause')
    const p = await preview(teams[0]!, stocks.DEEP!, 'buy', 100)
    expect(p.statusCode).toBe(200)
    expect(p.json().data.ok).toBe(true)
    const placed = await app.inject({ method: 'POST', url: '/api/orders', cookies: teams[0]!, payload: order(stocks.DEEP!, 'buy', 100) })
    expect(placed.statusCode).toBe(409)
    expect(placed.json().error.code).toBe('market_closed')
  })

  it('does not estimate before the event opens', async () => {
    const { stocks, teams } = await setupRoom(app, { status: 'draft' })
    const p = await preview(teams[0]!, stocks.DEEP!, 'buy', 100)
    expect(p.statusCode).toBe(409)
    expect(p.json().error.code).toBe('market_closed')
  })
})
