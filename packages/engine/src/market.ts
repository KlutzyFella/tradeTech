/**
 * Three separate causes of movement (blueprint §4.1):
 * news moves the anchor A, participant trades move pressure d,
 * optional background movement moves noise z. M = A·exp(d + z).
 */

export interface PriceState {
  readonly anchor: number
  /** Temporary demand pressure, in log-price units. */
  readonly pressure: number
  /** Background disturbance, in log-price units. */
  readonly noise: number
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite, got ${value}`)
}

function assertPositive(value: number, label: string): void {
  if (!(Number.isFinite(value) && value > 0)) {
    throw new RangeError(`${label} must be a positive finite number, got ${value}`)
  }
}

export function midPrice(state: PriceState): number {
  assertPositive(state.anchor, 'anchor')
  assertFinite(state.pressure, 'pressure')
  assertFinite(state.noise, 'noise')
  const mid = state.anchor * Math.exp(state.pressure + state.noise)
  assertPositive(mid, 'mid-price')
  return mid
}

/** d_after = d_before + λ·x/L. */
export function pressureAfter(
  pressure: number,
  liquidity: { readonly depth: number; readonly sensitivity: number },
  x: number,
): number {
  assertFinite(pressure, 'pressure')
  assertPositive(liquidity.depth, 'depth')
  if (!(Number.isFinite(liquidity.sensitivity) && liquidity.sensitivity >= 0)) {
    throw new RangeError(`sensitivity must be a non-negative finite number, got ${liquidity.sensitivity}`)
  }
  if (!Number.isSafeInteger(x)) throw new RangeError(`share quantity must be a safe integer, got ${x}`)
  return pressure + (liquidity.sensitivity * x) / liquidity.depth
}

/** A_new = A_old·(1 + h), h > −1. Shocks compound multiplicatively. */
export function applyNewsShock(anchor: number, shock: number): number {
  assertPositive(anchor, 'anchor')
  if (!(Number.isFinite(shock) && shock > -1)) {
    throw new RangeError(`news shock must be a finite number greater than -1, got ${shock}`)
  }
  return anchor * (1 + shock)
}

/** d(t+Δt) = d(t)·2^(−Δt/H), with Δt and H in active trading minutes. */
export function decayPressure(pressure: number, elapsedMinutes: number, halfLifeMinutes: number): number {
  assertFinite(pressure, 'pressure')
  assertPositive(halfLifeMinutes, 'half-life')
  if (!(Number.isFinite(elapsedMinutes) && elapsedMinutes >= 0)) {
    throw new RangeError(`elapsed time must be a non-negative finite number, got ${elapsedMinutes}`)
  }
  return pressure * 2 ** (-elapsedMinutes / halfLifeMinutes)
}
