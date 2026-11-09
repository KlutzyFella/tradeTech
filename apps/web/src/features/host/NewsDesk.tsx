import type { HostRoomView } from "@tradetech/contracts"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatChange } from "@/lib/format"
import { useHostAction, useHostNews } from "@/lib/host-queries"
import { cn } from "@/lib/utils"

type Kind = "mechanical" | "information"
type Mode = "publish" | "draft" | "schedule"

export function NewsDesk({ room }: { room: HostRoomView }) {
  const [headline, setHeadline] = useState("")
  const [body, setBody] = useState("")
  const [kind, setKind] = useState<Kind>("information")
  const [shocks, setShocks] = useState<Record<string, string>>({})
  const [minute, setMinute] = useState("")
  const create = useHostAction<Record<string, unknown>>(room.id, () => "/news")
  const news = useHostNews(room.id)
  const publishDraft = useHostAction<{ id: string }>(room.id, (b) => `/news/${b.id}/publish`, "Published")

  const impacts = Object.fromEntries(
    Object.entries(shocks)
      .filter(([, pct]) => pct !== "" && Number(pct) !== 0 && Number.isFinite(Number(pct)))
      .map(([id, pct]) => [id, Number(pct) / 100]),
  )
  const ready = headline.trim() !== "" && (kind === "information" || Object.keys(impacts).length > 0)
  const submit = (mode: Mode) => {
    if (mode === "publish" && !window.confirm(`Publish “${headline}” to every team now?`)) return
    create.mutate(
      { headline, body, kind, impacts: kind === "mechanical" ? impacts : {}, mode, ...(mode === "schedule" ? { scheduleAtMinute: Number(minute) } : {}) },
      {
        onSuccess: () => {
          setHeadline("")
          setBody("")
          setShocks({})
        },
      },
    )
  }
  const tickers = new Map(room.stocks.map((s) => [s.id, s.ticker]))

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Write news</h2>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="news-headline">Headline</Label>
          <Input id="news-headline" value={headline} onChange={(e) => setHeadline(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="news-body">Details for teams</Label>
          <textarea id="news-body" rows={3} value={body} onChange={(e) => setBody(e.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm" />
        </div>
        <div role="radiogroup" aria-label="News type" className="grid grid-cols-2 gap-2">
          {(["information", "mechanical"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={cn("rounded-md border px-3 py-2 text-left text-sm", kind === k ? "border-foreground bg-secondary" : "border-border")}
            >
              <span className="block font-medium">{k === "information" ? "Information only" : "Moves prices"}</span>
              <span className="text-muted-foreground">{k === "information" ? "Teams react; prices don’t jump." : "You set each stock’s move."}</span>
            </button>
          ))}
        </div>
        {kind === "mechanical" && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Price move per stock (%). Private — teams never see these.</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {room.stocks.map((s) => (
                <label key={s.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5 text-sm">
                  {s.ticker}
                  <Input
                    inputMode="decimal"
                    aria-label={`${s.ticker} move in percent`}
                    value={shocks[s.id] ?? ""}
                    onChange={(e) => setShocks({ ...shocks, [s.id]: e.target.value.replace(/[^\d.-]/g, "") })}
                    placeholder="0"
                    className="figures h-8 w-20 text-right"
                  />
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {create.error && <p role="alert" className="text-sm text-destructive">{create.error.message}</p>}
        <div className="flex flex-wrap items-end gap-2">
          <Button disabled={!ready || create.isPending} onClick={() => submit("publish")}>
            Publish now
          </Button>
          <Button variant="outline" disabled={!ready || create.isPending} onClick={() => submit("draft")}>
            Save draft
          </Button>
          <div className="flex items-end gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="news-minute">At round minute</Label>
              <Input id="news-minute" inputMode="decimal" value={minute} onChange={(e) => setMinute(e.target.value.replace(/[^\d.]/g, ""))} className="figures w-24" />
            </div>
            <Button variant="outline" disabled={!ready || minute === "" || create.isPending} onClick={() => submit("schedule")}>
              Schedule
            </Button>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">News log</h2>
        {news.data?.length === 0 && <p className="text-sm text-muted-foreground">Nothing written yet.</p>}
        <ul className="divide-y divide-border border-y border-border">
          {news.data?.map((item) => (
            <li key={item.id} className="flex flex-col gap-1 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{item.headline}</span>
                <Badge variant={item.status === "published" ? "secondary" : "outline"}>
                  {item.status === "scheduled" ? `At minute ${((item.scheduledAtMs ?? 0) / 60000).toFixed(1)}` : item.status === "draft" ? "Draft" : "Published"}
                </Badge>
              </div>
              <p className="figures text-sm text-muted-foreground">
                {item.kind === "information"
                  ? "Information only"
                  : Object.entries(item.impacts)
                      .map(([id, shock]) => `${tickers.get(id) ?? id} ${formatChange(shock)}`)
                      .join(", ")}
              </p>
              {item.status !== "published" && (
                <Button size="sm" variant="outline" className="self-start" onClick={() => window.confirm("Publish this now?") && publishDraft.mutate({ id: item.id })}>
                  Publish now
                </Button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
