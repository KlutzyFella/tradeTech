import { randomUUID } from 'node:crypto'
import type { OrderIntent } from '@tradetech/contracts'
import { applyFillToPosition, pressureAfter } from '@tradetech/engine'
import type { Order, Stock } from '../generated/prisma/client.ts'
import { appendRoomEvent, type Tx } from '../rooms/room-lock.ts'

export interface FillEffects {
  readonly signedQuantity: number
  readonly cashDeltaPaise: bigint
  readonly midAfter: number
  readonly borrowDelta: number
}

/** Takes the room's next acceptance sequence number. Caller holds the room lock. */
export async function nextAcceptSeq(tx: Tx, roomId: bigint): Promise<bigint> {
  const room = await tx.room.update({ where: { id: roomId }, data: { nextOrderSeq: { increment: 1 } }, select: { nextOrderSeq: true } })
  return room.nextOrderSeq - 1n
}

/**
 * Applies a fill's effects atomically: dealer pressure and borrow on the
 * stock, team cash, the position's basis and realized P&L, a ledger posting
 * and a public quote event. Caller holds the room lock.
 */
export async function applyFillEffects(
  tx: Tx,
  ref: { roomId: bigint; teamId: bigint },
  stock: Stock,
  fill: FillEffects,
  orderId: bigint,
  cause: 'fill' | 'liquidation',
): Promise<Stock> {
  const updated = await tx.stock.update({
    where: { id: stock.id },
    data: {
      pressure: pressureAfter(stock.pressure, stock, fill.signedQuantity),
      borrowUsed: { increment: fill.borrowDelta },
    },
  })
  await tx.team.update({ where: { id: ref.teamId }, data: { cashPaise: { increment: fill.cashDeltaPaise } } })

  const key = { teamId_stockId: { teamId: ref.teamId, stockId: stock.id } }
  const existing = await tx.position.findUnique({ where: key })
  const next = applyFillToPosition(
    existing ?? { quantity: 0, costBasisPaise: 0n, realizedPnlPaise: 0n },
    fill.signedQuantity,
    fill.cashDeltaPaise,
  )
  await tx.position.upsert({
    where: key,
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
    data: { roomId: ref.roomId, teamId: ref.teamId, amountPaise: fill.cashDeltaPaise, cause, orderId, eventOffset: event.offset },
  })
  return updated
}

/** Records a server-initiated (liquidation) order and applies its fill. */
export async function recordForcedFill(
  tx: Tx,
  ref: { roomId: bigint; teamId: bigint },
  stock: Stock,
  fill: FillEffects & { averagePrice: number },
): Promise<{ order: Order; stock: Stock }> {
  const intent: OrderIntent = fill.signedQuantity > 0 ? 'cover' : 'sell'
  const order = await tx.order.create({
    data: {
      roomId: ref.roomId,
      teamId: ref.teamId,
      stockId: stock.id,
      requestId: randomUUID(),
      requestHash: 'liquidation',
      acceptSeq: await nextAcceptSeq(tx, ref.roomId),
      intent,
      quantity: fill.signedQuantity,
      status: 'filled',
      avgPrice: fill.averagePrice,
      costPaise: -fill.cashDeltaPaise,
    },
  })
  return { order, stock: await applyFillEffects(tx, ref, stock, fill, order.id, 'liquidation') }
}
