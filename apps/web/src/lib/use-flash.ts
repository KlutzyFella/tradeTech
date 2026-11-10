import { useEffect, useRef, useState } from "react"

/**
 * Returns a class that briefly tints an element when `value` moves up or
 * down. The key changes on every move, so consecutive moves re-trigger.
 */
export function useFlash(value: number): { className: string; key: number } {
  const previous = useRef(value)
  const [flash, setFlash] = useState<{ className: string; key: number }>({ className: "", key: 0 })
  useEffect(() => {
    if (value === previous.current) return
    const up = value > previous.current
    previous.current = value
    setFlash((f) => ({ className: up ? "animate-flash-up" : "animate-flash-down", key: f.key + 1 }))
  }, [value])
  return flash
}
