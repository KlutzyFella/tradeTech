/**
 * Simulated-dealer price curve (blueprint §4.2–4.3).
 *
 * Signed quantity x: positive when a participant buys or covers, negative when
 * a participant sells or opens a short. Orders traverse the curve
 * M·exp(a·u) for u in [0, x], with a = sensitivity / depth.
 */

export interface Curve {
  /** Current reference mid-price, before this order. */
  readonly mid: number
  /** Liquidity depth in shares (not company float). */
  readonly depth: number
  /** Impact sensitivity λ (dimensionless, ≥ 0). */
  readonly sensitivity: number
}

export interface ExecutionCosts {
  /** Half-spread as a fraction of notional. */
  readonly halfSpread: number
  /** Transaction fee as a fraction of notional. */
  readonly fee: number
}

export function assertValidCurve(curve: Curve): void {
  if (!(Number.isFinite(curve.mid) && curve.mid > 0)) {
    throw new RangeError(`mid must be a positive finite number, got ${curve.mid}`)
  }
  if (!(Number.isFinite(curve.depth) && curve.depth > 0)) {
    throw new RangeError(`depth must be a positive finite number, got ${curve.depth}`)
  }
  if (!(Number.isFinite(curve.sensitivity) && curve.sensitivity >= 0)) {
    throw new RangeError(`sensitivity must be a non-negative finite number, got ${curve.sensitivity}`)
  }
}

function assertShares(x: number): void {
  if (!Number.isSafeInteger(x)) {
    throw new RangeError(`share quantity must be a safe integer, got ${x}`)
  }
}

function assertValidCosts(costs: ExecutionCosts): void {
  const { halfSpread, fee } = costs
  if (!(halfSpread >= 0 && fee >= 0 && halfSpread + fee < 1)) {
    throw new RangeError('halfSpread and fee must be non-negative and sum to less than 1')
  }
}

/**
 * Hard numerical ceiling on one order's log-price move |a·x|. Game rules
 * (bands, the 2% per-order endpoint) reject far smaller moves; this only
 * guarantees the math can never overflow to Infinity/NaN.
 */
export const MAX_LOG_MOVE = 50

function assertBoundedMove(a: number, x: number): void {
  if (!(Math.abs(a * x) <= MAX_LOG_MOVE)) {
    throw new RangeError(`order impact |a·x| = ${Math.abs(a * x)} exceeds the numerical limit ${MAX_LOG_MOVE}`)
  }
}

/** Impact coefficient a = λ / L. */
export function impactCoefficient(curve: Pick<Curve, 'depth' | 'sensitivity'>): number {
  return curve.sensitivity / curve.depth
}

/**
 * K(x) = M·(e^{a·x} − 1)/a — signed cash paid to the dealer before costs.
 * Negative on a sale (cash received). Uses expm1 for stability near zero.
 */
export function executionNotional(curve: Curve, x: number): number {
  assertValidCurve(curve)
  assertShares(x)
  const a = impactCoefficient(curve)
  assertBoundedMove(a, x)
  if (a === 0) return curve.mid * x
  return (curve.mid * Math.expm1(a * x)) / a
}

/** B(x) = K(x) + (s + f)·|K(x)| — signed cash paid including spread and fee. */
export function executionCost(curve: Curve, x: number, costs: ExecutionCosts): number {
  assertValidCosts(costs)
  const k = executionNotional(curve, x)
  return k + (costs.halfSpread + costs.fee) * Math.abs(k)
}

/** Mid-price after the order has traversed the curve. */
export function midAfter(curve: Curve, x: number): number {
  assertValidCurve(curve)
  assertShares(x)
  const a = impactCoefficient(curve)
  assertBoundedMove(a, x)
  return curve.mid * Math.exp(a * x)
}
