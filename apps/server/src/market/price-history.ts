import type { PricePoint } from '@tradetech/contracts'
import type { PrismaClient } from '../generated/prisma/client.ts'
import type { Tx } from '../rooms/room-lock.ts'
import { stockMid } from '../trading/market-state.ts'

/** How often the ticker samples every stock's price while a round runs. */
export const PRICE_SAMPLE_MS = 5_000
/** Charts never need more than this many points; longer histories are downsampled. */
export const MAX_CHART_POINTS = 400
export const SPARK_POINTS = 48

type Db = PrismaClient | Tx

/** Records current mid-prices (all stocks, or just `stockIds`). Caller holds the room lock. */
export async function recordPrices(tx: Tx, roomId: bigint, at: Date, stockIds?: readonly bigint[]): Promise<void> {
  const stocks = await tx.stock.findMany({ where: { roomId, ...(stockIds ? { id: { in: [...stockIds] } } : {}) } })
  if (stocks.length === 0) return
  await tx.pricePoint.createMany({ data: stocks.map((s) => ({ roomId, stockId: s.id, at, mid: stockMid(s) })) })
}

/** Samples all prices if the last point for this room is at least PRICE_SAMPLE_MS old. */
export async function samplePricesIfDue(tx: Tx, roomId: bigint, now: Date): Promise<boolean> {
  const last = await tx.pricePoint.findFirst({ where: { roomId }, orderBy: { at: 'desc' }, select: { at: true } })
  if (last && now.getTime() - last.at.getTime() < PRICE_SAMPLE_MS) return false
  await recordPrices(tx, roomId, now)
  return true
}

/**
 * Keeps at most `max` points: evenly spaced picks that always include the
 * first and last point (so the chart starts at the open and ends at "now").
 */
export function downsample<T>(points: readonly T[], max: number): T[] {
  if (points.length <= max) return [...points]
  const step = (points.length - 1) / (max - 1)
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]!)
}

export async function stockHistory(db: Db, roomId: bigint, stockId: bigint): Promise<PricePoint[]> {
  const rows = await db.pricePoint.findMany({
    where: { roomId, stockId },
    orderBy: [{ at: 'asc' }, { id: 'asc' }],
    select: { at: true, mid: true },
  })
  return downsample(rows, MAX_CHART_POINTS).map((r) => ({ t: r.at.toISOString(), mid: r.mid }))
}

/** Recent mid-prices per stock (oldest first), for small trend lines. */
export async function sparklines(db: Db, roomId: bigint): Promise<Map<string, number[]>> {
  const rows = await db.pricePoint.findMany({
    where: { roomId },
    orderBy: [{ at: 'asc' }, { id: 'asc' }],
    select: { stockId: true, mid: true },
  })
  const byStock = new Map<string, number[]>()
  for (const r of rows) {
    const key = r.stockId.toString()
    const series = byStock.get(key)
    // Local accumulation (not shared state): append, avoiding an O(n²) copy per row.
    if (series) series.push(r.mid)
    else byStock.set(key, [r.mid])
  }
  return new Map([...byStock].map(([k, mids]) => [k, downsample(mids, SPARK_POINTS)]))
}
