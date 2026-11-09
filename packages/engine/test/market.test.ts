import { describe, expect, it } from 'vitest'
import { applyNewsShock, decayPressure, midPrice, pressureAfter } from '../src/index.ts'

describe('mid-price from anchor, pressure and noise', () => {
  it('equals the anchor when pressure and noise are zero', () => {
    expect(midPrice({ anchor: 100, pressure: 0, noise: 0 })).toBe(100)
  })

  it('reproduces the post-buy mid of the worked example', () => {
    const pressure = pressureAfter(0, { depth: 100_000, sensitivity: 1 }, 1000)
    expect(midPrice({ anchor: 100, pressure, noise: 0 })).toBeCloseTo(101.005017, 6)
  })
})

describe('host news shocks', () => {
  it('shifts the anchor by +8% so the worked-example mid becomes ₹109.085418', () => {
    const pressure = pressureAfter(0, { depth: 100_000, sensitivity: 1 }, 1000)
    const anchor = applyNewsShock(100, 0.08)
    expect(midPrice({ anchor, pressure, noise: 0 })).toBeCloseTo(109.085418, 6)
  })

  it('compounds successive shocks multiplicatively', () => {
    expect(applyNewsShock(applyNewsShock(100, 0.1), -0.1)).toBeCloseTo(99, 10)
  })

  it('rejects a shock of -100% or worse', () => {
    expect(() => applyNewsShock(100, -1)).toThrow(RangeError)
  })
})

describe('temporary pressure decay', () => {
  it('halves pressure after one half-life', () => {
    expect(decayPressure(0.02, 4, 4)).toBeCloseTo(0.01, 12)
  })

  it('does not decay when no active time passes (e.g. paused)', () => {
    expect(decayPressure(0.02, 0, 4)).toBe(0.02)
  })

  it('rejects a non-positive half-life', () => {
    expect(() => decayPressure(0.02, 1, 0)).toThrow(RangeError)
  })
})

describe('market input validation', () => {
  it('rejects a non-finite trade quantity when updating pressure', () => {
    expect(() => pressureAfter(0, { depth: 1000, sensitivity: 1 }, Number.NaN)).toThrow(RangeError)
  })

  it('rejects a non-positive anchor when applying news', () => {
    expect(() => applyNewsShock(0, 0.05)).toThrow(RangeError)
  })

  it('rejects a mid-price that would be non-finite', () => {
    expect(() => midPrice({ anchor: 100, pressure: 1000, noise: 0 })).toThrow(RangeError)
  })
})
