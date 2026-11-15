import type { RoundView } from "@tradetech/contracts"
import { describe, expect, it } from "vitest"
import { tradingGate } from "./trading-gate"

const round = (status: RoundView["status"]): RoundView => ({ id: "1", sequence: 1, kind: "practice", status, durationMs: 600_000, remainingMs: 300_000 })
const base = { roomStatus: "practice" as const, round: round("running"), halted: false, newsPaused: false, ticker: "AIRCO" }

describe("trading gate", () => {
  it("is open in a running round", () => {
    expect(tradingGate(base)).toEqual({ open: true })
  })

  it("explains each reason trading is shut, most important first", () => {
    expect(tradingGate({ ...base, round: round("paused") })).toMatchObject({
      open: false,
      message: "Trading is paused. Orders open again when the host resumes the round.",
    })
    expect(tradingGate({ ...base, round: round("pending") })).toMatchObject({ open: false, message: "Trading opens when the host starts the round." })
    expect(tradingGate({ ...base, round: round("ended") })).toMatchObject({
      open: false,
      message: "This round is over. Trading opens when the host starts the next one.",
    })
    expect(tradingGate({ ...base, round: null })).toMatchObject({ open: false, message: "Trading opens when the host starts the round." })
    expect(tradingGate({ ...base, roomStatus: "draft" })).toMatchObject({ open: false, message: "Trading hasn't opened yet." })
    expect(tradingGate({ ...base, roomStatus: "paused" })).toMatchObject({
      open: false,
      message: "The host has paused the event. Trading resumes when they continue.",
    })
    expect(tradingGate({ ...base, roomStatus: "closed", halted: true })).toMatchObject({ open: false, message: "Trading has closed. Final results are in." })
    expect(tradingGate({ ...base, halted: true })).toMatchObject({ open: false, tone: "loss", message: "Trading in AIRCO is halted by the host." })
    expect(tradingGate({ ...base, newsPaused: true })).toMatchObject({ open: false, tone: "warning" })
  })

  it("waits for the market before saying anything", () => {
    expect(tradingGate({ ...base, roomStatus: undefined, round: undefined })).toMatchObject({ open: false, message: "Checking the market…" })
  })
})
