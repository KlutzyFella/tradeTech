import { importTemplateSchema, type EventTemplateData, type HostTemplateSummary } from "@tradetech/contracts"
import { useRef } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"
import { formatPaiseWhole } from "@/lib/format"
import { useHostTemplates, useTemplateAction } from "@/lib/host-queries"

/** A template file is the summary's name and description plus the data, so it round-trips through import. */
async function downloadTemplate(t: HostTemplateSummary): Promise<void> {
  const data = await api.get<EventTemplateData>(`/host/templates/${t.id}/export`)
  const blob = new Blob([JSON.stringify({ name: t.name, description: t.description, data }, null, 2)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `${t.name.replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "") || "template"}.tradetech.json`
  link.click()
  URL.revokeObjectURL(url)
}

/** Reads and validates a template file before it is sent, so problems are explained locally. */
async function readTemplateFile(file: File) {
  let json: unknown
  try {
    json = JSON.parse(await file.text())
  } catch {
    throw new Error("That file isn't valid JSON. Choose a template exported from TradeTech.")
  }
  const parsed = importTemplateSchema.safeParse(json)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw new Error(`That template can't be used: ${issue?.path.join(".") || "file"}: ${issue?.message ?? "invalid"}`)
  }
  return parsed.data
}

export function TemplatesPanel() {
  const templates = useHostTemplates()
  const fileInput = useRef<HTMLInputElement>(null)
  const remove = useTemplateAction((id: string) => api.del(`/host/templates/${id}`), "Template deleted")
  const importFile = useTemplateAction(async (file: File) => api.post("/host/templates", await readTemplateFile(file)), "Template imported")

  return (
    <section aria-labelledby="templates-heading" className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="templates-heading" className="text-lg font-semibold">
          Templates
        </h2>
        <Button type="button" size="sm" variant="outline" disabled={importFile.isPending} onClick={() => fileInput.current?.click()}>
          Import file
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          tabIndex={-1}
          aria-label="Template file to import"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ""
            if (file) importFile.mutate(file)
          }}
        />
      </div>
      {templates.data?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Save an event as a template from its console to reuse its stocks, rules and news calendar. Teams are never copied.
        </p>
      )}
      <ul className="divide-y divide-border border-y border-border text-sm empty:hidden">
        {templates.data?.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
            <span className="flex flex-col">
              <span className="font-medium">{t.name}</span>
              <span className="figures text-muted-foreground">
                {t.stockCount} {t.stockCount === 1 ? "stock" : "stocks"}, {t.newsCount} news, {formatPaiseWhole(t.startingCashRupees * 100)} each
              </span>
            </span>
            <span className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Download ${t.name}`}
                onClick={() => downloadTemplate(t).catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Download failed"))}
              >
                Download
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                aria-label={`Delete ${t.name}`}
                onClick={() => window.confirm(`Delete the template “${t.name}”? Events made from it are not affected.`) && remove.mutate(t.id)}
              >
                Delete
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
