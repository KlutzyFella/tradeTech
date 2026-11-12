import type { PricePoint } from "@tradetech/contracts"
import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from "react"
import { niceTicks, paddedDomain } from "@/lib/chart-geometry"
import { formatChange, formatPrice } from "@/lib/format"
import { useElementWidth } from "@/lib/use-element-width"
import { cn } from "@/lib/utils"

export interface ChartMarker {
  readonly t: string
  readonly label: string
  /** True when the story names this stock: drawn in the brand colour. */
  readonly emphasis: boolean
}

interface PriceChartProps {
  points: readonly PricePoint[]
  markers?: readonly ChartMarker[]
  /** Names the chart for assistive tech, e.g. "OILCO price this round". */
  title: string
  height?: number
}

const clock = new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit" })
const clockSeconds = new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
const axisPrice = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 })
const PAD = { top: 10, right: 64, bottom: 22, left: 46 }
const SR_TABLE_ROWS = 12

/**
 * Single-series price line: 2px trend-coloured line over a 10% wash, hairline
 * grid on clean ticks, a ringed end dot labelled with the latest price, news
 * markers on the timeline, and a crosshair readout on hover or keyboard.
 */
export function PriceChart({ points, markers = [], title, height = 160 }: PriceChartProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)
  const descId = useId()

  const geo = useMemo(() => {
    if (points.length < 2 || width < 120) return null
    const times = points.map((p) => new Date(p.t).getTime())
    const mids = points.map((p) => p.mid)
    const t0 = times[0]!
    const t1 = Math.max(times.at(-1)!, t0 + 1)
    const [lo, hi] = paddedDomain(mids)
    const innerW = width - PAD.left - PAD.right
    const innerH = height - PAD.top - PAD.bottom
    const x = (t: number) => PAD.left + ((t - t0) / (t1 - t0)) * innerW
    const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * innerH
    const xy = times.map((t, i) => [x(t), y(mids[i]!)] as const)
    const line = xy.map(([px, py], i) => `${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`).join("")
    const bottom = PAD.top + innerH
    const area = `${line}L${xy.at(-1)![0].toFixed(1)},${bottom}L${xy[0]![0].toFixed(1)},${bottom}Z`
    const ticks = niceTicks(lo, hi, 3).map((v) => ({ v, y: y(v) }))
    const marks = markers
      .map((m) => ({ ...m, x: x(new Date(m.t).getTime()) }))
      .filter((m) => m.x >= PAD.left - 0.5 && m.x <= PAD.left + innerW + 0.5)
    return { times, mids, xy, line, area, ticks, marks, bottom, t0, t1, innerW }
  }, [points, markers, width, height])

  const first = points[0]?.mid ?? 0
  const last = points.at(-1)?.mid ?? 0
  const change = first ? last / first - 1 : 0
  const up = change >= 0
  const summary =
    points.length < 2
      ? `${title}: not enough data yet.`
      : `${title}: from ${formatPrice(first)} to ${formatPrice(last)} (${formatChange(change)}), high ${formatPrice(Math.max(...points.map((p) => p.mid)))}, low ${formatPrice(Math.min(...points.map((p) => p.mid)))}.`

  const pick = (clientX: number, rect: DOMRect) => {
    if (!geo) return
    const px = clientX - rect.left
    let best = 0
    for (let i = 1; i < geo.xy.length; i++) if (Math.abs(geo.xy[i]![0] - px) < Math.abs(geo.xy[best]![0] - px)) best = i
    setActive(best)
  }
  const onPointer = (e: PointerEvent<SVGSVGElement>) => pick(e.clientX, e.currentTarget.getBoundingClientRect())
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (!geo) return
    const n = geo.xy.length
    const current = active ?? n - 1
    const next = e.key === "ArrowLeft" ? current - 1 : e.key === "ArrowRight" ? current + 1 : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : null
    if (next === null) return
    e.preventDefault()
    setActive(Math.max(0, Math.min(n - 1, next)))
  }

  const activePoint = active !== null && geo ? { x: geo.xy[active]![0], y: geo.xy[active]![1], p: points[active]! } : null
  const nearMarker =
    activePoint && geo ? geo.marks.find((m) => Math.abs(m.x - activePoint.x) <= Math.max(6, geo.innerW / geo.xy.length)) : undefined

  return (
    <figure className="relative flex flex-col gap-1" aria-describedby={descId}>
      <div ref={ref} className="relative w-full" style={{ height }}>
        {!geo ? (
          <div className="flex h-full items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
            {points.length < 2 ? "The chart fills in as the round runs." : "…"}
          </div>
        ) : (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={summary}
            tabIndex={0}
            onPointerMove={onPointer}
            onPointerLeave={() => setActive(null)}
            onKeyDown={onKey}
            onBlur={() => setActive(null)}
            className="block cursor-crosshair touch-pan-y rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {geo.ticks.map((t) => (
              <g key={t.v}>
                <line x1={PAD.left} x2={PAD.left + geo.innerW} y1={t.y} y2={t.y} className="stroke-border" strokeWidth={1} />
                <text x={PAD.left - 6} y={t.y} dy="0.32em" textAnchor="end" className="figures fill-muted-foreground text-[10px]">
                  {axisPrice.format(t.v)}
                </text>
              </g>
            ))}
            {geo.marks.map((m) => (
              <g key={`${m.t}-${m.label}`} aria-hidden>
                <line x1={m.x} x2={m.x} y1={PAD.top} y2={geo.bottom} strokeWidth={1} className={m.emphasis ? "stroke-brand-text/60" : "stroke-muted-foreground/30"} />
                <rect x={m.x - 3} y={geo.bottom - 3} width={6} height={6} transform={`rotate(45 ${m.x} ${geo.bottom})`} className={m.emphasis ? "fill-brand-text" : "fill-muted-foreground"} />
              </g>
            ))}
            <path d={geo.area} className={up ? "fill-gain" : "fill-loss"} fillOpacity={0.1} />
            <path d={geo.line} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className={up ? "stroke-gain" : "stroke-loss"} />
            <circle cx={geo.xy.at(-1)![0]} cy={geo.xy.at(-1)![1]} r={4} strokeWidth={2} className={cn("stroke-surface", up ? "fill-gain" : "fill-loss")} />
            <text x={geo.xy.at(-1)![0] + 8} y={geo.xy.at(-1)![1]} dy="0.32em" className="figures fill-foreground text-[11px] font-semibold">
              {formatPrice(last)}
            </text>
            <text x={PAD.left} y={height - 6} className="figures fill-muted-foreground text-[10px]">
              {clock.format(new Date(geo.t0))}
            </text>
            <text x={PAD.left + geo.innerW} y={height - 6} textAnchor="end" className="figures fill-muted-foreground text-[10px]">
              {clock.format(new Date(geo.t1))}
            </text>
            {activePoint && (
              <g aria-hidden>
                <line x1={activePoint.x} x2={activePoint.x} y1={PAD.top} y2={geo.bottom} className="stroke-foreground/40" strokeWidth={1} />
                <circle cx={activePoint.x} cy={activePoint.y} r={4} strokeWidth={2} className={cn("stroke-surface", up ? "fill-gain" : "fill-loss")} />
              </g>
            )}
          </svg>
        )}
        {activePoint && geo && (
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 z-10 max-w-56 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md"
            // Opposite side of the crosshair, so the readout never hides the line's latest stretch.
            style={activePoint.x > width / 2 ? { right: width - activePoint.x + 10 } : { left: activePoint.x + 10 }}
          >
            <p className="figures font-heading text-sm font-semibold">{formatPrice(activePoint.p.mid)}</p>
            <p className="figures text-muted-foreground">{clockSeconds.format(new Date(activePoint.p.t))}</p>
            {nearMarker && <p className="mt-1 line-clamp-2 font-medium">News: {nearMarker.label}</p>}
          </div>
        )}
      </div>
      <figcaption id={descId} className="sr-only">
        {summary}
        {points.length >= 2 && <SrTable points={points} />}
      </figcaption>
    </figure>
  )
}

