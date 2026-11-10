import AxeBuilder from "@axe-core/playwright"
import { readFileSync } from "node:fs"
import { expect, test, type Page } from "@playwright/test"
import { FIXTURE_PATH } from "./global-setup"

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000"
const HOST_EMAIL = process.env.E2E_HOST_EMAIL ?? "host@tradetech.local"
const HOST_PASSWORD = process.env.E2E_HOST_PASSWORD ?? "host-password-1"
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as {
  code: string
  teams: Record<string, { loginName: string; password: string }>
}

/** Fails on serious or critical WCAG 2.2 A/AA violations; lists each one in the message. */
async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()
  const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")
  expect(blocking.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")})`)).toEqual([])
}

test("the sign-in screen is accessible", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "Join your room" })).toBeVisible()
  await expectAccessible(page)
})

test("the team trading screen is accessible with the ticket open", async ({ page }, testInfo) => {
  const team = fixture.teams[testInfo.project.name] ?? fixture.teams.phone!
  const login = await page.request.post(`${BASE}/api/auth/team/login`, {
    data: { roomCode: fixture.code, loginName: team.loginName, password: team.password },
  })
  expect(login.ok()).toBe(true)
  await page.goto("/")
  await page.getByRole("button", { name: /^OILCO/ }).click()
  await page.getByLabel("Shares").fill("10")
  await expect(page.getByText("You pay")).toBeVisible()
  await expectAccessible(page)
})

test("the host console is accessible", async ({ page }) => {
  const login = await page.request.post(`${BASE}/api/auth/host/login`, { data: { email: HOST_EMAIL, password: HOST_PASSWORD } })
  expect(login.ok()).toBe(true)
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "TradeTech host console" })).toBeVisible()
  await expectAccessible(page)
})
