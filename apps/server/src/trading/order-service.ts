import { createHash } from 'node:crypto'
import type { OrderPreview, OrderTicketInput, PlaceOrder, PlaceOrderResult } from '@tradetech/contracts'
import { applyFillToPosition, evaluateOrder, pressureAfter, type OrderDecision, type OrderFill } from '@tradetech/engine'
import type { PrismaClient, Room, Stock, Team } from '../generated/prisma/client.ts'
import { AppError, notFound } from '../http/errors.ts'
import { appendRoomEvent, withRoomLock, type Tx } from '../rooms/room-lock.ts'
import { parseRoomRules } from '../rooms/rules.ts'
import { quotesFor, stockTradingState } from './market-state.ts'
import { toOrderView } from './views.ts'

const TRADING_STATUSES = new Set(['practice', 'live'])

export interface TeamRef {
  readonly teamId: bigint
  readonly roomId: bigint
}

function requestHash(ticket: OrderTicketInput): string {
  const canonical = JSON.stringify([ticket.stockId, ticket.intent, ticket.quantity, ticket.limitPrice ?? null])
  return createHash('sha256').update(canonical).digest('hex')
}

interface TradingSnapshot {
  readonly room: Room
  readonly team: Team
  readonly stock: Stock
  readonly decision: OrderDecision
}

/** Loads the team's book and evaluates the ticket. Must run inside the room lock to be authoritative. */
async function evaluate(tx: Tx, ref: TeamRef, ticket: OrderTicketInput): Promise<TradingSnapshot> {
  const room = await tx.room.findUniqueOrThrow({ where: { id: ref.roomId } })
  if (!TRADING_STATUSES.has(room.status)) throw new AppError(409, 'market_closed', 'Trading is not open right now.')
  const team = await tx.team.findUniqueOrThrow({ where: { id: ref.teamId } })
  if (team.status !== 'active') throw new AppError(403, 'team_inactive', `This team is ${team.status}.`)

  const stocks = await tx.stock.findMany({ where: { roomId: ref.roomId } })
  const stock = stocks.find((s) => s.id.toString() === ticket.stockId)
  if (!stock) throw notFound('Stock')
  const positions = await tx.position.findMany({ where: { teamId: ref.teamId } })
  const rules = parseRoomRules(room.rules)

  const decision = evaluateOrder(
    {
      cash: Number(team.cashPaise) / 100,
      positions: new Map(positions.map((p) => [p.stockId.toString(), p.quantity])),
      quotes: quotesFor(stocks, rules),
      stock: stockTradingState(stock),
      rules,
    },
    { stockId: ticket.stockId, intent: ticket.intent, quantity: ticket.quantity, limitPrice: ticket.limitPrice },
  )
  return { room, team, stock, decision }
}

async function enforceRateLimit(tx: Tx, ref: TeamRef, minIntervalMs: number): Promise<void> {
  if (minIntervalMs <= 0) return
  const last = await tx.order.findFirst({
    where: { teamId: ref.teamId },
    orderBy: { acceptedAt: 'desc' },
    select: { acceptedAt: true },
  })
  if (last && Date.now() - last.acceptedAt.getTime() < minIntervalMs) {
    throw new AppError(429, 'rate_limited', 'One order per second, please — try again in a moment.')
  }
}

