import { executionCost } from './curve.ts'
import { settleToPaise } from './money.ts'
import type { Positions, Quotes } from './valuation.ts'

export interface ClosingLine {
  readonly stockId: string
  readonly quantity: number
  readonly mid: number
  /** Cash the team would receive (negative: pay) closing this position, in paise. */
  readonly closingCashPaise: bigint
}

/**
 * Liquidation value in exact paise (blueprint §7): V = C − Σ B(−q), with
 * each position's closing cash settled once in the dealer's favour — the
 * same convention as a real fill. Pure: every team is valued against the
 * same frozen quotes, so valuation order cannot affect results.
 */
export function closingValuation(
  cashPaise: bigint,
  positions: Positions,
  quotes: Quotes,
): { readonly totalPaise: bigint; readonly lines: readonly ClosingLine[] } {
  let totalPaise = cashPaise
  const lines: ClosingLine[] = []
  for (const [stockId, quantity] of [...positions].sort(([a], [b]) => a.localeCompare(b))) {
    if (quantity === 0) continue
    const quote = quotes.get(stockId)
    if (!quote) throw new Error(`no quote for held stock ${stockId}`)
    const closingCashPaise = -settleToPaise(executionCost(quote, -quantity, quote))
    totalPaise += closingCashPaise
    lines.push({ stockId, quantity, mid: quote.mid, closingCashPaise })
  }
  return { totalPaise, lines }
}

/**
 * Standard competition ranking: best value first, exact ties share a rank
 * (1, 2, 2, 4). Display order within a tie is by name (code-unit order, locale-independent); prizes need a
 * tie-break announced in advance.
 */
export function rankStandings<T extends { readonly valuePaise: bigint; readonly name: string }>(
  entries: readonly T[],
): (T & { readonly rank: number })[] {
  const sorted = [...entries].sort((a, b) =>
    a.valuePaise === b.valuePaise ? (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) : a.valuePaise > b.valuePaise ? -1 : 1,
  )
  let rank = 0
  return sorted.map((entry, i) => {
    if (i === 0 || entry.valuePaise !== sorted[i - 1]!.valuePaise) rank = i + 1
    return { ...entry, rank }
  })
}
