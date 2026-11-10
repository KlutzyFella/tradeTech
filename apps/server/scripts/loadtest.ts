/**
 * Event-shaped load test. Creates a fresh room through the host API, signs in
 * N teams, and for D seconds each team places ~1 order/s (with jitter) while
 * holding a live socket and refetching market + portfolio on change signals,
 * exactly like the web app. The host publishes price-moving news every 20 s.
 *
 *   BASE_URL=http://localhost:3000 HOST_EMAIL=... HOST_PASSWORD=... \
 *     node scripts/loadtest.ts --teams 60 --seconds 60
 *
 * Reports order latency percentiles, refusals by reason, errors, refetch
 * latency and round-clock drift versus wall time.
 */
import { randomUUID } from 'node:crypto'
import { parseArgs } from 'node:util'
import { io, type Socket } from 'socket.io-client'

const { values } = parseArgs({
  options: {
    teams: { type: 'string', default: '20' },
    seconds: { type: 'string', default: '60' },
    /** Required to target anything but localhost: this creates real rooms and teams. */
    'i-know-this-writes-data': { type: 'boolean', default: false },
    stocks: { type: 'string', default: '10' },
  },
})
const TEAMS = Number(values.teams)
const SECONDS = Number(values.seconds)
const STOCKS = Number(values.stocks)
const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const HOST_EMAIL = process.env.HOST_EMAIL ?? 'host@tradetech.local'
const HOST_PASSWORD = process.env.HOST_PASSWORD ?? 'host-password-1'
const STARTING_CASH = 1_000_000

const target = new URL(BASE).hostname
if (!['localhost', '127.0.0.1', '::1'].includes(target) && !values['i-know-this-writes-data']) {
  console.error(`Refusing to load-test ${target}: it creates a room and ${TEAMS} teams there. Pass --i-know-this-writes-data to proceed.`)
  process.exit(2)
}

interface Client {
  cookie: string
  call<T = unknown>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ status: number; ms: number; data: T; code?: string }>
}

function client(): Client {
  const self: Client = {
    cookie: '',
    async call(method, path, body) {
      const started = performance.now()
      const res = await fetch(`${BASE}/api${path}`, {
        method,
        headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(self.cookie ? { cookie: self.cookie } : {}) },
        body: body === undefined ? null : JSON.stringify(body),
      })
      const ms = performance.now() - started
      const set = res.headers.get('set-cookie')
      if (set) self.cookie = set.split(';')[0]!
      const json = (await res.json().catch(() => ({}))) as { data?: unknown; error?: { code: string } }
      return { status: res.status, ms, data: json.data as never, ...(json.error ? { code: json.error.code } : {}) }
    },
  }
  return self
}

const percentile = (sorted: number[], p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]! : NaN)
const summarise = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return { count: s.length, p50: percentile(s, 50), p95: percentile(s, 95), p99: percentile(s, 99), max: s.at(-1) ?? NaN }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const must = <T>(r: { status: number; data: T; code?: string }, what: string): T => {
  if (r.status !== 200) throw new Error(`${what} failed: ${r.status} ${r.code ?? ''}`)
  return r.data
}

async function setup() {
  const host = client()
  must(await host.call('POST', '/auth/host/login', { email: HOST_EMAIL, password: HOST_PASSWORD }), 'host login')
  const code = `LT${Date.now().toString(36).slice(-6).toUpperCase()}`
  const room = must(await host.call<{ id: string }>('POST', '/host/rooms', { name: `Load ${TEAMS}`, code, startingCashRupees: STARTING_CASH }), 'room')
  const base = `/host/rooms/${room.id}`
  const stockIds: string[] = []
  for (let i = 0; i < STOCKS; i++) {
    const price = 50 + i * 75
    // Blueprint §8 sizing: 10% of all teams' cash in one stock moves it ~10%.
    const depth = Math.round((TEAMS * STARTING_CASH * 0.1) / price / Math.log(1.1))
    const s = must(
      await host.call<{ id: string }>('POST', `${base}/stocks`, {
        ticker: `S${i}`,
        name: `Stock ${i}`,
        sector: `Sector ${i % 4}`,
        openingPrice: price,
        depth,
        borrowPool: Math.round(depth / 5),
      }),
      'stock',
    )
    stockIds.push(s.id)
  }
  const teams = Array.from({ length: TEAMS }, (_, i) => ({ name: `Team ${i + 1}`, loginName: `t${i + 1}`, password: `password-${i + 1}` }))
  for (let i = 0; i < teams.length; i += 100) must(await host.call('POST', `${base}/teams`, { teams: teams.slice(i, i + 100) }), 'teams')
  must(await host.call('POST', `${base}/status`, { status: 'practice' }), 'practice')
  must(await host.call('POST', `${base}/rounds`, { durationMinutes: (SECONDS + 120) / 60 }), 'round')
  must(await host.call('POST', `${base}/rounds/current/start`), 'start')
  const roundStartedAt = Date.now()
  const sessions: Client[] = []
  for (const t of teams) {
    const c = client()
    must(await c.call('POST', '/auth/team/login', { roomCode: code, loginName: t.loginName, password: t.password }), 'team login')
    sessions.push(c)
  }
  return { host, base, stockIds, sessions, roundStartedAt }
}

