import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { tickRoom } from '../src/rounds/ticker.ts'
import { buildTestApp, order, resetDatabase, setupRoom, type Session } from './helpers.ts'

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

const history = async (team: Session, stockId: string) =>
  app.inject({ method: 'GET', url: `/api/stocks/${stockId}/history`, cookies: team })
const mids = async (team: Session, stockId: string): Promise<number[]> =>
  (await history(team, stockId)).json().data.points.map((p: { mid: number }) => p.mid)

describe('price history', () => {
  it('starts with the opening price when the round starts', async () => {
    const { teams, stocks } = await setupRoom(app)
    expect(await mids(teams[0]!, stocks.THIN!)).toEqual([100])
  })

  it('records the new price right after a fill', async () => {
    const { teams, stocks } = await setupRoom(app)
    await app.inject({ method: 'POST', url: '/api/orders', cookies: teams[0]!, payload: order(stocks.THIN!, 'buy', 1000) })
    const points = await mids(teams[0]!, stocks.THIN!)
    expect(points.at(-1)).toBeCloseTo(101.005017, 6)
  })

  it('records the jump when price-moving news publishes', async () => {
    const { teams, stocks, host, roomId } = await setupRoom(app, { rules: { newsPauseMs: 0 } })
    await app.inject({
      method: 'POST',
      url: `/api/host/rooms/${roomId}/news`,
      cookies: host,
      payload: { headline: 'Up', kind: 'mechanical', impacts: { [stocks.THIN!]: 0.08 }, mode: 'publish' },
    })
    expect((await mids(teams[0]!, stocks.THIN!)).at(-1)).toBeCloseTo(108, 9)
    expect(await mids(teams[0]!, stocks.DEEP!)).toEqual([100])
  })

  it('samples prices as the round clock runs', async () => {
    const { teams, stocks, roomId } = await setupRoom(app)
    const round = await app.db.round.findFirstOrThrow({ where: { roomId: BigInt(roomId) } })
    let now = round.lastTickAt!.getTime()
    for (let i = 0; i < 4; i++) {
      now += 5000
      await tickRoom(app.db, BigInt(roomId), new Date(now))
    }
    expect((await mids(teams[0]!, stocks.THIN!)).length).toBeGreaterThanOrEqual(4)
  })

  it('returns points oldest first with ISO timestamps', async () => {
    const { teams, stocks } = await setupRoom(app)
    await app.inject({ method: 'POST', url: '/api/orders', cookies: teams[0]!, payload: order(stocks.THIN!, 'buy', 10) })
    const points: { t: string }[] = (await history(teams[0]!, stocks.THIN!)).json().data.points
    expect(points.length).toBe(2)
    expect(new Date(points[0]!.t).getTime()).toBeLessThanOrEqual(new Date(points[1]!.t).getTime())
  })

  it('does not reveal another room’s stocks', async () => {
    const first = await setupRoom(app, { code: 'ROOMA1' })
    const second = await setupRoom(app, { code: 'ROOMB2' })
    expect((await history(first.teams[0]!, second.stocks.THIN!)).statusCode).toBe(404)
  })

  it('forgets practice prices when the event goes live', async () => {
    const { teams, stocks, host, roomId } = await setupRoom(app)
    await app.inject({ method: 'POST', url: '/api/orders', cookies: teams[0]!, payload: order(stocks.THIN!, 'buy', 1000) })
    await app.inject({ method: 'POST', url: `/api/host/rooms/${roomId}/status`, cookies: host, payload: { status: 'live' } })
    expect(await mids(teams[0]!, stocks.THIN!)).toEqual([])
  })
})

describe('projector view', () => {
  const projector = (cookies: Session, roomId: string) =>
    app.inject({ method: 'GET', url: `/api/host/rooms/${roomId}/projector`, cookies })

  it('gives the owning host a public-safe snapshot: no private impacts or drafts', async () => {
    const { host, roomId, stocks } = await setupRoom(app, { rules: { newsPauseMs: 0 } })
    const publish = (payload: object) => app.inject({ method: 'POST', url: `/api/host/rooms/${roomId}/news`, cookies: host, payload })
    await publish({ headline: 'Public story', kind: 'mechanical', impacts: { [stocks.THIN!]: 0.05 }, mode: 'publish' })
    await publish({ headline: 'Secret draft', kind: 'information', mode: 'draft' })

    const res = await projector(host, roomId)
    expect(res.statusCode).toBe(200)
    const data = res.json().data
    expect(data).toMatchObject({ name: 'Test room', code: 'TEST01', status: 'practice', round: { status: 'running' } })
    expect(data.news.map((n: { headline: string }) => n.headline)).toEqual(['Public story'])
    expect(JSON.stringify(data)).not.toContain('impacts')
    expect(JSON.stringify(data)).not.toContain('Secret draft')
    expect(data.stocks[0]).toMatchObject({ ticker: 'DEEP' })
    expect(Array.isArray(data.stocks[0].spark)).toBe(true)
  })

  it('shows the leaderboard only when the host has shared it', async () => {
    const { host, roomId } = await setupRoom(app, { teams: 2 })
    expect((await projector(host, roomId)).json().data.leaderboard).toBeNull()
    await app.inject({ method: 'POST', url: `/api/host/rooms/${roomId}/leaderboard/visibility`, cookies: host, payload: { public: true } })
    const board = (await projector(host, roomId)).json().data.leaderboard
    expect(board.entries).toHaveLength(2)
    expect(JSON.stringify(board)).not.toContain('teamId')
  })

  it('is only for the owning host', async () => {
    const { teams, roomId } = await setupRoom(app)
    expect((await projector(teams[0]!, roomId)).statusCode).toBe(403)
  })
})
