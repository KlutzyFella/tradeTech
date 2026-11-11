import { useEffect, useState } from "react"

/** The current time, refreshed on an interval (for relative timestamps). */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

const relative = new Intl.RelativeTimeFormat("en-IN", { numeric: "auto", style: "short" })

/** "just now", "3 min ago", "1 hr ago". */
export function timeAgo(iso: string, now: number): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000)
  if (seconds > -45) return "just now"
  const minutes = Math.round(seconds / 60)
  if (minutes > -60) return relative.format(minutes, "minute")
  return relative.format(Math.round(minutes / 60), "hour")
}
