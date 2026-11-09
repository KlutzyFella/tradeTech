import { executionCost, executionNotional, impactCoefficient, midAfter } from './curve.ts'
import { settleToPaise } from './money.ts'
import { portfolioMetrics } from './portfolio.ts'
import type { RiskRules } from './rules.ts'
import type { Positions, Quotes, StockQuote } from './valuation.ts'

export type OrderIntent = 'buy' | 'sell' | 'short' | 'cover'

export interface OrderTicket {
  readonly stockId: string
  readonly intent: OrderIntent
  /** Positive share count; the intent gives the sign. */
  readonly quantity: number
  /** Max all-in average price for buy/cover; min for sell/short. */
  readonly limitPrice?: number | undefined
}

export interface StockTradingState {
  readonly id: string
  readonly halted: boolean
  readonly shortable: boolean
  readonly borrowAvailable: number
  readonly bandLow: number
  readonly bandHigh: number
}

export interface OrderContext {
  /** Team ledger cash in rupees, including restricted collateral. */
  readonly cash: number
  readonly positions: Positions
  readonly quotes: Quotes
  readonly stock: StockTradingState
  readonly rules: RiskRules
}

export type RejectReason =
  | 'halted'
  | 'wrong_intent'
  | 'crosses_zero'
  | 'not_shortable'
  | 'insufficient_borrow'
  | 'order_too_large'
  | 'band'
  | 'price_protection'
  | 'insufficient_cash'
  | 'short_limit'
  | 'position_limit'
  | 'gross_exposure'

export interface OrderFill {
  readonly ok: true
  readonly signedQuantity: number
  /** Pre-cost average fill price K(x)/x. */
  readonly fillPrice: number
  /** All-in average price |B(x)|/|x| including spread and fee. */
  readonly averagePrice: number
  /** Team's signed cash change, rounded once in the dealer's favour. */
  readonly cashDeltaPaise: bigint
  readonly midBefore: number
  readonly midAfter: number
  readonly positionAfter: number
  /** Change in borrowed shares: + when shorting, − when covering. */
  readonly borrowDelta: number
}

export interface OrderRejection {
  readonly ok: false
  readonly reason: RejectReason
  readonly message: string
  /** Largest quantity that would pass the violated price limit, when applicable. */
  readonly maxQuantity?: number
}

export type OrderDecision = OrderFill | OrderRejection

const reject = (reason: RejectReason, message: string, maxQuantity?: number): OrderRejection =>
  maxQuantity === undefined ? { ok: false, reason, message } : { ok: false, reason, message, maxQuantity }

function checkIntent(ticket: OrderTicket, held: number, stock: StockTradingState): OrderRejection | null {
  const n = ticket.quantity
  switch (ticket.intent) {
    case 'buy':
      return held < 0 ? reject('wrong_intent', 'You are short this stock — use Cover to buy it back.') : null
    case 'sell':
      if (held <= 0) return reject('wrong_intent', 'You hold no shares to sell — use Short to open a short.')
      return n > held ? reject('crosses_zero', `You hold ${held} shares; sell at most ${held}, then short separately.`) : null
    case 'short':
      if (held > 0) return reject('wrong_intent', 'You hold this stock — sell it before opening a short.')
      if (!stock.shortable) return reject('not_shortable', 'This stock cannot be shorted.')
      return n > stock.borrowAvailable
        ? reject('insufficient_borrow', `Only ${stock.borrowAvailable} shares are available to borrow.`)
        : null
    case 'cover':
      if (held >= 0) return reject('wrong_intent', 'You have no short position to cover.')
      return n > -held ? reject('crosses_zero', `You are short ${-held}; cover at most ${-held}, then buy separately.`) : null
  }
}

/** Largest |x| whose quote move stays within `logMove` (log-price units). */
function maxQuantityForLogMove(quote: StockQuote, logMove: number): number {
  const a = impactCoefficient(quote)
  return a === 0 ? Number.MAX_SAFE_INTEGER : Math.max(0, Math.floor(logMove / a))
}

function checkPriceLimits(x: number, quote: StockQuote, ctx: OrderContext): OrderRejection | null {
  const up = x > 0
  const orderLimit = up ? Math.log(1 + ctx.rules.maxOrderMove) : -Math.log(1 - ctx.rules.maxOrderMove)
  const maxForOrder = maxQuantityForLogMove(quote, orderLimit)
  if (Math.abs(x) > maxForOrder) {
    return reject(
      'order_too_large',
      `One order may move the price at most ${ctx.rules.maxOrderMove * 100}%. Maximum now: ${maxForOrder} shares.`,
      maxForOrder,
    )
  }
  const bandEdge = up ? ctx.stock.bandHigh : ctx.stock.bandLow
  const bandRoom = up ? Math.log(bandEdge / quote.mid) : Math.log(quote.mid / bandEdge)
  const maxForBand = bandRoom > 0 ? maxQuantityForLogMove(quote, bandRoom) : 0
  if (Math.abs(x) > maxForBand) {
    return reject('band', `This order would take the price outside today’s band. Maximum now: ${maxForBand} shares.`, maxForBand)
  }
  return null
}

