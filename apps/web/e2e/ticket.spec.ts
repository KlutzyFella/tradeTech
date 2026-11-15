import { expect, request, type APIRequestContext } from "@playwright/test"
import { test } from "./fixtures"
import { HOST_STATE_PATH } from "./host-session"

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000"

async function call(ctx: APIRequestContext, path: string, data: unknown = {}) {
  const res = await ctx.post(`${BASE}/api${path}`, { data })
  if (!res.ok()) throw new Error(`${path}: ${res.status()} ${await res.text()}`)
  return (await res.json()).data
}

/** A practice event where the team holds 100 AIRCO and the host has paused the round. */
async function pausedWithHolding(host: APIRequestContext, team: APIRequestContext) {
  const code = `K${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase()
  const room = await call(host, "/host/rooms", { name: `Ticket ${code}`, code, startingCashRupees: 1_000_000, rules: { minOrderIntervalMs: 0 } })
  const base = `/host/rooms/${room.id}`
  const stock = await call(host, `${base}/stocks`, {
    ticker: "AIRCO",
    name: "Skyline Airways",
    sector: "Transport",
    openingPrice: 100,
    depth: 5_000_000,
    borrowPool: 10_000,
  })
  await call(host, `${base}/teams`, { teams: [{ name: "Pilots", loginName: "pilots", password: "pilots-pass" }] })
  await call(host, `${base}/status`, { status: "practice" })
  await call(host, `${base}/rounds`, { durationMinutes: 30 })
  await call(host, `${base}/rounds/current/start`)
  await call(team, "/auth/team/login", { roomCode: code, loginName: "pilots", password: "pilots-pass" })
  await call(team, "/orders", { requestId: crypto.randomUUID(), stockId: stock.id, intent: "buy", quantity: 100 })
  await call(host, `${base}/rounds/current/pause`)
  return { base }
}

test("the ticket says when trading is paused, still estimates, fixes an oversized sell, and fills once the round resumes", async ({ page }) => {
  const host = await request.newContext({ storageState: HOST_STATE_PATH })
  const event = await pausedWithHolding(host, page.request)

  await page.goto("/")
  // The header always shows the score, its change and spending money.
  const header = page.getByRole("banner")
  await expect(header).toContainText("Score")
  await expect(header).toContainText("₹9,99,970")
  await expect(header).toContainText("-₹30.02")
  await expect(header).toContainText("₹9,89,985")
  await page.getByRole("button", { name: /^AIRCO/ }).click()
  const status = page.getByRole("status").filter({ hasText: "Trading is paused" })
  await expect(status).toHaveText("Trading is paused. Orders open again when the host resumes the round.")

  // Buying: the estimate still works, with the cost breakdown, but the button waits.
  await page.getByLabel("Shares").fill("100")
  await expect(page.getByText("You pay")).toBeVisible()
  await expect(page.getByText("Spread and fee")).toBeVisible()
  await expect(page.getByText(/market ₹100\.\d\d/)).toBeVisible()
  await expect(page.getByText("Estimated at current prices.", { exact: false })).toBeVisible()
  await expect(page.getByRole("button", { name: "Buy 100 AIRCO" })).toBeDisabled()

  // Selling more than is held: the ticket says so and offers the fix.
  await page.getByRole("radio", { name: "Sell" }).click()
  await page.getByLabel("Shares").fill("500")
  await expect(page.getByText("You hold 100 shares; sell at most 100, then short separately.")).toBeVisible()
  await expect(page.getByRole("button", { name: "Use 100" })).toBeVisible()
  await page.getByRole("button", { name: "Sell all 100" }).click()
  await expect(page.getByLabel("Shares")).toHaveValue("100")
  await expect(page.getByText("You receive")).toBeVisible()

  // The host resumes: the notice goes and the order fills.
  await call(host, `${event.base}/rounds/current/resume`)
  await expect(status).toBeHidden()
  const sell = page.getByRole("button", { name: "Sell 100 AIRCO" })
  await expect(sell).toBeEnabled()
  await sell.click()
  await expect(page.getByText(/Sold 100 AIRCO at ₹\d+\.\d\d average/)).toBeVisible()
  // Cash is back; the score was already counting those shares at their closing value.
  await expect(header).not.toContainText("₹9,89,985")
  await expect(header).toContainText("₹9,99,970")
  await host.dispose()
})
