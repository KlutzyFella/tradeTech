import { describe, expect, it } from 'vitest'
import { settleToPaise } from '../src/index.ts'

describe('ledger rounding convention: once per fill, in the dealer’s favour', () => {
  it('rounds a buyer’s payment up to the next paisa', () => {
    expect(settleToPaise(100_652.4233)).toBe(10_065_243n)
  })

  it('rounds a seller’s proceeds down (cost towards zero)', () => {
    expect(settleToPaise(-108_378.9918)).toBe(-10_837_899n)
  })

  it('keeps exact paise unchanged', () => {
    expect(settleToPaise(12.34)).toBe(1234n)
  })

  it('makes many tiny round trips lose money rather than mint it', () => {
    // A ₹0.004 buy and ₹0.004 sale: rounding must never pay the team.
    const net = -settleToPaise(0.004) - settleToPaise(-0.004)
    expect(net).toBeLessThanOrEqual(0n)
  })
})
