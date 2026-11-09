import type { Me } from "@tradetech/contracts"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"
import { useHostRoom } from "@/lib/host-queries"
import { cn } from "@/lib/utils"
import { ControlPanel } from "./ControlPanel"
import { NewsDesk } from "./NewsDesk"
import { RoomsScreen } from "./RoomsScreen"
import { SetupPanel } from "./SetupPanel"
import { Standings } from "./Standings"

type Tab = "control" | "news" | "standings" | "setup"
const TABS: readonly { id: Tab; label: string }[] = [
  { id: "control", label: "Control" },
  { id: "news", label: "News" },
  { id: "standings", label: "Standings" },
  { id: "setup", label: "Setup" },
]

export function HostApp({ me }: { me: Extract<Me, { kind: "host" }> }) {
  const [roomId, setRoomId] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const logout = useMutation({ mutationFn: () => api.post("/auth/logout"), onSuccess: () => queryClient.clear() })
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-6 px-4 py-4">
      <header className="flex items-center justify-between gap-3 border-b border-border pb-3">
        <div className="min-w-0">
          <h1 className="font-semibold">TradeTech host console</h1>
          <p className="truncate text-sm text-muted-foreground">{me.email}</p>
        </div>
        <div className="flex gap-2">
          {roomId && (
            <Button variant="ghost" size="sm" onClick={() => setRoomId(null)}>
              All events
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => logout.mutate()}>
            Sign out
          </Button>
        </div>
      </header>
      {roomId ? <RoomConsole roomId={roomId} /> : <RoomsScreen onOpen={setRoomId} />}
    </div>
  )
}

function RoomConsole({ roomId }: { roomId: string }) {
  const [tab, setTab] = useState<Tab>("control")
  const room = useHostRoom(roomId)
  if (room.isPending) return <p className="text-sm text-muted-foreground">Loading event…</p>
  if (room.isError) return <p className="text-sm text-destructive">{room.error.message}</p>
  const data = room.data
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">{data.name}</h2>
        <p className="text-sm text-muted-foreground">
          Teams join with room code <span className="figures font-medium text-foreground">{data.code}</span>
        </p>
      </div>
      <nav aria-label="Console sections" className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-current={tab === t.id ? "page" : undefined}
            onClick={() => setTab(t.id)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium outline-none focus-visible:bg-muted",
              tab === t.id ? "border-foreground text-foreground" : "border-transparent text-muted-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {tab === "control" && <ControlPanel room={data} fetchedAt={room.dataUpdatedAt} />}
      {tab === "news" && <NewsDesk room={data} />}
      {tab === "standings" && <Standings roomId={roomId} startingCashPaise={data.startingCashPaise} />}
      {tab === "setup" && <SetupPanel room={data} />}
    </div>
  )
}
