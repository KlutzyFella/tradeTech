import AxeBuilder from "@axe-core/playwright"
import { readFileSync } from "node:fs"
// The plain Playwright test on purpose: the shared fixture marks the rules as already read.
import { expect, test } from "@playwright/test"
import { FIXTURE_PATH } from "./global-setup"

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000"
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as {
  code: string
  teams: Record<string, { loginName: string; password: string }>
}

test("a team gets a quick start on its first visit, with the full rules a tap away", async ({ page }, testInfo) => {
  const team = fixture.teams[testInfo.project.name] ?? fixture.teams.phone!
  const login = await page.request.post(`${BASE}/api/auth/team/login`, {
    data: { roomCode: fixture.code, loginName: team.loginName, password: team.password },
  })
  expect(login.ok()).toBe(true)

  await page.goto("/")
  // First visit: a short quick start, not the full rulebook.
  const quick = page.getByRole("dialog", { name: "Quick start" })
  await expect(quick).toBeVisible()
  await expect(quick.getByRole("heading", { level: 3 })).toHaveText(["How you win", "When you can trade", "Your first order"])
  await expect(quick.getByText(/Every team starts with ₹10,00,000/)).toBeVisible()
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"))
  const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()
  expect(audit.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([])

  // The full rules are one tap away, scoring first, with this event's numbers.
  await quick.getByRole("button", { name: "Read all rules" }).click()
  const sheet = page.getByRole("dialog", { name: "How it works" })
  await expect(sheet.getByRole("heading", { level: 3 }).first()).toHaveText("How you're scored")
  await expect(sheet.getByText(/0\.1% each side, plus a 0\.05% fee/)).toBeVisible()
  await sheet.getByRole("button", { name: "Got it" }).click()
  await expect(sheet).toBeHidden()

  // Remembered in this browser: no pop-up on the next visit; ? opens the full rules.
  await page.reload()
  await expect(page.getByRole("button", { name: "How it works" })).toBeVisible()
  await expect(quick).toBeHidden()
  await page.getByRole("button", { name: "How it works" }).click()
  await expect(sheet.getByRole("heading", { name: "Forced close-outs" })).toBeVisible()
})
