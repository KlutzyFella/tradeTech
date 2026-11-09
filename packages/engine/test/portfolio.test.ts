import { describe, expect, it } from 'vitest'
import { applyFillToPosition, portfolioMetrics, DEFAULT_RISK_RULES, type StockQuote } from '../src/index.ts'

const flat = (mid: number): StockQuote => ({ mid, depth: 1, sensitivity: 0, halfSpread: 0, fee: 0 })
const empty = { quantity: 0, costBasisPaise: 0n, realizedPnlPaise: 0n }

describe('position accounting', () => {
  it('records the cost of opening a long', () => {
    expect(applyFillToPosition(empty, 100, -1_000_000n)).toEqual({
      quantity: 100,
      costBasisPaise: 1_000_000n,
      realizedPnlPaise: 0n,
    })
  })

  it('realizes profit on a partial sale and keeps the remaining basis', () => {
    const long = applyFillToPosition(empty, 100, -1_000_000n)
    expect(applyFillToPosition(long, -50, 600_000n)).toEqual({
      quantity: 50,
      costBasisPaise: 500_000n,
      realizedPnlPaise: 100_000n,
    })
  })

  it('realizes ₹2,000 when a 100-share short at ₹100 is covered at ₹80 (blueprint §6)', () => {
    const short = applyFillToPosition(empty, -100, 1_000_000n)
    expect(applyFillToPosition(short, 100, -800_000n)).toEqual({
      quantity: 0,
      costBasisPaise: 0n,
      realizedPnlPaise: 200_000n,
    })
  })
})

describe('portfolio metrics', () => {
  it('reconciles the §6 short example: cash ₹1,10,000, equity ₹1,00,000, collateral 1.5× short', () => {
    const metrics = portfolioMetrics(110_000, new Map([['X', -100]]), new Map([['X', flat(100)]]), DEFAULT_RISK_RULES)
    expect(metrics).toMatchObject({
      equity: 100_000,
      shortNotional: 10_000,
      grossExposure: 10_000,
      restrictedCash: 15_000,
      availableCash: 95_000,
    })
  })

  it('reports a liquidation value equal to equity when closing costs are zero', () => {
    const metrics = portfolioMetrics(110_000, new Map([['X', -100]]), new Map([['X', flat(80)]]), DEFAULT_RISK_RULES)
    expect(metrics.liquidationValue).toBe(102_000)
  })
})
