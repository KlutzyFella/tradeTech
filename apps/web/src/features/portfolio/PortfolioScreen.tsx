import type { PortfolioView } from "@tradetech/contracts"
import { Skeleton } from "@/components/ui/skeleton"
import { formatPaise, formatPaiseWhole, formatPrice, formatShares, formatSignedPaise, trend } from "@/lib/format"
import { usePortfolio, useStandings } from "@/lib/queries"
import { cn } from "@/lib/utils"

const toneClass = (value: number) => cn(trend(value) === "gain" && "text-gain", trend(value) === "loss" && "text-loss")
const arrow = (value: number) => (value > 0 ? "▲ " : value < 0 ? "▼ " : "")

const SCORE_EXPLAINER =
  "Your score is the cash you would have after selling every holding and buying back every short at the dealer’s prices, including spread and fees. Market value and equity use the mid-price and are shown for reference."

interface PortfolioScreenProps {
  /** "wide": KPI row and positions table for laptops; "stacked": phone layout. */
  layout: "wide" | "stacked"
  /** The wide desk's left column already shows the score and standing. */
  summaryElsewhere?: boolean
}

export function PortfolioScreen({ layout, summaryElsewhere = false }: PortfolioScreenProps) {
  const portfolio = usePortfolio()
  if (portfolio.isPending) return <Skeleton className="m-4 h-40" />
  if (portfolio.isError) return <p className="px-4 py-6 text-destructive">{portfolio.error.message}</p>
  const p = portfolio.data
  const wide = layout === "wide"

  return (
    <div className={cn("flex flex-col gap-6", wide ? "pb-6" : "px-4 pb-6")}>
      {!summaryElsewhere && <ScoreHero p={p} />}
      <div className="grid gap-6">
        <div className="flex flex-col gap-6">
          <Figures p={p} wide={wide} />
          <Positions p={p} wide={wide} />
        </div>
        {!summaryElsewhere && <StandingsSection />}
      </div>
      <p className="max-w-prose text-xs leading-relaxed text-muted-foreground">{SCORE_EXPLAINER}</p>
    </div>
  )
}

/** Compact score + standing for the laptop desk's left column. */
export function DeskSummary() {
  const portfolio = usePortfolio()
  if (!portfolio.data) return <Skeleton className="h-64" />
  const p = portfolio.data
  return (
    <div className="flex flex-col gap-5">
      <ScoreHero p={p} compact />
      <dl className="figures flex flex-col divide-y divide-border rounded-lg border border-border bg-surface text-sm">
        {[
          ["Available cash", p.availableCashPaise],
          ["Short collateral", p.restrictedCashPaise],
          ["Equity at mid-price", p.equityPaise],
        ].map(([label, value]) => (
          <div key={label as string} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium">{formatPaiseWhole(value as number)}</dd>
          </div>
        ))}
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <dt className="text-muted-foreground">Open positions</dt>
          <dd className="font-medium">{p.positions.length}</dd>
        </div>
      </dl>
      <StandingsSection compact />
    </div>
  )
}

function ScoreHero({ p, compact = false }: { p: PortfolioView; compact?: boolean }) {
  const result = p.liquidationValuePaise - p.startingCashPaise
  return (
    <section aria-labelledby={compact ? "desk-score" : "score-heading"} className="relative overflow-hidden rounded-lg border border-border bg-surface px-5 py-4">
      <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-brand" />
      <h2 id={compact ? "desk-score" : "score-heading"} className="text-xs font-medium tracking-wide text-muted-foreground">
        Score if you closed everything now
      </h2>
      <p className={cn("figures font-heading font-semibold tracking-tight", compact ? "text-3xl" : "text-4xl")}>
        {formatPaiseWhole(p.liquidationValuePaise)}
      </p>
      <p className={cn("figures text-sm font-medium", toneClass(result))}>
        {arrow(result)}
        {formatSignedPaise(result)} since the start
      </p>
    </section>
  )
}

function Figures({ p, wide }: { p: PortfolioView; wide: boolean }) {
  const tiles: readonly { label: string; value: number; hint?: string }[] = [
    { label: "Available cash", value: p.availableCashPaise, hint: "What you can spend now" },
    { label: "Short collateral", value: p.restrictedCashPaise, hint: "Held against open shorts" },
    { label: "Equity at mid-price", value: p.equityPaise },
    { label: "Gross exposure", value: p.grossExposurePaise },
  ]
  return (
    <dl className={cn("figures grid gap-3", wide ? "grid-cols-2 xl:grid-cols-4" : "grid-cols-2")}>
      {tiles.map((t) => (
        <div key={t.label} className="flex flex-col gap-0.5 rounded-lg bg-muted px-4 py-3">
          <dt className="text-xs text-muted-foreground">{t.label}</dt>
          <dd className="text-lg font-semibold">{formatPaiseWhole(t.value)}</dd>
          {t.hint && wide && <dd className="text-xs text-muted-foreground">{t.hint}</dd>}
        </div>
      ))}
    </dl>
  )
}

