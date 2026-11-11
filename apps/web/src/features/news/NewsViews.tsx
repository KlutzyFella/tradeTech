import { ChevronDownIcon, ChevronUpIcon, Columns2Icon, Maximize2Icon, PanelRightIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { formatPrice } from "@/lib/format"
import { useNow } from "@/lib/use-now"
import { cn } from "@/lib/utils"
import { useNewsContext, useReadingSession, type NewsPlacement } from "./news-context"
import { NewsStory, type StoryDensity } from "./NewsStory"

const RELATIVE_TIME_REFRESH_MS = 30_000

/** The list shared by every placement, with an "Earlier" divider after the new stories. */
/** The reader is for reading; side placements need a longer look before stories count as read. */
const READ_DWELL_MS: Record<StoryDensity, number> = { reader: 1500, column: 4000, compact: 4000 }

function NewsFeed({ density, active }: { density: StoryDensity; active: boolean }) {
  const { items, loading, error } = useNewsContext()
  const highlighted = useReadingSession(active, READ_DWELL_MS[density])
  const now = useNow(RELATIVE_TIME_REFRESH_MS)
  if (loading) return <Skeleton className="m-4 h-28" />
  if (error) return <p className="px-5 py-6 text-sm text-destructive">{error.message}</p>
  if (items.length === 0) {
    return (
      <p className="px-5 py-8 text-sm text-muted-foreground">
        No news yet. Headlines from your host appear here the moment they break, and in a banner at the top of the screen.
      </p>
    )
  }
  const firstOld = items.findIndex((i) => !highlighted.has(i.id))
  return (
    <ol aria-live="polite" className="divide-y divide-border">
      {items.map((item, i) => (
        <li key={item.id}>
          {i === firstOld && firstOld > 0 && (
            <p className="bg-muted/50 px-5 py-1.5 text-[0.7rem] font-medium tracking-wide text-muted-foreground">Earlier</p>
          )}
          <NewsStory item={item} density={density} isNew={highlighted.has(item.id)} isLatest={i === 0} now={now} />
        </li>
      ))}
    </ol>
  )
}

const PLACEMENT_OPTIONS: readonly { value: NewsPlacement; label: string; hint: string }[] = [
  { value: "panel", label: "Side panel", hint: "Under the order ticket" },
  { value: "beside", label: "Beside market", hint: "A column next to the prices" },
  { value: "tab", label: "Tab only", hint: "Only on this tab" },
]

/** Lets a participant choose where the news feed lives on the laptop desk. */
export function PlacementControl({ allowBeside }: { allowBeside: boolean }) {
  const { placement, setPlacement } = useNewsContext()
  return (
    <div role="radiogroup" aria-label="Where news shows on your desk" className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
      {PLACEMENT_OPTIONS.map((o) => {
        const disabled = o.value === "beside" && !allowBeside
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={placement === o.value}
            disabled={disabled}
            title={disabled ? "Needs a wider window" : o.hint}
            onClick={() => setPlacement(o.value)}
            className={cn(
              "flex flex-col items-start rounded-md px-3 py-1.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40",
              placement === o.value ? "bg-background shadow-sm ring-1 ring-foreground/25" : "hover:bg-background/50",
            )}
          >
            <span className="text-sm font-medium">{o.label}</span>
            <span className="text-[0.7rem] text-muted-foreground">{disabled ? "Needs a wider window" : o.hint}</span>
          </button>
        )
      })}
    </div>
  )
}

/** The News tab: a large reader. On the desk, the order ticket stays docked beside it. */
export function NewsReader({ showPlacement, allowBeside }: { showPlacement: boolean; allowBeside: boolean }) {
  const { items, unread, markSeen } = useNewsContext()
  return (
    <section aria-labelledby="news-reader-heading" className="flex flex-col gap-4 pb-6">
      <div className="flex flex-wrap items-end justify-between gap-3 px-4 lg:px-0">
        <div>
          <h2 id="news-reader-heading" className="text-2xl font-semibold tracking-tight">
            News
          </h2>
          <p className="text-sm text-muted-foreground">
            {items.length === 0
              ? "Nothing yet this round."
              : `${items.length} ${items.length === 1 ? "story" : "stories"}. Tap a stock under a story to trade it.`}
          </p>
        </div>
        {unread.size > 0 && (
          <Button variant="outline" size="sm" onClick={() => markSeen(items.map((i) => i.id))}>
            Mark all as read
          </Button>
        )}
      </div>
      {showPlacement && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-muted-foreground">Where news shows on your desk</p>
          <PlacementControl allowBeside={allowBeside} />
        </div>
      )}
      <div className="overflow-hidden border-y border-border bg-surface lg:rounded-lg lg:border">
        <NewsFeed density="reader" active />
      </div>
    </section>
  )
}

