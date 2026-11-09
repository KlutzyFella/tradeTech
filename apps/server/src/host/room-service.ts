import { randomBytes } from 'node:crypto'
import {
  createStockSchema,
  ROOM_TRANSITIONS,
  type CreateRoom,
  type RoomStatus,
  type TeamImport,
} from '@tradetech/contracts'
import type { z } from 'zod'
import { hashPassword } from '../auth/password.ts'
import { Prisma, type PrismaClient, type Room } from '../generated/prisma/client.ts'
import { AppError, notFound } from '../http/errors.ts'
import { appendRoomEvent, withRoomLock, type Tx } from '../rooms/room-lock.ts'
import { mergeRoomRules } from '../rooms/rules.ts'
import { endUnfinishedRound } from '../rounds/round-service.ts'

const SETUP_STATUSES = new Set<string>(['draft', 'practice'])
const RESETTABLE_STATUSES = new Set<string>(['draft', 'practice'])
const RUPEE = 100n
/** Bound scrypt concurrency so a bulk import can't starve logins of the libuv pool. */
const HASH_BATCH = 4

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'

async function hashInBatches<T extends { password: string }>(items: readonly T[]): Promise<(T & { passwordHash: string })[]> {
  const out: (T & { passwordHash: string })[] = []
  for (let i = 0; i < items.length; i += HASH_BATCH) {
    const batch = items.slice(i, i + HASH_BATCH)
    out.push(...(await Promise.all(batch.map(async (t) => ({ ...t, passwordHash: await hashPassword(t.password) })))))
  }
  return out
}

/** Loads a room only if this host owns it; otherwise 404 so room ids don't leak. */
export async function ownedRoom(db: PrismaClient, hostId: bigint, roomId: bigint): Promise<Room> {
  const room = await db.room.findFirst({ where: { id: roomId, hostId } })
  if (!room) throw notFound('Room')
  return room
}

/** Re-reads status inside the room lock so setup can't race a go-live. */
async function assertSetupAllowed(tx: Tx, roomId: bigint): Promise<void> {
  const { status } = await tx.room.findUniqueOrThrow({ where: { id: roomId }, select: { status: true } })
  if (!SETUP_STATUSES.has(status)) {
    throw new AppError(409, 'room_locked', 'Teams and stocks can only be changed before the event goes live.')
  }
}

export async function createRoom(db: PrismaClient, hostId: bigint, input: CreateRoom): Promise<Room> {
  const roomCodeTaken = () => new AppError(409, 'room_code_taken', 'That room code is already in use.')
  if (await db.room.findUnique({ where: { code: input.code } })) throw roomCodeTaken()
  return db.room.create({
    data: {
      hostId,
      code: input.code,
      name: input.name,
      startingCashPaise: BigInt(input.startingCashRupees) * RUPEE,
      rules: mergeRoomRules(input.rules),
      randomSeed: randomBytes(16).toString('hex'),
    },
  }).catch((error: unknown) => {
    throw isUniqueViolation(error) ? roomCodeTaken() : error
  })
}

export async function importTeams(db: PrismaClient, room: Room, input: TeamImport): Promise<number> {
  const seen = new Set<string>()
  const duplicates = input.teams.filter((t) => {
    const key = t.loginName
    const dup = seen.has(key) || seen.has(`name:${t.name.toLowerCase()}`)
    seen.add(key).add(`name:${t.name.toLowerCase()}`)
    return dup
  })
  if (duplicates.length > 0) {
    throw new AppError(409, 'duplicate_teams', 'Team names and logins must be unique.', duplicates.map((d) => d.loginName))
  }
  const hashed = await hashInBatches(input.teams)
  return withRoomLock(db, room.id, async (tx) => {
    await assertSetupAllowed(tx, room.id)
    const clash = await tx.team.findMany({
      where: { roomId: room.id, OR: [{ loginName: { in: hashed.map((t) => t.loginName) } }, { name: { in: hashed.map((t) => t.name) } }] },
      select: { loginName: true },
    })
    if (clash.length > 0) {
      throw new AppError(409, 'duplicate_teams', 'Some teams already exist in this room.', clash.map((c) => c.loginName))
    }
    const created = await tx.team.createMany({
      data: hashed.map((t) => ({
        roomId: room.id,
        name: t.name,
        loginName: t.loginName,
        passwordHash: t.passwordHash,
        cashPaise: room.startingCashPaise,
      })),
    })
    const teams = await tx.team.findMany({ where: { roomId: room.id, loginName: { in: hashed.map((t) => t.loginName) } } })
    await tx.ledgerEntry.createMany({
      data: teams.map((t) => ({ roomId: room.id, teamId: t.id, amountPaise: room.startingCashPaise, cause: 'starting_cash' })),
    })
    return created.count
  })
}

