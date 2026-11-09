import { describe, expect, it } from 'vitest'
import { liquidationValue, markToMidEquity, type StockQuote } from '../src/index.ts'

const costs = { halfSpread: 0.001, fee: 0.0005 }
const quote = (mid: number): StockQuote => ({ mid, depth: 100_000, sensitivity: 1, ...costs })

describe('portfolio liquidation value (the competition score)', () => {
  it('equals cash for a flat portfolio', () => {
    expect(liquidationValue(500_000, new Map(), new Map())).toBe(500_000)
  })

  it('removes the mark-to-mid artefact a team creates by buying its own stock', () => {
    // Blueprint §7: buying 1,000 shares shows ~₹503.35 of apparent mark-to-mid profit.
    const cashAfterBuy = 1_000_000 - 100_501.670842 // pre-cost, so only impact matters
    const quotes = new Map([['THIN', { ...quote(101.005017), halfSpread: 0, fee: 0 }]])
    const positions = new Map([['THIN', 1000]])
    expect(markToMidEquity(cashAfterBuy, positions, quotes) - 1_000_000).toBeCloseTo(503.35, 2)
    expect(liquidationValue(cashAfterBuy, positions, quotes)).toBeCloseTo(1_000_000, 2)
  })

  it('values a short by the cost of buying it back along the curve', () => {
    // Short example in §6 ignoring impact: 100 shares, price falls to ₹80.
    const flat = (mid: number): StockQuote => ({ mid, depth: 1, sensitivity: 0, halfSpread: 0, fee: 0 })
    const positions = new Map([['X', -100]])
    expect(liquidationValue(110_000, positions, new Map([['X', flat(80)]]))).toBe(102_000)
    expect(liquidationValue(110_000, positions, new Map([['X', flat(120)]]))).toBe(98_000)
  })

  it('throws when a held stock has no quote', () => {
    expect(() => liquidationValue(0, new Map([['GHOST', 1]]), new Map())).toThrow(/GHOST/)
  })
})

describe('valuation input validation', () => {
  it('rejects non-finite cash', () => {
    expect(() => liquidationValue(Number.NaN, new Map(), new Map())).toThrow(RangeError)
  })
})
