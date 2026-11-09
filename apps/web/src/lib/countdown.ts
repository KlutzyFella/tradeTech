import type { RoundView } from "@tradetech/contracts"
import { useEffect, useState } from "react"

/**
 * Counts a round's remaining active time down locally between refetches.
 * The server is authoritative: every refetch re-anchors the countdown.
 */
export function useCountdown(round: RoundView | null | undefined, fetchedAt: number): number | null {
  const [now, setNow] = useState(() => Date.now())
  const running = round?.status === "running"
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [running])
  if (!round) return null
  if (!running) return round.remainingMs
  return Math.max(0, round.remainingMs - Math.max(0, now - fetchedAt))
}

export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}
