import type { PrismaClient } from '../generated/prisma/client.ts'

interface PracticeStory {
  readonly headline: string
  readonly body: string
  readonly sourceLabel: string
  readonly kind: 'information' | 'mechanical'
  /** Ticker → shock fraction; host-only, never sent to teams. */
  readonly impacts: Readonly<Record<string, number>>
  readonly plannedMinute: number
}

/**
 * A short story arc for a practice round (blueprint §5: rumours, then
 * confirmation). The rumour moves nothing by itself, so teams practise
 * reacting to information; the confirmation moves prices, so they see a
 * mechanical shock and the news pause.
 */
export const PRACTICE_STORIES: readonly PracticeStory[] = [
  {
    headline: 'Oil producers said to weigh supply cuts',
    body: 'Several trading desks report that major producers may announce output cuts later today. Nothing is confirmed yet. Refiners and airlines are the most exposed to fuel prices.',
    sourceLabel: 'Market chatter',
    kind: 'information',
    impacts: {},
    plannedMinute: 3,
  },
  {
    headline: 'Confirmed: producers cut output, crude jumps',
    body: 'Producers confirmed the cut this afternoon. Refiners holding stock gain from higher prices; carriers face bigger fuel bills.',
    sourceLabel: 'Newswire',
    kind: 'mechanical',
    impacts: { OILCO: 0.06, AIRCO: -0.05 },
    plannedMinute: 6,
  },
]

/** Adds the practice stories to a room as drafts with planned minutes. Needs the tickers they move. */
export async function addPracticeStories(db: PrismaClient, roomId: bigint): Promise<void> {
  const ids = new Map((await db.stock.findMany({ where: { roomId }, select: { id: true, ticker: true } })).map((s) => [s.ticker, s.id.toString()]))
  const missing = PRACTICE_STORIES.flatMap((s) => Object.keys(s.impacts)).filter((t) => !ids.has(t))
  if (missing.length > 0) throw new Error(`Practice stories need stocks ${[...new Set(missing)].join(', ')} in the room.`)
  await db.newsItem.createMany({
    data: PRACTICE_STORIES.map((s) => ({
      roomId,
      kind: s.kind,
      status: 'draft' as const,
      headline: s.headline,
      body: s.body,
      sourceLabel: s.sourceLabel,
      impacts: Object.fromEntries(Object.entries(s.impacts).map(([ticker, shock]) => [ids.get(ticker)!, shock])),
      scheduledAtMs: s.plannedMinute * 60_000,
    })),
  })
}
