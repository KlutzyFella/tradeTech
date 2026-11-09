import type { MarketView, OrderView, PortfolioView, PositionView, RoomStatus } from '@tradetech/contracts'
import { portfolioMetrics } from '@tradetech/engine'
import type { Order, PrismaClient } from '../generated/prisma/client.ts'
import { parseRoomRules } from '../rooms/rules.ts'
import { latestRound, toRoundView } from '../rounds/clock.ts'
import { quotesFor, stockMid, toPaise, toStockView } from './market-state.ts'

const ORDER_HISTORY_LIMIT = 100

export function toOrderView(order: Order & { stock: { ticker: string } }): OrderView {
  return {
    id: order.id.toString(),
    requestId: order.requestId,
    acceptSeq: Number(order.acceptSeq),
    stockId: order.stockId.toString(),
    ticker: order.stock.ticker,
    intent: order.intent,
    quantity: Math.abs(order.quantity),
    status: order.status === 'filled' ? 'filled' : 'rejected',
    averagePrice: order.avgPrice,
    cashDeltaPaise: order.costPaise === null ? null : Number(-order.costPaise),
    rejectReason: order.rejectReason,
    rejectMessage: order.rejectMessage,
    acceptedAt: order.acceptedAt.toISOString(),
  }
}

export async function getMarketView(db: PrismaClient, roomId: bigint): Promise<MarketView> {
  const room = await db.room.findUniqueOrThrow({
    where: { id: roomId },
    include: { stocks: { orderBy: { ticker: 'asc' } } },
  })
  const round = await latestRound(db, roomId)
  const now = new Date()
  return {
    roomStatus: room.status as RoomStatus,
    marketVersion: Number(room.marketVersion),
    round: round ? toRoundView(round, now) : null,
    serverTime: now.toISOString(),
    stocks: room.stocks.map((s) => toStockView(s, now)),
  }
}

export async function getPortfolioView(db: PrismaClient, ref: { teamId: bigint; roomId: bigint }): Promise<PortfolioView> {
  // One snapshot so cash, positions and prices are mutually consistent.
  const [room, team, stocks, positions] = await db.$transaction(
    [
      db.room.findUniqueOrThrow({ where: { id: ref.roomId } }),
      db.team.findUniqueOrThrow({ where: { id: ref.teamId } }),
      db.stock.findMany({ where: { roomId: ref.roomId } }),
      db.position.findMany({ where: { teamId: ref.teamId, quantity: { not: 0 } }, include: { stock: true } }),
    ],
    { isolationLevel: 'RepeatableRead' },
  )
  const rules = parseRoomRules(room.rules)
  const cash = Number(team.cashPaise) / 100
  const metrics = portfolioMetrics(
    cash,
    new Map(positions.map((p) => [p.stockId.toString(), p.quantity])),
    quotesFor(stocks, rules),
    rules,
  )
  const positionViews: PositionView[] = positions
    .map((p) => {
      const mid = stockMid(p.stock)
      const marketValuePaise = toPaise(p.quantity * mid)
      return {
        stockId: p.stockId.toString(),
        ticker: p.stock.ticker,
        quantity: p.quantity,
        mid,
        marketValuePaise,
        costBasisPaise: Number(p.costBasisPaise),
        unrealizedPnlPaise: marketValuePaise - Number(p.costBasisPaise),
        realizedPnlPaise: Number(p.realizedPnlPaise),
      }
    })
    .sort((a, b) => a.ticker.localeCompare(b.ticker))

  return {
    cashPaise: Number(team.cashPaise),
    restrictedCashPaise: toPaise(metrics.restrictedCash),
    availableCashPaise: toPaise(metrics.availableCash),
    equityPaise: toPaise(metrics.equity),
    grossExposurePaise: toPaise(metrics.grossExposure),
    shortNotionalPaise: toPaise(metrics.shortNotional),
    // Floor: the displayed score never overstates what closing would return.
    liquidationValuePaise: Math.floor(metrics.liquidationValue * 100),
    startingCashPaise: Number(room.startingCashPaise),
    positions: positionViews,
  }
}

export async function listTeamOrders(db: PrismaClient, teamId: bigint): Promise<OrderView[]> {
  const orders = await db.order.findMany({
    where: { teamId },
    orderBy: { acceptSeq: 'desc' },
    take: ORDER_HISTORY_LIMIT,
    include: { stock: { select: { ticker: true } } },
  })
  return orders.map(toOrderView)
}