/** A short table of evenly spaced readings: the chart's values without hovering. */
function SrTable({ points }: { points: readonly PricePoint[] }) {
  const step = Math.max(1, Math.floor(points.length / SR_TABLE_ROWS))
  const rows = points.filter((_, i) => i % step === 0 || i === points.length - 1)
  return (
    <table>
      <thead>
        <tr>
          <th scope="col">Time</th>
          <th scope="col">Price</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.t}>
            <td>{clockSeconds.format(new Date(p.t))}</td>
            <td>{formatPrice(p.mid)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Tiny trend line: muted stroke, end dot in the direction colour. Decorative; pair with visible numbers. */
export function Sparkline({ values, className }: { values: readonly number[]; className?: string }) {
  const W = 120
  const H = 32
  if (values.length < 2) return <span aria-hidden className={cn("block", className)} style={{ height: H }} />
  const [lo, hi] = paddedDomain(values)
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (W - 6) + 2, (1 - (v - lo) / (hi - lo)) * (H - 6) + 3] as const)
  const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join("")
  const up = values.at(-1)! >= values[0]!
  return (
    <svg aria-hidden viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={cn("block w-full", className)} style={{ height: H }}>
      <path d={d} fill="none" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" className="stroke-muted-foreground" />
      <circle cx={pts.at(-1)![0]} cy={pts.at(-1)![1]} r={2.75} className={up ? "fill-gain" : "fill-loss"} />
    </svg>
  )
}
