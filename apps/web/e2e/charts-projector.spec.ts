import { expect, request, type APIRequestContext } from "@playwright/test"
import { test } from "./fixtures"
import { HOST_STATE_PATH, signInAsHost } from "./host-session"

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000"

test.describe.configure({ mode: "serial" })
let host: APIRequestContext
let room: { id: string; name: string; code: string; base: string }
let teamNumber = 0

test.beforeAll(async () => {
  host = await request.newContext({ storageState: HOST_STATE_PATH })
  const call = async (path: string, data: unknown = {}) => {
    const res = await host.post(`${BASE}/api${path}`, { data })
    if (!res.ok()) throw new Error(`${path}: ${res.status()} ${await res.text()}`)
    return (await res.json()).data
  }
  const code = `C${Date.now().toString(36).slice(-7).toUpperCase()}`
  const name = `Charts ${code}`
  const created = await call("/host/rooms", { name, code, startingCashRupees: 1_000_000, rules: { minOrderIntervalMs: 0 } })
  const base = `/host/rooms/${created.id}`
  await call(`${base}/stocks`, { ticker: "OILCO", name: "Meridian Oil", sector: "Energy", openingPrice: 100, depth: 200_000, borrowPool: 1000 })
  await call(`${base}/teams`, {
    teams: Array.from({ length: 4 }, (_, i) => ({ name: `Chartist ${i + 1}`, loginName: `chartist${i + 1}`, password: `chart-pass-${i + 1}` })),
  })
  await call(`${base}/status`, { status: "practice" })
  await call(`${base}/rounds`, { durationMinutes: 30 })
  await call(`${base}/rounds/current/start`)
  room = { id: created.id, name, code, base }
})

test.afterAll(async () => {
  await host?.dispose()
})

test("a stock's order ticket charts its price this round", async ({ page }) => {
  teamNumber += 1
  const login = await page.request.post(`${BASE}/api/auth/team/login`, {
    data: { roomCode: room.code, loginName: `chartist${teamNumber}`, password: `chart-pass-${teamNumber}` },
  })
  expect(login.ok()).toBe(true)
  const market = (await (await page.request.get(`${BASE}/api/market`)).json()).data
  const order = await page.request.post(`${BASE}/api/orders`, {
    data: { requestId: crypto.randomUUID(), stockId: market.stocks[0].id, intent: "buy", quantity: 500 },
  })
  expect(order.ok()).toBe(true)

  await page.goto("/")
  await page.getByRole("button", { name: /^OILCO/ }).click()
  const chart = page.getByRole("img", { name: /OILCO price this round: from ₹100\.00 to ₹10[01]\.\d\d/ })
  await expect(chart).toBeVisible()
  // Keyboard users get the same readout: the chart is focusable and steps with the arrow keys.
  await chart.focus()
  await page.keyboard.press("Home")
  await expect(chart).toBeFocused()
})

test("the host opens a projector view that shows public information only", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The projector is opened from a laptop")
  await host.post(`${BASE}/api${room.base}/news`, { data: { headline: "Meridian Oil expands refinery", kind: "information", mode: "publish" } })
  await host.post(`${BASE}/api${room.base}/news`, { data: { headline: "Secret draft headline", kind: "information", mode: "draft" } })

  await signInAsHost(context)
  await page.goto("/")
  await page.getByRole("button", { name: new RegExp(room.name) }).click()
  const popupPromise = context.waitForEvent("page")
  await page.getByRole("button", { name: "Open projector view" }).click()
  const projector = await popupPromise

  await expect(projector).toHaveURL(new RegExp(`/projector/${room.id}$`))
  await expect(projector.getByLabel("Time left in round")).toBeVisible()
  await expect(projector.getByText("OILCO", { exact: true })).toBeVisible()
  await expect(projector.getByText(room.code, { exact: true })).toBeVisible()
  await expect(projector.getByText("Meridian Oil expands refinery")).toBeVisible()
  await expect(projector.getByText("Secret draft headline")).toHaveCount(0)
  await expect(projector.getByText("The leaderboard is hidden for now.")).toBeVisible()

  await host.post(`${BASE}/api${room.base}/leaderboard/visibility`, { data: { public: true } })
  await expect(projector.getByRole("heading", { name: "Leaderboard" })).toBeVisible()
  await expect(projector.getByText("Chartist 1")).toBeVisible()
})
