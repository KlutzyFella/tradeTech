import type { HostMonitorView, MarginLevel, MonitorTeam, MonitorTrade, OrderIntent } from "@tradetech/contracts"
import { Badge } from "@/components/ui/badge"
import { formatPaiseWhole, formatPrice, formatShares } from "@/lib/format"
import { useHostMonitor } from "@/lib/host-queries"
import { DESKTOP_QUERY, useMediaQuery } from "@/lib/use-media-query"
import { timeAgo, useNow } from "@/lib/use-now"
import { cn } from "@/lib/utils"

const PAST_TENSE: Record<OrderIntent, string> = { buy: "bought", sell: "sold", short: "shorted", cover: "covered" }
const SEVERITY: Record<MarginLevel, number> = { breach: 0, watch: 1, ok: 2, none: 3 }
const clock = new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })

/** Teams at risk first, then everyone else in a stable order. */
export const byUrgency = (teams: readonly MonitorTeam[]): MonitorTeam[] =>
  [...teams].sort((a, b) => SEVERITY[a.marginLevel] - SEVERITY[b.marginLevel] || a.name.localeCompare(b.name))

export const marginAlertCount = (view: HostMonitorView | undefined): number =>
  view?.teams.filter((t) => t.marginLevel === "watch" || t.marginLevel === "breach").length ?? 0

export function MonitorPanel({ roomId }: { roomId: string }) {
  const monitor = useHostMonitor(roomId)
  const now = useNow(5000)
  const desktop = useMediaQuery(DESKTOP_QUERY)
  if (monitor.isPending) return <p className="text-sm text-muted-foreground">Loading the monitor…</p>
  if (monitor.isError) return <p className="text-sm text-destructive">{monitor.error.message}</p>
  const view = monitor.data
  const online = view.teams.filter((t) => t.connections > 0).length
  const alerts = marginAlertCount(view)
  const teams = byUrgency(view.teams)

  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Teams online" value={`${online} of ${view.teams.length}`} />
        <Stat
          label="Orders, last minute"
          value={String(view.lastMinute.filled + view.lastMinute.rejected)}
          detail={view.lastMinute.rejected > 0 ? `${view.lastMinute.rejected} rejected` : undefined}
        />
        <Stat label="Traded, last minute" value={formatPaiseWhole(view.lastMinute.valuePaise)} />
        <Stat label="Margin alerts" value={String(alerts)} tone={alerts > 0 ? "warning" : undefined} />
      </dl>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_28rem]">
        <section aria-labelledby="monitor-teams" className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="monitor-teams" className="text-lg font-semibold">
              Teams
            </h2>
            <p className="text-sm text-muted-foreground">Teams near liquidation are listed first.</p>
          </div>
          {teams.length === 0 ? (
            <p className="text-sm text-muted-foreground">Add teams on the Setup tab.</p>
          ) : desktop ? (
            <TeamTable teams={teams} now={now} />
          ) : (
            <TeamList teams={teams} now={now} />
          )}
        </section>
        <TradeFeed trades={view.trades} />
      </div>
    </div>
  )
}

function Stat({ label, value, detail, tone }: { label: string; value: string; detail?: string | undefined; tone?: "warning" | undefined }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface px-4 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("figures font-heading text-2xl font-semibold", tone === "warning" && "text-warning")}>{value}</dd>
      {detail && <dd className="text-xs text-muted-foreground">{detail}</dd>}
    </div>
  )
}

function Connection({ team }: { team: MonitorTeam }) {
  const online = team.connections > 0
  return (
    <span className={cn("inline-flex items-center gap-2", !online && "text-muted-foreground")}>
      <span aria-hidden className={cn("size-2 rounded-full", online ? "bg-gain" : "bg-muted-foreground/50")} />
      {online ? (team.connections === 1 ? "Online" : `Online, ${team.connections} devices`) : "Offline"}
    </span>
  )
}

