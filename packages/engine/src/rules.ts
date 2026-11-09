/**
 * Game risk rules (blueprint §6, §8). These are competition rules, not
 * brokerage regulation. All fractions are of equity unless stated.
 */
export interface RiskRules {
  /** Restricted cash R = collateralRatio × short notional. */
  readonly collateralRatio: number
  /** Gross exposure cap as a fraction of equity. */
  readonly maxGrossExposure: number
  /** Single-stock absolute position cap as a fraction of equity. */
  readonly maxPositionFraction: number
  /** Total short notional cap as a fraction of equity. */
  readonly maxShortFraction: number
  /** Maximum fractional quote movement a single order may cause. */
  readonly maxOrderMove: number
}

export const DEFAULT_RISK_RULES: RiskRules = Object.freeze({
  collateralRatio: 1.5,
  maxGrossExposure: 1,
  maxPositionFraction: 0.25,
  maxShortFraction: 0.25,
  maxOrderMove: 0.02,
})
