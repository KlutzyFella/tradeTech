import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp, loginHost, order, resetDatabase, setupRoom, type Session } from './helpers.ts'

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

const post = (cookies: Session, url: string, payload: unknown = {}) => app.inject({ method: 'POST', url, cookies, payload: payload as object })
const get = (cookies: Session, url: string) => app.inject({ method: 'GET', url, cookies })
const del = (cookies: Session, url: string) => app.inject({ method: 'DELETE', url, cookies })
const goLive = (host: Session, roomId: string) => post(host, `/api/host/rooms/${roomId}/status`, { status: 'live' })

describe('editing room rules', () => {
  it('changes fees during practice, and orders pay the new fee', async () => {
    const { host, roomId, teams, stocks } = await setupRoom(app)
    const preview = async () =>
      (await post(teams[0]!, '/api/orders/preview', { stockId: stocks.DEEP!, intent: 'buy', quantity: 1000 })).json().data.cashDeltaPaise
    const before = await preview()
    const res = await post(host, `/api/host/rooms/${roomId}/rules`, { fee: 0.01 })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.fee).toBe(0.01)
    expect(await preview()).toBeLessThan(before)
  })

  it('rejects invalid rules with a clear message', async () => {
    const { host, roomId } = await setupRoom(app)
    const res = await post(host, `/api/host/rooms/${roomId}/rules`, { maxPositionFraction: 2 })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.message).toContain('maxPositionFraction')
  })

  it('locks rules once the event is live', async () => {
    const { host, roomId } = await setupRoom(app)
    await goLive(host, roomId)
    expect((await post(host, `/api/host/rooms/${roomId}/rules`, { fee: 0.01 })).statusCode).toBe(409)
  })
})

describe('editing stocks', () => {
  const edit = (host: Session, roomId: string, stockId: string, payload: object) =>
    post(host, `/api/host/rooms/${roomId}/stocks/${stockId}`, payload)

  it('updates the profile and market settings during practice', async () => {
    const { host, roomId, stocks, teams } = await setupRoom(app)
    const res = await edit(host, roomId, stocks.THIN!, { name: 'Thin Industries', profile: 'Makes thin things.', depth: 200_000 })
    expect(res.statusCode).toBe(200)
    const market = (await get(teams[0]!, '/api/market')).json().data
    expect(market.stocks.find((s: { ticker: string }) => s.ticker === 'THIN')).toMatchObject({ name: 'Thin Industries', profile: 'Makes thin things.' })
    const stock = await app.db.stock.findFirstOrThrow({ where: { ticker: 'THIN' } })
    expect(stock.depth).toBe(200_000)
  })

  it('never shrinks the borrow pool below shares already lent', async () => {
    const { host, roomId, stocks, teams } = await setupRoom(app)
    await post(teams[0]!, '/api/orders', order(stocks.DEEP!, 'short', 500))
    const res = await edit(host, roomId, stocks.DEEP!, { borrowPool: 100 })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.message).toContain('500')
  })

  it('changes the opening price only before any practice trading', async () => {
    const draft = await setupRoom(app, { status: 'draft' })
    expect((await edit(draft.host, draft.roomId, draft.stocks.THIN!, { openingPrice: 120 })).statusCode).toBe(200)
    const stock = await app.db.stock.findFirstOrThrow({ where: { ticker: 'THIN' } })
    expect([stock.openingPrice, stock.anchor, stock.bandReference]).toEqual([120, 120, 120])

    await resetDatabase(app)
    const practice = await setupRoom(app)
    expect((await edit(practice.host, practice.roomId, practice.stocks.THIN!, { openingPrice: 120 })).statusCode).toBe(409)
  })

  it('allows only descriptive edits once live', async () => {
    const { host, roomId, stocks } = await setupRoom(app)
    await goLive(host, roomId)
    expect((await edit(host, roomId, stocks.THIN!, { profile: 'Updated mid-event.' })).statusCode).toBe(200)
    expect((await edit(host, roomId, stocks.THIN!, { depth: 1 })).statusCode).toBe(409)
  })

  it('deletes a stock only while setting up', async () => {
    const draft = await setupRoom(app, { status: 'draft' })
    expect((await del(draft.host, `/api/host/rooms/${draft.roomId}/stocks/${draft.stocks.THIN}`)).statusCode).toBe(200)
    expect(await app.db.stock.count()).toBe(1)

    await resetDatabase(app)
    const practice = await setupRoom(app)
    expect((await del(practice.host, `/api/host/rooms/${practice.roomId}/stocks/${practice.stocks.THIN}`)).statusCode).toBe(409)
  })
})

