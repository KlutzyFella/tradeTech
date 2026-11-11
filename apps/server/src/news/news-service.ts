import { createNewsSchema, type HostNewsView, type NewsView } from '@tradetech/contracts'
import { applyNewsShock, midPrice } from '@tradetech/engine'
import type { z } from 'zod'
import type { NewsItem, PrismaClient, Room } from '../generated/prisma/client.ts'
import { AppError, notFound } from '../http/errors.ts'
import { appendRoomEvent, withRoomLock, type Tx } from '../rooms/room-lock.ts'
import { parseRoomRules } from '../rooms/rules.ts'
import { recordPrices } from '../market/price-history.ts'
import { unfinishedRound } from '../rounds/clock.ts'

type NewsInput = z.output<typeof createNewsSchema>
const MS_PER_MINUTE = 60_000

const impactsOf = (item: NewsItem): Record<string, number> => (item.impacts ?? {}) as Record<string, number>

/**
 * Publishes one item (blueprint §5, fair publication): for mechanical news
 * the anchors move, affected stocks pause briefly so nobody trades on a stale
 * quote, and any stock pushed outside its band is halted. The headline, new
 * anchors and market version commit together. Caller holds the room lock.
 */
export async function publishNewsItem(tx: Tx, item: NewsItem, now: Date): Promise<void> {
  if (item.kind === 'mechanical') {
    const room = await tx.room.findUniqueOrThrow({ where: { id: item.roomId } })
    const { newsPauseMs } = parseRoomRules(room.rules)
    const reopensAt = newsPauseMs > 0 ? new Date(now.getTime() + newsPauseMs) : null
    const moved: bigint[] = []
    for (const [stockId, shock] of Object.entries(impactsOf(item))) {
      const stock = await tx.stock.findFirst({ where: { id: BigInt(stockId), roomId: item.roomId } })
      if (!stock) continue
      const anchor = applyNewsShock(stock.anchor, shock)
      const mid = midPrice({ anchor, pressure: stock.pressure, noise: stock.noise })
      const outside = mid > stock.bandReference * (1 + stock.bandFraction) || mid < stock.bandReference * (1 - stock.bandFraction)
      await tx.stock.update({
        where: { id: stock.id },
        data: { anchor, reopensAt, ...(outside ? { halted: true, haltReason: 'band' } : {}) },
      })
      moved.push(stock.id)
    }
    if (moved.length > 0) await recordPrices(tx, item.roomId, now, moved)
  }
  await tx.newsItem.update({ where: { id: item.id }, data: { status: 'published', publishedAt: now } })
  await appendRoomEvent(tx, item.roomId, {
    type: 'news',
    payload: { newsId: item.id.toString(), headline: item.headline },
    isPublic: true,
    marketChanged: item.kind === 'mechanical',
  })
}

async function assertImpactsInRoom(tx: Tx, roomId: bigint, impacts: Record<string, number>): Promise<void> {
  const ids = Object.keys(impacts).map(BigInt)
  if (ids.length === 0) return
  const found = await tx.stock.count({ where: { roomId, id: { in: ids } } })
  if (found !== ids.length) throw new AppError(400, 'validation_failed', 'News refers to a stock that isn’t in this room.')
}

/**
 * Price-moving news may only publish while a round is open (running or
 * paused) in a practice or live room — never between rounds or after close.
 */
async function assertCanMovePrices(tx: Tx, roomId: bigint): Promise<void> {
  const room = await tx.room.findUniqueOrThrow({ where: { id: roomId }, select: { status: true } })
  const round = await tx.round.findFirst({ where: { roomId, status: { in: ['running', 'paused'] } }, select: { id: true } })
  if ((room.status !== 'practice' && room.status !== 'live') || !round) {
    throw new AppError(409, 'no_open_round', 'Price-moving news can only be published during a round.')
  }
}

export async function createNews(db: PrismaClient, room: Room, input: NewsInput, now = new Date()): Promise<HostNewsView> {
  return withRoomLock(db, room.id, async (tx) => {
    await assertImpactsInRoom(tx, room.id, input.impacts)
    if (input.mode === 'publish' && input.kind === 'mechanical') await assertCanMovePrices(tx, room.id)
    let roundId: bigint | null = null
    if (input.mode === 'schedule') {
      const round = await unfinishedRound(tx, room.id)
      if (!round) throw new AppError(409, 'no_round', 'Create a round before scheduling news.')
      roundId = round.id
    }
    const item = await tx.newsItem.create({
      data: {
        roomId: room.id,
        kind: input.kind,
        status: input.mode === 'schedule' ? 'scheduled' : 'draft',
        headline: input.headline,
        body: input.body,
        sourceLabel: input.sourceLabel ?? null,
        impacts: input.impacts,
        roundId,
        scheduledAtMs: input.mode === 'schedule' ? Math.round((input.scheduleAtMinute ?? 0) * MS_PER_MINUTE) : null,
      },
    })
    if (input.mode === 'publish') await publishNewsItem(tx, item, now)
    return toHostNewsView(await tx.newsItem.findUniqueOrThrow({ where: { id: item.id } }))
  })
}

/** Publishes a draft or scheduled item immediately. */
export async function publishNow(db: PrismaClient, room: Room, newsId: bigint, now = new Date()): Promise<void> {
  await withRoomLock(db, room.id, async (tx) => {
    const item = await tx.newsItem.findFirst({ where: { id: newsId, roomId: room.id } })
    if (!item) throw notFound('News item')
    if (item.status === 'published') throw new AppError(409, 'already_published', 'This item is already published.')
    if (item.kind === 'mechanical') await assertCanMovePrices(tx, room.id)
    await publishNewsItem(tx, item, now)
  })
}

export function toHostNewsView(item: NewsItem): HostNewsView {
  return {
    id: item.id.toString(),
    headline: item.headline,
    body: item.body,
    sourceLabel: item.sourceLabel,
    kind: item.kind,
    status: item.status,
    impacts: impactsOf(item),
    scheduledAtMs: item.scheduledAtMs,
    publishedAt: item.publishedAt?.toISOString() ?? null,
  }
}

/** Participant view: published items only, public fields only. */
export async function listPublicNews(db: PrismaClient, roomId: bigint): Promise<NewsView[]> {
  const room = await db.room.findUniqueOrThrow({ where: { id: roomId }, select: { liveSince: true } })
  const items = await db.newsItem.findMany({
    // Once live, practice-era headlines are no longer part of the story.
    where: { roomId, status: 'published', ...(room.liveSince ? { publishedAt: { gte: room.liveSince } } : {}) },
    orderBy: { publishedAt: 'desc' },
    select: { id: true, headline: true, body: true, sourceLabel: true, publishedAt: true },
  })
  return items.map((n) => ({
    id: n.id.toString(),
    headline: n.headline,
    body: n.body,
    sourceLabel: n.sourceLabel,
    publishedAt: (n.publishedAt ?? new Date(0)).toISOString(),
  }))
}

export async function listHostNews(db: PrismaClient, roomId: bigint): Promise<HostNewsView[]> {
  const items = await db.newsItem.findMany({ where: { roomId }, orderBy: { id: 'desc' } })
  return items.map(toHostNewsView)
}
