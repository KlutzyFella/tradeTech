import type { RoundAction } from '@tradetech/contracts'
import type { PrismaClient, Room, Round } from '../generated/prisma/client.ts'
import { AppError } from '../http/errors.ts'
import { appendRoomEvent, withRoomLock, type Tx } from '../rooms/room-lock.ts'
import { activeElapsedMs, latestRound, unfinishedRound } from './clock.ts'

const MS_PER_MINUTE = 60_000

export async function createRound(db: PrismaClient, room: Room, durationMinutes: number): Promise<Round> {
  return withRoomLock(db, room.id, async (tx) => {
    const { status } = await tx.room.findUniqueOrThrow({ where: { id: room.id }, select: { status: true } })
    if (status !== 'practice' && status !== 'live') {
      throw new AppError(409, 'room_not_open', 'Open practice or go live before creating a round.')
    }
    if (await unfinishedRound(tx, room.id)) throw new AppError(409, 'round_in_progress', 'Finish the current round first.')
    const last = await latestRound(tx, room.id)
    const round = await tx.round.create({
      data: {
        roomId: room.id,
        sequence: (last?.sequence ?? 0) + 1,
        kind: status === 'live' ? 'scored' : 'practice',
        durationMs: Math.round(durationMinutes * MS_PER_MINUTE),
      },
    })
    await appendRoomEvent(tx, room.id, { type: 'round_created', payload: { sequence: round.sequence }, isPublic: true, marketChanged: false })
    return round
  })
}

const TRANSITIONS: Record<RoundAction, { from: readonly Round['status'][]; to: Round['status'] }> = {
  start: { from: ['pending'], to: 'running' },
  pause: { from: ['running'], to: 'paused' },
  resume: { from: ['paused'], to: 'running' },
  end: { from: ['pending', 'running', 'paused'], to: 'ended' },
}

/** Moves a round to a new status, flushing active time so pauses never count. Caller holds the room lock. */
export async function transitionRound(tx: Tx, round: Round, to: Round['status'], now: Date): Promise<Round> {
  const elapsed = activeElapsedMs(round, now)
  const updated = await tx.round.update({
    where: { id: round.id },
    data: {
      status: to,
      activeElapsedMs: elapsed,
      lastTickAt: to === 'running' ? now : null,
      ...(to === 'running' && !round.startedAt ? { startedAt: now } : {}),
      ...(to === 'ended' ? { cutoffAt: now } : {}),
    },
  })
  await appendRoomEvent(tx, round.roomId, {
    type: 'round_status',
    payload: { sequence: round.sequence, from: round.status, to },
    isPublic: true,
    marketChanged: false,
  })
  return updated
}

export async function roundAction(db: PrismaClient, room: Room, action: RoundAction, now = new Date()): Promise<Round> {
  return withRoomLock(db, room.id, async (tx) => {
    const round = await unfinishedRound(tx, room.id)
    if (!round) throw new AppError(409, 'no_round', 'Create a round first.')
    const rule = TRANSITIONS[action]
    if (!rule.from.includes(round.status)) {
      throw new AppError(409, 'invalid_transition', `Can’t ${action} a round that is ${round.status}.`)
    }
    return transitionRound(tx, round, rule.to, now)
  })
}

/** Ends any unfinished round (used when the room goes live or closes). Caller holds the room lock. */
export async function endUnfinishedRound(tx: Tx, roomId: bigint, now: Date): Promise<void> {
  const round = await unfinishedRound(tx, roomId)
  if (round) await transitionRound(tx, round, 'ended', now)
}
