import {
  eventTemplateDataSchema,
  type CreateRoom,
  type EventTemplateData,
  type HostTemplateSummary,
} from '@tradetech/contracts'
import type { EventTemplate, PrismaClient, Room } from '../generated/prisma/client.ts'
import { AppError, notFound } from '../http/errors.ts'
import { withRoomLock } from '../rooms/room-lock.ts'
import { definedRules, parseRoomRules } from '../rooms/rules.ts'
import { createRoom } from './room-service.ts'

const MS_PER_MINUTE = 60_000
const PAISE_PER_RUPEE = 100n

/** Stored JSON is re-validated on read: a template that fails is a server bug, not user data. */
const dataOf = (t: EventTemplate): EventTemplateData => eventTemplateDataSchema.parse(t.data)

function summary(t: EventTemplate): HostTemplateSummary {
  const data = dataOf(t)
  return {
    id: t.id.toString(),
    name: t.name,
    description: t.description,
    startingCashRupees: data.startingCashRupees,
    stockCount: data.stocks.length,
    newsCount: data.news.length,
    updatedAt: t.updatedAt.toISOString(),
  }
}

export async function listTemplates(db: PrismaClient, hostId: bigint): Promise<HostTemplateSummary[]> {
  const rows = await db.eventTemplate.findMany({ where: { hostId }, orderBy: { updatedAt: 'desc' } })
  return rows.map(summary)
}

/** A host's own template, or 404 so ids don't leak between hosts. */
export async function ownedTemplate(db: PrismaClient, hostId: bigint, templateId: bigint): Promise<EventTemplate> {
  const t = await db.eventTemplate.findFirst({ where: { id: templateId, hostId } })
  if (!t) throw notFound('Template')
  return t
}

export const exportTemplate = (t: EventTemplate): EventTemplateData => dataOf(t)

/**
 * Snapshots an event as a template: starting cash, rules, stocks and every
 * news item (impacts re-keyed by ticker; planned minute from its schedule).
 * Teams, trades and results are never included.
 */
export async function saveTemplate(db: PrismaClient, room: Room, name: string, description: string): Promise<HostTemplateSummary> {
  const [stocks, news] = await Promise.all([
    db.stock.findMany({ where: { roomId: room.id }, orderBy: { ticker: 'asc' } }),
    db.newsItem.findMany({ where: { roomId: room.id }, orderBy: { id: 'asc' } }),
  ])
  if (stocks.length === 0) throw new AppError(409, 'nothing_to_save', 'Add at least one stock before saving a template.')
  const tickerOf = new Map(stocks.map((s) => [s.id.toString(), s.ticker]))
  const data = eventTemplateDataSchema.parse({
    version: 1,
    startingCashRupees: Number(room.startingCashPaise / PAISE_PER_RUPEE),
    rules: parseRoomRules(room.rules),
    stocks: stocks.map((s) => ({
      ticker: s.ticker,
      name: s.name,
      sector: s.sector,
      profile: s.profile,
      openingPrice: s.openingPrice,
      depth: s.depth,
      sensitivity: s.sensitivity,
      shortable: s.shortable,
      borrowPool: s.borrowPool,
      bandFraction: s.bandFraction,
    })),
    news: news.map((n) => ({
      headline: n.headline,
      body: n.body,
      ...(n.sourceLabel ? { sourceLabel: n.sourceLabel } : {}),
      kind: n.kind,
      impacts: Object.fromEntries(
        Object.entries((n.impacts ?? {}) as Record<string, number>).flatMap(([id, shock]) => {
          const ticker = tickerOf.get(id)
          return ticker ? [[ticker, shock]] : []
        }),
      ),
      ...(n.scheduledAtMs !== null ? { plannedMinute: n.scheduledAtMs / MS_PER_MINUTE } : {}),
    })),
  })
  const created = await db.eventTemplate.create({ data: { hostId: room.hostId, name, description, data } })
  return summary(created)
}

export async function importTemplate(db: PrismaClient, hostId: bigint, name: string, description: string, data: EventTemplateData) {
  return summary(await db.eventTemplate.create({ data: { hostId, name, description, data } }))
}

/**
 * Creates an event from a template. Typed values (starting cash, rules) win
 * over the template's; news arrives as drafts with their planned minute, to
 * be scheduled per round by the host.
 */
export async function createRoomFromTemplate(db: PrismaClient, hostId: bigint, input: CreateRoom, template: EventTemplate): Promise<Room> {
  const data = dataOf(template)
  // Blank form fields must not wipe the template's rules: merge only what was typed.
  const room = await createRoom(db, hostId, { ...input, rules: { ...data.rules, ...definedRules(input.rules) } })
  await withRoomLock(db, room.id, async (tx) => {
    await tx.stock.createMany({
      data: data.stocks.map((s) => ({
        roomId: room.id,
        ticker: s.ticker,
        name: s.name,
        sector: s.sector,
        profile: s.profile,
        openingPrice: s.openingPrice,
        anchor: s.openingPrice,
        bandReference: s.openingPrice,
        depth: s.depth,
        sensitivity: s.sensitivity,
        shortable: s.shortable,
        borrowPool: s.borrowPool,
        bandFraction: s.bandFraction,
      })),
    })
    const idOf = new Map((await tx.stock.findMany({ where: { roomId: room.id } })).map((s) => [s.ticker, s.id.toString()]))
    await tx.newsItem.createMany({
      data: data.news.map((n) => ({
        roomId: room.id,
        kind: n.kind,
        status: 'draft' as const,
        headline: n.headline,
        body: n.body,
        sourceLabel: n.sourceLabel ?? null,
        impacts: Object.fromEntries(Object.entries(n.impacts).map(([ticker, shock]) => [idOf.get(ticker)!, shock])),
        scheduledAtMs: n.plannedMinute === undefined ? null : Math.round(n.plannedMinute * MS_PER_MINUTE),
      })),
    })
  })
  return room
}

export async function deleteTemplate(db: PrismaClient, hostId: bigint, templateId: bigint): Promise<void> {
  const t = await ownedTemplate(db, hostId, templateId)
  await db.eventTemplate.delete({ where: { id: t.id } })
}
