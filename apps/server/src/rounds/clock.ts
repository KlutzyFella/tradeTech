import type { RoundView } from '@tradetech/contracts'
import type { PrismaClient, Round } from '../generated/prisma/client.ts'
import type { Tx } from '../rooms/room-lock.ts'

/** A tick never accounts for more than this much active time (guards stalls and clock jumps). */
export const MAX_TICK_MS = 5_000

const UNFINISHED = ['pending', 'running', 'paused'] as const

/** Active elapsed time as of `now`: stored elapsed plus time since the last tick while running. */
export function activeElapsedMs(round: Round, now: Date): number {
  // Capped like a tick, so a stalled ticker never books more active time than ticking would.
  const pending =
    round.status === 'running' && round.lastTickAt ? Math.min(MAX_TICK_MS, Math.max(0, now.getTime() - round.lastTickAt.getTime())) : 0
  return Math.min(round.durationMs, round.activeElapsedMs + pending)
}

export function toRoundView(round: Round, now: Date): RoundView {
  return {
    id: round.id.toString(),
    sequence: round.sequence,
    kind: round.kind,
    status: round.status,
    durationMs: round.durationMs,
    remainingMs: round.durationMs - activeElapsedMs(round, now),
  }
}

/** The newest round (rounds are strictly sequential, so it is the current one). */
export function latestRound(db: PrismaClient | Tx, roomId: bigint): Promise<Round | null> {
  return db.round.findFirst({ where: { roomId }, orderBy: { sequence: 'desc' } })
}

export function unfinishedRound(db: PrismaClient | Tx, roomId: bigint): Promise<Round | null> {
  return db.round.findFirst({ where: { roomId, status: { in: [...UNFINISHED] } }, orderBy: { sequence: 'desc' } })
}
