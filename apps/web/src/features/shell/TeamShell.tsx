import type { Me, RoomStatus, StockView } from "@tradetech/contracts"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { ActivityScreen } from "@/features/activity/ActivityScreen"
import { MarketScreen } from "@/features/market/MarketScreen"
import { NewsScreen } from "@/features/news/NewsScreen"
import { OrderSlip } from "@/features/order/OrderSlip"
import { PortfolioScreen } from "@/features/portfolio/PortfolioScreen"
import { api } from "@/lib/api"
import { formatClock, useCountdown } from "@/lib/countdown"
import { useLiveUpdates } from "@/lib/live"
import { useMarket, useNews } from "@/lib/queries"
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
  const { connected } = useLiveUpdates(true)
  const market = useMarket()
  const queryClient = useQueryClient()
  const logout = useMutation({
    mutationFn: () => api.post("/auth/logout"),
    onSuccess: () => queryClient.clear(),
  })
  const status = market.data?.roomStatus
  const round = market.data?.round
  const remaining = useCountdown(round, market.dataUpdatedAt)
  const news = useNews()
  const [seenNews, setSeenNews] = useState(0)
  const newsCount = news.data?.length ?? 0
  const unread = tab === "news" ? 0 : Math.max(0, newsCount - seenNews)
  const openTab = (next: Tab) => {
    if (next === "news" || tab === "news") setSeenNews(newsCount)
    setTab(next)
  }
  // Keep the open slip showing the latest quote for its stock.
  const liveSelected = selected ? (market.data?.stocks.find((s) => s.id === selected.id) ?? selected) : null

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-lg flex-col">
      <header className="sticky top-0 z-10 flex flex-col gap-0.5 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <h1 className="truncate font-semibold">{me.teamName}</h1>
          {round && round.status !== "ended" && (
            <p className="figures text-lg font-semibold" aria-label="Time left in round">
              {round.status === "paused" ? "Paused" : round.status === "pending" ? "Starting soon" : formatClock(remaining ?? 0)}
            </p>
          )}
          <Button variant="ghost" size="sm" onClick={() => logout.mutate()}>
            Sign out
          </Button>
        </div>
        <p className={cn("text-sm", status === "live" ? "text-gain" : "text-muted-foreground")}>
          {me.roomName} — {status ? STATUS_COPY[status] : "Connecting…"}
          {round?.status === "ended" && status !== "closed" && " — round over, waiting for the next one"}
          {!connected && status && " (reconnecting…)"}
        </p>
      </header>

      <main className="flex-1 pt-4">
        {tab === "market" && <MarketScreen onSelect={setSelected} />}
        {tab === "news" && <NewsScreen />}
        {tab === "portfolio" && <PortfolioScreen />}
        {tab === "activity" && <ActivityScreen />}
      </main>

      <nav aria-label="Sections" className="sticky bottom-0 grid grid-cols-4 border-t border-border bg-background pb-[env(safe-area-inset-bottom)]">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-current={tab === t.id ? "page" : undefined}
            onClick={() => openTab(t.id)}
            className={cn(
              "h-14 text-sm font-medium outline-none focus-visible:bg-muted",
              tab === t.id ? "text-foreground shadow-[inset_0_2px_0_var(--foreground)]" : "text-muted-foreground",
            )}
          >
            {t.label}
            {t.id === "news" && unread > 0 && (
              <span className="ml-1 inline-flex min-w-5 justify-center rounded-full bg-slip px-1.5 text-xs font-semibold text-slip-foreground">{unread}</span>
            )}
          </button>
        ))}
      </nav>

      <Sheet open={liveSelected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent side="bottom" className="max-h-[92svh] overflow-y-auto rounded-t-2xl pt-6">
          <SheetTitle className="sr-only">Trade {liveSelected?.ticker}</SheetTitle>
          {liveSelected && <OrderSlip key={liveSelected.id} stock={liveSelected} onDone={() => setSelected(null)} />}
        </SheetContent>
      </Sheet>
    </div>
  )
}
