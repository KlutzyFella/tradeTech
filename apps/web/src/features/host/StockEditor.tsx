import type { HostRoomView, HostStockView, UpdateStock } from "@tradetech/contracts"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { useHostAction } from "@/lib/host-queries"

interface StockEditorProps {
  room: HostRoomView
  stock: HostStockView | null
  onClose: () => void
}

/** Side panel for editing one stock; fields the event's stage doesn't allow are disabled with the reason shown. */
export function StockEditor({ room, stock, onClose }: StockEditorProps) {
  return (
    <Sheet open={stock !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto overscroll-contain bg-surface sm:max-w-md">
        {stock && <EditorForm key={stock.id} room={room} stock={stock} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  )
}

function EditorForm({ room, stock, onClose }: { room: HostRoomView; stock: HostStockView; onClose: () => void }) {
  const setup = room.status === "draft" || room.status === "practice"
  const draft = room.status === "draft"
  const [v, setV] = useState({
    name: stock.name,
    sector: stock.sector,
    profile: stock.profile,
    openingPrice: String(stock.openingPrice),
    depth: String(Math.round(stock.depth)),
    sensitivity: String(stock.sensitivity),
    borrowPool: String(stock.borrowPool),
    bandPercent: String(+(stock.bandFraction * 100).toFixed(2)),
    shortable: stock.shortable,
  })
  const save = useHostAction<UpdateStock>(room.id, () => `/stocks/${stock.id}`, { success: `${stock.ticker} saved` })

  const changes: UpdateStock = {
    ...(v.name !== stock.name ? { name: v.name } : {}),
    ...(v.sector !== stock.sector ? { sector: v.sector } : {}),
    ...(v.profile !== stock.profile ? { profile: v.profile } : {}),
    ...(draft && Number(v.openingPrice) !== stock.openingPrice ? { openingPrice: Number(v.openingPrice) } : {}),
    ...(setup && Number(v.depth) !== Math.round(stock.depth) ? { depth: Number(v.depth) } : {}),
    ...(setup && Number(v.sensitivity) !== stock.sensitivity ? { sensitivity: Number(v.sensitivity) } : {}),
    ...(setup && Number(v.borrowPool) !== stock.borrowPool ? { borrowPool: Number(v.borrowPool) } : {}),
    ...(setup && Number(v.bandPercent) / 100 !== stock.bandFraction ? { bandFraction: Number(v.bandPercent) / 100 } : {}),
    ...(setup && v.shortable !== stock.shortable ? { shortable: v.shortable } : {}),
  }
  const count = Object.keys(changes).length

  const text = (key: "name" | "sector", label: string) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`edit-${key}`}>{label}</Label>
      <Input id={`edit-${key}`} value={v[key]} onChange={(e) => setV({ ...v, [key]: e.target.value })} />
    </div>
  )
  const num = (key: "openingPrice" | "depth" | "sensitivity" | "borrowPool" | "bandPercent", label: string, enabled: boolean, hint?: string) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`edit-${key}`}>{label}</Label>
      <Input
        id={`edit-${key}`}
        inputMode="decimal"
        autoComplete="off"
        disabled={!enabled}
        value={v[key]}
        onChange={(e) => setV({ ...v, [key]: e.target.value.replace(/[^\d.]/g, "") })}
        className="figures"
        aria-describedby={hint ? `edit-${key}-hint` : undefined}
      />
      {hint && (
        <p id={`edit-${key}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  )

  return (
    <form
      className="flex flex-col gap-5 p-5"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate(changes, { onSuccess: onClose })
      }}
    >
      <div>
        <SheetTitle className="font-heading text-xl">Edit {stock.ticker}</SheetTitle>
        <SheetDescription>
          {setup ? "Changes apply immediately for every team." : "The event is live: only the name, sector and profile can change."}
        </SheetDescription>
      </div>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Description</legend>
        {text("name", "Company name")}
        {text("sector", "Sector")}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-profile">Profile for teams</Label>
          <textarea
            id="edit-profile"
            rows={3}
            value={v.profile}
            onChange={(e) => setV({ ...v, profile: e.target.value })}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Trading</legend>
        {num("openingPrice", "Opening price (₹)", draft, draft ? undefined : "Fixed once practice trading has started.")}
        {num("depth", "Liquidity depth (shares)", setup, "Higher depth: orders move the price less.")}
        {num("sensitivity", "Sensitivity", setup)}
        {num("bandPercent", "Price band (± %)", setup, "Trades that would cross it are refused; news that crosses it halts the stock.")}
        {num("borrowPool", "Shares to lend for shorts", setup, `${stock.borrowUsed} currently lent; the pool can't go below that.`)}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            disabled={!setup}
            checked={v.shortable}
            onChange={(e) => setV({ ...v, shortable: e.target.checked })}
            className="size-4 accent-[var(--brand)]"
          />
          Teams can short this stock
        </label>
      </fieldset>
      <div className="flex gap-2">
        <Button type="submit" disabled={count === 0 || save.isPending}>
          {count === 0 ? "No changes" : "Save changes"}
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
