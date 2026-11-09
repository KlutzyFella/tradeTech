import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RISK_RULES,
  evaluateOrder,
  type OrderContext,
  type StockQuote,
  type StockTradingState,
} from '../src/index.ts'

const costs = { halfSpread: 0.001, fee: 0.0005 }
// Thin stock from blueprint §4.4.
const thin: StockQuote = { mid: 100, depth: 100_000, sensitivity: 1, ...costs }
const deep = (mid = 100): StockQuote => ({ mid, depth: 5_000_000, sensitivity: 1, ...costs })

const tradable = (id: string, over: Partial<StockTradingState> = {}): StockTradingState => ({
  id,
  halted: false,
  shortable: true,
  borrowAvailable: 1_000_000,
  bandLow: 1,
  bandHigh: 10_000,
  ...over,
})

function context(over: Partial<OrderContext> = {}): OrderContext {
  return {
    cash: 1_000_000,
    positions: new Map(),
    quotes: new Map([
      ['THIN', thin],
      ['A', deep()],
      ['B', deep()],
      ['C', deep()],
      ['D', deep()],
      ['E', deep()],
    ]),
    stock: tradable('THIN'),
    rules: DEFAULT_RISK_RULES,
    ...over,
  }
}

describe('filling orders', () => {
  it('fills the worked-example buy, charging ₹1,00,652.43 rounded in the dealer’s favour', () => {
    const decision = evaluateOrder(context(), { stockId: 'THIN', intent: 'buy', quantity: 1000 })
    expect(decision.ok).toBe(true)
    if (!decision.ok) return
    expect(decision.cashDeltaPaise).toBe(-10_065_243n)
    expect(decision.signedQuantity).toBe(1000)
    expect(decision.positionAfter).toBe(1000)
    expect(decision.midAfter).toBeCloseTo(101.005017, 6)
    expect(decision.borrowDelta).toBe(0)
  })

  it('credits short-sale proceeds to cash and reserves borrow', () => {
    const decision = evaluateOrder(context({ stock: tradable('A'), rules: { ...DEFAULT_RISK_RULES } }), {
      stockId: 'A',
      intent: 'short',
      quantity: 1000,
    })
    expect(decision.ok).toBe(true)
    if (!decision.ok) return
    expect(decision.cashDeltaPaise > 9_980_000n && decision.cashDeltaPaise < 10_000_000n).toBe(true)
    expect(decision.positionAfter).toBe(-1000)
    expect(decision.borrowDelta).toBe(1000)
  })

  it('releases borrow when covering', () => {
    const decision = evaluateOrder(
      context({ positions: new Map([['A', -500]]), cash: 1_050_000, stock: tradable('A') }),
      { stockId: 'A', intent: 'cover', quantity: 200 },
    )
    expect(decision.ok && decision.borrowDelta).toBe(-200)
  })
})

describe('intent rules', () => {
  it('rejects selling more than is held (no crossing zero)', () => {
    const decision = evaluateOrder(context({ positions: new Map([['THIN', 10]]) }), {
      stockId: 'THIN',
      intent: 'sell',
      quantity: 11,
    })
    expect(decision).toMatchObject({ ok: false, reason: 'crosses_zero' })
  })

  it('rejects a buy while short — the team must cover instead', () => {
    const decision = evaluateOrder(context({ positions: new Map([['THIN', -10]]) }), {
      stockId: 'THIN',
      intent: 'buy',
      quantity: 5,
    })
    expect(decision).toMatchObject({ ok: false, reason: 'wrong_intent' })
  })

  it('rejects covering when not short', () => {
    const decision = evaluateOrder(context(), { stockId: 'THIN', intent: 'cover', quantity: 5 })
    expect(decision).toMatchObject({ ok: false, reason: 'wrong_intent' })
  })

  it('rejects shorting a stock that is not shortable', () => {
    const decision = evaluateOrder(context({ stock: tradable('THIN', { shortable: false }) }), {
      stockId: 'THIN',
      intent: 'short',
      quantity: 5,
    })
    expect(decision).toMatchObject({ ok: false, reason: 'not_shortable' })
  })

  it('rejects a short larger than the remaining borrow pool', () => {
    const decision = evaluateOrder(context({ stock: tradable('THIN', { borrowAvailable: 99 }) }), {
      stockId: 'THIN',
      intent: 'short',
      quantity: 100,
    })
    expect(decision).toMatchObject({ ok: false, reason: 'insufficient_borrow' })
  })

  it('rejects any execution in a halted stock', () => {
    const decision = evaluateOrder(
      context({ positions: new Map([['THIN', 10]]), stock: tradable('THIN', { halted: true }) }),
      { stockId: 'THIN', intent: 'sell', quantity: 10 },
    )
    expect(decision).toMatchObject({ ok: false, reason: 'halted' })
  })
})

