import { executionCost, type Curve, type ExecutionCosts } from './curve.ts'

/** A frozen quote: curve plus the closing costs used for valuation. */
export interface StockQuote extends Curve, ExecutionCosts {}

export type Positions = ReadonlyMap<string, number>
export type Quotes = ReadonlyMap<string, StockQuote>

function quoteFor(quotes: Quotes, stockId: string): StockQuote {
  const quote = quotes.get(stockId)
  if (!quote) throw new Error(`no quote for held stock ${stockId}`)
  return quote
}

/**
 * Portfolio liquidation value — the competition score (blueprint §7).
 * V = C − Σ B_i(−q_i), each position closed independently against the same
 * frozen market. Valuation never mutates shared market state, so team order
 * cannot affect results.
 */
export function liquidationValue(cash: number, positions: Positions, quotes: Quotes): number {
  if (!Number.isFinite(cash)) throw new RangeError(`cash must be finite, got ${cash}`)
  let value = cash
  for (const [stockId, quantity] of positions) {
    if (quantity === 0) continue
    const quote = quoteFor(quotes, stockId)
    value -= executionCost(quote, -quantity, quote)
  }
  return value
}

/**
 * Mark-to-mid equity E = C + Σ q_i·M_i. Explains exposure and collateral;
 * must never be shown as the score.
 */
export function markToMidEquity(cash: number, positions: Positions, quotes: Quotes): number {
  let equity = cash
  for (const [stockId, quantity] of positions) {
    if (quantity === 0) continue
    equity += quantity * quoteFor(quotes, stockId).mid
  }
  return equity
}
