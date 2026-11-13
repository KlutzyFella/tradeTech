import { readFileSync } from "node:fs"
// The plain Playwright test on purpose: the shared fixture marks the rules as already read.
import { expect, test } from "@playwright/test"
import { FIXTURE_PATH } from "./global-setup"

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000"
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as {
  code: string
  teams: Record<string, { loginName: string; password: string }>
}

test("a team sees how scoring works on its first visit, and can reopen it", async ({ page }, testInfo) => {
  const team = fixture.teams[testInfo.project.name] ?? fixture.teams.phone!
  const login = await page.request.post(`${BASE}/api/auth/team/login`, {
    data: { roomCode: fixture.code, loginName: team.loginName, password: team.password },
  })
  expect(login.ok()).toBe(true)

  await page.goto("/")
  const sheet = page.getByRole("dialog", { name: "How it works" })
  await expect(sheet).toBeVisible()
  // The scoring rule comes first, with this event's own numbers.
  await expect(sheet.getByRole("heading", { level: 3 }).first()).toHaveText("How you're scored")
  await expect(sheet.getByText("Every team starts with ₹10,00,000 in cash.")).toBeVisible()
  await expect(sheet.getByText(/0\.1% each side, plus a 0\.05% fee/)).toBeVisible()
  await sheet.getByRole("button", { name: "Got it" }).click()
  await expect(sheet).toBeHidden()

  // Remembered in this browser: no pop-up on the next visit, but one tap away.
  await page.reload()
  await expect(page.getByRole("button", { name: "How it works" })).toBeVisible()
  await expect(sheet).toBeHidden()
  await page.getByRole("button", { name: "How it works" }).click()
  await expect(sheet.getByRole("heading", { name: "Forced close-outs" })).toBeVisible()
})
