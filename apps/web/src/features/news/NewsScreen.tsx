import { Skeleton } from "@/components/ui/skeleton"
import { useNews } from "@/lib/queries"
import { cn } from "@/lib/utils"

const time = new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit" })

/** "page": the phone News tab; "rail": the compact feed in the laptop desk's side column. */
export function NewsScreen({ variant = "page" }: { variant?: "page" | "rail" }) {
  const news = useNews()
  const rail = variant === "rail"
  if (news.isPending) return <Skeleton className="m-4 h-32" />
  if (news.isError) return <p className="px-4 py-6 text-destructive">{news.error.message}</p>
  if (news.data.length === 0) {
    return (
      <p className={cn("text-sm text-muted-foreground", rail ? "px-5 py-6" : "mx-4 rounded-lg border border-dashed border-border px-4 py-6")}>
        No news yet. Headlines from your host will appear here as they break.
      </p>
    )
  }
  return (
    <ol aria-live="polite" className={cn("divide-y divide-border", !rail && "border-y border-border bg-surface")}>
      {news.data.map((item, i) => (
        <li key={item.id} className={cn("flex flex-col gap-1", rail ? "px-5 py-3.5" : "px-4 py-4")}>
          <p className="figures flex items-center gap-2 text-xs text-muted-foreground">
            {i === 0 && <span className="rounded-sm bg-brand px-1.5 py-px text-[0.65rem] font-semibold text-brand-foreground">Latest</span>}
            {time.format(new Date(item.publishedAt))}
            {item.sourceLabel && ` — ${item.sourceLabel}`}
          </p>
          <h3 className={cn("font-semibold leading-snug", rail ? "text-sm" : "text-base")}>{item.headline}</h3>
          {item.body && <p className={cn("leading-relaxed text-muted-foreground", rail ? "text-xs" : "text-sm")}>{item.body}</p>}
        </li>
      ))}
    </ol>
  )
}
