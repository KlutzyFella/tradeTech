import type { HostRoomView } from "@tradetech/contracts"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatPaise, formatPrice } from "@/lib/format"
import { useHostAction } from "@/lib/host-queries"

/** Blueprint §8: depth so that this much net buying moves the price ~10%. */
function suggestedDepth(price: number, teams: number, startingCashPaise: number): number {
  const stressRupees = Math.max(1, teams) * (startingCashPaise / 100) * 0.1
  return Math.round(stressRupees / price / Math.log(1.1))
}

export function SetupPanel({ room }: { room: HostRoomView }) {
  const locked = room.status !== "draft" && room.status !== "practice"
  return (
    <div className="flex flex-col gap-8">
      {locked && <p className="text-sm text-muted-foreground">Teams and stocks are locked once the event is live.</p>}
      <Stocks room={room} locked={locked} />
      <Teams room={room} locked={locked} />
    </div>
  )
}

function Stocks({ room, locked }: { room: HostRoomView; locked: boolean }) {
  const blank = { ticker: "", name: "", sector: "", openingPrice: "", depth: "", borrowPool: "", profile: "" }
  const [form, setForm] = useState(blank)
  const add = useHostAction<Record<string, unknown>>(room.id, () => "/stocks", { success: "Stock added" })
  const price = Number(form.openingPrice)
  const depth = form.depth ? Number(form.depth) : price > 0 ? suggestedDepth(price, room.teams.length, room.startingCashPaise) : 0
  const field = (key: keyof typeof blank, label: string, numeric = false) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`stock-${key}`}>{label}</Label>
      <Input
        id={`stock-${key}`}
        inputMode={numeric ? "decimal" : "text"}
        value={form[key]}
        placeholder={key === "depth" && depth ? String(depth) : undefined}
        onChange={(e) => setForm({ ...form, [key]: numeric ? e.target.value.replace(/[^\d.]/g, "") : e.target.value })}
        className={numeric ? "figures" : undefined}
      />
    </div>
  )
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-semibold">Stocks ({room.stocks.length})</h2>
      <ul className="divide-y divide-border border-y border-border text-sm">
        {room.stocks.map((s) => (
          <li key={s.id} className="figures flex justify-between gap-3 py-2">
            <span>
              <span className="font-medium">{s.ticker}</span> {s.name}, {s.sector}
            </span>
            <span className="text-muted-foreground">
              opens {formatPrice(s.openingPrice)}, depth {Math.round(s.depth).toLocaleString("en-IN")}
            </span>
          </li>
        ))}
      </ul>
      {!locked && (
        <form
          className="grid grid-cols-2 gap-3 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault()
            add.mutate(
              {
                ticker: form.ticker,
                name: form.name,
                sector: form.sector,
                profile: form.profile,
                openingPrice: price,
                depth,
                borrowPool: form.borrowPool ? Number(form.borrowPool) : Math.round(depth / 5),
              },
              { onSuccess: () => setForm(blank) },
            )
          }}
        >
          {field("ticker", "Ticker")}
          {field("name", "Company name")}
          {field("sector", "Sector")}
          {field("openingPrice", "Opening price (₹)", true)}
          {field("depth", "Liquidity depth (shares)", true)}
          {field("borrowPool", "Shares to lend for shorts", true)}
          <div className="col-span-2 flex flex-col gap-1.5 sm:col-span-3">
            <Label htmlFor="stock-profile">Company profile for teams</Label>
            <textarea id="stock-profile" rows={2} value={form.profile} onChange={(e) => setForm({ ...form, profile: e.target.value })} className="rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </div>
          <p className="col-span-2 text-sm text-muted-foreground sm:col-span-3">
            Leave depth blank to use the suggested value: 10% of all teams’ cash buying this stock moves its price about 10%.
          </p>
          <Button type="submit" className="justify-self-start" disabled={!form.ticker || !form.name || !form.sector || !(price > 0) || add.isPending}>
            Add stock
          </Button>
        </form>
      )}
    </section>
  )
}

function Teams({ room, locked }: { room: HostRoomView; locked: boolean }) {
  const [text, setText] = useState("")
  const importTeams = useHostAction<{ teams: { name: string; loginName: string; password: string }[] }>(room.id, () => "/teams", { success: "Teams added" })
  const resetPassword = useHostAction<{ teamId: string; password: string }>(room.id, (v) => `/teams/${v.teamId}/password`, {
    success: "Password reset — the team has been signed out",
    body: ({ password }) => ({ password }),
  })
  const setStatus = useHostAction<{ teamId: string; status: "active" | "disqualified"; reason: string }>(room.id, (v) => `/teams/${v.teamId}/status`, {
    body: ({ status, reason }) => ({ status, reason }),
  })
  const closed = room.status === "closed"
  const rows = text
    .split("\n")
    .map((line) => line.split(",").map((part) => part.trim()))
    .filter((parts) => parts.length >= 3 && parts[0])
    .map(([name, loginName, password]) => ({ name: name!, loginName: loginName!, password: password! }))
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-semibold">Teams ({room.teams.length})</h2>
      <ul className="divide-y divide-border border-y border-border text-sm">
        {room.teams.map((t) => (
          <li key={t.id} className="figures flex justify-between gap-3 py-2">
            <span>
              <span className="font-medium">{t.name}</span> signs in as {t.loginName}
              {t.status !== "active" && <span className="text-destructive"> ({t.status})</span>}
            </span>
            <span className="flex items-center gap-2">
              <span className="text-muted-foreground">{formatPaise(t.cashPaise)} cash</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const password = window.prompt(`New password for ${t.name} (8+ characters)`)
                  if (password) resetPassword.mutate({ teamId: t.id, password })
                }}
              >
                Reset password
              </Button>
              {!closed && t.status === "disqualified" && (
                <Button size="sm" variant="ghost" onClick={() => setStatus.mutate({ teamId: t.id, status: "active", reason: "" })}>
                  Reinstate
                </Button>
              )}
              {!closed && t.status !== "disqualified" && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => {
                    const reason = window.prompt(`Why is ${t.name} being disqualified? Teams are signed out and never ranked.`)
                    if (reason?.trim()) setStatus.mutate({ teamId: t.id, status: "disqualified", reason })
                  }}
                >
                  Disqualify
                </Button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {!locked && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            importTeams.mutate({ teams: rows }, { onSuccess: () => setText("") })
          }}
        >
          <Label htmlFor="team-import">Add teams: one per line as name, login, password (8+ characters)</Label>
          <textarea
            id="team-import"
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"Bulls, bulls, choose-a-password\nBears, bears, another-password"}
            className="figures rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <Button type="submit" className="self-start" disabled={rows.length === 0 || importTeams.isPending}>
            Add {rows.length || ""} {rows.length === 1 ? "team" : "teams"}
          </Button>
        </form>
      )}
    </section>
  )
}
