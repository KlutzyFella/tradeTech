import { expect, request, type APIRequestContext } from "@playwright/test"
import { test } from "./fixtures"
import { signInAsHost } from "./host-session"

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000"

async function call(ctx: APIRequestContext, path: string, data: unknown = {}) {
  const res = await ctx.post(`${BASE}/api${path}`, { data })
  if (!res.ok()) throw new Error(`${path}: ${res.status()} ${await res.text()}`)
  return (await res.json()).data
}

/** A practising event where team "squeezed" is short 2,000 shares and team "idle" has done nothing. */
async function shortedEvent(host: APIRequestContext) {
  const code = `M${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase()
  const name = `Monitor ${code}`
  const room = await call(host, "/host/rooms", { name, code, startingCashRupees: 1_000_000, rules: { minOrderIntervalMs: 0 } })
  const base = `/host/rooms/${room.id}`
  const stock = await call(host, `${base}/stocks`, {
    ticker: "SQZ",
    name: "Squeeze Co",
    sector: "Tech",
    openingPrice: 100,
    depth: 5_000_000,
    borrowPool: 10_000,
  })
  await call(host, `${base}/teams`, {
    teams: [
      { name: "Squeezed", loginName: "squeezed", password: "squeeze-pass" },
      { name: "Idle", loginName: "idle", password: "idle-pass-1" },
    ],
  })
  await call(host, `${base}/status`, { status: "practice" })
  await call(host, `${base}/rounds`, { durationMinutes: 30 })
  await call(host, `${base}/rounds/current/start`)

  const team = await request.newContext()
  await call(team, "/auth/team/login", { roomCode: code, loginName: "squeezed", password: "squeeze-pass" })
  await call(team, "/orders", { requestId: crypto.randomUUID(), stockId: stock.id, intent: "short", quantity: 2000 })
  return { name, code, base, stockId: stock.id as string, team }
}

test("the host monitor shows trades, connections and a margin breach until the close-out", async ({ page, browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Runs once: it drives server state; the phone layout is covered by the a11y audit")
  await signInAsHost(page.context())
  const event = await shortedEvent(page.request)

  await page.goto("/")
  await page.getByRole("button", { name: new RegExp(event.name) }).click()
  await page.getByRole("button", { name: "Monitor" }).click()

  const feed = page.getByRole("list", { name: "Latest orders, newest first" })
  await expect(feed.getByText(/Squeezed shorted 2,000 SQZ at ₹/)).toBeVisible()
  await expect(page.getByText("Orders, last minute").locator("..")).toContainText("1")
  const squeezedRow = page.getByRole("row", { name: /Squeezed/ })
  await expect(squeezedRow).toContainText(/Safe \(\d+\.\d\d×\)/)
  await expect(page.getByRole("row", { name: /Idle/ })).toContainText("No positions")
  await expect(page.getByRole("row", { name: /Idle/ })).toContainText("No orders yet")
  await expect(page.getByRole("row", { name: /Idle/ })).toContainText("Offline")

  // A team opening the app shows up as online.
  const idleTeam = await browser.newContext()
  const idlePage = await idleTeam.newPage()
  await call(idlePage.request, "/auth/team/login", { roomCode: event.code, loginName: "idle", password: "idle-pass-1" })
  await idlePage.goto("/")
  await expect(page.getByRole("row", { name: /Idle/ })).toContainText("Online")
  await expect(page.getByText("Teams online").locator("..")).toContainText("1 of 2")
  await idleTeam.close()

  // +300% on a stock the team is short: equity falls below 75% of exposure. The move crosses the band,
  // so the stock halts and the close-out waits, leaving the breach on screen.
  await call(page.request, `${event.base}/news`, { headline: "SQZ triples on takeover", kind: "mechanical", impacts: { [event.stockId]: 3 }, mode: "publish" })
  await expect(squeezedRow).toContainText(/Being liquidated \(0\.\d\d×\)/)
  await expect(page.getByRole("button", { name: /Monitor/ }).getByLabel("1 margin alert")).toBeVisible()
  // Breaching teams move to the top.
  await expect(page.getByRole("row").nth(1)).toContainText("Squeezed")

  await call(page.request, `${event.base}/stocks/${event.stockId}/halt`, { halted: false, rebaseBand: true })
  await expect(feed.getByText("Margin close-out")).toBeVisible({ timeout: 15_000 })
  await expect(feed.getByText(/Squeezed covered 2,000 SQZ/)).toBeVisible()
  await expect(squeezedRow).not.toContainText("Being liquidated")
  await event.team.dispose()
})