export async function createStock(db: PrismaClient, room: Room, input: z.output<typeof createStockSchema>) {
  const tickerTaken = () => new AppError(409, 'ticker_taken', `Ticker ${input.ticker} already exists in this room.`)
  return withRoomLock(db, room.id, async (tx) => {
    await assertSetupAllowed(tx, room.id)
    if (await tx.stock.findUnique({ where: { roomId_ticker: { roomId: room.id, ticker: input.ticker } } })) throw tickerTaken()
    return tx.stock.create({
    data: {
      roomId: room.id,
      ticker: input.ticker,
      name: input.name,
      sector: input.sector,
      profile: input.profile,
      openingPrice: input.openingPrice,
      anchor: input.openingPrice,
      depth: input.depth,
      sensitivity: input.sensitivity,
      shortable: input.shortable,
      borrowPool: input.borrowPool,
      bandReference: input.openingPrice,
      bandFraction: input.bandFraction,
    },
    })
  }).catch((error: unknown) => {
    throw isUniqueViolation(error) ? tickerTaken() : error
  })
}

export async function setRoomStatus(db: PrismaClient, room: Room, status: RoomStatus): Promise<RoomStatus> {
  return withRoomLock(db, room.id, async (tx) => {
    const current = (await tx.room.findUniqueOrThrow({ where: { id: room.id } })).status as RoomStatus
    if (current === status) return current
    if (!ROOM_TRANSITIONS[current].includes(status)) {
      throw new AppError(409, 'invalid_transition', `A ${current} room cannot become ${status}.`)
    }
    // Practice is separate account state (blueprint §8): scoring always starts clean.
    // Going live or closing ends any unfinished round (a practice round never carries into scoring).
    if (status === 'live' || status === 'closed') await endUnfinishedRound(tx, room.id, new Date())
    if (status === 'live' && (current === 'practice' || current === 'draft')) await wipePracticeState(tx, room.id)
    const firstTimeLive = status === 'live' && (current === 'practice' || current === 'draft')
    await tx.room.update({ where: { id: room.id }, data: { status, ...(firstTimeLive ? { liveSince: new Date() } : {}) } })
    await appendRoomEvent(tx, room.id, { type: 'room_status', payload: { from: current, to: status }, isPublic: true, marketChanged: false })
    return status
  })
}

/**
 * Wipes practice trading: positions cleared, prices back to opening, borrow
 * released, and each team's cash restored by an explicit ledger adjustment.
 * Only allowed before the event has gone live.
 */
export async function resetPractice(db: PrismaClient, room: Room): Promise<void> {
  await withRoomLock(db, room.id, async (tx) => {
    const { status } = await tx.room.findUniqueOrThrow({ where: { id: room.id }, select: { status: true } })
    if (!RESETTABLE_STATUSES.has(status)) {
      throw new AppError(409, 'reset_not_allowed', 'Practice can only be reset before the event goes live.')
    }
    await wipePracticeState(tx, room.id)
    await appendRoomEvent(tx, room.id, { type: 'practice_reset', payload: {}, isPublic: true, marketChanged: true })
  })
}

/**
 * Positions cleared, prices back to opening, borrow released, and each team's
 * cash restored by an explicit ledger adjustment. Caller holds the room lock.
 */
async function wipePracticeState(tx: Tx, roomId: bigint): Promise<void> {
  const room = await tx.room.findUniqueOrThrow({ where: { id: roomId } })
  await tx.position.deleteMany({ where: { roomId } })
  const stocks = await tx.stock.findMany({ where: { roomId } })
  for (const stock of stocks) {
    await tx.stock.update({
      where: { id: stock.id },
      data: {
        anchor: stock.openingPrice,
        pressure: 0,
        noise: 0,
        borrowUsed: 0,
        halted: false,
        haltReason: null,
        reopensAt: null,
        bandReference: stock.openingPrice,
      },
    })
  }
  // Unfired practice news becomes a draft: it must never fire into a later round by accident.
  await tx.newsItem.updateMany({ where: { roomId, status: 'scheduled' }, data: { status: 'draft', roundId: null, scheduledAtMs: null } })
  const teams = await tx.team.findMany({ where: { roomId } })
  const adjustments = teams
    .map((team) => ({ team, delta: room.startingCashPaise - team.cashPaise }))
    .filter((a) => a.delta !== 0n)
  for (const { team } of adjustments) {
    await tx.team.update({ where: { id: team.id }, data: { cashPaise: room.startingCashPaise } })
  }
  if (adjustments.length > 0) {
    await tx.ledgerEntry.createMany({
      data: adjustments.map(({ team, delta }) => ({
        roomId,
        teamId: team.id,
        amountPaise: delta,
        cause: 'practice_reset',
        note: 'Practice reset to starting cash',
      })),
    })
  }
}

export async function roomOverview(db: PrismaClient, roomId: bigint) {
  const room = await db.room.findUniqueOrThrow({
    where: { id: roomId },
    include: {
      stocks: { orderBy: { ticker: 'asc' } },
      teams: { orderBy: { name: 'asc' }, select: { id: true, name: true, loginName: true, status: true, cashPaise: true } },
    },
  })
  return room
}
