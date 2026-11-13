import { randomUUID } from 'node:crypto'
import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import type { CreateStock, RoomRules } from '@tradetech/contracts'
import { buildApp } from '../src/app.ts'
import { createHost } from '../src/auth/hosts.ts'
import { loadConfig } from '../src/config.ts'
import { TEST_DATABASE_URL } from './global-setup.ts'

export async function buildTestApp(): Promise<FastifyInstance> {
  const app = await buildApp(
    loadConfig({
      LOG_LEVEL: 'silent',
      DATABASE_URL: TEST_DATABASE_URL,
      NODE_ENV: 'test',
      LOGIN_RATE_LIMIT_MAX: '1000',
      TICKER_ENABLED: 'false',
    }),
  )
  await app.ready()
  return app
}

export async function resetDatabase(app: FastifyInstance): Promise<void> {
  await app.db.$executeRawUnsafe(
    `TRUNCATE event_templates, price_points, sessions, final_scores, room_events, ledger_entries, positions, orders, news_items, rounds, stocks, teams, rooms, hosts RESTART IDENTITY CASCADE`,
  )
}

export type Session = Record<string, string>

export function sessionFrom(response: LightMyRequestResponse): Session {
  const cookie = response.cookies.find((c) => c.name === 'tt_session')
  if (!cookie) throw new Error(`no session cookie (status ${response.statusCode}: ${response.body})`)
  return { tt_session: cookie.value }
}

export async function loginHost(app: FastifyInstance, email = 'host@example.com', password = 'host-password-1'): Promise<Session> {
  const existing = await app.db.host.findUnique({ where: { email } })
  if (!existing) await createHost(app.db, email, password)
  const response = await app.inject({ method: 'POST', url: '/api/auth/host/login', payload: { email, password } })
  return sessionFrom(response)
}

export const THIN_STOCK: CreateStock = {
  ticker: 'THIN',
  name: 'Thin Co',
  sector: 'Industrials',
  openingPrice: 100,
  depth: 100_000,
  borrowPool: 50_000,
}

export const DEEP_STOCK: CreateStock = {
  ticker: 'DEEP',
  name: 'Deep Co',
  sector: 'Energy',
  openingPrice: 100,
  depth: 5_000_000,
  borrowPool: 50_000,
}

interface RoomFixture {
  readonly roomId: string
  readonly host: Session
  readonly stocks: Record<string, string>
  readonly teams: Session[]
}

/** Creates a room with stocks and teams via the host API, then opens practice. */
export async function setupRoom(
  app: FastifyInstance,
  opts: {
    code?: string
    teams?: number
    rules?: Partial<RoomRules>
    status?: 'practice' | 'draft'
    /** Create and start a round so trading is open (default true when practising). */
    round?: boolean
    stocks?: CreateStock[]
  } = {},
): Promise<RoomFixture> {
  const host = await loginHost(app)
  const code = opts.code ?? 'TEST01'
  const room = await app.inject({
    method: 'POST',
    url: '/api/host/rooms',
    cookies: host,
    payload: { name: 'Test room', code, startingCashRupees: 1_000_000, rules: { minOrderIntervalMs: 0, ...opts.rules } },
  })
  const roomId: string = room.json().data.id
  const stocks: Record<string, string> = {}
  for (const stock of opts.stocks ?? [THIN_STOCK, DEEP_STOCK]) {
    const created = await app.inject({ method: 'POST', url: `/api/host/rooms/${roomId}/stocks`, cookies: host, payload: stock })
    stocks[stock.ticker] = created.json().data.id
  }
  const teamCount = opts.teams ?? 1
  const teams = Array.from({ length: teamCount }, (_, i) => ({
    name: `Team ${i + 1}`,
    loginName: `team${i + 1}`,
    password: `password-${i + 1}`,
  }))
  await app.inject({ method: 'POST', url: `/api/host/rooms/${roomId}/teams`, cookies: host, payload: { teams } })
  if ((opts.status ?? 'practice') === 'practice') {
    await app.inject({ method: 'POST', url: `/api/host/rooms/${roomId}/status`, cookies: host, payload: { status: 'practice' } })
    if (opts.round ?? true) await startRound(app, host, roomId)
  }
  const sessions: Session[] = []
  for (const team of teams) {
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/team/login',
      payload: { roomCode: code, loginName: team.loginName, password: team.password },
    })
    sessions.push(sessionFrom(login))
  }
  return { roomId, host, stocks, teams: sessions }
}

export function order(
  stockId: string,
  intent: 'buy' | 'sell' | 'short' | 'cover',
  quantity: number,
  extra: { requestId?: string; limitPrice?: number } = {},
): Record<string, unknown> {
  return { requestId: extra.requestId ?? randomUUID(), stockId, intent, quantity, ...(extra.limitPrice ? { limitPrice: extra.limitPrice } : {}) }
}

/** Creates a round and starts it. */
export async function startRound(app: FastifyInstance, host: Session, roomId: string, durationMinutes = 20): Promise<void> {
  const created = await app.inject({ method: 'POST', url: `/api/host/rooms/${roomId}/rounds`, cookies: host, payload: { durationMinutes } })
  if (created.statusCode !== 200) throw new Error(`create round failed: ${created.body}`)
  await roundAction(app, host, roomId, 'start')
}

export async function roundAction(app: FastifyInstance, host: Session, roomId: string, action: 'start' | 'pause' | 'resume' | 'end') {
  return app.inject({ method: 'POST', url: `/api/host/rooms/${roomId}/rounds/current/${action}`, cookies: host })
}
