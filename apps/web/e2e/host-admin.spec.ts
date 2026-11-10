import { expect, request, test } from "@playwright/test"

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000"
const HOST_EMAIL = process.env.E2E_HOST_EMAIL ?? "host@tradetech.local"
const HOST_PASSWORD = process.env.E2E_HOST_PASSWORD ?? "host-password-1"

/** Builds a practice event with one stock and one team through the API. */
async function practiceEvent() {
  const ctx = await request.newContext()
  const call = async (path: string, data: unknown = {}) => {
    const res = await ctx.post(`${BASE}/api${path}`, { data })
    if (!res.ok()) throw new Error(`${path}: ${res.status()} ${await res.text()}`)
    return (await res.json()).data
  }
  await call("/auth/host/login", { email: HOST_EMAIL, password: HOST_PASSWORD })
  const code = `A${Date.now().toString(36).slice(-7).toUpperCase()}`
  const room = await call("/host/rooms", { name: `Admin ${code}`, code, startingCashRupees: 1_000_000 })
  await call(`/host/rooms/${room.id}/stocks`, { ticker: "OILCO", name: "Meridian Oil", sector: "Energy", openingPrice: 100, depth: 524_603, borrowPool: 1000 })
  await call(`/host/rooms/${room.id}/teams`, { teams: [{ name: "Bulls", loginName: "bulls", password: "original-pass" }] })
  await call(`/host/rooms/${room.id}/status`, { status: "practice" })
  await ctx.dispose()
  return { code, name: `Admin ${code}` }
}

test("the host resets a password, disqualifies and reinstates a team, and halts a stock from the console", async ({ page }) => {
  const event = await practiceEvent()
  const prompts: string[] = []
  page.on("dialog", (dialog) => {
    // Answer prompts in order; plain confirms are accepted.
    void (dialog.type() === "prompt" ? dialog.accept(prompts.shift() ?? "") : dialog.accept())
  })

  await page.goto("/")
  await page.getByRole("button", { name: /Host sign-in/ }).click()
  await page.getByLabel("Email").fill(HOST_EMAIL)
  await page.getByLabel("Password").fill(HOST_PASSWORD)
  await page.getByRole("button", { name: "Sign in" }).click()
  await page.getByRole("button", { name: new RegExp(event.name) }).click()

  await page.getByRole("button", { name: "Setup" }).click()
  prompts.push("my-own-password")
  await page.getByRole("button", { name: "Reset password" }).click()
  await expect(page.getByText(/Password reset/)).toBeVisible()

  const api = await request.newContext()
  const login = (password: string) =>
    api.post(`${BASE}/api/auth/team/login`, { data: { roomCode: event.code, loginName: "bulls", password } })
  expect((await login("original-pass")).status()).toBe(401)
  expect((await login("my-own-password")).status()).toBe(200)

  prompts.push("Testing disqualification")
  await page.getByRole("button", { name: "Disqualify" }).click()
  await expect(page.getByText("(disqualified)")).toBeVisible()
  await page.getByRole("button", { name: "Reinstate" }).click()
  await expect(page.getByText("(disqualified)")).toHaveCount(0)

  await page.getByRole("button", { name: "Control" }).click()
  await page.getByRole("button", { name: "Halt" }).click()
  await expect(page.getByText("Halted", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Reopen" }).click()
  await expect(page.getByText("Halted", { exact: true })).toHaveCount(0)
  await api.dispose()
})

test("a too-short password is explained, not reported as a generic error", async ({ page }) => {
  const event = await practiceEvent()
  page.on("dialog", (dialog) => void (dialog.type() === "prompt" ? dialog.accept("short") : dialog.accept()))
  await page.goto("/")
  await page.getByRole("button", { name: /Host sign-in/ }).click()
  await page.getByLabel("Email").fill(HOST_EMAIL)
  await page.getByLabel("Password").fill(HOST_PASSWORD)
  await page.getByRole("button", { name: "Sign in" }).click()
  await page.getByRole("button", { name: new RegExp(event.name) }).click()
  await page.getByRole("button", { name: "Setup" }).click()
  await page.getByRole("button", { name: "Reset password" }).click()
  await expect(page.getByText(/at least 8 characters/)).toBeVisible()
})
