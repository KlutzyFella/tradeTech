import type { HostMonitorView, MonitorTeam, MonitorTrade } from '@tradetech/contracts'
import { maintenanceHeadroom, marginLevel, portfolioMetrics } from '@tradetech/engine'
import type { PrismaClient, Room } from '../generated/prisma/client.ts'
import { parseRoomRules } from '../rooms/rules.ts'
import { quotesFor, toPaise } from '../trading/market-state.ts'

/** The feed is a glance at what's happening now; full history is in the CSV exports. */
const TRADE_FEED_LIMIT = 40
const ACTIVITY_WINDOW_MS = 60_000
/** Forced fills are written with this request hash by recordForcedFill. */
const FORCED_FILL_HASH = 'liquidation'

/** Counts live connections per team; works across instances through the Socket.IO adapter. */
export type ConnectionCounter = (roomId: bigint) => Promise<ReadonlyMap<string, number>>

/**
 * Host live monitor (blueprint §9): connections, recent trading activity and
 * how close each team is to forced liquidation. Read-only and lock-free: it
 * reports a near-current picture and never decides anything.
 */
export async function monitorView(db: PrismaClient, room: Room, countConnections: ConnectionCounter, now = new Date()): Promise<HostMonitorView> {
  const since = new Date(now.getTime() - ACTIVITY_WINDOW_MS)
  const [stocks, teams, recent, lastMinute, lastOrders, connections] = await Promise.all([
    db.stock.findMany({ where: { roomId: room.id } }),
    db.team.findMany({ where: { roomId: room.id }, orderBy: { id: 'asc' }, include: { positions: { where: { quantity: { not: 0 } } } } }),
    db.order.findMany({
      where: { roomId: room.id },
      orderBy: { acceptSeq: 'desc' },
      take: TRADE_FEED_LIMIT,
      include: { stock: { select: { ticker: true } }, team: { select: { name: true } } },
    }),
    db.order.findMany({ where: { roomId: room.id, acceptedAt: { gte: since } }, select: { teamId: true, status: true, costPaise: true } }),
    db.order.groupBy({ by: ['teamId'], where: { roomId: room.id }, _max: { acceptedAt: true } }),
    countConnections(room.id),
  ])
  const rules = parseRoomRules(room.rules)
  const quotes = quotesFor(stocks, rules)
  const lastOrderAt = new Map(lastOrders.map((o) => [o.teamId, o._max.acceptedAt]))
  const minuteCounts = new Map<bigint, number>()
  for (const o of lastMinute) minuteCounts.set(o.teamId, (minuteCounts.get(o.teamId) ?? 0) + 1)

  const teamViews: MonitorTeam[] = teams.map((team) => {
    const metrics = portfolioMetrics(Number(team.cashPaise) / 100, new Map(team.positions.map((p) => [p.stockId.toString(), p.quantity])), quotes, rules)
    const headroom = maintenanceHeadroom(metrics, rules)
    return {
      teamId: team.id.toString(),
      name: team.name,
      status: team.status,
      connections: connections.get(team.id.toString()) ?? 0,
      lastOrderAt: lastOrderAt.get(team.id)?.toISOString() ?? null,
      ordersLastMinute: minuteCounts.get(team.id) ?? 0,
      liquidationValuePaise: toPaise(metrics.liquidationValue),
      grossExposurePaise: toPaise(metrics.grossExposure),
      shortNotionalPaise: toPaise(metrics.shortNotional),
      marginHeadroom: headroom,
      marginLevel: team.status === 'active' ? marginLevel(headroom) : 'none',
    }
  })

  const trades: MonitorTrade[] = recent.map((o) => ({
    id: o.id.toString(),
    teamName: o.team.name,
    ticker: o.stock.ticker,
    intent: o.intent,
    quantity: Math.abs(o.quantity),
    status: o.status === 'filled' ? 'filled' : 'rejected',
    averagePrice: o.avgPrice,
    valuePaise: o.costPaise === null ? null : Math.abs(Number(o.costPaise)),
    rejectMessage: o.rejectMessage,
    forced: o.requestHash === FORCED_FILL_HASH,
    acceptedAt: o.acceptedAt.toISOString(),
  }))

  const filled = lastMinute.filter((o) => o.status === 'filled')
  return {
    serverTime: now.toISOString(),
    teams: teamViews,
    trades,
    lastMinute: {
      filled: filled.length,
      rejected: lastMinute.length - filled.length,
      valuePaise: filled.reduce((sum, o) => sum + Math.abs(Number(o.costPaise ?? 0n)), 0),
    },
  }
}
