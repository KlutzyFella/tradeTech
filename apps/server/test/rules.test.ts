import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp, resetDatabase, setupRoom } from './helpers.ts'

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

describe('published rules for teams', () => {
  it('returns the event’s current rules and starting cash', async () => {
    const { roomId, host, teams } = await setupRoom(app, { rules: { fee: 0.002 } })
    const first = await app.inject({ method: 'GET', url: '/api/rules', cookies: teams[0]! })
    expect(first.statusCode).toBe(200)
    expect(first.json().data).toMatchObject({ startingCashPaise: 100_000_000, rules: { fee: 0.002, halfSpread: 0.001, newsPauseMs: 3000 } })

    await app.inject({ method: 'POST', url: `/api/host/rooms/${roomId}/rules`, cookies: host, payload: { newsPauseMs: 5000 } })
    const updated = await app.inject({ method: 'GET', url: '/api/rules', cookies: teams[0]! })
    expect(updated.json().data.rules.newsPauseMs).toBe(5000)
  })

  it('is for signed-in teams', async () => {
    const { host } = await setupRoom(app)
    expect((await app.inject({ method: 'GET', url: '/api/rules' })).statusCode).toBe(401)
    expect((await app.inject({ method: 'GET', url: '/api/rules', cookies: host })).statusCode).toBe(403)
  })
})
