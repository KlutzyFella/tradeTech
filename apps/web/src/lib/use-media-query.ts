import { useSyncExternalStore } from "react"

/** Subscribes to a CSS media query; re-renders when it starts or stops matching. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener("change", onChange)
      return () => list.removeEventListener("change", onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/** Laptop and up (Tailwind `lg`): multi-pane trading desk instead of the phone layout. */
export const DESKTOP_QUERY = "(min-width: 1024px)"

/** Wide desk (Tailwind `2xl`, e.g. 1080p): adds the left column with score and standing. */
export const WIDE_DESK_QUERY = "(min-width: 1536px)"
