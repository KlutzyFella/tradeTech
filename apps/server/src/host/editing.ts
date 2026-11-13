import type { RoomRules, UpdateStock } from '@tradetech/contracts'
import type { PrismaClient, Room, Stock } from '../generated/prisma/client.ts'
import { AppError, notFound } from '../http/errors.ts'
import { appendRoomEvent, withRoomLock, type Tx } from '../rooms/room-lock.ts'
import { mergeRoomRules, parseRoomRules, type RoomRulesOverrides } from '../rooms/rules.ts'
import { toStockView } from '../trading/market-state.ts'

/** Fields that only describe a stock; editable until the event closes. */
const DESCRIPTIVE = new Set(['name', 'sector', 'profile'])
/** Fields that change how a stock trades; only while setting up or practising. */
const SETUP_STATUSES = new Set(['draft', 'practice'])

async function currentStatus(tx: Tx, roomId: bigint): Promise<string> {
  return (await tx.room.findUniqueOrThrow({ where: { id: roomId }, select: { status: true } })).status
}

/**
 * Merges rule changes and validates the whole set. Rules lock once the event
 * is live: changing fees or limits mid-competition would be unfair.
 */
export async function updateRules(db: PrismaClient, room: Room, changes: RoomRulesOverrides): Promise<RoomRules> {
  return withRoomLock(db, room.id, async (tx) => {
    if (!SETUP_STATUSES.has(await currentStatus(tx, room.id))) {
      throw new AppError(409, 'rules_locked', 'Rules are locked once the event is live.')
    }
    const current = await tx.room.findUniqueOrThrow({ where: { id: room.id } })
    const merged = mergeRoomRules(changes, parseRoomRules(current.rules))
    await tx.room.update({ where: { id: room.id }, data: { rules: merged, rulesVersion: { increment: 1 } } })
    await appendRoomEvent(tx, room.id, { type: 'rules_changed', payload: { changes }, isPublic: false, marketChanged: false })
    return merged
  })
}

async function ownedStock(tx: Tx, roomId: bigint, stockId: bigint): Promise<Stock> {
  const stock = await tx.stock.findFirst({ where: { id: stockId, roomId } })
  if (!stock) throw notFound('Stock')
  return stock
}

/**
 * Edits a stock. Descriptions can change until close; trading settings only
 * while setting up or practising; the opening price only before any trading
 * (draft). The borrow pool never drops below shares already lent.
 */
export async function updateStock(db: PrismaClient, room: Room, stockId: bigint, changes: UpdateStock) {
  return withRoomLock(db, room.id, async (tx) => {
    const status = await currentStatus(tx, room.id)
    const stock = await ownedStock(tx, room.id, stockId)
    const fields = Object.keys(changes)
    if (status === 'closed') throw new AppError(409, 'room_closed', 'The event has closed; stocks can no longer change.')
    if (!SETUP_STATUSES.has(status) && fields.some((f) => !DESCRIPTIVE.has(f))) {
      throw new AppError(409, 'stock_locked', 'Once live, only the name, sector and profile can change.')
    }
    if (changes.openingPrice !== undefined && status !== 'draft') {
      throw new AppError(409, 'opening_price_locked', 'The opening price can only change before practice trading starts.')
    }
    if (changes.borrowPool !== undefined && changes.borrowPool < stock.borrowUsed) {
      throw new AppError(409, 'borrow_pool_too_small', `${stock.borrowUsed} shares are already lent; the pool can't be smaller.`)
    }
    // Only fields actually sent: partial input may carry explicit undefineds.
    const sent = Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined)) as {
      [K in keyof UpdateStock]-?: Exclude<UpdateStock[K], undefined>
    }
    const updated = await tx.stock.update({
      where: { id: stock.id },
      data: {
        ...sent,
        // A new opening price resets the stock's whole price state.
        ...(changes.openingPrice !== undefined
          ? { anchor: changes.openingPrice, bandReference: changes.openingPrice, pressure: 0, noise: 0 }
          : {}),
      },
    })
    await appendRoomEvent(tx, room.id, {
      type: 'stock_changed',
      payload: { stockId: stock.id.toString(), fields },
      isPublic: true,
      marketChanged: fields.some((f) => !DESCRIPTIVE.has(f)),
    })
    return toStockView(updated)
  })
}

/** Removes a stock that has never traded: only while setting up. */
export async function deleteStock(db: PrismaClient, room: Room, stockId: bigint): Promise<void> {
  await withRoomLock(db, room.id, async (tx) => {
    if ((await currentStatus(tx, room.id)) !== 'draft') {
      throw new AppError(409, 'stock_locked', 'Stocks can only be removed while setting up, before practice.')
    }
    const stock = await ownedStock(tx, room.id, stockId)
    const used = (await tx.order.count({ where: { stockId: stock.id } })) + (await tx.position.count({ where: { stockId: stock.id } }))
    if (used > 0) throw new AppError(409, 'stock_in_use', 'This stock has trades on record and cannot be removed.')
    const drafts = await tx.newsItem.findMany({ where: { roomId: room.id, status: { not: 'published' } }, select: { headline: true, impacts: true } })
    const referencing = drafts.filter((n) => Object.hasOwn((n.impacts ?? {}) as object, stock.id.toString()))
    if (referencing.length > 0) {
      throw new AppError(409, 'stock_in_news', `Unpublished news moves ${stock.ticker} (“${referencing[0]!.headline}”). Edit that news first.`)
    }
    await tx.stock.delete({ where: { id: stock.id } })
  })
}
