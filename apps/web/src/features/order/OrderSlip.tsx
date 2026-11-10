import type { OrderIntent, OrderPreview, PlaceOrderResult, StockView } from "@tradetech/contracts"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api, NetworkError } from "@/lib/api"
import { PriceChange } from "@/components/price-change"
import { formatPaise, formatPrice, formatShares } from "@/lib/format"
import { queryKeys } from "@/lib/live"
import { usePortfolio } from "@/lib/queries"
import { cn } from "@/lib/utils"

const INTENTS: readonly { intent: OrderIntent; label: string; past: string; side: "gain" | "loss" }[] = [
  { intent: "buy", label: "Buy", past: "Bought", side: "gain" },
  { intent: "sell", label: "Sell", past: "Sold", side: "loss" },
  { intent: "short", label: "Short", past: "Shorted", side: "loss" },
  { intent: "cover", label: "Cover", past: "Covered", side: "gain" },
]
const PREVIEW_DEBOUNCE_MS = 250

function allowedIntents(held: number, shortable: boolean): Set<OrderIntent> {
  if (held > 0) return new Set(["buy", "sell"])
  if (held < 0) return new Set(["short", "cover"])
  return new Set(shortable ? ["buy", "short"] : ["buy"])
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return debounced
}

interface OrderSlipProps {
  stock: StockView
  onDone: () => void
}

/** Quick sizes for thumbs: tap to fill the quantity. */
const QUICK_SIZES = [100, 500, 1000, 5000] as const

export function OrderSlip({ stock, onDone }: OrderSlipProps) {
  const queryClient = useQueryClient()
  const portfolio = usePortfolio()
  const held = portfolio.data?.positions.find((p) => p.stockId === stock.id)?.quantity ?? 0
  const allowed = allowedIntents(held, stock.shortable)

  const [intent, setIntent] = useState<OrderIntent>(held < 0 ? "cover" : "buy")
  const [quantityText, setQuantityText] = useState("")
  const [limitText, setLimitText] = useState("")
  const quantity = Number.parseInt(quantityText, 10)
  const limitPrice = limitText ? Number.parseFloat(limitText) : undefined
  const ticket = useMemo(
    () => ({ stockId: stock.id, intent, quantity, ...(limitPrice && limitPrice > 0 ? { limitPrice } : {}) }),
    [stock.id, intent, quantity, limitPrice],
  )
  const validQuantity = Number.isSafeInteger(quantity) && quantity > 0

  // The requestId survives only while an order's outcome is unknown (network
  // failure), so tapping again is a safe retry the server executes at most
  // once. Any change to the ticket, or any definitive answer, starts a new one.
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [ticketForId, setTicketForId] = useState(ticket)
  if (ticketForId !== ticket) {
    setTicketForId(ticket)
    setRequestId(crypto.randomUUID())
  }

  const debouncedTicket = useDebounced(ticket, PREVIEW_DEBOUNCE_MS)
  const preview = useQuery({
    queryKey: ["preview", debouncedTicket],
    queryFn: () => api.post<OrderPreview>("/orders/preview", debouncedTicket),
    enabled: validQuantity && allowed.has(intent) && debouncedTicket === ticket,
    staleTime: 0,
    retry: false,
  })

  const place = useMutation({
    mutationFn: () => api.post<PlaceOrderResult>("/orders", { ...ticket, requestId }),
    onSettled: (_data, error) => {
      if (!(error instanceof NetworkError)) setRequestId(crypto.randomUUID())
    },
    onSuccess: ({ order }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.portfolio })
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders })
      void queryClient.invalidateQueries({ queryKey: queryKeys.market })
      if (order.status === "filled") {
        const verb = INTENTS.find((i) => i.intent === order.intent)?.past ?? "Filled"
        toast.success(`${verb} ${formatShares(order.quantity)} ${order.ticker} at ${formatPrice(order.averagePrice ?? 0)} average`)
        onDone()
      }
    },
  })
  // Block only on a preview of exactly this ticket; the server re-checks anyway.
  const previewBlocks = preview.data?.ok === false && debouncedTicket === ticket
  const rejected = place.data?.order.status === "rejected" ? place.data.order : null
  const outcomeUnknown = place.error instanceof NetworkError
  // The server sends pausedUntil only while the pause is in force; flip it off locally at expiry.
  const [expiredPause, setExpiredPause] = useState<string | null>(null)
  useEffect(() => {
    const until = stock.pausedUntil
    if (!until) return
    const id = setTimeout(() => setExpiredPause(until), Math.max(0, new Date(until).getTime() - Date.now()))
    return () => clearTimeout(id)
  }, [stock.pausedUntil])
  const newsPaused = stock.pausedUntil !== null && expiredPause !== stock.pausedUntil

  const chosen = INTENTS.find((i) => i.intent === intent)!
  const blocked = !validQuantity || !allowed.has(intent) || stock.halted || newsPaused || place.isPending || previewBlocks
  return (
    <div className="flex flex-col">
      <div aria-hidden className={cn("h-1 rounded-t-lg", chosen.side === "gain" ? "bg-gain" : "bg-loss")} />
      <div className="flex flex-col gap-5 px-5 pt-4 pb-6">
        <header className="flex items-start justify-between gap-3 pr-8 lg:pr-0">
          <div className="min-w-0">
            <h2 className="text-2xl font-semibold tracking-wide">{stock.ticker}</h2>
            <p className="truncate text-sm text-muted-foreground">
              {stock.name}, {stock.sector}
            </p>
          </div>
          <div className="flex flex-col items-end">
            <p className="figures font-heading text-2xl font-semibold">{formatPrice(stock.mid)}</p>
            <PriceChange value={stock.change} className="text-sm" />
          </div>
        </header>

        {stock.profile && <p className="text-sm leading-relaxed text-muted-foreground">{stock.profile}</p>}
        {stock.halted && (
          <p role="status" className="rounded-md bg-loss-tint px-3 py-2 text-sm font-medium text-loss">
            Trading in {stock.ticker} is halted by the host.
          </p>
        )}
        {!stock.halted && newsPaused && (
          <p role="status" className="rounded-md bg-warning/15 px-3 py-2 text-sm font-medium text-warning">
            Trading reopens in a few seconds while prices update for the news.
          </p>
        )}

        <dl className="figures grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-md bg-muted px-3 py-2">
            <dt className="text-xs text-muted-foreground">Your position</dt>
            <dd className={cn("font-medium", held > 0 && "text-gain", held < 0 && "text-loss")}>
              {held > 0 ? `Long ${formatShares(held)}` : held < 0 ? `Short ${formatShares(-held)}` : "None"}
            </dd>
          </div>
          <div className="rounded-md bg-muted px-3 py-2">
            <dt className="text-xs text-muted-foreground">Available cash</dt>
            <dd className="font-medium">{portfolio.data ? formatPaise(portfolio.data.availableCashPaise) : "…"}</dd>
          </div>
        </dl>

        <div role="radiogroup" aria-label="Order type" className="grid grid-cols-4 gap-1.5 rounded-lg bg-muted p-1">
          {INTENTS.map((option) => {
            const active = option.intent === intent
            return (
              <button
                key={option.intent}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={!allowed.has(option.intent) || stock.halted}
                onClick={() => setIntent(option.intent)}
                className={cn(
                  "h-10 rounded-md font-heading text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-35",
                  !active && "text-muted-foreground hover:text-foreground",
                  active && option.side === "gain" && "bg-gain text-background",
                  active && option.side === "loss" && "bg-loss text-background",
                )}
              >
                {option.label}
              </button>
            )
          })}
        </div>

        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="quantity">Shares</Label>
              <Input
                id="quantity"
                inputMode="numeric"
                autoComplete="off"
                value={quantityText}
                onChange={(e) => setQuantityText(e.target.value.replace(/\D/g, ""))}
                className="figures h-11 text-lg"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="limit">{intent === "buy" || intent === "cover" ? "Max avg price" : "Min avg price"}</Label>
              <Input
                id="limit"
                inputMode="decimal"
                autoComplete="off"
                placeholder="Optional"
                value={limitText}
                onChange={(e) => setLimitText(e.target.value.replace(/[^\d.]/g, ""))}
                className="figures h-11 text-lg"
              />
            </div>
          </div>
          <div role="group" aria-label="Quick sizes" className="flex flex-wrap gap-1.5">
            {QUICK_SIZES.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setQuantityText(String(n))}
                className={cn(
                  "figures h-8 min-w-14 rounded-md border border-border px-2.5 text-xs font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                  quantity === n && "border-foreground bg-muted",
                )}
              >
                {formatShares(n)}
              </button>
            ))}
          </div>
        </div>

        <Estimate preview={validQuantity ? preview.data : undefined} pending={validQuantity && preview.isFetching} onUseMax={(n) => setQuantityText(String(n))} />

        <div aria-live="polite" className="contents">
          {rejected && <p role="alert" className="text-sm text-destructive">Not filled: {rejected.rejectMessage}</p>}
          {place.error && !outcomeUnknown && <p role="alert" className="text-sm text-destructive">{place.error.message}</p>}
          {outcomeUnknown && (
            <p role="alert" className="text-sm text-destructive">
              We couldn’t confirm this order. Tap {chosen.label} again — it will not be placed twice.
            </p>
          )}
        </div>

        <Button size="lg" variant={chosen.side === "gain" ? "buy" : "sell"} className="h-12 font-heading text-base" disabled={blocked} onClick={() => place.mutate()}>
          {place.isPending ? "Sending order…" : `${chosen.label} ${validQuantity ? formatShares(quantity) : ""} ${stock.ticker}`}
        </Button>
      </div>
    </div>
  )
}