async function main() {
  console.log(`Setting up ${TEAMS} teams, ${STOCKS} stocks against ${BASE}…`)
  const { host, base, stockIds, sessions, roundStartedAt } = await setup()
  const orderMs: number[] = []
  const refetchMs: number[] = []
  const outcomes = new Map<string, number>()
  const bump = (k: string) => outcomes.set(k, (outcomes.get(k) ?? 0) + 1)
  let errors = 0
  const deadline = Date.now() + SECONDS * 1000

  const sockets: Socket[] = sessions.map((s) => {
    const socket = io(BASE, { extraHeaders: { cookie: s.cookie, origin: new URL(BASE).origin }, transports: ['websocket'] })
    let inFlight = false
    const refetch = async () => {
      if (inFlight || Date.now() > deadline) return
      inFlight = true
      try {
        const [m, p] = await Promise.all([s.call('GET', '/market'), s.call('GET', '/portfolio')])
        refetchMs.push(Math.max(m.ms, p.ms))
        if (m.status >= 500 || p.status >= 500) errors++
      } catch {
        errors++
      } finally {
        inFlight = false
      }
    }
    socket.on('market:changed', () => void refetch())
    socket.on('orders:changed', () => void refetch())
    return socket
  })

  const trader = async (s: Client, i: number) => {
    await sleep(Math.random() * 1000)
    let n = 0
    while (Date.now() < deadline) {
      const stockId = stockIds[(i + n) % stockIds.length]!
      // Mostly buys early, then sells, so books stay within limits.
      const intent = n % 4 === 3 ? 'sell' : 'buy'
      try {
        const r = await s.call<{ order: { status: string; rejectReason: string | null } }>('POST', '/orders', {
          requestId: randomUUID(),
          stockId,
          intent,
          quantity: 1 + Math.floor(Math.random() * 50),
        })
        orderMs.push(r.ms)
        if (r.status === 200) bump(r.data.order.status === 'filled' ? 'filled' : `rejected:${r.data.order.rejectReason}`)
        else if (r.status >= 500) errors++
        else bump(`refused:${r.code}`)
      } catch {
        errors++
      }
      n++
      await sleep(1000 + Math.random() * 200)
    }
  }

  const newsDesk = async () => {
    let k = 0
    while (Date.now() < deadline - 5000) {
      await sleep(20_000)
      const shock = (k % 2 === 0 ? 1 : -1) * 0.04
      await host.call('POST', `${base}/news`, { headline: `News ${k}`, kind: 'mechanical', impacts: { [stockIds[k % stockIds.length]!]: shock }, mode: 'publish' })
      k++
    }
  }

  const started = Date.now()
  await Promise.all([...sessions.map(trader), newsDesk()])
  const wallMs = Date.now() - started
  for (const s of sockets) s.disconnect()

  const round = must(await host.call<{ remainingMs: number; durationMs: number }>('GET', `${base}/round`), 'round')
  const activeMs = round.durationMs - round.remainingMs
  const expectedActiveMs = Date.now() - roundStartedAt
  const ordersPerSec = orderMs.length / (wallMs / 1000)

  console.log(JSON.stringify(
    {
      teams: TEAMS,
      seconds: SECONDS,
      ordersPerSec: Number(ordersPerSec.toFixed(1)),
      orderLatencyMs: Object.fromEntries(Object.entries(summarise(orderMs)).map(([k, v]) => [k, Math.round(v)])),
      refetchLatencyMs: Object.fromEntries(Object.entries(summarise(refetchMs)).map(([k, v]) => [k, Math.round(v)])),
      outcomes: Object.fromEntries([...outcomes].sort((a, b) => b[1] - a[1])),
      errors,
      clockDriftMs: expectedActiveMs - activeMs,
    },
    null,
    2,
  ))
  if (errors > 0) process.exitCode = 1
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
