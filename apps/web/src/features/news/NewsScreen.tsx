import { Skeleton } from "@/components/ui/skeleton"
import { useNews } from "@/lib/queries"

const time = new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit" })

export function NewsScreen() {
  const news = useNews()
  if (news.isPending) return <Skeleton className="m-4 h-40" />
  if (news.isError) return <p className="px-4 py-6 text-destructive">{news.error.message}</p>
  if (news.data.length === 0) {
    return <p className="px-4 py-6 text-sm text-muted-foreground">No news yet. Headlines from your host will appear here as they break.</p>
  }
  return (
    <ul className="divide-y divide-border border-y border-border">
      {news.data.map((item) => (
        <li key={item.id} className="flex flex-col gap-1 px-4 py-4">
          <p className="figures text-sm text-muted-foreground">
            {time.format(new Date(item.publishedAt))}
            {item.sourceLabel && ` — ${item.sourceLabel}`}
          </p>
          <h2 className="font-semibold">{item.headline}</h2>
          {item.body && <p className="text-sm">{item.body}</p>}
        </li>
      ))}
    </ul>
  )
}
