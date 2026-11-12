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
