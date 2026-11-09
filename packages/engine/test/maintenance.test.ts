import { describe, expect, it } from 'vitest'
import { closingFill, DEFAULT_MAINTENANCE_RULES, DEFAULT_RISK_RULES, maintenanceStatus, portfolioMetrics, type StockQuote } from '../src/index.ts'

const flat = (mid: number): StockQuote => ({ mid, depth: 1, sensitivity: 0, halfSpread: 0, fee: 0 })
const status = (cash: number, positions: [string, number][], quotes: [string, StockQuote][]) =>
  maintenanceStatus(portfolioMetrics(cash, new Map(positions), new Map(quotes), DEFAULT_RISK_RULES), DEFAULT_MAINTENANCE_RULES)

describe('maintenance margin (blueprint §6)', () => {
  it('passes a flat portfolio', () => {
    expect(status(1_000_000, [], [])).toEqual({ ok: true })
  })

  it('passes the §6 short at ₹100: cash ₹1,10,000 ≥ 1.3 × ₹10,000', () => {
    expect(status(110_000, [['X', -100]], [['X', flat(100)]])).toEqual({ ok: true })
  })

  it('fails when cash falls below 1.3× short notional (short squeeze)', () => {
    // Short 1,000 squeezed to ₹900: S = ₹9L, 1.3S = ₹11.7L > cash ₹1.1L.
    expect(status(110_000, [['X', -1000]], [['X', flat(900)]])).toMatchObject({ ok: false, reason: 'collateral' })
  })

  it('fails when equity falls below 75% of gross exposure', () => {
    // ₹10L long with ₹4L of negative cash (after a gap): E = 6L < 0.75 × 10L.
    expect(status(-400_000, [['A', 10_000]], [['A', flat(100)]])).toMatchObject({ ok: false, reason: 'equity' })
  })

  it('treats negative equity as a failure even with no shorts', () => {
    expect(status(-10, [], [])).toMatchObject({ ok: false, reason: 'equity' })
  })
})

describe('forced closing fills', () => {
  it('closes a long along the curve, ignoring the per-order cap and band', () => {
    const quote: StockQuote = { mid: 100, depth: 100_000, sensitivity: 1, halfSpread: 0.001, fee: 0.0005 }
    const fill = closingFill(quote, 5000) // 5% move — beyond the 2% cap
    expect(fill.signedQuantity).toBe(-5000)
    expect(fill.midAfter).toBeCloseTo(100 * Math.exp(-0.05), 9)
    expect(fill.cashDeltaPaise > 0n).toBe(true)
  })

  it('closes a short by buying it back', () => {
    const fill = closingFill(flat(80), -100)
    expect(fill).toMatchObject({ signedQuantity: 100, cashDeltaPaise: -800_000n, borrowDelta: -100 })
  })
})
