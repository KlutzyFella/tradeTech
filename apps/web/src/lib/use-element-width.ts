import { useEffect, useRef, useState } from "react"

/** Tracks an element's content width, so SVG charts draw at real pixel size. */
export function useElementWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry?.contentRect.width ?? 0)))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}
