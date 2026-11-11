import type { NewsView, StockView } from "@tradetech/contracts"
import { PriceChange } from "@/components/price-change"
import { formatPrice } from "@/lib/format"
import { cn } from "@/lib/utils"
import { timeAgo } from "@/lib/use-now"
import { useNewsContext } from "./news-context"

const clock = new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit" })

export type StoryDensity = "reader" | "column" | "compact"

interface NewsStoryProps {
  item: NewsView
  density: StoryDensity
  isNew: boolean
  isLatest: boolean
  now: number
}

export function NewsStory({ item, density, isNew, isLatest, now }: NewsStoryProps) {
  const { mentionsOf, heldIds, selectStock } = useNewsContext()
  const mentions = mentionsOf(item)
  const aboutHoldings = mentions.filter((s) => heldIds.has(s.id))
  const reader = density === "reader"
  const compact = density === "compact"

  return (
    <article
      aria-labelledby={`story-${density}-${item.id}`}
      className={cn(
        "relative flex flex-col gap-1.5",
        reader ? "px-5 py-5 sm:px-6" : compact ? "px-5 py-3.5" : "px-4 py-4",
        isNew && "bg-brand/[0.06]",
      )}
    >
      {isNew && <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-brand-text" />}
      <p className="figures flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {isNew && <span className="rounded-sm bg-brand px-1.5 py-px text-[0.65rem] font-semibold text-brand-foreground">New</span>}
        {!isNew && isLatest && <span className="rounded-sm bg-muted px-1.5 py-px text-[0.65rem] font-semibold text-foreground">Latest</span>}
        <time dateTime={item.publishedAt} title={clock.format(new Date(item.publishedAt))}>
          {timeAgo(item.publishedAt, now)}
        </time>
        {item.sourceLabel && <span>— {item.sourceLabel}</span>}
        {aboutHoldings.length > 0 && (
          <span className="rounded-sm bg-warning/15 px-1.5 py-px font-medium text-warning">
            You hold {aboutHoldings.map((s) => s.ticker).join(", ")}
          </span>
        )}
      </p>
      <h3
        id={`story-${density}-${item.id}`}
        className={cn("font-semibold leading-snug text-pretty", reader ? (isLatest ? "text-2xl" : "text-xl") : compact ? "text-sm" : "text-base")}
      >
        {item.headline}
      </h3>
      {item.body && (
        <p
          className={cn(
            "leading-relaxed text-pretty text-muted-foreground",
            reader ? "max-w-[68ch] text-base" : compact ? "line-clamp-3 text-xs" : "text-sm",
          )}
        >
          {item.body}
        </p>
      )}
      {mentions.length > 0 && <MentionChips stocks={mentions} onSelect={selectStock} size={reader ? "md" : "sm"} />}
    </article>
  )
}

function MentionChips({ stocks, onSelect, size }: { stocks: readonly StockView[]; onSelect: (s: StockView) => void; size: "sm" | "md" }) {
  return (
    <ul aria-label="Stocks in this story" className="mt-1 flex flex-wrap gap-1.5">
      {stocks.map((stock) => (
        <li key={stock.id}>
          <button
            type="button"
            onClick={() => onSelect(stock)}
            aria-label={`Trade ${stock.ticker}, ${formatPrice(stock.mid)}, ${stock.change >= 0 ? "up" : "down"} ${Math.abs(stock.change * 100).toFixed(2)}% today`}
            className={cn(
              "figures inline-flex items-center gap-1.5 rounded-md border border-border bg-background font-medium outline-none transition-colors hover:border-foreground/40 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
              size === "md" ? "h-8 px-2.5 text-sm" : "h-7 px-2 text-xs",
            )}
          >
            <span translate="no" className="font-heading font-semibold tracking-wide">
              {stock.ticker}
            </span>
            <span className="text-muted-foreground">{formatPrice(stock.mid)}</span>
            <PriceChange value={stock.change} />
            {stock.halted && <span className="text-loss">Halted</span>}
          </button>
        </li>
      ))}
    </ul>
  )
}
