import type { ExportKind } from '@tradetech/contracts'
import type { PrismaClient } from '../generated/prisma/client.ts'
import { currentStandings } from './standings.ts'

type Cell = string | number | boolean | null | undefined

/**
 * RFC 4180 quoting, plus neutralising spreadsheet formulas: a cell starting
 * with = + - @ (or tab/CR) is prefixed with ' so Excel/Sheets show it as text.
 */
export function csvCell(value: Cell): string {
  if (value === null || value === undefined) return ''
  let text = String(value)
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\n\r]/.test(text) || text !== String(value) ? `"${text.replaceAll('"', '""')}"` : text
}

const toCsv = (header: readonly string[], rows: readonly Cell[][]): string =>
  [header.join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\n') + '\n'

/** Numbers (never strings) so negative amounts stay numeric and aren't mistaken for formulas. */
const rupees = (paise: bigint | number | null): number | null => (paise === null ? null : Math.round(Number(paise)) / 100)

export async function buildExport(db: PrismaClient, roomId: bigint, kind: ExportKind): Promise<string> {
  switch (kind) {
    case 'standings': {
      const { final, rows } = await currentStandings(db, roomId)
      return toCsv(
        ['rank', 'team', 'login', 'status', 'liquidation_value_inr', 'final'],
        rows.map((r) => [r.rank, r.name, r.loginName, r.status, rupees(r.liquidationValuePaise), final]),
      )
    }
    case 'orders': {
      const orders = await db.order.findMany({ where: { roomId }, orderBy: { acceptSeq: 'asc' }, include: { team: true, stock: true } })
      return toCsv(
        ['seq', 'accepted_at', 'team', 'ticker', 'intent', 'signed_quantity', 'status', 'avg_price_inr', 'cash_change_inr', 'reject_reason', 'source'],
        orders.map((o) => [
          o.acceptSeq.toString(),
          o.acceptedAt.toISOString(),
          o.team.name,
          o.stock.ticker,
          o.intent,
          o.quantity,
          o.status,
          o.avgPrice === null ? null : Number(o.avgPrice.toFixed(6)),
          rupees(o.costPaise === null ? null : -o.costPaise),
          o.rejectReason,
          o.requestHash === 'liquidation' ? 'liquidation' : 'team',
        ]),
      )
    }
    case 'ledger': {
      const entries = await db.ledgerEntry.findMany({ where: { roomId }, orderBy: { id: 'asc' }, include: { team: true } })
      return toCsv(
        ['id', 'at', 'team', 'amount_inr', 'cause', 'order_id', 'note'],
        entries.map((e) => [e.id.toString(), e.createdAt.toISOString(), e.team.name, rupees(e.amountPaise), e.cause, e.orderId?.toString(), e.note]),
      )
    }
    case 'news': {
      const items = await db.newsItem.findMany({ where: { roomId }, orderBy: { id: 'asc' } })
      return toCsv(
        ['id', 'status', 'kind', 'published_at', 'headline', 'body', 'impacts_json'],
        items.map((n) => [n.id.toString(), n.status, n.kind, n.publishedAt?.toISOString(), n.headline, n.body, JSON.stringify(n.impacts)]),
      )
    }
  }
}