describe('event templates', () => {
  async function scriptedRoom() {
    const room = await setupRoom(app, { rules: { fee: 0.002, newsPauseMs: 0 } })
    const news = (payload: object) => post(room.host, `/api/host/rooms/${room.roomId}/news`, payload)
    await news({ headline: 'Opening bell story', kind: 'information', mode: 'publish' })
    await news({ headline: 'Refinery fire', body: 'Capacity offline.', kind: 'mechanical', impacts: { [room.stocks.THIN!]: 0.08 }, mode: 'schedule', scheduleAtMinute: 6 })
    await news({ headline: 'Rate cut rumour', kind: 'information', mode: 'draft' })
    return room
  }

  it('saves an event as a template keyed by ticker, without teams', async () => {
    const { host, roomId } = await scriptedRoom()
    const saved = await post(host, `/api/host/rooms/${roomId}/save-template`, { name: 'Oil shock', description: 'Two-stock scenario' })
    expect(saved.statusCode).toBe(200)
    const list = (await get(host, '/api/host/templates')).json().data
    expect(list).toEqual([expect.objectContaining({ name: 'Oil shock', stockCount: 2, newsCount: 3 })])

    const exported = await get(host, `/api/host/templates/${list[0].id}/export`)
    const data = exported.json().data
    expect(data.version).toBe(1)
    expect(data.startingCashRupees).toBe(1_000_000)
    expect(data.rules.fee).toBe(0.002)
    expect(data.stocks.map((s: { ticker: string }) => s.ticker)).toEqual(['DEEP', 'THIN'])
    expect(data.news.find((n: { headline: string }) => n.headline === 'Refinery fire')).toMatchObject({ kind: 'mechanical', impacts: { THIN: 0.08 }, plannedMinute: 6 })
    expect(JSON.stringify(data)).not.toMatch(/team1|password/)
  })

  it('creates a new event from a template with news as planned drafts', async () => {
    const { host, roomId } = await scriptedRoom()
    const template = (await post(host, `/api/host/rooms/${roomId}/save-template`, { name: 'Oil shock' })).json().data
    const created = await post(host, '/api/host/rooms', { name: 'Second run', code: 'RERUN1', startingCashRupees: 500_000, templateId: template.id })
    expect(created.statusCode).toBe(200)
    const overview = (await get(host, `/api/host/rooms/${created.json().data.id}`)).json().data
    expect(overview.stocks.map((s: { ticker: string }) => s.ticker)).toEqual(['DEEP', 'THIN'])
    expect(overview.teams).toEqual([])
    // The host's typed starting cash wins; the template only pre-fills the form.
    expect(overview.startingCashPaise).toBe(50_000_000)

    const news = (await get(host, `/api/host/rooms/${created.json().data.id}/news`)).json().data
    expect(news.every((n: { status: string }) => n.status === 'draft')).toBe(true)
    const fire = news.find((n: { headline: string }) => n.headline === 'Refinery fire')
    const thin = overview.stocks.find((s: { ticker: string }) => s.ticker === 'THIN')
    expect(fire).toMatchObject({ impacts: { [thin.id]: 0.08 }, scheduledAtMs: 360_000 })
  })

  it('keeps the template’s rules except the ones the host typed', async () => {
    const { host, roomId } = await scriptedRoom()
    const template = (await post(host, `/api/host/rooms/${roomId}/save-template`, { name: 'Oil shock' })).json().data
    const created = await post(host, '/api/host/rooms', {
      name: 'Third run',
      code: 'RERUN3',
      startingCashRupees: 1_000_000,
      templateId: template.id,
      rules: { minOrderIntervalMs: 2000 },
    })
    const room = await app.db.room.findUniqueOrThrow({ where: { id: BigInt(created.json().data.id) } })
    expect(room.rules).toMatchObject({ fee: 0.002, minOrderIntervalMs: 2000 })
  })

  it('schedules a planned draft into the current round in one step', async () => {
    const { host, roomId } = await scriptedRoom()
    const draft = (await get(host, `/api/host/rooms/${roomId}/news`)).json().data.find((n: { headline: string }) => n.headline === 'Rate cut rumour')
    const res = await post(host, `/api/host/rooms/${roomId}/news/${draft.id}/schedule`, { minute: 3 })
    expect(res.statusCode).toBe(200)
    const after = (await get(host, `/api/host/rooms/${roomId}/news`)).json().data.find((n: { id: string }) => n.id === draft.id)
    expect(after).toMatchObject({ status: 'scheduled', scheduledAtMs: 180_000 })
  })

  it('imports a template and validates it strictly', async () => {
    const { host, roomId } = await scriptedRoom()
    const template = (await post(host, `/api/host/rooms/${roomId}/save-template`, { name: 'Oil shock' })).json().data
    const data = (await get(host, `/api/host/templates/${template.id}/export`)).json().data
    const other = await loginHost(app, 'other@example.com', 'other-password-1')
    expect((await post(other, '/api/host/templates', { name: 'Shared copy', data })).statusCode).toBe(200)

    const broken = { ...data, news: [{ headline: 'Bad', kind: 'mechanical', impacts: { NOPE: 0.1 } }] }
    const res = await post(other, '/api/host/templates', { name: 'Broken', data: broken })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.message).toContain('NOPE')
  })

  it('keeps templates private to their host', async () => {
    const { host, roomId } = await scriptedRoom()
    const template = (await post(host, `/api/host/rooms/${roomId}/save-template`, { name: 'Mine' })).json().data
    const other = await loginHost(app, 'other@example.com', 'other-password-1')
    expect((await get(other, `/api/host/templates/${template.id}/export`)).statusCode).toBe(404)
    expect((await del(other, `/api/host/templates/${template.id}`)).statusCode).toBe(404)
    expect((await del(host, `/api/host/templates/${template.id}`)).statusCode).toBe(200)
    expect((await get(host, '/api/host/templates')).json().data).toEqual([])
  })
})
