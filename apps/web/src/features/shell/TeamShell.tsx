import type { Me, RoomStatus, RoundView, StockView } from "@tradetech/contracts"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { LogOutIcon } from "lucide-react"
import { useCallback, useMemo, useState, type ReactNode } from "react"
import { BrandMark, ProductLockup } from "@/components/brand/BrandLogo"
import { SkipLink } from "@/components/skip-link"
import { ThemeToggle } from "@/components/theme-toggle"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { ActivityScreen } from "@/features/activity/ActivityScreen"
import { MarketScreen } from "@/features/market/MarketScreen"
import { NewsProvider, useNewsContext } from "@/features/news/news-context"
import { BreakingNewsStrip, NewsColumn, NewsPanel, NewsReader } from "@/features/news/NewsViews"
import { OrderSlip } from "@/features/order/OrderSlip"
import { DeskSummary, PortfolioScreen } from "@/features/portfolio/PortfolioScreen"
import { api } from "@/lib/api"
import { formatClock, useCountdown } from "@/lib/countdown"
import { useLiveUpdates } from "@/lib/live"
import { useMarket, useNews, usePortfolio } from "@/lib/queries"
import { BESIDE_NEWS_QUERY, DESKTOP_QUERY, useMediaQuery, VERY_WIDE_QUERY, WIDE_DESK_QUERY } from "@/lib/use-media-query"
import { cn } from "@/lib/utils"

type Tab = "market" | "news" | "portfolio" | "activity"
const TABS: readonly { id: Tab; label: string }[] = [
  { id: "market", label: "Market" },
  { id: "news", label: "News" },
  { id: "portfolio", label: "Portfolio" },
  { id: "activity", label: "Activity" },
]

const STATUS_COPY: Record<RoomStatus, string> = {
  draft: "Trading hasn’t opened yet",
  practice: "Practice round — results don’t count",
  live: "Live — trades count",
  paused: "Paused by the host",
  closed: "Trading has closed",
}

export function TeamShell({ me }: { me: Extract<Me, { kind: "team" }> }) {
  const [tab, setTab] = useState<Tab>("market")
  const [selected, setSelected] = useState<StockView | null>(null)
  const market = useMarket()
  const news = useNews()
  const portfolio = usePortfolio()
  const heldIds = useMemo(() => new Set(portfolio.data?.positions.map((p) => p.stockId)), [portfolio.data])
  const openNewsTab = useCallback(() => setTab("news"), [])

  return (
    <NewsProvider
      teamId={me.teamId}
      items={news.data}
      loading={news.isPending}
      error={news.error}
      stocks={market.data?.stocks ?? []}
      heldIds={heldIds}
      selectStock={setSelected}
      openNewsTab={openNewsTab}
    >
      <TeamLayout me={me} tab={tab} setTab={setTab} selected={selected} setSelected={setSelected} />
    </NewsProvider>
  )
}

interface TeamLayoutProps {
  me: Extract<Me, { kind: "team" }>
  tab: Tab
  setTab: (tab: Tab) => void
  selected: StockView | null
  setSelected: (stock: StockView | null) => void
}

