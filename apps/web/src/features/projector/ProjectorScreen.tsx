import type { ProjectorView, RoomStatus } from "@tradetech/contracts"
import { useQuery } from "@tanstack/react-query"
import { ExpandIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { brand } from "@/brand"
import { BrandLockup } from "@/components/brand/BrandLogo"
import { Sparkline } from "@/components/charts/PriceChart"
import { PriceChange } from "@/components/price-change"
import { api } from "@/lib/api"
import { formatClock, useCountdown } from "@/lib/countdown"
import { formatPaiseWhole, formatPrice } from "@/lib/format"
import { useFlash } from "@/lib/use-flash"
import { timeAgo, useNow } from "@/lib/use-now"
import { cn } from "@/lib/utils"

const POLL_MS = 2000

const STATUS_LINE: Record<RoomStatus, string> = {
  draft: "Getting ready",
  practice: "Practice round — results don’t count",
  live: "Live — trades count",
  paused: "Paused",
  closed: "Trading has closed",
}

/**
 * The venue's big screen: read-only, always in the brand's dark theme, sized
 * to be read from the back of a room. Built from the server's public-safe
 * projector snapshot only.
 */
export function ProjectorScreen({ roomId }: { roomId: string }) {
  const view = useQuery({
    queryKey: ["projector", roomId],
    queryFn: () => api.get<ProjectorView>(`/host/rooms/${roomId}/projector`),
    refetchInterval: POLL_MS,
  })
  useEffect(() => {
    if (view.data) document.title = `${view.data.name} — ${brand.productName}`
  }, [view.data])

  if (view.isError) {
    return (
      <main className="dark grid min-h-svh place-items-center bg-background p-10 text-foreground">
        <p className="text-xl text-destructive">{view.error.message}</p>
      </main>
    )
  }
  if (!view.data) return <main className="dark min-h-svh bg-background" aria-busy="true" />
  return <Projector data={view.data} fetchedAt={view.dataUpdatedAt} />
}

function Projector({ data, fetchedAt }: { data: ProjectorView; fetchedAt: number }) {
  return (
    <main className="dark flex h-svh flex-col gap-[1.5vh] overflow-hidden bg-background px-[2.5vw] py-[2.5vh] text-foreground">
      <ProjectorHeader data={data} fetchedAt={fetchedAt} />
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)] gap-[1.5vw]">
        <Leaderboard data={data} />
        <MarketBoard data={data} />
      </div>
      <NewsBar data={data} />
      <Footer data={data} />
    </main>
  )
}

function ProjectorHeader({ data, fetchedAt }: { data: ProjectorView; fetchedAt: number }) {
  const remaining = useCountdown(data.round, fetchedAt)
  const round = data.round
  const lowTime = round?.status === "running" && remaining !== null && remaining < 60_000
  return (
    <header className="flex items-center gap-[2vw]">
      <BrandLockup className="h-[11vh] w-auto" />
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[4.2vh] leading-tight font-semibold tracking-tight">{data.name}</h1>
        <p className={cn("text-[2.4vh]", data.status === "live" ? "text-brand-text" : "text-muted-foreground")}>
          {STATUS_LINE[data.status]}
          {round?.status === "ended" && data.status !== "closed" && " — round over"}
        </p>
      </div>
      {round && round.status !== "ended" && (
        <div className="text-right">
          <p className="text-[2.2vh] text-muted-foreground">
            {round.kind === "practice" ? "Practice round" : "Round"} {round.sequence}
          </p>
          <p aria-label="Time left in round" className={cn("figures font-heading text-[10vh] leading-none font-semibold tracking-tight", lowTime && "text-brand-text")}>
            {round.status === "paused" ? "Paused" : round.status === "pending" ? "Soon" : formatClock(remaining ?? 0)}
          </p>
        </div>
      )}
    </header>
  )
}

