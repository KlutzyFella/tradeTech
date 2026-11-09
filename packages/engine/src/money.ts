/**
 * Ledger rounding convention: cash is rounded once per fill, to the paisa,
 * always in the dealer's favour. A positive cost (team pays) rounds up; a
 * negative cost (team receives) rounds towards zero. This ensures order
 * splitting can never mint money through rounding.
 */
const PAISE_PER_RUPEE = 100
/** Tolerance that absorbs binary floating-point error on already-exact paise. */
const EPSILON_PAISE = 1e-6

export function settleToPaise(signedCostRupees: number): bigint {
  if (!Number.isFinite(signedCostRupees)) {
    throw new RangeError(`cost must be finite, got ${signedCostRupees}`)
  }
  const paise = signedCostRupees * PAISE_PER_RUPEE
  return BigInt(Math.ceil(paise - EPSILON_PAISE))
}
