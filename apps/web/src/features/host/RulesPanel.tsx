import type { HostRoomView, RoomRules } from "@tradetech/contracts"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useHostAction } from "@/lib/host-queries"

type Unit = "percent" | "times" | "seconds"
interface RuleField {
  key: keyof RoomRules
  label: string
  unit: Unit
  hint: string
}

/** Grouped, in plain units: the API stores fractions and milliseconds. */
const GROUPS: readonly { title: string; fields: readonly RuleField[] }[] = [
  {
    title: "Trading costs",
    fields: [
      {
        key: "halfSpread",
        label: "Half-spread",
        unit: "percent",
        hint: "Dealer's margin on each side of the price.",
      },
      {
        key: "fee",
        label: "Fee",
        unit: "percent",
        hint: "Charged on every filled order's value.",
      },
    ],
  },
  {
    title: "Limits",
    fields: [
      {
        key: "maxOrderMove",
        label: "Max price move per order",
        unit: "percent",
        hint: "Bigger orders are refused with the largest size that fits.",
      },
      {
        key: "maxPositionFraction",
        label: "Max in one stock",
        unit: "percent",
        hint: "Of the team's equity.",
      },
      {
        key: "maxShortFraction",
        label: "Max total shorts",
        unit: "percent",
        hint: "Of the team's equity.",
      },
      {
        key: "maxGrossExposure",
        label: "Max gross exposure",
        unit: "times",
        hint: "Longs plus shorts, as a multiple of equity.",
      },
    ],
  },
  {
    title: "Margin",
    fields: [
      {
        key: "collateralRatio",
        label: "Short collateral",
        unit: "times",
        hint: "Cash held back per rupee shorted.",
      },
      {
        key: "maintenanceCollateralRatio",
        label: "Liquidate below collateral",
        unit: "times",
        hint: "Short collateral level that triggers closing a team out.",
      },
      {
        key: "maintenanceEquityRatio",
        label: "Liquidate below equity",
        unit: "percent",
        hint: "Equity as a share of gross exposure.",
      },
    ],
  },
  {
    title: "Timing",
    fields: [
      {
        key: "newsPauseMs",
        label: "Pause after price-moving news",
        unit: "seconds",
        hint: "Affected stocks refuse orders while prices update.",
      },
      {
        key: "minOrderIntervalMs",
        label: "Time between a team's orders",
        unit: "seconds",
        hint: "Stops click-spam.",
      },
    ],
  },
]

const UNIT_SUFFIX: Record<Unit, string> = {
  percent: "%",
  times: "×",
  seconds: "s",
}
const toDisplay = (unit: Unit, v: number) => String(unit === "percent" ? +(v * 100).toFixed(4) : unit === "seconds" ? v / 1000 : v)
const fromDisplay = (unit: Unit, text: string) => {
  const n = Number(text)
  return unit === "percent" ? n / 100 : unit === "seconds" ? Math.round(n * 1000) : n
}

export function RulesPanel({ room }: { room: HostRoomView }) {
  const editable = room.status === "draft" || room.status === "practice"
  const initial = () =>
    Object.fromEntries(GROUPS.flatMap((g) => g.fields.map((f) => [f.key, toDisplay(f.unit, room.rules[f.key])]))) as Record<keyof RoomRules, string>
  const [values, setValues] = useState(initial)
  const save = useHostAction<Partial<RoomRules>>(room.id, () => "/rules", {
    success: "Rules saved",
  })
  const fields = GROUPS.flatMap((g) => g.fields)
  const changed = fields.filter((f) => values[f.key] !== toDisplay(f.unit, room.rules[f.key]))
  const invalid = changed.some((f) => values[f.key].trim() === "" || !Number.isFinite(Number(values[f.key])))

  return (
    <section aria-labelledby="rules-heading" className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5 xl:col-span-2">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="rules-heading" className="text-lg font-semibold">
          Rules
        </h2>
        <p className="text-xs text-muted-foreground">
          {editable ? "Editable while setting up and in practice." : "Locked: rules can't change once the event is live."}
        </p>
      </div>
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate(Object.fromEntries(changed.map((f) => [f.key, fromDisplay(f.unit, values[f.key])])))
        }}
      >
        <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-4">
          {GROUPS.map((group) => (
            <fieldset key={group.title} disabled={!editable} className="flex flex-col gap-3">
              <legend className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">{group.title}</legend>
              {group.fields.map((f) => (
                <div key={f.key} className="flex flex-col gap-1">
                  <Label htmlFor={`rule-${f.key}`}>{f.label}</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id={`rule-${f.key}`}
                      inputMode="decimal"
                      autoComplete="off"
                      value={values[f.key]}
                      onChange={(e) =>
                        setValues({
                          ...values,
                          [f.key]: e.target.value.replace(/[^\d.]/g, ""),
                        })
                      }
                      aria-describedby={`rule-${f.key}-hint`}
                      className="figures h-9 w-28"
                    />
                    <span className="text-sm text-muted-foreground">{UNIT_SUFFIX[f.unit]}</span>
                  </div>
                  <p id={`rule-${f.key}-hint`} className="text-xs text-muted-foreground">
                    {f.hint}
                  </p>
                </div>
              ))}
            </fieldset>
          ))}
        </div>
        {editable && (
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={changed.length === 0 || invalid || save.isPending}>
              {changed.length === 0 ? "No changes" : `Save ${changed.length} ${changed.length === 1 ? "change" : "changes"}`}
            </Button>
            {changed.length > 0 && (
              <Button type="button" variant="ghost" onClick={() => setValues(initial())}>
                Undo changes
              </Button>
            )}
          </div>
        )}
      </form>
    </section>
  )
}