describe('price limits', () => {
  it('rejects an order that moves the quote more than 2%, reporting the maximum quantity', () => {
    const decision = evaluateOrder(context(), { stockId: 'THIN', intent: 'buy', quantity: 2000 })
    // ln(1.02) / (1 / 100,000) = 1980.26
    expect(decision).toMatchObject({ ok: false, reason: 'order_too_large', maxQuantity: 1980 })
  })

  it('rejects the whole order when its final quote would cross the band — no clamped fill', () => {
    const decision = evaluateOrder(
      context({ quotes: new Map([['THIN', { ...thin, mid: 119.5 }]]), stock: tradable('THIN', { bandHigh: 120 }) }),
      { stockId: 'THIN', intent: 'buy', quantity: 1000 },
    )
    // ln(120 / 119.5) / 1e-5 = 417.5
    expect(decision).toMatchObject({ ok: false, reason: 'band', maxQuantity: 417 })
  })

  it('honours the buyer’s maximum all-in average price', () => {
    const decision = evaluateOrder(context(), {
      stockId: 'THIN',
      intent: 'buy',
      quantity: 1000,
      limitPrice: 100.5,
    })
    expect(decision).toMatchObject({ ok: false, reason: 'price_protection' })
  })

  it('honours the seller’s minimum all-in average price', () => {
    const decision = evaluateOrder(context({ positions: new Map([['THIN', 1000]]) }), {
      stockId: 'THIN',
      intent: 'sell',
      quantity: 1000,
      limitPrice: 99.5,
    })
    expect(decision).toMatchObject({ ok: false, reason: 'price_protection' })
  })
})

describe('opening risk limits', () => {
  it('rejects a buy the team cannot afford', () => {
    const decision = evaluateOrder(context({ cash: 50_000 }), { stockId: 'THIN', intent: 'buy', quantity: 1000 })
    expect(decision).toMatchObject({ ok: false, reason: 'insufficient_cash' })
  })

  it('rejects a single-stock position above 25% of equity', () => {
    const decision = evaluateOrder(context({ stock: tradable('A') }), { stockId: 'A', intent: 'buy', quantity: 3000 })
    expect(decision).toMatchObject({ ok: false, reason: 'position_limit' })
  })

  it('rejects total short notional above 25% of equity', () => {
    const decision = evaluateOrder(
      context({ cash: 1_200_000, positions: new Map([['A', -2000]]), stock: tradable('B') }),
      { stockId: 'B', intent: 'short', quantity: 1000 },
    )
    expect(decision).toMatchObject({ ok: false, reason: 'short_limit' })
  })

  it('rejects gross exposure above 100% of equity', () => {
    const decision = evaluateOrder(
      // Short proceeds fund longs: equity ≈ ₹10L, gross ≈ ₹10.2L, cash still positive.
      context({
        cash: 520_000,
        positions: new Map([
          ['A', -2400],
          ['B', 2400],
          ['C', 2400],
          ['D', 2400],
        ]),
        stock: tradable('E'),
      }),
      { stockId: 'E', intent: 'buy', quantity: 600 },
    )
    expect(decision).toMatchObject({ ok: false, reason: 'gross_exposure' })
  })

  it('always allows risk-reducing sells, even when the team is over its limits', () => {
    const decision = evaluateOrder(
      context({ cash: 0, positions: new Map([['A', 4000]]), stock: tradable('A') }),
      { stockId: 'A', intent: 'sell', quantity: 1000 },
    )
    expect(decision.ok).toBe(true)
  })
})
