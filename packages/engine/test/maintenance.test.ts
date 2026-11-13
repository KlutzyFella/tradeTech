import { describe, expect, it } from 'vitest'
import {
  closingFill,
  DEFAULT_MAINTENANCE_RULES,
  DEFAULT_RISK_RULES,
  maintenanceHeadroom,
  maintenanceStatus,
  marginLevel,
  portfolioMetrics,
  type StockQuote,
} from '../src/index.ts'

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

describe('maintenance headroom (live monitor early warning)', () => {
  const headroom = (cash: number, positions: [string, number][], quotes: [string, StockQuote][]) =>
    maintenanceHeadroom(portfolioMetrics(cash, new Map(positions), new Map(quotes), DEFAULT_RISK_RULES), DEFAULT_MAINTENANCE_RULES)

  it('is null when nothing is at risk (all cash)', () => {
    expect(headroom(1_000_000, [], [])).toBeNull()
  })

  it('is the tighter of the two requirements, as actual ÷ required', () => {
    // §6 short at ₹100: collateral 1,10,000 ÷ (1.3 × 10,000) = 8.46; equity 1,00,000 ÷ (0.75 × 10,000) = 13.3.
    expect(headroom(110_000, [['X', -100]], [['X', flat(100)]])).toBeCloseTo(110_000 / 13_000, 6)
  })

  it('drops below 1 exactly when maintenance fails', () => {
    // Squeezed short, equity still positive: cash 12L, short 1,000 at ₹1,000. Collateral 12L ÷ 13L = 0.92,
    // but equity 2L ÷ (0.75 × 10L) = 0.27 is tighter, and maintenanceStatus agrees it fails.
    const squeezed: [number, [string, number][], [string, StockQuote][]] = [1_200_000, [['X', -1000]], [['X', flat(1000)]]]
    expect(headroom(...squeezed)).toBeCloseTo(200_000 / 750_000, 6)
    expect(status(...squeezed).ok).toBe(false)
    // Gapped long: equity 6L ÷ (0.75 × 10L) = 0.8.
    expect(headroom(-400_000, [['A', 10_000]], [['A', flat(100)]])).toBeCloseTo(0.8, 6)
  })

  it('is 0 when equity is gone', () => {
    expect(headroom(-10, [], [])).toBe(0)
  })

  it('classifies headroom into monitor levels', () => {
    expect(marginLevel(null)).toBe('none')
    expect(marginLevel(2)).toBe('ok')
    expect(marginLevel(1.05)).toBe('watch')
    expect(marginLevel(0.99)).toBe('breach')
    expect(marginLevel(1.5, 1.6)).toBe('watch')
  })
})