async function applyFill(tx: Tx, snapshot: TradingSnapshot, ref: TeamRef, fill: OrderFill, orderId: bigint): Promise<void> {
  const { stock } = snapshot
  await tx.stock.update({
    where: { id: stock.id },
    data: {
      pressure: pressureAfter(stock.pressure, stock, fill.signedQuantity),
      borrowUsed: { increment: fill.borrowDelta },
    },
  })
  await tx.team.update({ where: { id: ref.teamId }, data: { cashPaise: { increment: fill.cashDeltaPaise } } })

  const existing = await tx.position.findUnique({ where: { teamId_stockId: { teamId: ref.teamId, stockId: stock.id } } })
  const next = applyFillToPosition(
    existing ?? { quantity: 0, costBasisPaise: 0n, realizedPnlPaise: 0n },
    fill.signedQuantity,
    fill.cashDeltaPaise,
  )
  await tx.position.upsert({
    where: { teamId_stockId: { teamId: ref.teamId, stockId: stock.id } },
    create: { roomId: ref.roomId, teamId: ref.teamId, stockId: stock.id, ...next },
    update: next,
  })
  const event = await appendRoomEvent(tx, ref.roomId, {
    type: 'quote',
    payload: { stockId: stock.id.toString(), mid: fill.midAfter },
    isPublic: true,
    marketChanged: true,
  })
  await tx.ledgerEntry.create({
    data: { roomId: ref.roomId, teamId: ref.teamId, amountPaise: fill.cashDeltaPaise, cause: 'fill', orderId, eventOffset: event.offset },
  })
}

/**
 * Accepts one order atomically as the room's single writer. Idempotent on
 * (team, requestId): a retry returns the stored result; a reused id with a
 * different body is refused. Rule rejections are persisted with their reason.
 */
export async function placeOrder(db: PrismaClient, ref: TeamRef, input: PlaceOrder): Promise<PlaceOrderResult> {
  const hash = requestHash(input)
  return withRoomLock(db, ref.roomId, async (tx) => {
    const prior = await tx.order.findUnique({
      where: { teamId_requestId: { teamId: ref.teamId, requestId: input.requestId } },
      include: { stock: { select: { ticker: true } } },
    })
    if (prior) {
      if (prior.requestHash !== hash) {
        throw new AppError(409, 'idempotency_conflict', 'This request id was already used for a different order.')
      }
      return { order: toOrderView(prior), replayed: true }
    }

    const snapshot = await evaluate(tx, ref, input)
    await enforceRateLimit(tx, ref, parseRoomRules(snapshot.room.rules).minOrderIntervalMs)
    const { decision, stock } = snapshot
    const sign = input.intent === 'buy' || input.intent === 'cover' ? 1 : -1

    const seq = await tx.room.update({
      where: { id: ref.roomId },
      data: { nextOrderSeq: { increment: 1 } },
      select: { nextOrderSeq: true },
    })
    const order = await tx.order.create({
      data: {
        roomId: ref.roomId,
        teamId: ref.teamId,
        stockId: stock.id,
        requestId: input.requestId,
        requestHash: hash,
        acceptSeq: seq.nextOrderSeq - 1n,
        intent: input.intent,
        quantity: sign * input.quantity,
        limitPrice: input.limitPrice ?? null,
        status: decision.ok ? 'filled' : 'rejected',
        avgPrice: decision.ok ? decision.averagePrice : null,
        costPaise: decision.ok ? -decision.cashDeltaPaise : null,
        rejectReason: decision.ok ? null : decision.reason,
        rejectMessage: decision.ok ? null : decision.message,
      },
      include: { stock: { select: { ticker: true } } },
    })
    if (decision.ok) await applyFill(tx, snapshot, ref, decision, order.id)
    return { order: toOrderView(order), replayed: false }
  })
}

/** Estimates an order against current state without persisting anything. */
export async function previewOrder(db: PrismaClient, ref: TeamRef, ticket: OrderTicketInput): Promise<OrderPreview> {
  const { decision } = await db.$transaction((tx) => evaluate(tx, ref, ticket))
  if (!decision.ok) {
    return {
      ok: false,
      reason: decision.reason,
      message: decision.message,
      ...(decision.maxQuantity === undefined ? {} : { maxQuantity: decision.maxQuantity }),
    }
  }
  return {
    ok: true,
    averagePrice: decision.averagePrice,
    cashDeltaPaise: Number(decision.cashDeltaPaise),
    midAfter: decision.midAfter,
  }
}
