import type { EventRulesView } from "@tradetech/contracts"
import { formatPaiseWhole } from "@/lib/format"

export interface RulesSection {
  readonly title: string
  readonly points: readonly string[]
}

/** 0.0005 → "0.05%", 0.25 → "25%": no trailing zeros, no sign. */
export const plainPercent = (fraction: number): string => `${+(fraction * 100).toFixed(3)}%`

export const plainSeconds = (ms: number): string => {
  const seconds = +(ms / 1000).toFixed(1)
  return `${seconds} ${seconds === 1 ? "second" : "seconds"}`
}

const times = (n: number): string => `${+n.toFixed(2)}×`

/**
 * The event's rules in plain language, built from its actual numbers. The
 * scoring rule comes first: teams must understand it before scored trading.
 */
export function describeRules({ startingCashPaise, rules: r }: EventRulesView): RulesSection[] {
  return [
    {
      title: "How you're scored",
      points: [
        `Every team starts with ${formatPaiseWhole(startingCashPaise)} in cash.`,
        "Your score is your liquidation value: the cash you would end up with if you sold everything you own and bought back everything you're short, right now, through the market.",
        "Selling a big position pushes the price down as it fills, so a huge holding in a thinly traded stock is worth less than its price times its shares. Spread and fees count too.",
        "The highest liquidation value when trading closes wins.",
      ],
    },
    {
      title: "What a trade costs",
      points: [
        `You buy slightly above the market price and sell slightly below it: ${plainPercent(r.halfSpread)} each side, plus a ${plainPercent(r.fee)} fee on every fill.`,
        "Big orders move the price against you while they fill. The order ticket shows your average price and total before you confirm.",
        `One order can move a price by at most ${plainPercent(r.maxOrderMove)}. Larger orders are refused with the biggest size that fits.`,
        ...(r.minOrderIntervalMs > 0
          ? [r.minOrderIntervalMs === 1000 ? "You can place one order per second." : `You can place one order every ${plainSeconds(r.minOrderIntervalMs)}.`]
          : []),
      ],
    },
    {
      title: "Short selling",
      points: [
        "Shorting sells shares you don't own, betting the price will fall. You close a short by buying the shares back (cover).",
        `You receive the sale money, but ${times(r.collateralRatio)} the short's value is held back from your available cash as collateral.`,
        "Each stock has a limited number of shares to borrow, shared by all teams.",
      ],
    },
    {
      title: "Limits",
      points: [
        "Equity means your cash plus your positions at market price.",
        `At most ${plainPercent(r.maxPositionFraction)} of your equity in any one stock.`,
        `Shorts at most ${plainPercent(r.maxShortFraction)} of your equity in total.`,
        `Everything you hold, long and short together, at most ${times(r.maxGrossExposure)} your equity.`,
      ],
    },
    {
      title: "Forced close-outs",
      points: [
        `If prices move against you so that your cash falls below ${times(r.maintenanceCollateralRatio)} your shorts' value, or your equity falls below ${plainPercent(r.maintenanceEquityRatio)} of everything you hold, the market closes your positions automatically at current prices.`,
        "Losses from a close-out are kept. Nobody gets fresh cash.",
      ],
    },
    {
      title: "News, bands and halts",
      points: [
        "News reaches every team at the same moment.",
        ...(r.newsPauseMs > 0 ? [`Stocks moved by news pause for ${plainSeconds(r.newsPauseMs)} so nobody can trade before the price updates.`] : []),
        "Each stock has a price band, shown on its order ticket. Trades that would cross it are refused, and news that crosses it halts the stock until the host reopens it.",
      ],
    },
    {
      title: "Rounds",
      points: [
        "Practice rounds don't count: everything is reset before the event goes live.",
        "In scored rounds, your positions carry over from one round to the next. Trading only happens while a round is running.",
      ],
    },
  ]
}