function Estimate({ preview, pending, onUseMax }: { preview: OrderPreview | undefined; pending: boolean; onUseMax: (n: number) => void }) {
  if (!preview) {
    return (
      <p className="rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
        {pending ? "Estimating…" : "Enter a quantity to see the estimated cost before you trade."}
      </p>
    )
  }
  if (!preview.ok) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md bg-loss-tint px-3 py-2.5 text-sm text-loss">
        <span className="flex-1">{preview.message}</span>
        {preview.maxQuantity !== undefined && preview.maxQuantity > 0 && (
          <Button variant="outline" size="sm" onClick={() => onUseMax(preview.maxQuantity!)}>
            Use {formatShares(preview.maxQuantity)}
          </Button>
        )}
      </div>
    )
  }
  const paying = (preview.cashDeltaPaise ?? 0) < 0
  return (
    <dl className="figures grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 rounded-md border border-border px-3 py-3 text-sm">
      <dt className="text-muted-foreground">Estimated average</dt>
      <dd className="text-right font-medium">{formatPrice(preview.averagePrice ?? 0)}</dd>
      <dt className="text-muted-foreground">{paying ? "You pay" : "You receive"}</dt>
      <dd className="text-right font-heading text-base font-semibold">{formatPaise(Math.abs(preview.cashDeltaPaise ?? 0))}</dd>
      <dt className="text-muted-foreground">Price after</dt>
      <dd className="text-right">{formatPrice(preview.midAfter ?? 0)}</dd>
    </dl>
  )
}
