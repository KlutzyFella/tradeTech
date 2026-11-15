import type { RoomStatus, RoundView } from "@tradetech/contracts"

export type TradingGate = { readonly open: true } | { readonly open: false; readonly tone: "info" | "warning" | "loss"; readonly message: string }

interface GateInput {
  readonly roomStatus: RoomStatus | undefined
  /** undefined while the market is loading; null before the first round. */
  readonly round: RoundView | null | undefined
  readonly halted: boolean
  readonly newsPaused: boolean
  readonly ticker: string
}

const shut = (message: string, tone: "info" | "warning" | "loss" = "info"): TradingGate => ({ open: false, tone, message })

/**
 * Whether a team can place an order on this stock now, and if not, why, in
 * the order a team should hear it: the event, then the round, then the stock.
 * Mirrors the server's checks; the server still has the final say.
 */
export function tradingGate({ roomStatus, round, halted, newsPaused, ticker }: GateInput): TradingGate {
  if (roomStatus === undefined || round === undefined) return shut("Checking the market…")
  if (roomStatus === "draft") return shut("Trading hasn't opened yet.")
  if (roomStatus === "closed") return shut("Trading has closed. Final results are in.")
  if (roomStatus === "paused") return shut("The host has paused the event. Trading resumes when they continue.", "warning")
  if (round === null || round.status === "pending") return shut("Trading opens when the host starts the round.")
  if (round.status === "ended") return shut("This round is over. Trading opens when the host starts the next one.")
  if (round.status === "paused") return shut("Trading is paused. Orders open again when the host resumes the round.", "warning")
  if (halted) return shut(`Trading in ${ticker} is halted by the host.`, "loss")
  if (newsPaused) return shut("Trading reopens in a few seconds while prices update for the news.", "warning")
  return { open: true }
}
