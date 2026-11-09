import type { RiskRules } from './rules.ts'
import { liquidationValue, markToMidEquity, type Positions, type Quotes } from './valuation.ts'

export interface PortfolioMetrics {
  /** Cash + Σ q·M. Explains exposure; never the score. */
  readonly equity: number
  /** Σ |q|·M. */
  readonly grossExposure: number
  /** Σ max(−q, 0)·M. */
  readonly shortNotional: number
  /** collateralRatio × shortNotional; part of cash, not extra cash. */
  readonly restrictedCash: number
  /** Cash − restricted cash: a spending limit, not a value. */
  readonly availableCash: number
  /** The competition score. */
  readonly liquidationValue: number
}

function midOf(quotes: Quotes, stockId: string): number {
  const quote = quotes.get(stockId)
  if (!quote) throw new Error(`no quote for held stock ${stockId}`)
  return quote.mid
}

export function portfolioMetrics(
  cash: number,
  positions: Positions,
  quotes: Quotes,
  rules: Pick<RiskRules, 'collateralRatio'>,
): PortfolioMetrics {
  let grossExposure = 0
  let shortNotional = 0
  for (const [stockId, quantity] of positions) {
    if (quantity === 0) continue
    const notional = Math.abs(quantity) * midOf(quotes, stockId)
    grossExposure += notional
    if (quantity < 0) shortNotional += notional
  }
  const restrictedCash = rules.collateralRatio * shortNotional
  return {
    equity: markToMidEquity(cash, positions, quotes),
    grossExposure,
    shortNotional,
    restrictedCash,
    availableCash: cash - restrictedCash,
    liquidationValue: liquidationValue(cash, positions, quotes),
  }
}

export interface PositionBook {
  /** Signed shares: > 0 long, < 0 short. */
  readonly quantity: number
  /** Net cash spent opening the current position (negative for shorts). */
  readonly costBasisPaise: bigint
  readonly realizedPnlPaise: bigint
}

/**
 * Applies one fill. `cashDeltaPaise` is the team's signed cash change
 * (negative when it pays). Orders never cross zero, so a fill either opens
 * (adds to |q|) or closes part or all of the position.
 */
export function applyFillToPosition(position: PositionBook, signedQuantity: number, cashDeltaPaise: bigint): PositionBook {
  const quantity = position.quantity + signedQuantity
  if (position.quantity !== 0 && Math.sign(quantity) === -Math.sign(position.quantity)) {
    throw new RangeError('a fill may not cross zero')
  }
  const opening = position.quantity === 0 || Math.sign(signedQuantity) === Math.sign(position.quantity)
  if (opening) {
    return { ...position, quantity, costBasisPaise: position.costBasisPaise - cashDeltaPaise }
  }
  const closed = BigInt(Math.abs(signedQuantity))
  const held = BigInt(Math.abs(position.quantity))
  const basisReleased = quantity === 0 ? position.costBasisPaise : (position.costBasisPaise * closed) / held
  return {
    quantity,
    costBasisPaise: position.costBasisPaise - basisReleased,
    realizedPnlPaise: position.realizedPnlPaise + cashDeltaPaise - basisReleased,
  }
}
