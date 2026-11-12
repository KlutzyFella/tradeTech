import { useEffect, useRef, useState } from "react"

/** Moves smaller than this (relative) don't flash: pressure fading nudges prices constantly. */
const MIN_FLASH_MOVE = 0.0005

/**
 * Returns a class that briefly tints an element when `value` moves up or
 * down meaningfully (a trade or news, not background drift). The key changes
 * on every flash, so consecutive moves re-trigger.
 */
export function useFlash(value: number, minRelativeMove = MIN_FLASH_MOVE): { className: string; key: number } {
  const previous = useRef(value)
  const [flash, setFlash] = useState<{ className: string; key: number }>({ className: "", key: 0 })
  useEffect(() => {
    const base = previous.current
    if (base === 0 || Math.abs(value - base) / Math.abs(base) < minRelativeMove) return
    const up = value > base
    previous.current = value
    setFlash((f) => ({ className: up ? "animate-flash-up" : "animate-flash-down", key: f.key + 1 }))
  }, [value, minRelativeMove])
  return flash
}