/** Compact feed under the order ticket, collapsible to save room. */
export function NewsPanel({ allowBeside }: { allowBeside: boolean }) {
  const { unread, panelCollapsed, setPanelCollapsed, openNewsTab, setPlacement, items } = useNewsContext()
  const latest = items[0]
  return (
    <section aria-labelledby="news-panel-heading" className="flex min-h-0 flex-col rounded-lg border border-border bg-surface">
      <header className="flex items-center gap-2 border-b border-border py-1.5 pr-1.5 pl-5">
        <h2 id="news-panel-heading" className="flex flex-1 items-center gap-2 text-base font-semibold">
          News
          {unread.size > 0 && (
            <span className="rounded-full bg-brand px-1.5 text-xs font-semibold text-brand-foreground">{unread.size} new</span>
          )}
        </h2>
        {allowBeside && (
          <Button variant="ghost" size="icon-sm" aria-label="Show news beside the market" title="Show beside the market" onClick={() => setPlacement("beside")}>
            <Columns2Icon />
          </Button>
        )}
        <Button variant="ghost" size="icon-sm" aria-label="Open news in a full tab" title="Open in a full tab" onClick={openNewsTab}>
          <Maximize2Icon />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-expanded={!panelCollapsed}
          aria-controls="news-panel-body"
          aria-label={panelCollapsed ? "Expand news panel" : "Collapse news panel"}
          onClick={() => setPanelCollapsed(!panelCollapsed)}
        >
          {panelCollapsed ? <ChevronDownIcon /> : <ChevronUpIcon />}
        </Button>
      </header>
      {panelCollapsed ? (
        latest && (
          <button type="button" onClick={openNewsTab} className="px-5 py-3 text-left text-sm outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
            <span className="text-xs text-muted-foreground">Latest: </span>
            <span className="font-medium">{latest.headline}</span>
          </button>
        )
      ) : (
        <div id="news-panel-body" className="max-h-[calc(100svh-31rem)] min-h-40 overflow-y-auto overscroll-contain">
          <NewsFeed density="compact" active />
        </div>
      )}
    </section>
  )
}

/** Full-height news column beside the market table. */
export function NewsColumn() {
  const { unread, openNewsTab, setPlacement } = useNewsContext()
  return (
    <section aria-labelledby="news-column-heading" className="flex min-h-0 flex-col self-start rounded-lg border border-border bg-surface lg:sticky lg:top-[5.25rem]">
      <header className="flex items-center gap-2 border-b border-border py-1.5 pr-1.5 pl-4">
        <h2 id="news-column-heading" className="flex flex-1 items-center gap-2 text-base font-semibold">
          News
          {unread.size > 0 && <span className="rounded-full bg-brand px-1.5 text-xs font-semibold text-brand-foreground">{unread.size} new</span>}
        </h2>
        <Button variant="ghost" size="icon-sm" aria-label="Move news to the side panel" title="Move to the side panel" onClick={() => setPlacement("panel")}>
          <PanelRightIcon />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Open news in a full tab" title="Open in a full tab" onClick={openNewsTab}>
          <Maximize2Icon />
        </Button>
      </header>
      <div className="max-h-[calc(100svh-9rem)] overflow-y-auto overscroll-contain">
        <NewsFeed density="column" active />
      </div>
    </section>
  )
}

/**
 * The breaking-news strip in the sticky header: the actual headline, the
 * stocks it names with live prices, and Read / Dismiss. Never blocks trading.
 */
export function BreakingNewsStrip() {
  const { breaking, dismissBreaking, openNewsTab, mentionsOf, selectStock } = useNewsContext()
  if (!breaking) return null
  const mentions = mentionsOf(breaking)
  return (
    <div role="status" aria-label="Breaking news" className="border-t border-brand/40 bg-brand/10 motion-safe:animate-in motion-safe:slide-in-from-top-1 motion-safe:fade-in">
      <div className="mx-auto flex w-full max-w-[1920px] flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2 lg:px-5 2xl:px-8">
        <span className="rounded-sm bg-brand px-1.5 py-0.5 font-heading text-xs font-semibold tracking-wide text-brand-foreground">Breaking</span>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold max-sm:basis-[calc(100%-6rem)]">{breaking.headline}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {mentions.slice(0, 3).map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                selectStock(s)
                dismissBreaking()
              }}
              className="figures inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2 text-xs font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Trade ${s.ticker} at ${formatPrice(s.mid)}`}
            >
              <span translate="no" className="font-heading font-semibold">
                {s.ticker}
              </span>
              {formatPrice(s.mid)}
            </button>
          ))}
          <Button
            size="sm"
            onClick={() => {
              openNewsTab()
              dismissBreaking()
            }}
          >
            Read
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Dismiss breaking news" onClick={dismissBreaking}>
            <XIcon />
          </Button>
        </div>
      </div>
    </div>
  )
}
