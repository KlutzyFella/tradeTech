import { expect, request, type APIRequestContext, type Page } from "@playwright/test"
import { test } from "./fixtures"
import { HOST_STATE_PATH } from "./host-session"

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000"

interface Room {
  host: APIRequestContext
  base: string
  code: string
  stockIds: Record<string, string>
}

// Reuses the host session from global setup; tests share one room.
test.describe.configure({ mode: "serial" })
let room: Room
let teamNumber = 0

test.beforeAll(async () => {
  const host = await request.newContext({ storageState: HOST_STATE_PATH })
  const call = async (path: string, data: unknown = {}) => {
    const res = await host.post(`${BASE}/api${path}`, { data })
    if (!res.ok()) throw new Error(`${path}: ${res.status()} ${await res.text()}`)
    return (await res.json()).data
  }
  const code = `N${Date.now().toString(36).slice(-7).toUpperCase()}`
  const created = await call("/host/rooms", { name: `News ${code}`, code, startingCashRupees: 1_000_000, rules: { newsPauseMs: 0 } })
  const base = `/host/rooms/${created.id}`
  const stockIds: Record<string, string> = {}
  for (const [ticker, name] of [
    ["OILCO", "Meridian Oil"],
    ["AIRCO", "Skyline Airways"],
  ] as const) {
    stockIds[ticker] = (await call(`${base}/stocks`, { ticker, name, sector: "Energy", openingPrice: 100, depth: 500_000, borrowPool: 1000 })).id
  }
  const teams = Array.from({ length: 6 }, (_, i) => ({ name: `Reader ${i + 1}`, loginName: `reader${i + 1}`, password: `reader-pass-${i + 1}` }))
  await call(`${base}/teams`, { teams })
  await call(`${base}/status`, { status: "practice" })
  await call(`${base}/rounds`, { durationMinutes: 30 })
  await call(`${base}/rounds/current/start`)
  room = { host, base, code, stockIds }
})

test.afterAll(async () => {
  await room?.host.dispose()
})

async function publish(headline: string, body = "") {
  const res = await room.host.post(`${BASE}/api${room.base}/news`, { data: { headline, body, kind: "information", mode: "publish" } })
  expect(res.ok()).toBe(true)
}

/** Signs a fresh team in through the page's API context and opens the app. */
async function openAsTeam(page: Page) {
  teamNumber += 1
  const login = await page.request.post(`${BASE}/api/auth/team/login`, {
    data: { roomCode: room.code, loginName: `reader${teamNumber}`, password: `reader-pass-${teamNumber}` },
  })
  expect(login.ok()).toBe(true)
  await page.goto("/")
  await expect(page.getByLabel("Time left in round")).toBeVisible()
}

test("breaking news names the stocks in the story and opens the ticket from them", async ({ page }) => {
  await openAsTeam(page)
  await publish("Skyline Airways cuts routes as fuel climbs", "Analysts expect Meridian Oil to benefit.")

  const strip = page.getByRole("status", { name: "Breaking news" })
  await expect(strip).toContainText("Skyline Airways cuts routes as fuel climbs")
  await expect(strip.getByRole("button", { name: /^Trade AIRCO/ })).toBeVisible()
  await expect(strip.getByRole("button", { name: /^Trade OILCO/ })).toBeVisible()

  await strip.getByRole("button", { name: /^Trade AIRCO/ }).click()
  await expect(page.getByRole("heading", { name: "AIRCO", exact: true })).toBeVisible()
  await expect(strip).toHaveCount(0)
})

test("reading the News tab clears the unread count, and stays read after a reload", async ({ page }) => {
  await openAsTeam(page)
  await publish("Quiet session expected")
  const newsTab = page.getByRole("button", { name: /^News/ })
  await expect(newsTab).toContainText("unread")

  await newsTab.click()
  await expect(page.getByRole("article", { name: "Quiet session expected" })).toContainText("New")
  // Stories count as read after the reader has been open for its dwell time (1.5 s).
  await page.waitForTimeout(2000)
  await page.getByRole("button", { name: "Market" }).click()
  await expect(newsTab).not.toContainText("unread")

  await page.reload()
  await expect(page.getByLabel("Time left in round")).toBeVisible()
  await expect(page.getByRole("button", { name: /^News/ })).not.toContainText("unread")
})

test("on a laptop, news can sit in the side panel, beside the market or only in its tab", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Placement choices are for the laptop desk")
  await openAsTeam(page)
  await publish("Placement check story")

  // Default: the side panel under the order ticket.
  await expect(page.getByRole("region", { name: /^News/ }).filter({ has: page.getByRole("button", { name: "Collapse news panel" }) })).toBeVisible()

  await page.getByRole("button", { name: /^News/ }).click()
  const choices = page.getByRole("radiogroup", { name: "Where news shows on your desk" })
  await choices.getByRole("radio", { name: /Beside market/ }).click()
  await page.getByRole("button", { name: "Market" }).click()
  await expect(page.getByRole("button", { name: "Move news to the side panel" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Collapse news panel" })).toHaveCount(0)

  await page.getByRole("button", { name: /^News/ }).click()
  await choices.getByRole("radio", { name: /Tab only/ }).click()
  await page.getByRole("button", { name: "Market" }).click()
  await expect(page.getByRole("article", { name: "Placement check story" })).toHaveCount(0)

  // The choice is remembered on this device.
  await page.reload()
  await expect(page.getByLabel("Time left in round")).toBeVisible()
  await expect(page.getByRole("article", { name: "Placement check story" })).toHaveCount(0)
  await page.getByRole("button", { name: /^News/ }).click()
  await expect(choices.getByRole("radio", { name: /Tab only/ })).toHaveAttribute("aria-checked", "true")
})

test("on a phone, news has its own tab and no desk placement choice", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "Phone layout only")
  await openAsTeam(page)
  await publish("Phone reader story")
  await page.getByRole("button", { name: /^News/ }).click()
  await expect(page.getByRole("article", { name: "Phone reader story" })).toBeVisible()
  await expect(page.getByRole("radiogroup", { name: "Where news shows on your desk" })).toHaveCount(0)
})
