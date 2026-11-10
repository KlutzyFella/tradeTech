import { formatChange, trend } from "@/lib/format"
import { cn } from "@/lib/utils"

/** A signed % change with an arrow, so direction never depends on colour alone. */
export function PriceChange({ value, className }: { value: number; className?: string }) {
  const t = trend(value)
  return (
    <span className={cn("figures inline-flex items-center gap-0.5", t === "gain" && "text-gain", t === "loss" && "text-loss", t === "flat" && "text-muted-foreground", className)}>
      <span aria-hidden>{t === "gain" ? "▲" : t === "loss" ? "▼" : "•"}</span>
      {formatChange(value)}
    </span>
  )
}
