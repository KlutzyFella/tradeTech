import type { OrderIntent, OrderPreview, PlaceOrderResult, StockView } from "@tradetech/contracts"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api, NetworkError } from "@/lib/api"
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

  const chosen = INTENTS.find((i) => i.intent === intent)!
  return (
    <div className="flex flex-col gap-5 px-4 pb-6">
      <header className="flex items-baseline justify-between gap-3 pr-10">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold">{stock.ticker}</h2>
          <p className="truncate text-sm text-muted-foreground">{stock.name}</p>
        </div>
        <p className="figures text-xl font-semibold">{formatPrice(stock.mid)}</p>
      </header>
      {stock.profile && <p className="text-sm text-muted-foreground">{stock.profile}</p>}
      <p className="text-sm">
        {held > 0 && `You hold ${formatShares(held)} shares.`}
        {held < 0 && `You are short ${formatShares(-held)} shares.`}
        {held === 0 && "You have no position."}
        {portfolio.data && ` Available cash ${formatPaise(portfolio.data.availableCashPaise)}.`}
      </p>

      <section className="flex flex-col gap-4 rounded-lg border-2 border-slip bg-card p-4" aria-label="Order slip">
        <div role="radiogroup" aria-label="Order type" className="grid grid-cols-4 gap-2">
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
                  "h-11 rounded-md border text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-35",
                  !active && "border-border bg-background",
                  active && option.side === "gain" && "border-gain bg-gain text-primary-foreground",
                  active && option.side === "loss" && "border-loss bg-loss text-primary-foreground",
                )}
              >
                {option.label}
              </button>
            )
          })}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="quantity">Shares</Label>
            <Input id="quantity" inputMode="numeric" value={quantityText} onChange={(e) => setQuantityText(e.target.value.replace(/\D/g, ""))} className="figures h-11 text-lg" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="limit">{intent === "buy" || intent === "cover" ? "Max avg price" : "Min avg price"}</Label>
            <Input id="limit" inputMode="decimal" placeholder="Optional" value={limitText} onChange={(e) => setLimitText(e.target.value.replace(/[^\d.]/g, ""))} className="figures h-11 text-lg" />
          </div>
        </div>

        <Estimate preview={validQuantity ? preview.data : undefined} pending={validQuantity && preview.isFetching} onUseMax={(n) => setQuantityText(String(n))} />

        {rejected && <p role="alert" className="text-sm text-destructive">Not filled: {rejected.rejectMessage}</p>}
        {place.error && !outcomeUnknown && <p role="alert" className="text-sm text-destructive">{place.error.message}</p>}
        {outcomeUnknown && (
          <p role="alert" className="text-sm text-destructive">
            We couldn’t confirm this order. Tap {chosen.label} again — it will not be placed twice.
          </p>
        )}

        <Button
          size="lg"
          className="h-12 bg-slip text-base text-slip-foreground hover:bg-slip/90"
          disabled={!validQuantity || !allowed.has(intent) || stock.halted || place.isPending || previewBlocks}
          onClick={() => place.mutate()}
        >
          {place.isPending ? "Sending order…" : `${chosen.label} ${validQuantity ? formatShares(quantity) : ""} ${stock.ticker}`}
        </Button>
      </section>
    </div>
  )
}

function Estimate({ preview, pending, onUseMax }: { preview: OrderPreview | undefined; pending: boolean; onUseMax: (n: number) => void }) {
  if (!preview) return <p className="text-sm text-muted-foreground">{pending ? "Estimating…" : "Enter a quantity to see the estimated cost."}</p>
  if (!preview.ok) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm text-destructive">
        <span>{preview.message}</span>
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
    <dl className="figures grid grid-cols-2 gap-y-1 text-sm">
      <dt className="text-muted-foreground">Estimated average</dt>
      <dd className="text-right font-medium">{formatPrice(preview.averagePrice ?? 0)}</dd>
      <dt className="text-muted-foreground">{paying ? "You pay" : "You receive"}</dt>
      <dd className="text-right font-medium">{formatPaise(Math.abs(preview.cashDeltaPaise ?? 0))}</dd>
      <dt className="text-muted-foreground">Price after</dt>
      <dd className="text-right">{formatPrice(preview.midAfter ?? 0)}</dd>
    </dl>
  )
}
