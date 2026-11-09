import type { HostStandingsView } from "@tradetech/contracts"
import { Button } from "@/components/ui/button"
import { formatPaiseWhole, formatSignedPaise, trend } from "@/lib/format"
import { hostKeys, useHostAction } from "@/lib/host-queries"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"

const EXPORTS = [
  { kind: "standings", label: "Standings" },
  { kind: "orders", label: "Orders" },
  { kind: "ledger", label: "Cash ledger" },
  { kind: "news", label: "News log" },
] as const

const frozenTime = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "medium" })

export function Standings({ roomId, startingCashPaise }: { roomId: string; startingCashPaise: number }) {
  const board = useQuery({
    queryKey: hostKeys.board(roomId),
    queryFn: () => api.get<HostStandingsView>(`/host/rooms/${roomId}/leaderboard`),
    refetchInterval: 2000,
  })
  const visibility = useHostAction<{ public: boolean }>(roomId, () => "/leaderboard/visibility")
  if (!board.data) return <p className="text-sm text-muted-foreground">Loading standings…</p>
  const { final, frozenAt, leaderboardPublic, entries } = board.data

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-semibold">{final ? "Final results" : "Live standings"}</h2>
          <p className="text-sm text-muted-foreground">
            {final && frozenAt ? `Frozen ${frozenTime.format(new Date(frozenAt))}` : "By liquidation value, updating every 2 seconds"}
          </p>
        </div>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Add teams to see standings.</p>
        ) : (
          <ol className="divide-y divide-border border-y border-border">
            {entries.map((entry) => {
              const result = entry.liquidationValuePaise - startingCashPaise
              return (
                <li key={entry.teamId} className="figures flex items-center gap-3 py-2.5">
                  <span className="w-8 text-right font-semibold">{entry.rank ?? "—"}</span>
                  <span className="flex-1">
                    {entry.name}
                    {entry.status !== "active" && <span className="text-destructive"> ({entry.status})</span>}
                  </span>
                  <span className="flex flex-col items-end">
                    <span>{formatPaiseWhole(entry.liquidationValuePaise)}</span>
                    <span className={cn("text-sm", trend(result) === "gain" && "text-gain", trend(result) === "loss" && "text-loss")}>
                      {formatSignedPaise(result)}
                    </span>
                  </span>
                </li>
              )
            })}
          </ol>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">What teams see</h2>
        <p className="text-sm text-muted-foreground">
          {leaderboardPublic
            ? "Teams can see their rank and the full table."
            : "Teams see only their own score. Ranks and the table are hidden."}
        </p>
        <Button
          variant="outline"
          className="self-start"
          disabled={visibility.isPending}
          onClick={() => visibility.mutate({ public: !leaderboardPublic })}
        >
          {leaderboardPublic ? "Hide leaderboard from teams" : "Show leaderboard to teams"}
        </Button>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Download records</h2>
        <p className="text-sm text-muted-foreground">CSV files for results, audits and disputes.</p>
        <div className="flex flex-wrap gap-2">
          {EXPORTS.map((e) => (
            <a
              key={e.kind}
              href={`/api/host/rooms/${roomId}/export/${e.kind}.csv`}
              download
              className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            >
              {e.label}
            </a>
          ))}
        </div>
      </section>
    </div>
  )
}
