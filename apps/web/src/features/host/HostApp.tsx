import type { HostRoomView, Me } from "@tradetech/contracts"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  ActivityIcon,
  ArrowLeftIcon,
  BookmarkPlusIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  MonitorIcon,
  NewspaperIcon,
  SettingsIcon,
  TrophyIcon,
} from "lucide-react"
import { useState, type ComponentType } from "react"
import { BrandMark, ProductLockup } from "@/components/brand/BrandLogo"
import { SkipLink } from "@/components/skip-link"
import { ThemeToggle } from "@/components/theme-toggle"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"
import { useHostMonitor, useHostRoom, useTemplateAction } from "@/lib/host-queries"
import { cn } from "@/lib/utils"
import { ControlPanel } from "./ControlPanel"
import { marginAlertCount, MonitorPanel } from "./MonitorPanel"
import { NewsDesk } from "./NewsDesk"
import { RoomStatusBadge } from "./RoomStatusBadge"
import { RoomsScreen } from "./RoomsScreen"
import { SetupPanel } from "./SetupPanel"
import { Standings } from "./Standings"

type Tab = "control" | "monitor" | "news" | "standings" | "setup"
const TABS: readonly {
  id: Tab
  label: string
  icon: ComponentType<{ className?: string }>
}[] = [
  { id: "control", label: "Control", icon: LayoutDashboardIcon },
  { id: "monitor", label: "Monitor", icon: ActivityIcon },
  { id: "news", label: "News", icon: NewspaperIcon },
  { id: "standings", label: "Standings", icon: TrophyIcon },
  { id: "setup", label: "Setup", icon: SettingsIcon },
]

export function HostApp({ me }: { me: Extract<Me, { kind: "host" }> }) {
  const [roomId, setRoomId] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const logout = useMutation({
    mutationFn: () => api.post("/auth/logout"),
    onSuccess: () => queryClient.clear(),
  })
  return (
    <div className="flex min-h-svh flex-col">
      <SkipLink />
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1920px] items-center gap-4 px-4 py-2.5 lg:px-6">
          <ProductLockup className="max-sm:hidden" />
          <BrandMark className="h-6 sm:hidden" />
          <div className="min-w-0 flex-1 border-l border-border pl-4">
            <h1 className="truncate text-base leading-tight font-semibold">
              <span className="max-sm:sr-only">TradeTech </span>
              <span className="sm:hidden">Host console</span>
              <span className="max-sm:hidden">host console</span>
            </h1>
            <p className="truncate text-xs text-muted-foreground max-sm:hidden">{me.email}</p>
          </div>
          {roomId && (
            <Button variant="ghost" size="sm" onClick={() => setRoomId(null)}>
              <ArrowLeftIcon data-icon="inline-start" />
              <span className="max-sm:sr-only">All events</span>
            </Button>
          )}
          <ThemeToggle />
          <Button variant="ghost" size="icon" aria-label="Sign out" title="Sign out" onClick={() => logout.mutate()}>
            <LogOutIcon />
          </Button>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1920px] flex-1 px-4 py-6 outline-none lg:px-6">
        {roomId ? <RoomConsole roomId={roomId} /> : <RoomsScreen onOpen={setRoomId} />}
      </main>
    </div>
  )
}

function RoomConsole({ roomId }: { roomId: string }) {
  const [tab, setTab] = useState<Tab>("control")
  const room = useHostRoom(roomId)
  const alerts = marginAlertCount(useHostMonitor(roomId).data)
  if (room.isPending) return <p className="text-sm text-muted-foreground">Loading event…</p>
  if (room.isError) return <p className="text-sm text-destructive">{room.error.message}</p>
  const data = room.data
  return (
    <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] xl:gap-8">
      <aside className="flex flex-col gap-5 lg:sticky lg:top-[4.75rem] lg:self-start">
        <EventIdentity room={data} />
        <nav aria-label="Console sections" className="flex gap-1 overflow-x-auto border-b border-border lg:flex-col lg:border-b-0">
          {TABS.map((t) => {
            const Icon = t.icon
            const active = tab === t.id
            return (
              <button
                key={t.id}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex shrink-0 items-center gap-2.5 px-3 py-2 font-heading text-sm font-medium transition-colors outline-none focus-visible:bg-muted",
                  "max-lg:-mb-px max-lg:border-b-2 lg:rounded-md",
                  active
                    ? "text-foreground max-lg:border-brand-text lg:bg-muted lg:shadow-[inset_3px_0_0_var(--brand-text)]"
                    : "text-muted-foreground hover:text-foreground max-lg:border-transparent lg:hover:bg-muted/60"
                )}
              >
                <Icon className="size-4 max-lg:hidden" />
                {t.label}
                {t.id === "monitor" && alerts > 0 && (
                  <Badge variant="warning" className="figures ml-auto" aria-label={`${alerts} margin ${alerts === 1 ? "alert" : "alerts"}`}>
                    {alerts}
                  </Badge>
                )}
              </button>
            )
          })}
        </nav>
      </aside>
      <section aria-label={TABS.find((t) => t.id === tab)?.label} className="min-w-0">
        {tab === "control" && <ControlPanel room={data} fetchedAt={room.dataUpdatedAt} />}
        {tab === "monitor" && <MonitorPanel roomId={roomId} />}
        {tab === "news" && <NewsDesk room={data} />}
        {tab === "standings" && <Standings roomId={roomId} startingCashPaise={data.startingCashPaise} />}
        {tab === "setup" && <SetupPanel room={data} />}
      </section>
    </div>
  )
}

function EventIdentity({ room }: { room: HostRoomView }) {
  const saveTemplate = useTemplateAction(
    (name: string) => api.post(`/host/rooms/${room.id}/save-template`, { name }),
    "Saved as a template. Find it under Templates on the events screen."
  )
  return (
    <div className="flex flex-col gap-2 lg:rounded-lg lg:border lg:border-border lg:bg-surface lg:p-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xl leading-tight font-semibold tracking-tight">{room.name}</h2>
        <RoomStatusBadge status={room.status} />
      </div>
      <p className="text-sm text-muted-foreground">
        Teams join with room code{" "}
        <span className="figures rounded-sm bg-muted px-1.5 py-0.5 font-heading font-semibold tracking-[0.15em] text-foreground">{room.code}</span>
      </p>
      <p className="figures text-xs text-muted-foreground">
        {room.teams.length} teams, {room.stocks.length} stocks
      </p>
      <Button variant="outline" size="sm" className="mt-1 self-start" onClick={() => window.open(`/projector/${room.id}`, "_blank", "noopener")}>
        <MonitorIcon data-icon="inline-start" />
        Open projector view
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        disabled={room.stocks.length === 0 || saveTemplate.isPending}
        onClick={() => {
          const name = window.prompt("Template name (stocks, rules and news are saved; teams are not)", room.name)
          if (name?.trim()) saveTemplate.mutate(name.trim())
        }}
      >
        <BookmarkPlusIcon data-icon="inline-start" />
        Save as template
      </Button>
    </div>
  )
}
