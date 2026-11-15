import type { OrderIntent, OrderPreview, PlaceOrderResult, StockView } from "@tradetech/contracts"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api, ApiError, NetworkError } from "@/lib/api"
import { PriceChart } from "@/components/charts/PriceChart"
import { PriceChange } from "@/components/price-change"
import { useNewsContext } from "@/features/news/news-context"
import { formatPaise, formatPrice, formatShares } from "@/lib/format"
import { queryKeys } from "@/lib/live"
import { useMarket, usePortfolio, useStockHistory } from "@/lib/queries"
import { cn } from "@/lib/utils"
import { tradingGate, type TradingGate } from "./trading-gate"

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
  const market = useMarket()
  const held = portfolio.data?.positions.find((p) => p.stockId === stock.id)?.quantity ?? 0
  const allowed = allowedIntents(held, stock.shortable)

  const [intent, setIntent] = useState<OrderIntent>(held < 0 ? "cover" : "buy")
  const [quantityText, setQuantityText] = useState("")
  const [limitText, setLimitText] = useState("")
  const quantity = Number.parseInt(quantityText, 10)
  const limitPrice = limitText ? Number.parseFloat(limitText) : undefined
  const ticket = useMemo(
    () => ({ stockId: stock.id, intent, quantity, ...(limitPrice && limitPrice > 0 ? { limitPrice } : {}) }),
    [stock.id, intent, quantity, limitPrice]
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

  const gate = tradingGate({
    roomStatus: market.data?.roomStatus,
    round: market.data ? market.data.round : undefined,
    halted: stock.halted,
    newsPaused,
    ticker: stock.ticker,
  })
  const chosen = INTENTS.find((i) => i.intent === intent)!
  // Selling or covering everything: the one size a team often wants and can't guess.
  const closeAll = (intent === "sell" && held > 0) || (intent === "cover" && held < 0) ? Math.abs(held) : null
  const blocked = !gate.open || !validQuantity || !allowed.has(intent) || place.isPending || previewBlocks
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

        <StockChart stock={stock} />

        {stock.profile && <p className="text-sm leading-relaxed text-muted-foreground">{stock.profile}</p>}

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
                  "h-10 rounded-md font-heading text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-35",
                  !active && "text-muted-foreground hover:text-foreground",
                  active && option.side === "gain" && "bg-gain text-background",
                  active && option.side === "loss" && "bg-loss text-background"
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
            {closeAll !== null && (
              <button
                type="button"
                onClick={() => setQuantityText(String(closeAll))}
                className={cn(
                  "figures h-8 rounded-md border border-border px-2.5 text-xs font-semibold transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                  quantity === closeAll && "border-foreground bg-muted"
                )}
              >
                {intent === "sell" ? "Sell" : "Cover"} all {formatShares(closeAll)}
              </button>
            )}
            {QUICK_SIZES.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setQuantityText(String(n))}
                className={cn(
                  "figures h-8 min-w-14 rounded-md border border-border px-2.5 text-xs font-medium transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                  quantity === n && "border-foreground bg-muted"
                )}
              >
                {formatShares(n)}
              </button>
            ))}
          </div>
        </div>

        <Estimate
          preview={validQuantity ? preview.data : undefined}
          error={validQuantity && preview.error instanceof ApiError ? preview.error.message : null}
          pending={validQuantity && preview.isFetching}
          marketOpen={gate.open}
          onUseMax={(n) => setQuantityText(String(n))}
        />

        <div aria-live="polite" className="contents">
          {rejected && (
            <p role="alert" className="text-sm text-destructive">
              Not filled: {rejected.rejectMessage}
            </p>
          )}
          {place.error && !outcomeUnknown && (
            <p role="alert" className="text-sm text-destructive">
              {place.error.message}
            </p>
          )}
          {outcomeUnknown && (
            <p role="alert" className="text-sm text-destructive">
              We couldn’t confirm this order. Tap {chosen.label} again — it will not be placed twice.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {!gate.open && <GateNotice gate={gate} />}
          <Button
            size="lg"
            variant={chosen.side === "gain" ? "buy" : "sell"}
            className="h-12 font-heading text-base"
            disabled={blocked}
            aria-describedby={gate.open ? undefined : "trading-gate"}
            onClick={() => place.mutate()}
          >
            {place.isPending ? "Sending order…" : `${chosen.label} ${validQuantity ? formatShares(quantity) : ""} ${stock.ticker}`}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** This round's price line, with news markers (brand colour when the story names this stock). */
function StockChart({ stock }: { stock: StockView }) {
  const history = useStockHistory(stock.id)
  const { items, mentionsOf } = useNewsContext()
  const markers = useMemo(
    () => items.map((n) => ({ t: n.publishedAt, label: n.headline, emphasis: mentionsOf(n).some((s) => s.id === stock.id) })),
    [items, mentionsOf, stock.id]
  )
  // The live quote may be newer than the last sample: end the line at the price shown above it.
  const points = useMemo(() => {
    const base = history.data?.points ?? []
    if (base.length === 0) return base
    const last = base.at(-1)!
    return last.mid === stock.mid ? base : [...base, { t: new Date().toISOString(), mid: stock.mid }]
  }, [history.data, stock.mid])
  return <PriceChart points={points} markers={markers} title={`${stock.ticker} price this round`} height={150} />
}

function GateNotice({ gate }: { gate: Extract<TradingGate, { open: false }> }) {
  return (
    <p
      id="trading-gate"
      role="status"
      className={cn(
        "rounded-md px-3 py-2 text-sm font-medium",
        gate.tone === "loss" && "bg-loss-tint text-loss",
        gate.tone === "warning" && "bg-warning/15 text-warning",
        gate.tone === "info" && "bg-muted text-foreground"
      )}
    >
      {gate.message}
    </p>
  )
}

interface EstimateProps {
  preview: OrderPreview | undefined
  /** The server's reason no estimate is possible (for example, before the event opens). */
  error: string | null
  pending: boolean
  marketOpen: boolean
  onUseMax: (n: number) => void
}

function Estimate({ preview, error, pending, marketOpen, onUseMax }: EstimateProps) {
  if (!preview) {
    return (
      <p className="rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
        {pending ? "Estimating…" : (error ?? "Enter a quantity to see the estimated cost before you trade.")}
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
  const costsPaise = (preview.spreadCostPaise ?? 0) + (preview.feeCostPaise ?? 0)
  return (
    <div className="flex flex-col gap-1.5">
      <dl className="figures grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 rounded-md border border-border px-3 py-3 text-sm">
        <dt className="text-muted-foreground">Fill price</dt>
        <dd className="text-right font-medium">
          {formatPrice(preview.fillPrice ?? preview.averagePrice ?? 0)}
          {preview.marketPrice !== undefined && (
            <span className="block text-xs font-normal text-muted-foreground">market {formatPrice(preview.marketPrice)}</span>
          )}
        </dd>
        <dt className="text-muted-foreground">Spread and fee</dt>
        <dd className="text-right">
          {formatPaise(costsPaise)}
          <span className="block text-xs text-muted-foreground">
            {formatPaise(preview.spreadCostPaise ?? 0)} spread + {formatPaise(preview.feeCostPaise ?? 0)} fee
          </span>
        </dd>
        <dt className="font-medium">{paying ? "You pay" : "You receive"}</dt>
        <dd className="text-right font-heading text-base font-semibold">
          {formatPaise(Math.abs(preview.cashDeltaPaise ?? 0))}
          <span className="block font-sans text-xs font-normal text-muted-foreground">{formatPrice(preview.averagePrice ?? 0)} a share, all in</span>
        </dd>
        <dt className="text-muted-foreground">Price after</dt>
        <dd className="text-right">{formatPrice(preview.midAfter ?? 0)}</dd>
      </dl>
      {!marketOpen && <p className="text-xs text-muted-foreground">Estimated at current prices. It may change by the time trading opens.</p>}
    </div>
  )
}
