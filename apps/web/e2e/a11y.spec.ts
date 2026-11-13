import AxeBuilder from "@axe-core/playwright"
import { readFileSync } from "node:fs"
import { expect, test, type Page } from "@playwright/test"
import { FIXTURE_PATH } from "./global-setup"
import { signInAsHost } from "./host-session"

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000"
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as {
  code: string
  teams: Record<string, { loginName: string; password: string }>
}

/** Fails on serious or critical WCAG 2.2 A/AA violations; lists each one in the message. */
async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()
  const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")
  expect(
    blocking.map(
      (v) =>
        `${v.id}: ${v.help} (${v.nodes
          .map((n) => n.target.join(" "))
          .slice(0, 3)
          .join(", ")})`
    )
  ).toEqual([])
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

test("the News reader is accessible", async ({ page }, testInfo) => {
  const team = fixture.teams[testInfo.project.name] ?? fixture.teams.phone!
  const login = await page.request.post(`${BASE}/api/auth/team/login`, {
    data: { roomCode: fixture.code, loginName: team.loginName, password: team.password },
  })
  expect(login.ok()).toBe(true)
  await page.goto("/")
  await page.getByRole("button", { name: /^News/ }).click()
  await expect(page.getByRole("heading", { name: "News", exact: true, level: 2 })).toBeVisible()
  await expectAccessible(page)
})

test("the host console is accessible", async ({ page }) => {
  await signInAsHost(page.context())
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "TradeTech host console" })).toBeVisible()
  await expectAccessible(page)
})

test("the host's setup tab and stock editor are accessible", async ({ page }) => {
  await signInAsHost(page.context())
  await page.goto("/")
  await page.getByRole("button", { name: new RegExp(`Room code ${fixture.code}`) }).click()
  await page.getByRole("button", { name: "Setup" }).click()
  await expect(page.getByRole("heading", { name: "Rules" })).toBeVisible()
  await expectAccessible(page)
  await page.getByRole("button", { name: "Edit OILCO" }).click()
  await expect(page.getByRole("dialog", { name: "Edit OILCO" })).toBeVisible()
  // Audit the settled sheet, not its slide-in (mid-fade text reads as low contrast).
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"))
  await expectAccessible(page)
})

test("the host's live monitor is accessible", async ({ page }) => {
  await signInAsHost(page.context())
  await page.goto("/")
  await page.getByRole("button", { name: new RegExp(`Room code ${fixture.code}`) }).click()
  await page.getByRole("button", { name: "Monitor" }).click()
  await expect(page.getByRole("heading", { name: "Latest orders" })).toBeVisible()
  await expectAccessible(page)
})

test("the projector view is accessible", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Big-screen view")
  await signInAsHost(page.context())
  const rooms = (await (await page.request.get(`${BASE}/api/host/rooms`)).json()).data as { id: string }[]
  await page.goto(`/projector/${rooms[0]!.id}`)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await expectAccessible(page)
})