function Margin({ team }: { team: MonitorTeam }) {
  if (team.status !== "active") return <span className="text-muted-foreground capitalize">{team.status}</span>
  const ratio = team.marginHeadroom === null ? "" : ` (${team.marginHeadroom.toFixed(2)}×)`
  switch (team.marginLevel) {
    case "breach":
      return <span className="font-semibold text-destructive">Being liquidated{ratio}</span>
    case "watch":
      return <span className="font-semibold text-warning">Near liquidation{ratio}</span>
    case "ok":
      return <span>Safe{ratio}</span>
    default:
      return <span className="text-muted-foreground">No positions</span>
  }
}

const lastOrder = (team: MonitorTeam, now: number) => (team.lastOrderAt ? timeAgo(team.lastOrderAt, now) : "No orders yet")

function TeamTable({ teams, now }: { teams: readonly MonitorTeam[]; now: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="figures w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr className="border-b border-border">
            <th scope="col" className="py-2 pr-3 font-medium">
              Team
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Connection
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Last order
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">
              Orders/min
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">
              Value
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">
              Exposure
            </th>
            <th scope="col" className="py-2 font-medium">
              Margin
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {teams.map((t) => (
            <tr key={t.teamId} className={cn(t.marginLevel === "breach" && "bg-loss-tint")}>
              <th scope="row" className="py-2.5 pr-3 text-left font-medium">
                {t.name}
              </th>
              <td className="py-2.5 pr-3">
                <Connection team={t} />
              </td>
              <td className="py-2.5 pr-3 text-muted-foreground">{lastOrder(t, now)}</td>
              <td className="py-2.5 pr-3 text-right">{t.ordersLastMinute}</td>
              <td className="py-2.5 pr-3 text-right">{formatPaiseWhole(t.liquidationValuePaise)}</td>
              <td className="py-2.5 pr-3 text-right">
                {formatPaiseWhole(t.grossExposurePaise)}
                {t.shortNotionalPaise > 0 && <span className="block text-xs text-muted-foreground">{formatPaiseWhole(t.shortNotionalPaise)} short</span>}
              </td>
              <td className="py-2.5">
                <Margin team={t} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TeamList({ teams, now }: { teams: readonly MonitorTeam[]; now: number }) {
  return (
    <ul className="divide-y divide-border border-y border-border text-sm">
      {teams.map((t) => (
        <li key={t.teamId} className={cn("figures flex flex-col gap-1 py-2.5", t.marginLevel === "breach" && "bg-loss-tint")}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-medium">{t.name}</span>
            <span>{formatPaiseWhole(t.liquidationValuePaise)}</span>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-muted-foreground">
            <Connection team={t} />
            <span>{lastOrder(t, now)}</span>
          </div>
          <Margin team={t} />
        </li>
      ))}
    </ul>
  )
}

function TradeFeed({ trades }: { trades: readonly MonitorTrade[] }) {
  return (
    <section aria-labelledby="monitor-trades" className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="monitor-trades" className="text-lg font-semibold">
          Latest orders
        </h2>
        <p className="text-sm text-muted-foreground">Full history is in the CSV exports.</p>
      </div>
      {trades.length === 0 ? (
        <p className="text-sm text-muted-foreground">No orders yet.</p>
      ) : (
        <ol aria-label="Latest orders, newest first" className="divide-y divide-border border-y border-border text-sm">
          {trades.map((t) => (
            <li key={t.id} className={cn("figures flex flex-col gap-0.5 py-2", t.status === "rejected" && "text-muted-foreground")}>
              <div className="flex items-baseline justify-between gap-3">
                <span>
                  <span className="font-medium text-foreground">{t.teamName}</span> {t.status === "filled" ? PAST_TENSE[t.intent] : `tried to ${t.intent}`}{" "}
                  {formatShares(t.quantity)} {t.ticker}
                  {t.averagePrice !== null && ` at ${formatPrice(t.averagePrice)}`}
                </span>
                <time dateTime={t.acceptedAt} className="shrink-0 text-xs text-muted-foreground">
                  {clock.format(new Date(t.acceptedAt))}
                </time>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {t.forced && <Badge variant="destructive">Margin close-out</Badge>}
                {t.status === "rejected" ? (
                  <span>Rejected: {t.rejectMessage ?? "refused"}</span>
                ) : (
                  t.valuePaise !== null && <span className="text-muted-foreground">{formatPaiseWhole(t.valuePaise)}</span>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