function checkOpeningLimits(ctx: OrderContext, cashAfter: number, positionsAfter: Positions, quotesAfter: Quotes): OrderRejection | null {
  const metrics = portfolioMetrics(cashAfter, positionsAfter, quotesAfter, ctx.rules)
  const { equity } = metrics
  if (metrics.availableCash < 0) return reject('insufficient_cash', 'Not enough available cash for this order.')
  if (metrics.shortNotional > ctx.rules.maxShortFraction * equity) {
    return reject('short_limit', `Total shorts may not exceed ${ctx.rules.maxShortFraction * 100}% of equity.`)
  }
  const held = positionsAfter.get(ctx.stock.id) ?? 0
  const quote = quotesAfter.get(ctx.stock.id)
  if (quote && Math.abs(held) * quote.mid > ctx.rules.maxPositionFraction * equity) {
    return reject('position_limit', `One stock may not exceed ${ctx.rules.maxPositionFraction * 100}% of equity.`)
  }
  if (metrics.grossExposure > ctx.rules.maxGrossExposure * equity) {
    return reject('gross_exposure', `Total exposure may not exceed ${ctx.rules.maxGrossExposure * 100}% of equity.`)
  }
  return null
}

/**
 * Decides one order against the current frozen state. Pure: the caller
 * persists the fill (cash, position, pressure, borrow) atomically.
 * Risk limits apply only to risk-increasing intents (buy, short); sells and
 * covers are exempt so teams can reduce risk. Price limits (2% per order,
 * circuit band) apply to every intent, as blueprint §8 specifies: a cover at
 * the band edge is rejected with its max quantity; only emergency closures
 * (stage C margin liquidation) bypass the band.
 */
export function evaluateOrder(ctx: OrderContext, ticket: OrderTicket): OrderDecision {
  if (!Number.isSafeInteger(ticket.quantity) || ticket.quantity <= 0) {
    throw new RangeError(`quantity must be a positive integer, got ${ticket.quantity}`)
  }
  if (ticket.stockId !== ctx.stock.id) throw new Error('ticket stock does not match trading state')
  const quote = ctx.quotes.get(ticket.stockId)
  if (!quote) throw new Error(`no quote for ${ticket.stockId}`)
  if (ctx.stock.halted) return reject('halted', 'Trading in this stock is halted.')

  const held = ctx.positions.get(ticket.stockId) ?? 0
  const intentError = checkIntent(ticket, held, ctx.stock)
  if (intentError) return intentError

  const x = ticket.intent === 'buy' || ticket.intent === 'cover' ? ticket.quantity : -ticket.quantity
  const limitError = checkPriceLimits(x, quote, ctx)
  if (limitError) return limitError

  const notional = executionNotional(quote, x)
  const cost = executionCost(quote, x, quote)
  const averagePrice = Math.abs(cost) / ticket.quantity
  if (ticket.limitPrice !== undefined) {
    const breached = x > 0 ? averagePrice > ticket.limitPrice : averagePrice < ticket.limitPrice
    if (breached) {
      return reject('price_protection', `Average price ₹${averagePrice.toFixed(2)} is beyond your limit ₹${ticket.limitPrice}.`)
    }
  }

  const cashDeltaPaise = -settleToPaise(cost)
  const newMid = midAfter(quote, x)
  const positionAfter = held + x
  const positionsAfter = new Map(ctx.positions).set(ticket.stockId, positionAfter)
  const quotesAfter = new Map(ctx.quotes).set(ticket.stockId, { ...quote, mid: newMid })
  const cashAfter = ctx.cash + Number(cashDeltaPaise) / 100

  if (ticket.intent === 'buy' || ticket.intent === 'short') {
    const riskError = checkOpeningLimits(ctx, cashAfter, positionsAfter, quotesAfter)
    if (riskError) return riskError
  }

  return {
    ok: true,
    signedQuantity: x,
    fillPrice: notional / x,
    averagePrice,
    cashDeltaPaise,
    midBefore: quote.mid,
    midAfter: newMid,
    positionAfter,
    borrowDelta: ticket.intent === 'short' ? ticket.quantity : ticket.intent === 'cover' ? -ticket.quantity : 0,
  }
}
