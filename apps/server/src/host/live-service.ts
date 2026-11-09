import type { PrismaClient, Room } from '../generated/prisma/client.ts'
import { notFound } from '../http/errors.ts'
import { appendRoomEvent, withRoomLock } from '../rooms/room-lock.ts'
import { stockMid } from '../trading/market-state.ts'

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
