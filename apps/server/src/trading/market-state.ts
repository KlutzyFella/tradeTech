import type { RoomRules, StockView } from '@tradetech/contracts'
import { midPrice, type StockQuote, type StockTradingState } from '@tradetech/engine'
import type { Stock } from '../generated/prisma/client.ts'

export const stockMid = (stock: Stock): number =>
  midPrice({ anchor: stock.anchor, pressure: stock.pressure, noise: stock.noise })

export function stockQuote(stock: Stock, rules: RoomRules): StockQuote {
  return {
    mid: stockMid(stock),
    depth: stock.depth,
    sensitivity: stock.sensitivity,
    halfSpread: rules.halfSpread,
    fee: rules.fee,
  }
}

export function stockTradingState(stock: Stock): StockTradingState {
  return {
    id: stock.id.toString(),
    halted: stock.halted,
    shortable: stock.shortable,
    borrowAvailable: stock.borrowPool - stock.borrowUsed,
    bandLow: stock.bandReference * (1 - stock.bandFraction),
    bandHigh: stock.bandReference * (1 + stock.bandFraction),
  }
}

export function quotesFor(stocks: readonly Stock[], rules: RoomRules): Map<string, StockQuote> {
  return new Map(stocks.map((s) => [s.id.toString(), stockQuote(s, rules)]))
}

export function toStockView(stock: Stock): StockView {
  const mid = stockMid(stock)
  const state = stockTradingState(stock)
  return {
    id: state.id,
    ticker: stock.ticker,
    name: stock.name,
    sector: stock.sector,
    profile: stock.profile,
    mid,
    openingPrice: stock.openingPrice,
    change: mid / stock.openingPrice - 1,
    halted: stock.halted,
    shortable: stock.shortable,
    borrowAvailable: state.borrowAvailable,
    bandLow: state.bandLow,
    bandHigh: state.bandHigh,
  }
}

/** Rupees → integer paise for display figures (not ledger postings). */
export const toPaise = (rupees: number): number => Math.round(rupees * 100)
