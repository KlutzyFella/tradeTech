import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { addPracticeStories, PRACTICE_STORIES } from '../src/host/practice-stories.ts'
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

const stock = (ticker: string) => ({ ticker, name: `${ticker} Co`, sector: 'Test', openingPrice: 100, depth: 1_000_000, borrowPool: 1000 })

describe('practice stories for the demo', () => {
  it('adds a rumour and its price-moving confirmation as planned drafts', async () => {
    const { roomId, host, stocks } = await setupRoom(app, { stocks: [stock('OILCO'), stock('AIRCO')] })
    await addPracticeStories(app.db, BigInt(roomId))

    const news = (await app.inject({ method: 'GET', url: `/api/host/rooms/${roomId}/news`, cookies: host })).json().data
    const byHeadline = new Map(news.map((n: { headline: string }) => [n.headline, n]))
    const [rumour, confirmation] = PRACTICE_STORIES.map((s) => byHeadline.get(s.headline) as Record<string, unknown>)
    expect(rumour).toMatchObject({ kind: 'information', status: 'draft', impacts: {}, scheduledAtMs: 3 * 60_000 })
    expect(confirmation).toMatchObject({
      kind: 'mechanical',
      status: 'draft',
      scheduledAtMs: 6 * 60_000,
      impacts: { [stocks.OILCO!]: 0.06, [stocks.AIRCO!]: -0.05 },
    })

    // One click in the news desk schedules each for the running round.
    const scheduled = await app.inject({ method: 'POST', url: `/api/host/rooms/${roomId}/news/${(confirmation as { id: string }).id}/schedule`, cookies: host, payload: { minute: 6 } })
    expect(scheduled.statusCode).toBe(200)
  })

  it('names the missing stock when the room lacks one', async () => {
    const { roomId } = await setupRoom(app, { stocks: [stock('OILCO')] })
    await expect(addPracticeStories(app.db, BigInt(roomId))).rejects.toThrow(/AIRCO/)
  })
})
