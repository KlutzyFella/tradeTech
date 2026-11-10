import type { HostRoomSummary } from "@tradetech/contracts"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/api"
import { hostKeys, useHostRooms } from "@/lib/host-queries"
import { RoomStatusBadge } from "./RoomStatusBadge"


export function RoomsScreen({ onOpen }: { onOpen: (id: string) => void }) {
  const rooms = useHostRooms()
  const queryClient = useQueryClient()
  const [name, setName] = useState("")
  const [code, setCode] = useState("")
  const [cash, setCash] = useState("1000000")
  const create = useMutation({
    mutationFn: () => api.post<HostRoomSummary>("/host/rooms", { name, code, startingCashRupees: Number(cash) }),
    onSuccess: (room) => {
      void queryClient.invalidateQueries({ queryKey: hostKeys.rooms })
      onOpen(room.id)
    },
  })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    create.mutate()
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_26rem]">
      <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5">
        <h2 className="text-lg font-semibold">Your events</h2>
        {rooms.data?.length === 0 && <p className="text-sm text-muted-foreground">No events yet. Create one below.</p>}
        <ul className="divide-y divide-border border-y border-border">
          {rooms.data?.map((room) => (
            <li key={room.id}>
              <button type="button" onClick={() => onOpen(room.id)} className="flex w-full items-center justify-between gap-3 py-3 text-left outline-none focus-visible:bg-muted">
                <span className="flex flex-col">
                  <span className="font-medium">{room.name}</span>
                  <span className="text-sm text-muted-foreground">Room code {room.code}</span>
                </span>
                <RoomStatusBadge status={room.status} />
              </button>
            </li>
          ))}
        </ul>
      </section>
      <form onSubmit={submit} className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5">
        <h2 className="text-lg font-semibold">Create an event</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5 sm:col-span-3">
            <Label htmlFor="room-name">Event name</Label>
            <Input id="room-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="room-code">Room code</Label>
            <Input id="room-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="4–12 letters or digits" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="room-cash">Starting cash per team (₹)</Label>
            <Input id="room-cash" inputMode="numeric" value={cash} onChange={(e) => setCash(e.target.value.replace(/\D/g, ""))} className="figures" />
          </div>
        </div>
        {create.error && <p role="alert" className="text-sm text-destructive">{create.error.message}</p>}
        <Button type="submit" className="self-start" disabled={!name || !code || !cash || create.isPending}>
          Create event
        </Button>
      </form>
    </div>
  )
}
