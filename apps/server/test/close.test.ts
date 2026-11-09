import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp, order, resetDatabase, setupRoom, THIN_STOCK, type Session } from './helpers.ts'

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

/** Practice → live (fresh scored round) with three teams; team 2 profits from +8% news. */
async function liveEventWithWinner() {
  const room = await setupRoom(app, { teams: 3, rules: { newsPauseMs: 0 }, stocks: [THIN_STOCK] })
  const base = `/api/host/rooms/${room.roomId}`
  await post(room.host, `${base}/status`, { status: 'live' })
  await post(room.host, `${base}/rounds`, { durationMinutes: 20 })
  await post(room.host, `${base}/rounds/current/start`)
  await post(room.teams[1]!, '/api/orders', order(room.stocks.THIN!, 'buy', 1000))
  await post(room.host, `${base}/news`, { headline: 'Up', kind: 'mechanical', impacts: { [room.stocks.THIN!]: 0.08 }, mode: 'publish' })
  return { ...room, base }
}

describe('closing the competition', () => {
  it('freezes every team’s liquidation value and rank in exact paise', async () => {
    const { host, base } = await liveEventWithWinner()
    expect((await post(host, `${base}/status`, { status: 'closed' })).statusCode).toBe(200)

    const standings = (await get(host, `${base}/leaderboard`)).json().data
    expect(standings.final).toBe(true)
    expect(standings.entries.map((e: { name: string; rank: number }) => [e.name, e.rank])).toEqual([
      ['Team 2', 1],
      ['Team 1', 2],
      ['Team 3', 2],
    ])
    // Team 2 paid ₹1,00,652.43 and its exit at ₹109.085418 is worth ₹1,08,378.99 (§4.4).
    expect(standings.entries[0].liquidationValuePaise).toBe(100_000_000 - 10_065_243 + 10_837_899)
    expect(await app.db.finalScore.count()).toBe(3)
  })

  it('stops trading after the close and keeps the results fixed', async () => {
    const { host, base, teams, stocks } = await liveEventWithWinner()
    await post(host, `${base}/status`, { status: 'closed' })
    expect((await post(teams[0]!, '/api/orders', order(stocks.THIN!, 'buy', 1))).statusCode).toBe(409)
    const news = await post(host, `${base}/news`, { headline: 'Late', kind: 'mechanical', impacts: { [stocks.THIN!]: 0.5 }, mode: 'publish' })
    expect(news.statusCode).toBe(409)
    const before = (await get(host, `${base}/leaderboard`)).json().data.entries
    expect((await post(host, `${base}/status`, { status: 'closed' })).statusCode).toBe(200)
    expect((await get(host, `${base}/leaderboard`)).json().data.entries).toEqual(before)
  })

  it('leaves disqualified teams out of the ranking', async () => {
    const { host, base } = await liveEventWithWinner()
    const overview = (await get(host, base)).json().data
    const team2 = overview.teams.find((t: { name: string }) => t.name === 'Team 2')
    await post(host, `${base}/teams/${team2.id}/status`, { status: 'disqualified', reason: 'Collusion' })
    await post(host, `${base}/status`, { status: 'closed' })
    const entries = (await get(host, `${base}/leaderboard`)).json().data.entries
    expect(entries.map((e: { name: string; rank: number | null }) => [e.name, e.rank])).toEqual([
      ['Team 1', 1],
      ['Team 3', 1],
      ['Team 2', null],
    ])
  })
})

describe('what teams can see', () => {
  it('shows a team only its own value until the host shares the leaderboard', async () => {
    const { host, base, teams } = await liveEventWithWinner()
    const hidden = (await get(teams[0]!, '/api/standings')).json().data
    expect(hidden).toMatchObject({ visible: false, final: false, teamCount: 3, me: { rank: null }, entries: [] })
    expect(hidden.me.liquidationValuePaise).toBe(100_000_000)

    await post(host, `${base}/leaderboard/visibility`, { public: true })
    const shown = (await get(teams[0]!, '/api/standings')).json().data
    expect(shown.visible).toBe(true)
    expect(shown.me.rank).toBe(2)
    expect(shown.entries).toHaveLength(3)
    expect(JSON.stringify(shown)).not.toContain('teamId')
  })

  it('reports the frozen final result after the close', async () => {
    const { host, base, teams } = await liveEventWithWinner()
    await post(host, `${base}/leaderboard/visibility`, { public: true })
    await post(host, `${base}/status`, { status: 'closed' })
    const data = (await get(teams[1]!, '/api/standings')).json().data
    expect(data).toMatchObject({ final: true, me: { rank: 1 } })
  })
})

