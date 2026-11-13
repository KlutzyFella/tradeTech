import { executionCost, midAfter } from './curve.ts'
import { settleToPaise } from './money.ts'
import type { PortfolioMetrics } from './portfolio.ts'
import { DEFAULT_MAINTENANCE_RULES, type MaintenanceRules } from './rules.ts'
import type { StockQuote } from './valuation.ts'

export type MaintenanceStatus = { readonly ok: true } | { readonly ok: false; readonly reason: 'collateral' | 'equity' }

/**
 * Maintenance check (blueprint §6): fails when C < 1.3·S (only with shorts)
 * or when equity is non-positive or below 0.75·G. Failing teams are
 * liquidated deterministically.
 */
export function maintenanceStatus(
  metrics: PortfolioMetrics,
  rules: Partial<MaintenanceRules> = {},
): MaintenanceStatus {
  const { maintenanceCollateralRatio, maintenanceEquityRatio } = { ...DEFAULT_MAINTENANCE_RULES, ...rules }
  const cash = metrics.availableCash + metrics.restrictedCash
  if (metrics.shortNotional > 0 && cash < maintenanceCollateralRatio * metrics.shortNotional) {
    return { ok: false, reason: 'collateral' }
  }
  if (metrics.equity <= 0 || (metrics.grossExposure > 0 && metrics.equity < maintenanceEquityRatio * metrics.grossExposure)) {
    return { ok: false, reason: 'equity' }
  }
  return { ok: true }
}

/**
 * How far a team is from forced liquidation: actual ÷ required for whichever
 * maintenance requirement is tighter (1 = the threshold, below 1 = failing).
 * Null when nothing is at risk: no exposure, no shorts and positive equity.
 */
export function maintenanceHeadroom(metrics: PortfolioMetrics, rules: Partial<MaintenanceRules> = {}): number | null {
  const { maintenanceCollateralRatio, maintenanceEquityRatio } = { ...DEFAULT_MAINTENANCE_RULES, ...rules }
  if (metrics.equity <= 0) return 0
  const ratios: number[] = []
  if (metrics.shortNotional > 0) {
    ratios.push((metrics.availableCash + metrics.restrictedCash) / (maintenanceCollateralRatio * metrics.shortNotional))
  }
  if (metrics.grossExposure > 0 && maintenanceEquityRatio > 0) {
    ratios.push(metrics.equity / (maintenanceEquityRatio * metrics.grossExposure))
  }
  return ratios.length === 0 ? null : Math.min(...ratios)
}

/** Within 10% of a forced close: shorts opened at the 1.5× initial collateral start at 1.15. */
export const MARGIN_WATCH_HEADROOM = 1.1

export type MarginLevel = 'none' | 'ok' | 'watch' | 'breach'

export function marginLevel(headroom: number | null, watchBelow: number = MARGIN_WATCH_HEADROOM): MarginLevel {
  if (headroom === null) return 'none'
  if (headroom < 1) return 'breach'
  return headroom < watchBelow ? 'watch' : 'ok'
}

export interface ClosingFill {
  readonly signedQuantity: number
  readonly cashDeltaPaise: bigint
  readonly averagePrice: number
  readonly midAfter: number
  readonly borrowDelta: number
}

/**
 * Emergency close of a whole position along the curve. Bypasses opening
 * limits, the per-order cap and the band; the caller must not close halted
 * stocks (halt policy still applies).
 */
export function closingFill(quote: StockQuote, heldQuantity: number): ClosingFill {
  if (!Number.isSafeInteger(heldQuantity) || heldQuantity === 0) throw new RangeError('nothing to close')
  const x = -heldQuantity
  const cost = executionCost(quote, x, quote)
  return {
    signedQuantity: x,
    cashDeltaPaise: -settleToPaise(cost),
    averagePrice: Math.abs(cost) / Math.abs(x),
    midAfter: midAfter(quote, x),
    borrowDelta: heldQuantity < 0 ? heldQuantity : 0,
  }
}
