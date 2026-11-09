import { describe, expect, it } from 'vitest'
import { executionCost, executionNotional, midAfter, type Curve } from '../src/index.ts'

// Blueprint §4.4 worked example: mid ₹100, depth 100,000, sensitivity 1,
// half-spread 0.10%, fee 0.05%.
const thinStock: Curve = { mid: 100, depth: 100_000, sensitivity: 1 }
const costs = { halfSpread: 0.001, fee: 0.0005 }

describe('execution along the curve', () => {
  it('fills a 1,000-share buy at an average of ₹100.501671', () => {
    expect(executionNotional(thinStock, 1000) / 1000).toBeCloseTo(100.501671, 6)
  })

  it('charges ₹1,00,652.42 including spread and fee for that buy', () => {
    expect(executionCost(thinStock, 1000, costs)).toBeCloseTo(100_652.42, 2)
  })

  it('moves the mid to ₹101.005017 after the buy', () => {
    expect(midAfter(thinStock, 1000)).toBeCloseTo(101.005017, 6)
  })

  it('returns cash (negative cost) on a sale, net of spread and fee', () => {
    const afterNews: Curve = { ...thinStock, mid: 109.085418 }
    expect(-executionCost(afterNews, -1000, costs)).toBeCloseTo(108_378.99, 1)
  })

  it('trades at the mid when sensitivity is zero', () => {
    const flat: Curve = { ...thinStock, sensitivity: 0 }
    expect(executionNotional(flat, 250)).toBe(25_000)
    expect(midAfter(flat, 250)).toBe(100)
  })

  it('costs nothing to trade zero shares', () => {
    expect(executionCost(thinStock, 0, costs)).toBe(0)
  })
})

describe('no free money from own impact', () => {
  it('buy then immediate reverse is zero-profit before costs', () => {
    const paid = executionNotional(thinStock, 1000)
    const received = -executionNotional({ ...thinStock, mid: midAfter(thinStock, 1000) }, -1000)
    expect(received - paid).toBeCloseTo(0, 6)
  })

  it('buy then immediate reverse loses ₹301.51 after costs', () => {
    const paid = executionCost(thinStock, 1000, costs)
    const exitCurve = { ...thinStock, mid: midAfter(thinStock, 1000) }
    const received = -executionCost(exitCurve, -1000, costs)
    expect(received - paid).toBeCloseTo(-301.51, 2)
  })

  it('splitting a block into 100 slices has the same unrounded notional', () => {
    let curve = thinStock
    let total = 0
    for (let i = 0; i < 100; i++) {
      total += executionNotional(curve, 10)
      curve = { ...curve, mid: midAfter(curve, 10) }
    }
    expect(total).toBeCloseTo(executionNotional(thinStock, 1000), 6)
  })
})

describe('input validation', () => {
  it.each([
    ['non-positive mid', { mid: 0, depth: 1, sensitivity: 1 }],
    ['non-positive depth', { mid: 1, depth: 0, sensitivity: 1 }],
    ['negative sensitivity', { mid: 1, depth: 1, sensitivity: -1 }],
  ])('rejects %s', (_label, curve) => {
    expect(() => executionNotional(curve, 1)).toThrow(RangeError)
  })

  it('rejects fractional share quantities', () => {
    expect(() => executionNotional(thinStock, 1.5)).toThrow(RangeError)
  })

  it('rejects spread plus fee of 100% or more', () => {
    expect(() => executionCost(thinStock, 1, { halfSpread: 0.6, fee: 0.4 })).toThrow(RangeError)
  })
})

describe('numerical safety', () => {
  const tinyDepth: Curve = { mid: 100, depth: 1000, sensitivity: 1 }

  it('rejects an order whose impact would overflow instead of returning Infinity', () => {
    expect(() => executionNotional(tinyDepth, 1_000_000)).toThrow(RangeError)
    expect(() => midAfter(tinyDepth, 1_000_000)).toThrow(RangeError)
  })

  it('never returns NaN from executionCost with zero costs on an extreme order', () => {
    expect(() => executionCost(tinyDepth, 1_000_000, { halfSpread: 0, fee: 0 })).toThrow(RangeError)
  })
})
