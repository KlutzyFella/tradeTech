import { CircleHelpIcon } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { useEventRules } from "@/lib/queries"
import { DESKTOP_QUERY, useMediaQuery } from "@/lib/use-media-query"
import { describeRules, quickStart } from "./rules-copy"

const seenKey = (teamId: string) => `tradetech:rules-seen:${teamId}`

/** Per-browser convenience only: storage can be unavailable (private mode), so failures just show the rules again. */
function hasSeen(teamId: string): boolean {
  try {
    return window.localStorage.getItem(seenKey(teamId)) === "1"
  } catch {
    return false
  }
}

function markSeen(teamId: string): void {
  try {
    window.localStorage.setItem(seenKey(teamId), "1")
  } catch {
    // Not remembered; the explainer opens again next visit, which is harmless.
  }
}

type View = "quick" | "full"

/**
 * The "?" header button and the rules sheet. A team's first visit in this
 * browser opens a three-step quick start; "?" opens the full rules.
 */
export function HowItWorks({ teamId }: { teamId: string }) {
  // The shell remounts for a different team, so reading once at mount is enough.
  const [open, setOpen] = useState(() => !hasSeen(teamId))
  const [view, setView] = useState<View>("quick")
  const desktop = useMediaQuery(DESKTOP_QUERY)
  const change = (next: boolean) => {
    setOpen(next)
    if (!next) markSeen(teamId)
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="How it works"
        title="How it works"
        onClick={() => {
          setView("full")
          change(true)
        }}
      >
        <CircleHelpIcon />
      </Button>
      <Sheet open={open} onOpenChange={change}>
        <SheetContent side={desktop ? "right" : "bottom"} className="max-h-[90dvh] overflow-y-auto overscroll-contain bg-surface data-[side=right]:sm:max-w-lg">
          {open &&
            (view === "quick" ? (
              <QuickStart device={desktop ? "desktop" : "phone"} onDone={() => change(false)} onAllRules={() => setView("full")} />
            ) : (
              <RulesBody onDone={() => change(false)} />
            ))}
        </SheetContent>
      </Sheet>
    </>
  )
}

function QuickStart({ device, onDone, onAllRules }: { device: "phone" | "desktop"; onDone: () => void; onAllRules: () => void }) {
  const rules = useEventRules(true)
  return (
    <div className="flex flex-col gap-6 p-5 lg:p-6">
      <div className="flex flex-col gap-1 pr-8">
        <SheetTitle className="font-heading text-xl">Quick start</SheetTitle>
        <SheetDescription>Three things to know before your first trade.</SheetDescription>
      </div>
      {rules.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {rules.isError && <p className="text-sm text-destructive">{rules.error.message}</p>}
      {rules.data && (
        <ol className="flex flex-col gap-4">
          {quickStart(rules.data, device).map((step, i) => (
            <li key={step.title} className="flex gap-3">
              <span
                aria-hidden
                className="figures flex size-7 shrink-0 items-center justify-center rounded-full bg-brand font-heading text-sm font-semibold text-brand-foreground"
              >
                {i + 1}
              </span>
              <div className="flex flex-col gap-0.5">
                <h3 className="font-heading text-base font-semibold">{step.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
      <div className="flex flex-wrap gap-2">
        <Button onClick={onDone}>Start trading</Button>
        <Button variant="ghost" onClick={onAllRules}>
          Read all rules
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">The full rules are always under the ? button at the top.</p>
    </div>
  )
}

function RulesBody({ onDone }: { onDone: () => void }) {
  const rules = useEventRules(true)
  return (
    <div className="flex flex-col gap-6 p-5 lg:p-6">
      <div className="flex flex-col gap-1 pr-8">
        <SheetTitle className="font-heading text-xl">How it works</SheetTitle>
        <SheetDescription>The rules of this event. Reopen them any time with the ? button.</SheetDescription>
      </div>
      {rules.isPending && <p className="text-sm text-muted-foreground">Loading the rules…</p>}
      {rules.isError && <p className="text-sm text-destructive">{rules.error.message}</p>}
      {rules.data &&
        describeRules(rules.data).map((section, i) => (
          <section key={section.title} aria-labelledby={`rules-${i}`} className="flex flex-col gap-2">
            <h3 id={`rules-${i}`} className="font-heading text-base font-semibold">
              {section.title}
            </h3>
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-muted-foreground marker:text-brand-text">
              {section.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </section>
        ))}
      <Button className="self-start" onClick={onDone}>
        Got it
      </Button>
    </div>
  )
}
