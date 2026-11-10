import type { OrderView } from "@tradetech/contracts"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { formatPaise, formatPrice, formatShares } from "@/lib/format"
import { useOrders } from "@/lib/queries"
import { cn } from "@/lib/utils"

const time = new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
const INTENT_LABEL = { buy: "Buy", sell: "Sell", short: "Short", cover: "Cover" } as const

const StatusBadge = ({ order }: { order: OrderView }) =>
  order.status === "filled" ? <Badge variant="positive">Filled</Badge> : <Badge variant="destructive">Not filled</Badge>

const cashText = (o: OrderView) => `${(o.cashDeltaPaise ?? 0) < 0 ? "paid" : "received"} ${formatPaise(Math.abs(o.cashDeltaPaise ?? 0))}`

export function ActivityScreen({ layout }: { layout: "table" | "list" }) {
  const orders = useOrders()
  if (orders.isPending) return <Skeleton className="m-4 h-40" />
  if (orders.isError) return <p className="px-4 py-6 text-destructive">{orders.error.message}</p>
  if (orders.data.length === 0) {
    return (
      <p className={cn("rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground", layout === "list" && "mx-4")}>
        Your orders will appear here once you trade.
      </p>
    )
  }

  if (layout === "table") {
    return (
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="figures w-full text-sm">
          <thead className="border-b border-border text-xs text-muted-foreground">
            <tr>
              {["Time", "Order", "Status", "Average price", "Cash", "Details"].map((h, i) => (
                <th key={h} scope="col" className={cn("px-4 py-2.5 font-medium", i < 3 || i === 5 ? "text-left" : "text-right")}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {orders.data.map((o) => (
              <tr key={o.id}>
                <td className="px-4 py-3 text-muted-foreground">{time.format(new Date(o.acceptedAt))}</td>
                <th scope="row" className="px-4 py-3 text-left font-medium">
                  {INTENT_LABEL[o.intent]} {formatShares(o.quantity)} {o.ticker}
                </th>
                <td className="px-4 py-3">
                  <StatusBadge order={o} />
                </td>
                <td className="px-4 py-3 text-right">{o.status === "filled" ? formatPrice(o.averagePrice ?? 0) : "—"}</td>
                <td className="px-4 py-3 text-right">{o.status === "filled" ? cashText(o) : "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{o.status === "filled" ? "" : o.rejectMessage}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <ul className="divide-y divide-border border-y border-border bg-surface">
      {orders.data.map((o) => (
        <li key={o.id} className="flex flex-col gap-1 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium">
              {INTENT_LABEL[o.intent]} {formatShares(o.quantity)} {o.ticker}
            </span>
            <StatusBadge order={o} />
          </div>
          <div className="figures flex justify-between gap-3 text-sm text-muted-foreground">
            <span>{time.format(new Date(o.acceptedAt))}</span>
            {o.status === "filled" ? (
              <span>
                {formatPrice(o.averagePrice ?? 0)} avg — {cashText(o)}
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