function Positions({ p, wide }: { p: PortfolioView; wide: boolean }) {
  return (
    <section aria-labelledby="positions-heading" className="flex flex-col gap-2">
      <h2 id="positions-heading" className="text-lg font-semibold">
        Positions
      </h2>
      {p.positions.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
          No positions yet. Pick a stock on the Market tab to trade.
        </p>
      ) : wide ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="figures w-full text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr>
                {["Stock", "Position", "Price", "Market value", "Unrealised", "Realised"].map((h, i) => (
                  <th key={h} scope="col" className={cn("px-4 py-2.5 font-medium", i === 0 ? "text-left" : "text-right")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {p.positions.map((pos) => (
                <tr key={pos.stockId}>
                  <th scope="row" className="px-4 py-3 text-left font-heading font-semibold tracking-wide">
                    {pos.ticker}
                  </th>
                  <td className={cn("px-4 py-3 text-right", pos.quantity > 0 ? "text-gain" : "text-loss")}>
                    {pos.quantity > 0 ? "Long" : "Short"} {formatShares(Math.abs(pos.quantity))}
                  </td>
                  <td className="px-4 py-3 text-right">{formatPrice(pos.mid)}</td>
                  <td className="px-4 py-3 text-right">{formatPaise(pos.marketValuePaise)}</td>
                  <td className={cn("px-4 py-3 text-right font-medium", toneClass(pos.unrealizedPnlPaise))}>
                    {arrow(pos.unrealizedPnlPaise)}
                    {formatSignedPaise(pos.unrealizedPnlPaise)}
                  </td>
                  <td className={cn("px-4 py-3 text-right", toneClass(pos.realizedPnlPaise))}>{formatSignedPaise(pos.realizedPnlPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {p.positions.map((pos) => (
            <li key={pos.stockId} className="figures flex items-center justify-between gap-3 px-4 py-3">
              <span className="flex flex-col">
                <span className="font-heading font-semibold tracking-wide">{pos.ticker}</span>
                <span className="text-sm text-muted-foreground">
                  {pos.quantity > 0 ? "Long" : "Short"} {formatShares(Math.abs(pos.quantity))} at {formatPrice(pos.mid)}
                </span>
              </span>
              <span className="flex flex-col items-end">
                <span>{formatPaise(pos.marketValuePaise)}</span>
                <span className={cn("text-sm", toneClass(pos.unrealizedPnlPaise))}>
                  {arrow(pos.unrealizedPnlPaise)}
                  {formatSignedPaise(pos.unrealizedPnlPaise)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function StandingsSection({ compact = false }: { compact?: boolean }) {
  const standings = useStandings()
  const s = standings.data
  if (!s) return null
  const headingId = compact ? "desk-standing" : "standing-heading"
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2 rounded-lg border border-border bg-surface px-4 py-4">
      <h2 id={headingId} className="text-base font-semibold">
        {s.final ? "Final result" : "Standing"}
      </h2>
      {s.final && (
        <p className="figures text-lg">
          Final score {formatPaiseWhole(s.me.liquidationValuePaise)}
          {s.me.rank !== null && `, rank ${s.me.rank} of ${s.teamCount}`}
        </p>
      )}
      {!s.final && s.me.rank !== null && (
        <p className="figures">
          You are rank <span className="font-heading text-xl font-semibold">{s.me.rank}</span> of {s.teamCount}.
        </p>
      )}
      {!s.visible && <p className="text-sm text-muted-foreground">Your host is keeping the leaderboard hidden for now.</p>}
      {s.visible && s.entries.length > 0 && (
        <ol className="figures divide-y divide-border text-sm">
          {s.entries.slice(0, compact ? 5 : undefined).map((e) => (
            <li key={`${e.rank}-${e.name}`} className="flex justify-between gap-3 py-1.5">
              <span className="truncate">
                <span className="inline-block w-7 font-semibold">{e.rank}</span>
                {e.name}
              </span>
              <span>{formatPaiseWhole(e.liquidationValuePaise)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
