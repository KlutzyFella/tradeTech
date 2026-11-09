import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { formatPaise, formatPrice, formatShares } from "@/lib/format"
import { useOrders } from "@/lib/queries"

const time = new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
const INTENT_LABEL = { buy: "Buy", sell: "Sell", short: "Short", cover: "Cover" } as const

export function ActivityScreen() {
  const orders = useOrders()
  if (orders.isPending) return <Skeleton className="m-4 h-40" />
  if (orders.isError) return <p className="px-4 py-6 text-destructive">{orders.error.message}</p>
  if (orders.data.length === 0) {
    return <p className="px-4 py-6 text-sm text-muted-foreground">Your orders will appear here once you trade.</p>
  }
  return (
    <ul className="divide-y divide-border border-y border-border">
      {orders.data.map((o) => (
        <li key={o.id} className="flex flex-col gap-1 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold">
              {INTENT_LABEL[o.intent]} {formatShares(o.quantity)} {o.ticker}
            </span>
            <Badge variant={o.status === "filled" ? "secondary" : "destructive"}>{o.status === "filled" ? "Filled" : "Not filled"}</Badge>
          </div>
          <div className="figures flex justify-between gap-3 text-sm text-muted-foreground">
            <span>{time.format(new Date(o.acceptedAt))}</span>
            {o.status === "filled" ? (
              <span>
                {formatPrice(o.averagePrice ?? 0)} avg — {(o.cashDeltaPaise ?? 0) < 0 ? "paid" : "received"}{" "}
                {formatPaise(Math.abs(o.cashDeltaPaise ?? 0))}
              </span>
            ) : (
              <span className="text-right">{o.rejectMessage}</span>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}
