import type { Prisma, PrismaClient } from '../generated/prisma/client.ts'

export type Tx = Prisma.TransactionClient

/**
 * Runs `fn` as the room's single writer (ADR 0002): one transaction holding
 * pg_advisory_xact_lock(roomId), so all mutations of a room — and of every
 * team in it — are serialized. The lock is released on commit/rollback.
 */
export async function withRoomLock<T>(db: PrismaClient, roomId: bigint, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${roomId})`
      return fn(tx)
    },
    { maxWait: 5_000, timeout: 10_000 },
  )
}

/**
 * Appends to the room's event log / outbox inside the writer transaction and
 * bumps the market version when the market changed.
 */
export async function appendRoomEvent(
  tx: Tx,
  roomId: bigint,
  event: { type: string; payload: Prisma.InputJsonValue; isPublic: boolean; marketChanged: boolean },
): Promise<{ offset: bigint; marketVersion: bigint }> {
  const room = await tx.room.update({
    where: { id: roomId },
    data: {
      nextEventOffset: { increment: 1 },
      ...(event.marketChanged ? { marketVersion: { increment: 1 } } : {}),
    },
    select: { nextEventOffset: true, marketVersion: true },
  })
  const offset = room.nextEventOffset - 1n
  await tx.roomEvent.create({
    data: {
      roomId,
      offset,
      marketVersion: room.marketVersion,
      type: event.type,
      payload: event.payload,
      isPublic: event.isPublic,
    },
  })
  return { offset, marketVersion: room.marketVersion }
}
