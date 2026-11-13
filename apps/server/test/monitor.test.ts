import type { FastifyInstance } from 'fastify'
import { io as connect, type Socket } from 'socket.io-client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp, loginHost, order, resetDatabase, setupRoom } from './helpers.ts'

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

const monitor = (roomId: string, cookies: Record<string, string>) => app.inject({ method: 'GET', url: `/api/host/rooms/${roomId}/monitor`, cookies })

describe('host live monitor', () => {
  it('lists recent trades newest first, with rejections and the last minute totals', async () => {
    const { roomId, host, stocks, teams } = await setupRoom(app, { teams: 2 })
    await app.inject({ method: 'POST', url: '/api/orders', cookies: teams[0]!, payload: order(stocks.DEEP!, 'buy', 100) })
    await app.inject({ method: 'POST', url: '/api/orders', cookies: teams[1]!, payload: order(stocks.THIN!, 'sell', 5) })

    const res = await monitor(roomId, host)
    expect(res.statusCode).toBe(200)
    const view = res.json().data
    expect(view.trades.map((t: { teamName: string; ticker: string; status: string }) => [t.teamName, t.ticker, t.status])).toEqual([
      ['Team 2', 'THIN', 'rejected'],
      ['Team 1', 'DEEP', 'filled'],
    ])
    expect(view.trades[0].rejectMessage).toBeTruthy()
    expect(view.trades[1]).toMatchObject({ intent: 'buy', quantity: 100, forced: false })
    expect(view.trades[1].valuePaise).toBeGreaterThan(1_000_000)
    expect(view.lastMinute).toMatchObject({ filled: 1, rejected: 1 })
    expect(view.lastMinute.valuePaise).toBe(view.trades[1].valuePaise)
  })

  it('shows each team’s activity, value and margin level', async () => {
    const { roomId, host, stocks, teams } = await setupRoom(app, { teams: 2 })
    await app.inject({ method: 'POST', url: '/api/orders', cookies: teams[0]!, payload: order(stocks.DEEP!, 'short', 2000) })

    const view = (await monitor(roomId, host)).json().data
    const [shorter, idle] = view.teams
    expect(shorter).toMatchObject({ name: 'Team 1', status: 'active', ordersLastMinute: 1, connections: 0 })
    expect(shorter.lastOrderAt).not.toBeNull()
    expect(shorter.shortNotionalPaise).toBeGreaterThan(0)
    expect(shorter.marginHeadroom).toBeGreaterThan(1)
    expect(shorter.marginLevel).toBe('ok')
    expect(idle).toMatchObject({ name: 'Team 2', ordersLastMinute: 0, lastOrderAt: null, marginHeadroom: null, marginLevel: 'none' })
    expect(idle.liquidationValuePaise).toBe(100_000_000)
  })

  it('counts each team’s live connections (tabs and devices)', async () => {
    const { roomId, host, teams } = await setupRoom(app, { teams: 2 })
    await app.listen({ port: 0, host: '127.0.0.1' })
    const address = app.server.address()
    if (!address || typeof address === 'string') throw new Error('no port')
    const open = (session: Record<string, string>) =>
      new Promise<Socket>((resolve, reject) => {
        const socket = connect(`http://127.0.0.1:${address.port}`, {
          transports: ['websocket'],
          extraHeaders: { cookie: `tt_session=${session.tt_session}` },
        })
        socket.on('connect', () => resolve(socket))
        socket.on('connect_error', reject)
      })
    const sockets = await Promise.all([open(teams[0]!), open(teams[0]!), open(teams[1]!)])
    try {
      // Joining channels completes just after the connect event.
      await expect
        .poll(async () => (await monitor(roomId, host)).json().data.teams.map((t: { connections: number }) => t.connections))
        .toEqual([2, 1])
      sockets[1]!.disconnect()
      await expect.poll(async () => (await monitor(roomId, host)).json().data.teams[0].connections).toBe(1)
    } finally {
      for (const socket of sockets) socket.disconnect()
    }
  })

  it('is host-only and limited to the host’s own rooms', async () => {
    const { roomId, teams } = await setupRoom(app)
    expect((await monitor(roomId, teams[0]!)).statusCode).toBe(403)
    const other = await loginHost(app, 'other@example.com', 'other-password-1')
    expect((await monitor(roomId, other)).statusCode).toBe(404)
  })
})
