import type { NewsView, StockView } from "@tradetech/contracts"
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { buildMentionIndex, findMentions } from "@/lib/mentions"

/** Where the news feed lives on the laptop desk. The News tab is always available as well. */
export type NewsPlacement = "panel" | "beside" | "tab"
const PLACEMENTS: readonly NewsPlacement[] = ["panel", "beside", "tab"]

/** How long a fresh story stays in the breaking-news strip unless dismissed. */
const BREAKING_MS = 20_000
const MAX_SEEN = 500

// Per-device conveniences only: storage can be blocked, so every access is guarded.
function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}
function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Private mode or blocked storage: the preference just won't persist.
  }
}

interface NewsContextValue {
  readonly items: readonly NewsView[]
  readonly loading: boolean
  readonly error: Error | null
  readonly unread: ReadonlySet<string>
  readonly markSeen: (ids: readonly string[]) => void
  /** The freshest story that arrived while signed in, while it is still "breaking". */
  readonly breaking: NewsView | null
  readonly dismissBreaking: () => void
  readonly mentionsOf: (item: NewsView) => readonly StockView[]
  readonly heldIds: ReadonlySet<string>
  readonly selectStock: (stock: StockView) => void
  readonly openNewsTab: () => void
  readonly placement: NewsPlacement
  readonly setPlacement: (p: NewsPlacement) => void
  readonly panelCollapsed: boolean
  readonly setPanelCollapsed: (collapsed: boolean) => void
}

const NewsContext = createContext<NewsContextValue | null>(null)

export function useNewsContext(): NewsContextValue {
  const value = use(NewsContext)
  if (!value) throw new Error("useNewsContext must be used inside <NewsProvider>")
  return value
}

interface NewsProviderProps {
  teamId: string
  items: readonly NewsView[] | undefined
  loading: boolean
  error: Error | null
  stocks: readonly StockView[]
  heldIds: ReadonlySet<string>
  selectStock: (stock: StockView) => void
  openNewsTab: () => void
  children: ReactNode
}

export function NewsProvider({ teamId, items, loading, error, stocks, heldIds, selectStock, openNewsTab, children }: NewsProviderProps) {
  const seenKey = `tradetech:news-seen:${teamId}`
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => {
    try {
      return new Set(JSON.parse(readStorage(seenKey) ?? "[]") as string[])
    } catch {
      return new Set()
    }
  })
  const markSeen = useCallback(
    (ids: readonly string[]) => {
      setSeen((prev) => {
        if (ids.every((id) => prev.has(id))) return prev
        const next = [...prev, ...ids.filter((id) => !prev.has(id))].slice(-MAX_SEEN)
        writeStorage(seenKey, JSON.stringify(next))
        return new Set(next)
      })
    },
    [seenKey],
  )

  const [placement, setPlacementState] = useState<NewsPlacement>(() => {
    const stored = readStorage("tradetech:news-placement")
    return PLACEMENTS.includes(stored as NewsPlacement) ? (stored as NewsPlacement) : "panel"
  })
  const setPlacement = useCallback((p: NewsPlacement) => {
    setPlacementState(p)
    writeStorage("tradetech:news-placement", p)
  }, [])
  const [panelCollapsed, setCollapsedState] = useState(() => readStorage("tradetech:news-panel-collapsed") === "1")
  const setPanelCollapsed = useCallback((c: boolean) => {
    setCollapsedState(c)
    writeStorage("tradetech:news-panel-collapsed", c ? "1" : "0")
  }, [])

  // Stories present when we first load are history, not breaking news.
  const known = useRef<Set<string> | null>(null)
  const [breaking, setBreaking] = useState<NewsView | null>(null)
  useEffect(() => {
    if (!items) return
    if (known.current === null) {
      known.current = new Set(items.map((i) => i.id))
      return
    }
    const fresh = items.filter((i) => !known.current!.has(i.id))
    for (const i of fresh) known.current.add(i.id)
    if (fresh.length > 0) setBreaking(fresh[0]!)
  }, [items])
  useEffect(() => {
    if (!breaking) return
    const timer = setTimeout(() => setBreaking(null), BREAKING_MS)
    return () => clearTimeout(timer)
  }, [breaking])
  const dismissBreaking = useCallback(() => setBreaking(null), [])

  const index = useMemo(() => buildMentionIndex(stocks), [stocks])
  const byId = useMemo(() => new Map(stocks.map((s) => [s.id, s])), [stocks])
  const mentionsOf = useCallback(
    (item: NewsView) =>
      findMentions(`${item.headline}\n${item.body}`, index)
        .map((id) => byId.get(id))
        .filter((s): s is StockView => s !== undefined),
    [index, byId],
  )

  const list = useMemo(() => items ?? [], [items])
  const unread = useMemo(() => new Set(list.filter((i) => !seen.has(i.id)).map((i) => i.id)), [list, seen])

  const value: NewsContextValue = {
    items: list,
    loading,
    error,
    unread,
    markSeen,
    breaking,
    dismissBreaking,
    mentionsOf,
    heldIds,
    selectStock,
    openNewsTab,
    placement,
    setPlacement,
    panelCollapsed,
    setPanelCollapsed,
  }
  return <NewsContext value={value}>{children}</NewsContext>
}

/**
 * A reading session for a visible news view: stories unread when the view
 * opened (or arriving while it is open) keep their "New" highlight for as long
 * as the view stays open, and count as read once it has been on screen for
 * `dwellMs` with the window focused.
 */
export function useReadingSession(active: boolean, dwellMs: number): ReadonlySet<string> {
  const { unread, markSeen } = useNewsContext()
  const [highlighted, setHighlighted] = useState<ReadonlySet<string>>(new Set())
  const [prevActive, setPrevActive] = useState(false)
  if (active !== prevActive) {
    setPrevActive(active)
    if (!active) setHighlighted(new Set())
  }
  const missing = active ? [...unread].filter((id) => !highlighted.has(id)) : []
  if (missing.length > 0) setHighlighted(new Set([...highlighted, ...missing]))

  useEffect(() => {
    if (!active || unread.size === 0) return
    const ids = [...unread]
    // Only while the participant is actually looking: tab visible and window focused.
    const timer = setTimeout(() => {
      if (document.visibilityState === "visible" && document.hasFocus()) markSeen(ids)
    }, dwellMs)
    return () => clearTimeout(timer)
  }, [active, unread, markSeen, dwellMs])

  return highlighted
}
