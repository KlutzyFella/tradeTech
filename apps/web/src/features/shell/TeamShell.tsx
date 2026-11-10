import type { Me, RoomStatus, RoundView, StockView } from "@tradetech/contracts"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { LogOutIcon } from "lucide-react"
import { useState } from "react"
import { BrandMark, ProductLockup } from "@/components/brand/BrandLogo"
import { SkipLink } from "@/components/skip-link"
import { ThemeToggle } from "@/components/theme-toggle"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { ActivityScreen } from "@/features/activity/ActivityScreen"
import { MarketScreen } from "@/features/market/MarketScreen"
import { NewsScreen } from "@/features/news/NewsScreen"
import { OrderSlip } from "@/features/order/OrderSlip"
import { DeskSummary, PortfolioScreen } from "@/features/portfolio/PortfolioScreen"
import { api } from "@/lib/api"
import { formatClock, useCountdown } from "@/lib/countdown"
import { useLiveUpdates } from "@/lib/live"
import { useMarket, useNews } from "@/lib/queries"
import { DESKTOP_QUERY, useMediaQuery, WIDE_DESK_QUERY } from "@/lib/use-media-query"
import { cn } from "@/lib/utils"

type Tab = "market" | "news" | "portfolio" | "activity"
const PHONE_TABS: readonly { id: Tab; label: string }[] = [
  { id: "market", label: "Market" },
  { id: "news", label: "News" },
  { id: "portfolio", label: "Portfolio" },
  { id: "activity", label: "Activity" },
]
/** On the desk, news has its own column, so it isn't a tab. */
const DESK_TABS = PHONE_TABS.filter((t) => t.id !== "news")

const STATUS_COPY: Record<RoomStatus, string> = {
  draft: "Trading hasn’t opened yet",
  practice: "Practice round — results don’t count",
  live: "Live — trades count",
  paused: "Paused by the host",
  closed: "Trading has closed",
}

