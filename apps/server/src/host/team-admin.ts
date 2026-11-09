import { hashPassword } from '../auth/password.ts'
import type { PrismaClient, Room } from '../generated/prisma/client.ts'
import { AppError, notFound } from '../http/errors.ts'
import { appendRoomEvent, withRoomLock } from '../rooms/room-lock.ts'

async function ownedTeam(db: PrismaClient, room: Room, teamId: bigint) {
  const team = await db.team.findFirst({ where: { id: teamId, roomId: room.id } })
  if (!team) throw notFound('Team')
  return team
}

/** Sets a new password and signs the team out of every device. */
export async function resetTeamPassword(db: PrismaClient, room: Room, teamId: bigint, password: string): Promise<void> {
  const team = await ownedTeam(db, room, teamId)
  const passwordHash = await hashPassword(password)
  await db.$transaction([
    db.team.update({ where: { id: team.id }, data: { passwordHash } }),
    db.session.deleteMany({ where: { teamId: team.id } }),
  ])
}

/**
 * Disqualifies (with a reason) or reinstates a team. Disqualification signs
 * the team out; its trades stay on record but it is never ranked. Frozen
 * (insolvent) teams stay frozen — this never issues fresh cash.
 */
export async function setTeamStatus(db: PrismaClient, room: Room, teamId: bigint, status: 'active' | 'disqualified', reason: string): Promise<void> {
  await ownedTeam(db, room, teamId)
  await withRoomLock(db, room.id, async (tx) => {
    const { status: roomStatus } = await tx.room.findUniqueOrThrow({ where: { id: room.id }, select: { status: true } })
    if (roomStatus === 'closed') throw new AppError(409, 'room_closed', 'Results are final; team status can no longer change.')
    const team = await tx.team.findUniqueOrThrow({ where: { id: teamId } })
    if (status === 'active' && team.status !== 'disqualified') return
    // Reinstating restores insolvency: a team with negative cash goes back to frozen, never to trading.
    const next = status === 'active' && team.cashPaise < 0n ? 'frozen' : status
    const statusReason = next === 'frozen' ? 'Insolvent after margin liquidation' : status === 'active' ? null : reason
    await tx.team.update({ where: { id: teamId }, data: { status: next, statusReason } })
    if (status === 'disqualified') await tx.session.deleteMany({ where: { teamId } })
    await appendRoomEvent(tx, room.id, {
      type: 'team_status',
      payload: { teamId: teamId.toString(), status, reason },
      isPublic: false,
      marketChanged: false,
    })
  })
}
