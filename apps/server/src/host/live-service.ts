import type { LeaderboardEntry } from '@tradetech/contracts'
import { liquidationValue } from '@tradetech/engine'
import type { PrismaClient, Room } from '../generated/prisma/client.ts'
import { notFound } from '../http/errors.ts'
import { appendRoomEvent, withRoomLock } from '../rooms/room-lock.ts'
import { parseRoomRules } from '../rooms/rules.ts'
import { quotesFor, stockMid } from '../trading/market-state.ts'

/** Host halt/reopen. Reopening can re-centre the band on the current price (blueprint §8). */
export async function setHalt(db: PrismaClient, room: Room, stockId: bigint, halted: boolean, rebaseBand: boolean): Promise<void> {
  await withRoomLock(db, room.id, async (tx) => {
    const stock = await tx.stock.findFirst({ where: { id: stockId, roomId: room.id } })
    if (!stock) throw notFound('Stock')
    await tx.stock.update({
      where: { id: stock.id },
      data: {
        halted,
        haltReason: halted ? 'host' : null,
        ...(!halted && rebaseBand ? { bandReference: stockMid(stock) } : {}),
      },
    })
    await appendRoomEvent(tx, room.id, {
      type: halted ? 'halt' : 'reopen',
      payload: { stockId: stock.id.toString(), rebaseBand },
      isPublic: true,
      marketChanged: true,
    })
  })
}

/**
 * Current standings by liquidation value, all teams valued against one
 * consistent snapshot. Equal paise share a rank (1, 2, 2, 4).
 */
export async function leaderboard(db: PrismaClient, roomId: bigint): Promise<LeaderboardEntry[]> {
  const [room, stocks, teams] = await db.$transaction(
    [
      db.room.findUniqueOrThrow({ where: { id: roomId } }),
      db.stock.findMany({ where: { roomId } }),
      db.team.findMany({ where: { roomId }, include: { positions: { where: { quantity: { not: 0 } } } } }),
    ],
    { isolationLevel: 'RepeatableRead' },
  )
  const quotes = quotesFor(stocks, parseRoomRules(room.rules))
  const valued = teams
    .map((team) => ({
      teamId: team.id.toString(),
      name: team.name,
      status: team.status,
      // Round (not floor) so float noise like 100028.9999… can't split a genuine tie.
      liquidationValuePaise: Math.round(
        liquidationValue(Number(team.cashPaise) / 100, new Map(team.positions.map((p) => [p.stockId.toString(), p.quantity])), quotes) * 100,
      ),
    }))
    .sort((a, b) => b.liquidationValuePaise - a.liquidationValuePaise || a.name.localeCompare(b.name))
  return valued.map((entry, i) => {
    const firstEqual = valued.findIndex((e) => e.liquidationValuePaise === entry.liquidationValuePaise)
    return { ...entry, rank: (firstEqual === -1 ? i : firstEqual) + 1 }
  })
}
