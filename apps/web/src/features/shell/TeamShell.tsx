import type { Me, RoomStatus, StockView } from "@tradetech/contracts"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { ActivityScreen } from "@/features/activity/ActivityScreen"
import { MarketScreen } from "@/features/market/MarketScreen"
import { OrderSlip } from "@/features/order/OrderSlip"
import { PortfolioScreen } from "@/features/portfolio/PortfolioScreen"
import { api } from "@/lib/api"
import { useLiveUpdates } from "@/lib/live"
import { useMarket } from "@/lib/queries"
import { cn } from "@/lib/utils"

type Tab = "market" | "portfolio" | "activity"
const TABS: readonly { id: Tab; label: string }[] = [
  { id: "market", label: "Market" },
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
  // Keep the open slip showing the latest quote for its stock.
  const liveSelected = selected ? (market.data?.stocks.find((s) => s.id === selected.id) ?? selected) : null

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-lg flex-col">
      <header className="sticky top-0 z-10 flex flex-col gap-0.5 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <h1 className="truncate font-semibold">{me.teamName}</h1>
          <Button variant="ghost" size="sm" onClick={() => logout.mutate()}>
            Sign out
          </Button>
        </div>
        <p className={cn("text-sm", status === "live" ? "text-gain" : "text-muted-foreground")}>
          {me.roomName} — {status ? STATUS_COPY[status] : "Connecting…"}
          {!connected && status && " (reconnecting…)"}
        </p>
      </header>

      <main className="flex-1 pt-4">
        {tab === "market" && <MarketScreen onSelect={setSelected} />}
        {tab === "portfolio" && <PortfolioScreen />}
        {tab === "activity" && <ActivityScreen />}
      </main>

      <nav aria-label="Sections" className="sticky bottom-0 grid grid-cols-3 border-t border-border bg-background pb-[env(safe-area-inset-bottom)]">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-current={tab === t.id ? "page" : undefined}
            onClick={() => setTab(t.id)}
            className={cn(
              "h-14 text-sm font-medium outline-none focus-visible:bg-muted",
              tab === t.id ? "text-foreground shadow-[inset_0_2px_0_var(--foreground)]" : "text-muted-foreground",
            )}
          >
            {t.label}
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
