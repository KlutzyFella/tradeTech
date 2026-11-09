import type { PortfolioView } from "@tradetech/contracts"
import { Skeleton } from "@/components/ui/skeleton"
import { formatPaise, formatPaiseWhole, formatPrice, formatShares, formatSignedPaise, trend } from "@/lib/format"
import { usePortfolio, useStandings } from "@/lib/queries"
import { cn } from "@/lib/utils"

const toneClass = (value: number) =>
  cn(trend(value) === "gain" && "text-gain", trend(value) === "loss" && "text-loss")

export function PortfolioScreen() {
  const portfolio = usePortfolio()
  if (portfolio.isPending) return <Skeleton className="m-4 h-40" />
  if (portfolio.isError) return <p className="px-4 py-6 text-destructive">{portfolio.error.message}</p>
  const p = portfolio.data
  const result = p.liquidationValuePaise - p.startingCashPaise

  return (
    <div className="flex flex-col gap-6 px-4 pb-6">
      <section aria-labelledby="score-heading" className="flex flex-col gap-1 pt-2">
        <h2 id="score-heading" className="text-sm text-muted-foreground">
          Score if you closed everything now
        </h2>
        <p className="figures text-3xl font-semibold">{formatPaiseWhole(p.liquidationValuePaise)}</p>
        <p className={cn("figures text-sm", toneClass(result))}>{formatSignedPaise(result)} since the start</p>
      </section>

      <StandingsSection />

      <Figures p={p} />

      <section aria-labelledby="positions-heading" className="flex flex-col gap-2">
        <h2 id="positions-heading" className="font-semibold">
          Positions
        </h2>
        {p.positions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No positions yet. Pick a stock on the Market tab to trade.</p>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {p.positions.map((pos) => (
              <li key={pos.stockId} className="figures flex items-center justify-between gap-3 py-3">
                <span className="flex flex-col">
                  <span className="font-semibold">{pos.ticker}</span>
                  <span className="text-sm text-muted-foreground">
                    {pos.quantity > 0 ? "Long" : "Short"} {formatShares(Math.abs(pos.quantity))} at {formatPrice(pos.mid)}
                  </span>
                </span>
                <span className="flex flex-col items-end">
                  <span>{formatPaise(pos.marketValuePaise)}</span>
                  <span className={cn("text-sm", toneClass(pos.unrealizedPnlPaise))}>{formatSignedPaise(pos.unrealizedPnlPaise)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="text-xs text-muted-foreground">
        Your score is the cash you would have after selling every holding and buying back every short at the dealer’s
        prices, including spread and fees. Market value and equity use the mid-price and are shown for reference.
      </p>
    </div>
  )
}

function StandingsSection() {
  const standings = useStandings()
  const s = standings.data
  if (!s) return null
  return (
    <section aria-labelledby="standing-heading" className="flex flex-col gap-2">
      <h2 id="standing-heading" className="font-semibold">
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
          You are rank {s.me.rank} of {s.teamCount}.
        </p>
      )}
      {!s.visible && <p className="text-sm text-muted-foreground">Your host is keeping the leaderboard hidden for now.</p>}
      {s.visible && s.entries.length > 0 && (
        <ol className="figures divide-y divide-border border-y border-border text-sm">
          {s.entries.map((e) => (
            <li key={`${e.rank}-${e.name}`} className="flex justify-between gap-3 py-1.5">
              <span>
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

function Figures({ p }: { p: PortfolioView }) {
  const rows: readonly [string, number][] = [
    ["Available cash", p.availableCashPaise],
    ["Cash held as short collateral", p.restrictedCashPaise],
    ["Total cash", p.cashPaise],
    ["Equity at mid-price", p.equityPaise],
    ["Gross exposure", p.grossExposurePaise],
  ]
  return (
    <dl className="figures grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="text-right">{formatPaise(value)}</dd>
        </div>
      ))}
    </dl>
  )
}
