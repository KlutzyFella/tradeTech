import type { StockView } from "@tradetech/contracts"
import { PriceChange } from "@/components/price-change"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { formatPrice, formatShares } from "@/lib/format"
import { useMarket, usePortfolio } from "@/lib/queries"
import { useFlash } from "@/lib/use-flash"
import { cn } from "@/lib/utils"

interface MarketScreenProps {
  onSelect: (stock: StockView) => void
  selectedId: string | null
  /** "table": columns for laptop screens; "list": compact rows for phones. */
  layout: "table" | "list"
}

/** Desk columns: stock, (sector from xl), price, change, position, state. */
const TABLE_COLUMNS =
  "grid-cols-[minmax(9rem,1.6fr)_7rem_6rem_minmax(6.5rem,1fr)_5.5rem] xl:grid-cols-[minmax(10rem,1.6fr)_minmax(6rem,1fr)_7rem_6rem_minmax(7rem,1fr)_5.5rem]"

export function MarketScreen({ onSelect, selectedId, layout }: MarketScreenProps) {
  const market = useMarket()
  const portfolio = usePortfolio()
  const held = new Map(portfolio.data?.positions.map((p) => [p.stockId, p.quantity]))

  if (market.isPending) return <ListSkeleton />
  if (market.isError) return <p className="px-4 py-6 text-destructive">{market.error.message}</p>
  if (market.data.stocks.length === 0) {
    return <p className="px-4 py-6 text-sm text-muted-foreground">No stocks yet. Your host is still setting up the market.</p>
  }
  const bySector = groupBySector(market.data.stocks)

  if (layout === "table") {
    return (
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <div aria-hidden className={cn("grid gap-4 border-b border-border px-4 py-2.5 text-xs text-muted-foreground", TABLE_COLUMNS)}>
          <span>Stock</span>
          <span className="max-xl:hidden">Sector</span>
          <span className="text-right">Price</span>
          <span className="text-right">Today</span>
          <span className="text-right">Your position</span>
          <span className="text-right">Status</span>
        </div>
        <ul className="divide-y divide-border">
          {market.data.stocks.map((stock) => (
            <li key={stock.id}>
              <TableRow stock={stock} held={held.get(stock.id) ?? 0} selected={stock.id === selectedId} onSelect={onSelect} />
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 pb-4">
      {[...bySector].map(([sector, stocks]) => (
        <section key={sector} aria-labelledby={`sector-${sector}`}>
          <h2 id={`sector-${sector}`} className="px-4 pb-1.5 text-xs font-medium tracking-wide text-muted-foreground">
            {sector}
          </h2>
          <ul className="divide-y divide-border border-y border-border bg-surface">
            {stocks.map((stock) => (
              <li key={stock.id}>
                <ListRow stock={stock} held={held.get(stock.id) ?? 0} onSelect={onSelect} />
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

function StateBadge({ stock }: { stock: StockView }) {
  if (stock.halted) return <Badge variant="destructive">Halted</Badge>
  if (stock.pausedUntil) return <Badge variant="warning">News pause</Badge>
  return null
}

function heldLabel(held: number): string | null {
  if (held > 0) return `Long ${formatShares(held)}`
  if (held < 0) return `Short ${formatShares(-held)}`
  return null
}

function Price({ value, className }: { value: number; className?: string }) {
  const flash = useFlash(value)
  return (
    <span key={flash.key} className={cn("figures rounded-sm px-1 font-semibold", flash.className, className)}>
      {formatPrice(value)}
    </span>
  )
}

interface RowProps {
  stock: StockView
  held: number
  onSelect: (s: StockView) => void
}

function TableRow({ stock, held, selected, onSelect }: RowProps & { selected: boolean }) {
  const position = heldLabel(held)
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(stock)}
      className={cn(
        "grid w-full items-center gap-4 px-4 py-3 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        TABLE_COLUMNS,
        selected && "bg-muted shadow-[inset_3px_0_0_var(--brand-text)]",
      )}
    >
      <span className="flex min-w-0 flex-col">
        <span translate="no" className="font-heading font-semibold tracking-wide">
          {stock.ticker}
        </span>
        <span className="truncate text-sm text-muted-foreground">{stock.name}</span>
      </span>
      <span className="truncate text-sm text-muted-foreground max-xl:hidden">{stock.sector}</span>
      <span className="text-right">
        <Price value={stock.mid} />
      </span>
      <span className="text-right text-sm">
        <PriceChange value={stock.change} />
      </span>
      <span className={cn("figures text-right text-sm", held > 0 && "text-gain", held < 0 && "text-loss", !position && "text-muted-foreground")}>
        {position ?? "—"}
      </span>
      <span className="flex justify-end">
        <StateBadge stock={stock} />
      </span>
    </button>
  )
}

function ListRow({ stock, held, onSelect }: RowProps) {
  const position = heldLabel(held)
  return (
    <button
      type="button"
      onClick={() => onSelect(stock)}
      className="flex w-full items-center gap-3 px-4 py-3 text-left outline-none active:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span translate="no" className="flex items-center gap-2 font-heading font-semibold tracking-wide">
          {stock.ticker}
          <StateBadge stock={stock} />
        </span>
        <span className="truncate text-sm text-muted-foreground">
          {stock.name}
          {position && ` — ${position}`}
        </span>
      </span>
      <span className="flex flex-col items-end gap-0.5">
        <Price value={stock.mid} className="-mr-1" />
        <PriceChange value={stock.change} className="text-sm" />
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
