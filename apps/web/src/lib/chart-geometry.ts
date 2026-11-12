/** Pure chart maths: clean ticks and padded domains. No DOM, so it is unit-tested. */

/** A "nice" step (1, 2 or 5 × a power of ten) at least as big as `rough`. */
function niceStep(rough: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const normalized = rough / magnitude
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return factor * magnitude
}

/** Up to about `count` clean, evenly spaced ticks inside [min, max]. */
export function niceTicks(min: number, max: number, count: number): number[] {
  if (!(max > min)) return [min]
  const step = niceStep((max - min) / count)
  const decimals = Math.max(0, -Math.floor(Math.log10(step)))
  const ticks: number[] = []
  for (let k = Math.ceil(min / step - 1e-9); k * step <= max + 1e-9; k++) {
    ticks.push(Number((k * step).toFixed(decimals)))
  }
  return ticks
}

/** The value range plus 10% padding, so the line never touches the chart's edges. */
export function paddedDomain(values: readonly number[]): [number, number] {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || Math.abs(max) * 0.01 || 1
  const pad = span * 0.1
  return [min - pad, max + pad]
}