export function TeamShell({ me }: { me: Extract<Me, { kind: "team" }> }) {
  const desktop = useMediaQuery(DESKTOP_QUERY)
  // Rendered (not CSS-hidden) by breakpoint, so the score and standing exist exactly once.
  const wideDesk = useMediaQuery(WIDE_DESK_QUERY)
  const [tab, setTab] = useState<Tab>("market")
  const [selected, setSelected] = useState<StockView | null>(null)
  const { connected } = useLiveUpdates(true)
  const market = useMarket()
  const news = useNews()
  const [seenNews, setSeenNews] = useState(0)
  const newsCount = news.data?.length ?? 0
  const unread = tab === "news" ? 0 : Math.max(0, newsCount - seenNews)
  const openTab = (next: Tab) => {
    if (next === "news" || tab === "news") setSeenNews(newsCount)
    setTab(next)
  }
  // The desk has no News tab; fall back to Market if the window grows while on it.
  const activeTab = desktop && tab === "news" ? "market" : tab
  // Keep the ticket showing the latest quote for its stock.
  const liveSelected = selected ? (market.data?.stocks.find((s) => s.id === selected.id) ?? selected) : null

  const header = (
    <TeamHeader
      me={me}
      status={market.data?.roomStatus}
      round={market.data?.round ?? null}
      fetchedAt={market.dataUpdatedAt}
      connected={connected}
    />
  )
  const section = (
    <>
      {activeTab === "market" && <MarketScreen onSelect={setSelected} selectedId={liveSelected?.id ?? null} layout={desktop ? "table" : "list"} />}
      {activeTab === "news" && <NewsScreen />}
      {activeTab === "portfolio" && <PortfolioScreen layout={desktop ? "wide" : "stacked"} summaryElsewhere={wideDesk} />}
      {activeTab === "activity" && <ActivityScreen layout={desktop ? "table" : "list"} />}
    </>
  )

  if (desktop) {
    return (
      <div className="flex min-h-svh flex-col">
        <SkipLink />
        {header}
        <div className="mx-auto grid w-full max-w-[1920px] flex-1 grid-cols-[minmax(0,1fr)_380px] gap-5 px-5 py-5 2xl:grid-cols-[288px_minmax(0,1fr)_400px] 2xl:gap-6 2xl:px-8">
          {wideDesk && (
            <aside aria-label="Your desk">
              <div className="sticky top-[5.25rem]">
                <DeskSummary />
              </div>
            </aside>
          )}
          <main id="main" tabIndex={-1} className="flex min-w-0 flex-col gap-4 outline-none">
            <nav aria-label="Sections" className="flex gap-1 border-b border-border">
              {DESK_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-current={activeTab === t.id ? "page" : undefined}
                  onClick={() => openTab(t.id)}
                  className={cn(
                    "-mb-px border-b-2 px-4 py-2.5 font-heading text-sm font-medium outline-none transition-colors focus-visible:bg-muted",
                    activeTab === t.id ? "border-brand-text text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </nav>
            {section}
          </main>
          <aside aria-label="Trading" className="flex min-w-0 flex-col gap-5">
            <section aria-label="Order ticket" className="rounded-lg border border-border bg-surface">
              {liveSelected ? (
                <OrderSlip key={liveSelected.id} stock={liveSelected} onDone={() => setSelected(null)} />
              ) : (
                <div className="flex flex-col items-start gap-2 px-5 py-8">
                  <p className="font-heading text-lg font-semibold">Order ticket</p>
                  <p className="text-sm text-muted-foreground">Pick a stock from the market to see its price impact and place an order.</p>
                </div>
              )}
            </section>
            <section aria-labelledby="news-rail-heading" className="flex min-h-0 flex-col rounded-lg border border-border bg-surface">
              <h2 id="news-rail-heading" className="border-b border-border px-5 py-3 text-base font-semibold">
                News
              </h2>
              <div className="max-h-[calc(100svh-30rem)] min-h-40 overflow-y-auto">
                <NewsScreen variant="rail" />
              </div>
            </section>
          </aside>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-2xl flex-col">
      <SkipLink />
      {header}
      <main id="main" tabIndex={-1} className="flex-1 pt-3 outline-none">
        {section}
      </main>
      <nav
        aria-label="Sections"
        className="sticky bottom-0 z-10 grid grid-cols-4 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        {PHONE_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-current={activeTab === t.id ? "page" : undefined}
            onClick={() => openTab(t.id)}
            className={cn(
              "relative h-14 font-heading text-sm font-medium outline-none focus-visible:bg-muted",
              activeTab === t.id ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {activeTab === t.id && <span aria-hidden className="absolute inset-x-6 top-0 h-0.5 bg-brand-text" />}
            {t.label}
            {t.id === "news" && unread > 0 && (
              <span className="ml-1 inline-flex min-w-5 justify-center rounded-full bg-brand px-1.5 text-xs font-semibold text-brand-foreground">
                {unread}
              </span>
            )}
          </button>
        ))}
      </nav>
      <Sheet open={liveSelected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent side="bottom" className="max-h-[92svh] overflow-y-auto overscroll-contain rounded-t-2xl bg-surface pt-2">
          <SheetTitle className="sr-only">Trade {liveSelected?.ticker}</SheetTitle>
          <div aria-hidden className="mx-auto mb-2 h-1 w-10 rounded-full bg-border" />
          {liveSelected && <OrderSlip key={liveSelected.id} stock={liveSelected} onDone={() => setSelected(null)} />}
        </SheetContent>
      </Sheet>
    </div>
  )
}

interface TeamHeaderProps {
  me: Extract<Me, { kind: "team" }>
  status: RoomStatus | undefined
  round: RoundView | null
  fetchedAt: number
  connected: boolean
}

function TeamHeader({ me, status, round, fetchedAt, connected }: TeamHeaderProps) {
  const queryClient = useQueryClient()
  const logout = useMutation({ mutationFn: () => api.post("/auth/logout"), onSuccess: () => queryClient.clear() })
  const remaining = useCountdown(round, fetchedAt)
  const showClock = round !== null && round.status !== "ended"
  const lowTime = round?.status === "running" && remaining !== null && remaining < 60_000

  const statusLine = (
    <>
      {status ? STATUS_COPY[status] : "Connecting…"}
      {round?.status === "ended" && status !== "closed" && " — round over, waiting for the next one"}
    </>
  )

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1920px] items-center gap-3 px-4 py-2.5 lg:gap-5 lg:px-5 2xl:px-8">
        <span className="lg:hidden">
          <BrandMark className="h-6" />
        </span>
        <span className="max-lg:hidden">
          <ProductLockup />
        </span>
        <div className="flex min-w-0 flex-1 flex-col lg:flex-row lg:items-center lg:gap-3">
          <h1 className="truncate text-base font-semibold lg:text-lg">{me.teamName}</h1>
          <p className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground lg:text-sm">
            <span className="truncate max-lg:hidden">{me.roomName}</span>
            {status === "live" ? <Badge variant="live">{statusLine}</Badge> : <span className="truncate">{statusLine}</span>}
          </p>
        </div>
        {showClock && (
          <div className="flex flex-col items-end leading-none">
            <span className="text-[0.65rem] tracking-wide text-muted-foreground max-lg:hidden">
              {round.kind === "practice" ? "Practice" : "Round"} {round.sequence}
            </span>
            <p
              aria-label="Time left in round"
              className={cn("figures font-heading text-xl font-semibold lg:text-2xl", lowTime && "text-brand-text")}
            >
              {round.status === "paused" ? "Paused" : round.status === "pending" ? "Starting soon" : formatClock(remaining ?? 0)}
            </p>
          </div>
        )}
        <span
          role="status"
          aria-label={connected ? "Live updates connected" : "Reconnecting"}
          title={connected ? "Live updates connected" : "Reconnecting…"}
          className={cn("size-2 shrink-0 rounded-full", connected ? "bg-gain" : "animate-pulse bg-warning")}
        />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button variant="ghost" size="icon" aria-label="Sign out" title="Sign out" onClick={() => logout.mutate()}>
            <LogOutIcon />
          </Button>
        </div>
      </div>
    </header>
  )
}
