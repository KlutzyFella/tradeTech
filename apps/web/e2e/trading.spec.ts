import { readFileSync } from "node:fs"
import { expect } from "@playwright/test"
import { test } from "./fixtures"
import { FIXTURE_PATH } from "./global-setup"

interface TeamFixture {
  name: string
  loginName: string
  password: string
}
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as { code: string; teams: Record<string, TeamFixture> }
const teamFor = (project: string): TeamFixture => fixture.teams[project] ?? fixture.teams.phone!

test("a team signs in, buys a stock, and sees it in its portfolio and activity", async ({ page }, testInfo) => {
  const team = teamFor(testInfo.project.name)
  await page.goto("/")
  await page.getByLabel("Room code").fill(fixture.code)
  await page.getByLabel("Team login").fill(team.loginName)
  await page.getByLabel("Password").fill(team.password)
  await page.getByRole("button", { name: "Sign in" }).click()

  await expect(page.getByRole("heading", { name: team.name })).toBeVisible()
  await expect(page.getByText("Practice round — results don’t count")).toBeVisible()

  await page.getByRole("button", { name: /^OILCO/ }).click()
  await page.getByLabel("Shares").fill("1000")
  await expect(page.getByText("You pay")).toBeVisible()
  await page.getByRole("button", { name: "Buy 1,000 OILCO" }).click()
  await expect(page.getByText(/Bought 1,000 OILCO at ₹100\.\d\d average/)).toBeVisible()

  await page.getByRole("button", { name: "Portfolio" }).click()
  await expect(page.getByText("Long 1,000")).toBeVisible()

  await page.getByRole("button", { name: "Activity" }).click()
  await expect(page.getByText("Buy 1,000 OILCO")).toBeVisible()
  await expect(page.getByText("Filled")).toBeVisible()
})

test("an order the team cannot make is explained before it is sent", async ({ page }, testInfo) => {
  const team = teamFor(testInfo.project.name)
  await page.goto("/")
  await page.getByLabel("Room code").fill(fixture.code)
  await page.getByLabel("Team login").fill(team.loginName)
  await page.getByLabel("Password").fill(team.password)
  await page.getByRole("button", { name: "Sign in" }).click()

  await page.getByRole("button", { name: /^OILCO/ }).click()
  await page.getByLabel("Shares").fill("50000")
  await expect(page.getByText(/One order may move the price at most 2%/)).toBeVisible()
  await expect(page.getByRole("button", { name: "Buy 50,000 OILCO" })).toBeDisabled()

  // The 2% cap allows ~10,388 shares here (₹10.4L) — more than the team can afford.
  await page.getByRole("button", { name: /^Use / }).click()
  await expect(page.getByText("Not enough available cash for this order.")).toBeVisible()

  await page.getByLabel("Shares").fill("100")
  await expect(page.getByText("You pay")).toBeVisible()
  await expect(page.getByRole("button", { name: "Buy 100 OILCO" })).toBeEnabled()
})