describe('exports', () => {
  it('downloads standings as CSV with spreadsheet formulas neutralised', async () => {
    const { host, roomId } = await setupRoom(app, { teams: 0 })
    await post(host, `/api/host/rooms/${roomId}/teams`, { teams: [{ name: '=HYPERLINK("x")', loginName: 'evil', password: 'password-evil' }] })
    const response = await get(host, `/api/host/rooms/${roomId}/export/standings.csv`)
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('text/csv')
    expect(response.headers['content-disposition']).toContain('attachment')
    const [header, row] = response.body.trim().split('\n')
    expect(header).toBe('rank,team,login,status,liquidation_value_inr,final')
    expect(row).toContain(`"'=HYPERLINK(""x"")"`)
  })

  it('exports orders, ledger and news, and only for the owning host', async () => {
    const { host, roomId, teams, stocks } = await setupRoom(app)
    await post(teams[0]!, '/api/orders', order(stocks.THIN!, 'buy', 10))
    for (const kind of ['orders', 'ledger', 'news']) {
      const response = await get(host, `/api/host/rooms/${roomId}/export/${kind}.csv`)
      expect(response.statusCode).toBe(200)
    }
    expect((await get(host, `/api/host/rooms/${roomId}/export/orders.csv`)).body).toContain('THIN')
    expect((await get(teams[0]!, `/api/host/rooms/${roomId}/export/orders.csv`)).statusCode).toBe(403)
  })

  it('keeps negative amounts numeric so spreadsheets can sum the ledger', async () => {
    const { host, roomId, teams, stocks } = await setupRoom(app)
    await post(teams[0]!, '/api/orders', order(stocks.THIN!, 'buy', 1000))
    const ledger = (await get(host, `/api/host/rooms/${roomId}/export/ledger.csv`)).body
    expect(ledger).toContain(',-100652.43,fill,')
    expect(ledger).not.toContain("'-")
  })
})

describe('team management', () => {
  it('resets a team password and signs the team out everywhere', async () => {
    const { host, roomId, teams } = await setupRoom(app)
    const team = (await get(host, `/api/host/rooms/${roomId}`)).json().data.teams[0]
    expect((await post(host, `/api/host/rooms/${roomId}/teams/${team.id}/password`, { password: 'brand-new-pass' })).statusCode).toBe(200)
    expect((await get(teams[0]!, '/api/portfolio')).statusCode).toBe(401)
    const login = (password: string) => post({}, '/api/auth/team/login', { roomCode: 'TEST01', loginName: 'team1', password })
    expect((await login('password-1')).statusCode).toBe(401)
    expect((await login('brand-new-pass')).statusCode).toBe(200)
  })

  it('disqualifies a team with a reason and can reinstate it', async () => {
    const { host, roomId, teams } = await setupRoom(app)
    const url = (id: string) => `/api/host/rooms/${roomId}/teams/${id}/status`
    const team = (await get(host, `/api/host/rooms/${roomId}`)).json().data.teams[0]
    expect((await post(host, url(team.id), { status: 'disqualified' })).statusCode).toBe(400)
    await post(host, url(team.id), { status: 'disqualified', reason: 'Shared logins' })
    expect((await get(teams[0]!, '/api/portfolio')).statusCode).toBe(401)
    await post(host, url(team.id), { status: 'active' })
    const relogin = await post({}, '/api/auth/team/login', { roomCode: 'TEST01', loginName: 'team1', password: 'password-1' })
    expect(relogin.statusCode).toBe(200)
  })
})
