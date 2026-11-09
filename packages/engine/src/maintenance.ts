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
