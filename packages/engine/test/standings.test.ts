import { describe, expect, it } from 'vitest'
import { closingValuation, rankStandings, type StockQuote } from '../src/index.ts'

const costs = { halfSpread: 0.001, fee: 0.0005 }
const thin = (mid: number): StockQuote => ({ mid, depth: 100_000, sensitivity: 1, ...costs })
const flat = (mid: number): StockQuote => ({ mid, depth: 1, sensitivity: 0, halfSpread: 0, fee: 0 })

describe('closing valuation in exact paise', () => {
  it('equals cash for a flat book', () => {
    expect(closingValuation(12_345n, new Map(), new Map())).toEqual({ totalPaise: 12_345n, lines: [] })
  })

  it('values the worked-example exit at ₹1,08,378.99 — proceeds rounded down, the dealer’s favour', () => {
    // Blueprint §4.4: 1,000 shares exited at mid ₹109.085418 nets ₹1,08,378.9918.
    const { totalPaise, lines } = closingValuation(0n, new Map([['THIN', 1000]]), new Map([['THIN', thin(109.08541804509014)]]))
    expect(totalPaise).toBe(10_837_899n)
    expect(lines).toEqual([{ stockId: 'THIN', quantity: 1000, mid: 109.08541804509014, closingCashPaise: 10_837_899n }])
  })

  it('subtracts the buy-back cost of a short (§6: 100 short covered at ₹80 from ₹1,10,000)', () => {
    const { totalPaise } = closingValuation(11_000_000n, new Map([['X', -100]]), new Map([['X', flat(80)]]))
    expect(totalPaise).toBe(10_200_000n)
  })

  it('never mutates the shared quotes, so every team sees the same closing market', () => {
    const quotes = new Map([['THIN', thin(100)]])
    closingValuation(0n, new Map([['THIN', 5000]]), quotes)
    expect(quotes.get('THIN')!.mid).toBe(100)
  })
})

describe('competition ranking', () => {
  const entry = (name: string, valuePaise: bigint) => ({ name, valuePaise })

  it('ranks best first with shared ranks for exact ties (1, 2, 2, 4)', () => {
    const ranked = rankStandings([entry('D', 50n), entry('B', 90n), entry('C', 90n), entry('A', 100n)])
    expect(ranked.map((e) => [e.name, e.rank])).toEqual([
      ['A', 1],
      ['B', 2],
      ['C', 2],
      ['D', 4],
    ])
  })

  it('gives the same ranks whatever order teams are valued in', () => {
    const teams = [entry('A', 7n), entry('B', 3n), entry('C', 7n), entry('D', 1n), entry('E', 9n)]
    const rankOf = (list: typeof teams) => Object.fromEntries(rankStandings(list).map((e) => [e.name, e.rank]))
    expect(rankOf([...teams].reverse())).toEqual(rankOf(teams))
    expect(rankOf([teams[2]!, teams[0]!, teams[4]!, teams[1]!, teams[3]!])).toEqual(rankOf(teams))
  })
})
