import type { StockView } from "@tradetech/contracts"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { formatChange, formatPrice, formatShares, trend } from "@/lib/format"
import { useMarket, usePortfolio } from "@/lib/queries"
import { cn } from "@/lib/utils"

interface MarketScreenProps {
  onSelect: (stock: StockView) => void
}

export function MarketScreen({ onSelect }: MarketScreenProps) {
  const market = useMarket()
  const portfolio = usePortfolio()
  const held = new Map(portfolio.data?.positions.map((p) => [p.stockId, p.quantity]))

  if (market.isPending) return <ListSkeleton />
  if (market.isError) return <p className="px-4 py-6 text-destructive">{market.error.message}</p>

  const bySector = groupBySector(market.data.stocks)
  return (
    <div className="flex flex-col gap-6 pb-4">
      {[...bySector].map(([sector, stocks]) => (
        <section key={sector} aria-labelledby={`sector-${sector}`}>
          <h2 id={`sector-${sector}`} className="px-4 pb-1 text-sm font-medium text-muted-foreground">
            {sector}
          </h2>
          <ul className="divide-y divide-border border-y border-border bg-card">
            {stocks.map((stock) => (
              <li key={stock.id}>
                <StockRow stock={stock} held={held.get(stock.id) ?? 0} onSelect={onSelect} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function groupBySector(stocks: readonly StockView[]): Map<string, StockView[]> {
  const groups = new Map<string, StockView[]>()
  for (const stock of stocks) groups.set(stock.sector, [...(groups.get(stock.sector) ?? []), stock])
  return groups
}

function StockRow({ stock, held, onSelect }: { stock: StockView; held: number; onSelect: (s: StockView) => void }) {
  const direction = trend(stock.change)
  return (
    <button
      type="button"
      onClick={() => onSelect(stock)}
      className="flex w-full items-center gap-3 px-4 py-3 text-left outline-none focus-visible:bg-muted active:bg-muted"
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-2 font-semibold">
          {stock.ticker}
          {stock.halted && <Badge variant="destructive">Halted</Badge>}
          {!stock.halted && stock.pausedUntil && <Badge variant="outline">News pause</Badge>}
        </span>
        <span className="truncate text-sm text-muted-foreground">
          {stock.name}
          {held !== 0 && ` — ${held > 0 ? "you hold" : "you are short"} ${formatShares(Math.abs(held))}`}
        </span>
      </span>
      <span className="figures flex flex-col items-end">
        <span className="font-semibold">{formatPrice(stock.mid)}</span>
        <span className={cn("text-sm", direction === "gain" && "text-gain", direction === "loss" && "text-loss", direction === "flat" && "text-muted-foreground")}>
          {formatChange(stock.change)}
        </span>
      </span>
    </button>
  )
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-4 py-4" aria-busy="true" aria-label="Loading market">
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  )
}
