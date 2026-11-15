import { formatPaiseWhole, formatSignedPaise, trend } from "@/lib/format"
import { usePortfolio } from "@/lib/queries"
import { cn } from "@/lib/utils"

const SCORE_HINT = "Your score: what you would have if you closed every position now, after price impact, spread and fees."

/**
 * The team's score, change since the start and spending money, always in view.
 * "inline" sits in the laptop header row; "strip" is a slim row under the phone header.
 */
export function HeaderScore({ layout }: { layout: "inline" | "strip" }) {
  const portfolio = usePortfolio()
  if (!portfolio.data) return null
  const p = portfolio.data
  const change = p.liquidationValuePaise - p.startingCashPaise
  const tone = trend(change)
  const changeText = (
    <span
      className={cn("figures text-xs font-medium", tone === "gain" && "text-gain", tone === "loss" && "text-loss", tone === "flat" && "text-muted-foreground")}
    >
      {tone === "gain" ? "▲ " : tone === "loss" ? "▼ " : ""}
      {formatSignedPaise(change)}
    </span>
  )

  if (layout === "strip") {
    return (
      <dl className="figures mx-auto flex w-full max-w-[1920px] items-baseline justify-between gap-3 border-t border-border/60 px-4 py-1.5 text-sm">
        <div className="flex items-baseline gap-2" title={SCORE_HINT}>
          <dt className="text-xs text-muted-foreground">Score</dt>
          <dd className="font-heading font-semibold">{formatPaiseWhole(p.liquidationValuePaise)}</dd>
          <dd>{changeText}</dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt className="text-xs text-muted-foreground">Cash</dt>
          <dd className="font-medium">{formatPaiseWhole(p.availableCashPaise)}</dd>
        </div>
      </dl>
    )
  }
  return (
    <dl className="figures flex items-end gap-5 leading-none">
      <div className="flex flex-col items-end gap-1" title={SCORE_HINT}>
        <dt className="text-[0.65rem] tracking-wide text-muted-foreground">Score</dt>
        <dd className="flex items-baseline gap-2">
          <span className="font-heading text-xl font-semibold">{formatPaiseWhole(p.liquidationValuePaise)}</span>
          {changeText}
        </dd>
      </div>
      <div className="flex flex-col items-end gap-1">
        <dt className="text-[0.65rem] tracking-wide text-muted-foreground">Available cash</dt>
        <dd className="font-heading text-xl font-semibold">{formatPaiseWhole(p.availableCashPaise)}</dd>
      </div>
    </dl>
  )
}
