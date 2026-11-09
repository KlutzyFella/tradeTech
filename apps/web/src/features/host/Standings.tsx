import { formatPaiseWhole, formatSignedPaise, trend } from "@/lib/format"
import { useLeaderboard } from "@/lib/host-queries"
import { cn } from "@/lib/utils"

export function Standings({ roomId, startingCashPaise }: { roomId: string; startingCashPaise: number }) {
  const board = useLeaderboard(roomId)
  if (!board.data) return <p className="text-sm text-muted-foreground">Loading standings…</p>
  if (board.data.length === 0) return <p className="text-sm text-muted-foreground">Add teams to see standings.</p>
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-semibold">Standings by liquidation value</h2>
      <ol className="divide-y divide-border border-y border-border">
        {board.data.map((entry) => {
          const result = entry.liquidationValuePaise - startingCashPaise
          return (
            <li key={entry.teamId} className="figures flex items-center gap-3 py-2.5">
              <span className="w-8 text-right font-semibold">{entry.rank}</span>
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
    </section>
  )
}