function TeamLayout({ me, tab, setTab, selected, setSelected }: TeamLayoutProps) {
  const desktop = useMediaQuery(DESKTOP_QUERY)
  const canShowBeside = useMediaQuery(BESIDE_NEWS_QUERY)
  const wide = useMediaQuery(WIDE_DESK_QUERY)
  const veryWide = useMediaQuery(VERY_WIDE_QUERY)
  const { connected } = useLiveUpdates(true)
  const market = useMarket()
  const { unread, placement } = useNewsContext()
  // "Beside market" needs room; on narrower windows it falls back to the side panel.
  const effectivePlacement = placement === "beside" && !canShowBeside ? "panel" : placement
  // The score column appears when it fits alongside everything else; rendered, never CSS-hidden.
  const deskColumn = effectivePlacement === "beside" ? veryWide : wide
  // Keep the ticket showing the latest quote for its stock.
  const liveSelected = selected ? (market.data?.stocks.find((s) => s.id === selected.id) ?? selected) : null

  const header = (
    <TeamHeader
      me={me}
      status={market.data?.roomStatus}
      round={market.data?.round ?? null}
      fetchedAt={market.dataUpdatedAt}
      connected={connected}
      banner={<BreakingNewsStrip />}
    />
  )
  const marketTable = (
    <MarketScreen onSelect={setSelected} selectedId={liveSelected?.id ?? null} layout={desktop ? "table" : "list"} />
  )
  const section = (
    <>
      {tab === "market" &&
        (desktop && effectivePlacement === "beside" ? (
          <div className="grid grid-cols-[minmax(0,1fr)_340px] items-start gap-4">
            {marketTable}
            <NewsColumn />
          </div>
        ) : (
          marketTable
        ))}
      {tab === "news" && <NewsReader showPlacement={desktop} allowBeside={canShowBeside} />}
      {tab === "portfolio" && <PortfolioScreen layout={desktop ? "wide" : "stacked"} summaryElsewhere={deskColumn} />}
      {tab === "activity" && <ActivityScreen layout={desktop ? "table" : "list"} />}
    </>
  )
  const tabButton = (t: (typeof TABS)[number], variant: "desk" | "phone") => {
    const active = tab === t.id
    const count = t.id === "news" && !active ? unread.size : 0
    return (
      <button
        key={t.id}
        type="button"
        aria-current={active ? "page" : undefined}
        onClick={() => setTab(t.id)}
        className={cn(
          "relative inline-flex items-center justify-center gap-1.5 font-heading text-sm font-medium outline-none transition-colors",
          variant === "desk"
            ? cn("-mb-px border-b-2 px-4 py-2.5 focus-visible:bg-muted", active ? "border-brand-text text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")
            : cn("h-14 focus-visible:bg-muted", active ? "text-foreground" : "text-muted-foreground"),
        )}
      >
        {variant === "phone" && active && <span aria-hidden className="absolute inset-x-6 top-0 h-0.5 bg-brand-text" />}
        {t.label}
        {count > 0 && (
          <span className="inline-flex min-w-5 justify-center rounded-full bg-brand px-1.5 text-xs font-semibold text-brand-foreground">
            <span className="sr-only">, </span>
            {count}
            <span className="sr-only"> unread</span>
          </span>
        )}
      </button>
    )
  }

  if (desktop) {
    return (
      <div className="flex min-h-svh flex-col">
        <SkipLink />
        {header}
        <div
          className={cn(
            "mx-auto grid w-full max-w-[1920px] flex-1 gap-5 px-5 py-5 2xl:gap-6 2xl:px-8",
            deskColumn ? "grid-cols-[288px_minmax(0,1fr)_400px]" : "grid-cols-[minmax(0,1fr)_380px]",
          )}
        >
          {deskColumn && (
            <aside aria-label="Your desk">
              <div className="sticky top-[5.25rem]">
                <DeskSummary />
              </div>
            </aside>
          )}
          <main id="main" tabIndex={-1} className="flex min-w-0 flex-col gap-4 outline-none">
            <nav aria-label="Sections" className="flex gap-1 border-b border-border">
              {TABS.map((t) => tabButton(t, "desk"))}
            </nav>
            {section}
          </main>
          <aside aria-label="Trading" className="flex min-w-0 flex-col gap-5">
            <div className="flex flex-col gap-5 lg:sticky lg:top-[5.25rem]">
              <section aria-label="Order ticket" className="rounded-lg border border-border bg-surface">
                {liveSelected ? (
                  <OrderSlip key={liveSelected.id} stock={liveSelected} onDone={() => setSelected(null)} />
                ) : (
                  <div className="flex flex-col items-start gap-2 px-5 py-8">
                    <p className="font-heading text-lg font-semibold">Order ticket</p>
                    <p className="text-sm text-muted-foreground">
                      Pick a stock from the market, or tap a stock under a news story, to see its price impact and place an order.
                    </p>
                  </div>
                )}
              </section>
              {/* One feed at a time: none here while the News tab or the beside-market column shows it. */}
              {effectivePlacement === "panel" && tab !== "news" && <NewsPanel allowBeside={canShowBeside} />}
            </div>
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
        {TABS.map((t) => tabButton(t, "phone"))}
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
  /** Shown under the header row, inside the sticky area (breaking news). */
  banner?: ReactNode
}

function TeamHeader({ me, status, round, fetchedAt, connected, banner }: TeamHeaderProps) {
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
      {banner}
    </header>
  )
}
