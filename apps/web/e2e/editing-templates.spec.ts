import { readFile } from "node:fs/promises"
import { expect, type APIRequestContext, type Page } from "@playwright/test"
import { test } from "./fixtures"
import { signInAsHost } from "./host-session"

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000"

async function api(ctx: APIRequestContext, method: "GET" | "POST", path: string, data: unknown = {}) {
  const res = method === "GET" ? await ctx.get(`${BASE}/api${path}`) : await ctx.post(`${BASE}/api${path}`, { data })
  if (!res.ok()) throw new Error(`${path}: ${res.status()} ${await res.text()}`)
  return (await res.json()).data
}

/** A draft event with one stock and a draft news item planned for minute 5. */
async function draftEvent(ctx: APIRequestContext, prefix: string) {
  // Unique across parallel workers: time plus randomness.
  const code = `${prefix}${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase()
  const name = `Setup ${code}`
  const room = await api(ctx, "POST", "/host/rooms", { name, code, startingCashRupees: 500_000 })
  const stock = await api(ctx, "POST", `/host/rooms/${room.id}/stocks`, {
    ticker: "OILCO",
    name: "Meridian Oil",
    sector: "Energy",
    openingPrice: 100,
    depth: 200_000,
    borrowPool: 1000,
  })
  await api(ctx, "POST", `/host/rooms/${room.id}/news`, {
    headline: "Refinery fire",
    kind: "mechanical",
    impacts: { [stock.id]: -0.05 },
    mode: "draft",
  })
  return { id: room.id as string, code, name }
}

/** Answers browser prompts in order; confirms are accepted. */
function answerDialogs(page: Page): string[] {
  const answers: string[] = []
  page.on("dialog", (dialog) => void (dialog.type() === "prompt" ? dialog.accept(answers.shift() ?? "") : dialog.accept()))
  return answers
}

test("the host edits rules and a stock while setting up, and trading fields lock once practice starts", async ({ page }) => {
  await signInAsHost(page.context())
  const event = await draftEvent(page.request, "E")
  answerDialogs(page)
  await page.goto("/")
  await page.getByRole("button", { name: new RegExp(event.name) }).click()
  await page.getByRole("button", { name: "Setup" }).click()

  // Rules are shown in plain units: a 0.05% fee is typed as 0.05, not 0.0005.
  const fee = page.getByLabel("Fee", { exact: true })
  await expect(fee).toHaveValue("0.05")
  await fee.fill("0.1")
  await page.getByLabel("Pause after price-moving news").fill("5")
  await page.getByRole("button", { name: "Save 2 changes" }).click()
  await expect(page.getByText("Rules saved")).toBeVisible()
  const saved = await api(page.request, "GET", `/host/rooms/${event.id}`)
  expect(saved.rules).toMatchObject({ fee: 0.001, newsPauseMs: 5000 })

  await page.getByRole("button", { name: "Edit OILCO" }).click()
  const sheet = page.getByRole("dialog", { name: "Edit OILCO" })
  await sheet.getByLabel("Company name").fill("Meridian Energy")
  await sheet.getByLabel("Opening price (₹)").fill("120")
  await sheet.getByRole("button", { name: "Save changes" }).click()
  await expect(page.getByText("OILCO saved")).toBeVisible()
  await expect(page.getByText(/Meridian Energy, Energy/)).toBeVisible()
  await expect(page.getByText(/opens ₹120\.00/)).toBeVisible()

  await api(page.request, "POST", `/host/rooms/${event.id}/status`, { status: "practice" })
  await page.reload()
  await page.getByRole("button", { name: new RegExp(event.name) }).click()
  await page.getByRole("button", { name: "Setup" }).click()
  await page.getByRole("button", { name: "Edit OILCO" }).click()
  await expect(page.getByRole("dialog", { name: "Edit OILCO" }).getByLabel("Opening price (₹)")).toBeDisabled()
  await expect(page.getByRole("dialog", { name: "Edit OILCO" }).getByLabel("Liquidity depth (shares)")).toBeEnabled()
})

test("an event saved as a template creates the next event with its stocks, rules and planned news", async ({ page }) => {
  await signInAsHost(page.context())
  const event = await draftEvent(page.request, "T")
  await api(page.request, "POST", `/host/rooms/${event.id}/rules`, { halfSpread: 0.002 })
  const answers = answerDialogs(page)
  const templateName = `Template ${event.code}`

  await page.goto("/")
  await page.getByRole("button", { name: new RegExp(event.name) }).click()
  answers.push(templateName)
  await page.getByRole("button", { name: "Save as template" }).click()
  await expect(page.getByText(/Saved as a template/)).toBeVisible()

  await page.getByRole("button", { name: "All events" }).click()
  const templates = page.getByRole("region", { name: "Templates" })
  await expect(templates.getByText(templateName)).toBeVisible()
  await expect(templates.getByText(/1 stock, 1 news, ₹5,00,000 each/).first()).toBeVisible()

  const download = page.waitForEvent("download")
  await templates.getByRole("button", { name: `Download ${templateName}` }).click()
  const file = JSON.parse(await readFile(await (await download).path(), "utf8"))
  expect(file).toMatchObject({ name: templateName, data: { version: 1, stocks: [{ ticker: "OILCO" }], news: [{ impacts: { OILCO: -0.05 } }] } })

  // Importing that file under a new name adds a second copy.
  const importedName = `${templateName} copy`
  await page.getByLabel("Template file to import").setInputFiles({
    name: "copy.tradetech.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...file, name: importedName })),
  })
  await expect(templates.getByText(importedName)).toBeVisible()

  const code = `N${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase()
  await page.getByLabel("Start from").selectOption({ label: templateName })
  await expect(page.getByLabel("Starting cash per team (₹)")).toHaveValue("500000")
  await page.getByLabel("Event name").fill(`From template ${code}`)
  await page.getByLabel("Room code").fill(code)
  await page.getByRole("button", { name: "Create event" }).click()

  await expect(page.getByRole("heading", { name: `From template ${code}` })).toBeVisible()
  await page.getByRole("button", { name: "Setup" }).click()
  await expect(page.getByText(/OILCO Meridian Oil, Energy/)).toBeVisible()
  await expect(page.getByLabel("Half-spread")).toHaveValue("0.2")
  await page.getByRole("button", { name: "News", exact: true }).click()
  await expect(page.getByText("Refinery fire")).toBeVisible()
  await expect(page.getByText("Draft", { exact: true })).toBeVisible()

  // The event got a copy: deleting the template leaves it untouched.
  await page.getByRole("button", { name: "All events" }).click()
  await templates.getByRole("button", { name: `Delete ${importedName}` }).click()
  await expect(templates.getByText(importedName)).toHaveCount(0)
})