function Leaderboard({ data }: { data: ProjectorView }) {
  const board = data.leaderboard
  return (
    <section aria-labelledby="pj-board" className="flex min-h-0 flex-col rounded-xl border border-border bg-surface px-[1.6vw] py-[2vh]">
      <h2 id="pj-board" className="text-[3vh] font-semibold">
        {board?.final ? "Final results" : "Leaderboard"}
      </h2>
      {!board ? (
        <div className="flex flex-1 flex-col justify-center gap-[1.5vh]">
          <p className="text-[2.6vh] text-muted-foreground">The leaderboard is hidden for now.</p>
          <p className="text-[2.2vh] text-muted-foreground">{data.teamCount} teams are trading.</p>
        </div>
      ) : board.entries.length === 0 ? (
        <p className="mt-[2vh] text-[2.4vh] text-muted-foreground">Standings appear once teams join.</p>
      ) : (
        // Rows share the panel's height evenly, so up to ten teams always fit on screen.
        <ol
          className="mt-[1vh] grid min-h-0 flex-1 divide-y divide-border"
          style={{ gridTemplateRows: `repeat(${Math.max(board.entries.length, 5)}, minmax(0, 1fr))` }}
        >
          {board.entries.map((e) => (
            <li key={`${e.rank}-${e.name}`} className="figures flex min-h-0 items-center gap-[1vw]">
              <span className={cn("w-[2.5vw] font-heading text-[3.4vh] font-semibold", e.rank === 1 ? "text-brand-text" : "text-muted-foreground")}>{e.rank}</span>
              <span className="min-w-0 flex-1 truncate text-[3vh] font-medium">{e.name}</span>
              <span className="text-[2.8vh]">{formatPaiseWhole(e.liquidationValuePaise)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function MarketBoard({ data }: { data: ProjectorView }) {
  return (
    <section aria-labelledby="pj-market" className="flex min-h-0 flex-col gap-[1.2vh]">
      <h2 id="pj-market" className="sr-only">
        Market
      </h2>
      <ul className="grid min-h-0 flex-1 auto-rows-fr grid-cols-2 gap-[1vh] xl:grid-cols-2">
        {data.stocks.map((s) => (
          <li key={s.id}>
            <Tile stock={s} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function Tile({ stock }: { stock: ProjectorView["stocks"][number] }) {
  const flash = useFlash(stock.mid)
  return (
    <div key={flash.key} className={cn("flex h-full items-center gap-[1vw] rounded-lg border border-border bg-surface px-[1.2vw]", flash.className)}>
      <div className="flex w-[34%] min-w-0 flex-col">
        <span translate="no" className="font-heading text-[2.9vh] leading-tight font-semibold tracking-wide">
          {stock.ticker}
        </span>
        <span className="truncate text-[1.7vh] text-muted-foreground">{stock.name}</span>
      </div>
      <div className="min-w-0 flex-1">
        <Sparkline values={stock.spark} className="h-[5vh]!" />
      </div>
      <div className="flex w-[30%] flex-col items-end">
        <span className="figures font-heading text-[3vh] leading-tight font-semibold">{formatPrice(stock.mid)}</span>
        {stock.halted ? (
          <span className="text-[1.9vh] font-semibold text-loss">Halted</span>
        ) : stock.pausedUntil ? (
          <span className="text-[1.9vh] font-semibold text-warning">News pause</span>
        ) : (
          <PriceChange value={stock.change} className="text-[2vh]" />
        )}
      </div>
    </div>
  )
}

function NewsBar({ data }: { data: ProjectorView }) {
  const now = useNow(30_000)
  const [latest, ...earlier] = data.news
  // One orchestrated moment: the bar flashes once when a new headline lands.
  const [seenId, setSeenId] = useState<string | null>(latest?.id ?? null)
  const fresh = latest !== undefined && latest.id !== seenId
  useEffect(() => {
    if (!fresh) return
    const timer = setTimeout(() => setSeenId(latest.id), 6000)
    return () => clearTimeout(timer)
  }, [fresh, latest])
  if (!latest) return null
  return (
    <section
      aria-labelledby="pj-news"
      aria-live="polite"
      className={cn(
        "flex items-stretch gap-[1.5vw] rounded-xl border px-[1.6vw] py-[1.6vh] transition-colors duration-700",
        fresh ? "border-brand bg-brand/20" : "border-border bg-surface",
      )}
    >
      <h2 id="pj-news" className="sr-only">
        Latest news
      </h2>
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <p className="flex items-center gap-[0.8vw] text-[1.9vh] text-muted-foreground">
          <span className="rounded-sm bg-brand px-[0.5vw] py-[0.2vh] font-heading font-semibold text-brand-foreground">{fresh ? "Breaking" : "Latest"}</span>
          {timeAgo(latest.publishedAt, now)}
          {latest.sourceLabel && ` — ${latest.sourceLabel}`}
        </p>
        <p className="mt-[0.6vh] truncate font-heading text-[3.8vh] leading-tight font-semibold">{latest.headline}</p>
      </div>
      {earlier.length > 0 && (
        <ul className="hidden w-[32%] flex-col justify-center gap-[0.6vh] border-l border-border pl-[1.5vw] lg:flex">
          {earlier.slice(0, 2).map((n) => (
            <li key={n.id} className="truncate text-[1.9vh] text-muted-foreground">
              <span className="figures">{timeAgo(n.publishedAt, now)}</span> — {n.headline}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Footer({ data }: { data: ProjectorView }) {
  const [fullscreen, setFullscreen] = useState(false)
  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement !== null)
    document.addEventListener("fullscreenchange", update)
    return () => document.removeEventListener("fullscreenchange", update)
  }, [])
  return (
    <footer className="flex items-center justify-between gap-4 text-[1.9vh] text-muted-foreground">
      <p>
        Join at <span className="font-medium text-foreground">{window.location.host}</span> with room code{" "}
        <span className="figures rounded-sm bg-muted px-[0.5vw] py-[0.2vh] font-heading font-semibold tracking-[0.2em] text-foreground">{data.code}</span>
      </p>
      {!fullscreen && (
        <button
          type="button"
          onClick={() => void document.documentElement.requestFullscreen?.()}
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ExpandIcon className="size-4" />
          Full screen
        </button>
      )}
    </footer>
  )
}
