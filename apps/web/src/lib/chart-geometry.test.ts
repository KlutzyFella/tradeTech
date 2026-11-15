import { describe, expect, it } from "vitest"
import { niceTicks, paddedDomain } from "./chart-geometry"

describe("clean axis ticks", () => {
  it("picks round steps inside the range", () => {
    expect(niceTicks(96.3, 108.9, 4)).toEqual([100, 105])
    expect(niceTicks(0, 1000, 5)).toEqual([0, 200, 400, 600, 800, 1000])
  })

  it("handles small price ranges with decimal steps", () => {
    expect(niceTicks(99.8, 100.4, 4)).toEqual([99.8, 100, 100.2, 100.4])
  })

  it("never returns an empty axis for a flat line", () => {
    expect(niceTicks(100, 100, 4).length).toBeGreaterThan(0)
  })
})

describe("chart domain", () => {
  it("pads a range so the line never touches the edges", () => {
    const [lo, hi] = paddedDomain([100, 110])
    expect(lo).toBeLessThan(100)
    expect(hi).toBeGreaterThan(110)
  })

  it("gives a flat line a visible band around its value", () => {
    const [lo, hi] = paddedDomain([100, 100, 100])
    expect(lo).toBeLessThan(100)
    expect(hi).toBeGreaterThan(100)
  })
})

describe("ticks on a nearly flat price", () => {
  it("never places ticks closer than the minimum step, so labels stay distinct", () => {
    // A 100-share buy against a deep stock: ₹100.000 → ₹100.002. Without a floor the ticks are 0.001 apart.
    expect(niceTicks(99.9998, 100.0022, 3, 0.01)).toEqual([100])
    const labels = niceTicks(99.97, 100.03, 3, 0.01).map((t) => t.toFixed(2))
    expect(new Set(labels).size).toBe(labels.length)
  })
})
