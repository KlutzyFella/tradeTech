import type { HostRoomView, HostStockView, RoomStatus } from "@tradetech/contracts"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatClock, useCountdown } from "@/lib/countdown"
import { formatChange, formatPrice, trend } from "@/lib/format"
import { useHostAction } from "@/lib/host-queries"
import { cn } from "@/lib/utils"

const PHASE_ACTIONS: Record<RoomStatus, readonly { to: RoomStatus; label: string; confirm?: string }[]> = {
  draft: [{ to: "practice", label: "Open practice" }],
  practice: [{ to: "live", label: "Go live", confirm: "Going live wipes all practice trading and starts scoring. Continue?" }],
  live: [{ to: "closed", label: "Close the event", confirm: "Closing ends trading for good. Continue?" }],
  paused: [{ to: "live", label: "Resume event" }],
  closed: [],
}
const PHASE_COPY: Record<RoomStatus, string> = {
  draft: "Setting up — teams can sign in but not trade.",
  practice: "Practice — results don’t count and can be reset.",
  live: "Live — trades count towards the final score.",
  paused: "Paused.",
  closed: "Closed — trading has ended.",
}

export function ControlPanel({ room, fetchedAt }: { room: HostRoomView; fetchedAt: number }) {
  const setStatus = useHostAction<{ status: RoomStatus }>(room.id, () => "/status")
  const reset = useHostAction(room.id, () => "/reset-practice", "Practice reset")
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Event</h2>
        <p className="text-sm text-muted-foreground">{PHASE_COPY[room.status]}</p>
        <div className="flex flex-wrap gap-2">
          {PHASE_ACTIONS[room.status].map((action) => (
            <Button
              key={action.to}
              variant={action.to === "closed" ? "destructive" : "default"}
              disabled={setStatus.isPending}
              onClick={() => (!action.confirm || window.confirm(action.confirm)) && setStatus.mutate({ status: action.to })}
            >
              {action.label}
            </Button>
          ))}
          {(room.status === "practice" || room.status === "draft") && (
            <Button variant="outline" disabled={reset.isPending} onClick={() => window.confirm("Reset every team’s practice trading?") && reset.mutate(undefined)}>
              Reset practice
            </Button>
          )}
        </div>
      </section>
      <RoundControls room={room} fetchedAt={fetchedAt} />
      <StockMonitor room={room} />
    </div>
  )
}

function RoundControls({ room, fetchedAt }: { room: HostRoomView; fetchedAt: number }) {
  const [minutes, setMinutes] = useState("20")
  const create = useHostAction<{ durationMinutes: number }>(room.id, () => "/rounds")
  const act = useHostAction<{ action: "start" | "pause" | "resume" | "end" }>(room.id, (b) => `/rounds/current/${b.action}`)
  const round = room.round
  const remaining = useCountdown(round, fetchedAt)
  const canCreate = (room.status === "practice" || room.status === "live") && (!round || round.status === "ended")

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-semibold">Round</h2>
      {round ? (
        <div className="flex items-baseline gap-4">
          <p className="figures text-4xl font-semibold">{formatClock(remaining ?? 0)}</p>
          <p className="text-sm text-muted-foreground">
            {round.kind === "practice" ? "Practice" : "Scored"} round {round.sequence} — {round.status}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No rounds yet.</p>
      )}
      <div className="flex flex-wrap gap-2">
        {round?.status === "pending" && <Button onClick={() => act.mutate({ action: "start" })}>Start round</Button>}
        {round?.status === "running" && <Button onClick={() => act.mutate({ action: "pause" })}>Pause</Button>}
        {round?.status === "paused" && <Button onClick={() => act.mutate({ action: "resume" })}>Resume</Button>}
        {round && round.status !== "ended" && (
          <Button variant="outline" onClick={() => window.confirm("End this round now? Trading stops immediately.") && act.mutate({ action: "end" })}>
            End round
          </Button>
        )}
      </div>
      {canCreate && (
        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="round-minutes">Length (minutes)</Label>
            <Input id="round-minutes" inputMode="decimal" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/[^\d.]/g, ""))} className="figures w-28" />
          </div>
          <Button variant="outline" disabled={!Number(minutes)} onClick={() => create.mutate({ durationMinutes: Number(minutes) })}>
            New {room.status === "live" ? "scored" : "practice"} round
          </Button>
        </div>
      )}
    </section>
  )
}

function StockMonitor({ room }: { room: HostRoomView }) {
  const halt = useHostAction<{ stockId: string; halted: boolean; rebaseBand: boolean }>(room.id, (b) => `/stocks/${b.stockId}/halt`)
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-semibold">Market</h2>
      <ul className="divide-y divide-border border-y border-border">
        {room.stocks.map((stock) => (
          <li key={stock.id} className="flex items-center gap-3 py-2.5">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-center gap-2 font-medium">
                {stock.ticker}
                {stock.halted && <Badge variant="destructive">{stock.haltReason === "band" ? "Halted: band" : "Halted"}</Badge>}
              </span>
              <span className="figures text-sm text-muted-foreground">
                Band {formatPrice(stock.bandLow)} to {formatPrice(stock.bandHigh)}, {stock.borrowUsed} of {stock.borrowPool} lent
              </span>
            </span>
            <span className="figures flex flex-col items-end">
              <span>{formatPrice(stock.mid)}</span>
              <span className={cn("text-sm", trend(stock.change) === "gain" && "text-gain", trend(stock.change) === "loss" && "text-loss")}>
                {formatChange(stock.change)}
              </span>
            </span>
            <HaltButton stock={stock} onToggle={(halted, rebaseBand) => halt.mutate({ stockId: stock.id, halted, rebaseBand })} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function HaltButton({ stock, onToggle }: { stock: HostStockView; onToggle: (halted: boolean, rebaseBand: boolean) => void }) {
  if (!stock.halted) {
    return (
      <Button size="sm" variant="outline" onClick={() => onToggle(true, false)}>
        Halt
      </Button>
    )
  }
  return (
    <Button
      size="sm"
      onClick={() => onToggle(false, window.confirm(`Re-centre ${stock.ticker}’s band on the current price before reopening?`))}
    >
      Reopen
    </Button>
  )
}
