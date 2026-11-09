import { expect, test, type Page } from "@playwright/test"

const HOST_EMAIL = process.env.E2E_HOST_EMAIL ?? "host@tradetech.local"
const HOST_PASSWORD = process.env.E2E_HOST_PASSWORD ?? "host-password-1"

async function signInHost(page: Page) {
  await page.goto("/")
  await page.getByRole("button", { name: /Host sign-in/ }).click()
  await page.getByLabel("Email").fill(HOST_EMAIL)
  await page.getByLabel("Password").fill(HOST_PASSWORD)
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page.getByRole("heading", { name: "TradeTech host console" })).toBeVisible()
}

test("a host sets up and runs a round; a team sees the clock and the news move prices", async ({ browser }) => {
  const host = await (await browser.newContext()).newPage()
  host.on("dialog", (d) => void d.accept())
  await signInHost(host)

  const code = `H${Date.now().toString(36).slice(-7).toUpperCase()}`
  await host.getByLabel("Event name").fill("Host E2E Cup")
  await host.getByLabel("Room code").fill(code)
  await host.getByRole("button", { name: "Create event" }).click()
  await expect(host.getByRole("heading", { name: "Host E2E Cup" })).toBeVisible()

  await host.getByRole("button", { name: "Setup" }).click()
  await host.getByLabel("Ticker").fill("OILCO")
  await host.getByLabel("Company name").fill("Meridian Oil")
  await host.getByLabel("Sector").fill("Energy")
  await host.getByLabel("Opening price (₹)").fill("100")
  await host.getByRole("button", { name: "Add stock" }).click()
  await expect(host.getByText("Meridian Oil, Energy")).toBeVisible()
  await host.getByLabel(/Add teams/).fill("Bulls, bulls, bulls-password")
  await host.getByRole("button", { name: "Add 1 team" }).click()
  await expect(host.getByText("signs in as bulls")).toBeVisible()

  await host.getByRole("button", { name: "Control" }).click()
  await host.getByRole("button", { name: "Open practice" }).click()
  await host.getByRole("button", { name: "New practice round" }).click()
  await host.getByRole("button", { name: "Start round" }).click()
  await expect(host.getByText(/Practice round 1 — running/)).toBeVisible()

  const team = await (await browser.newContext()).newPage()
  await team.goto("/")
  await team.getByLabel("Room code").fill(code)
  await team.getByLabel("Team login").fill("bulls")
  await team.getByLabel("Password").fill("bulls-password")
  await team.getByRole("button", { name: "Sign in" }).click()
  await expect(team.getByLabel("Time left in round")).toHaveText(/^(19|20):\d\d$/)
  await expect(team.getByRole("button", { name: /OILCO/ })).toContainText("₹100.00")

  await host.getByRole("button", { name: "News" }).click()
  await host.getByLabel("Headline").fill("Refinery outage cuts supply")
  await host.getByRole("radio", { name: /Moves prices/ }).click()
  await host.getByLabel("OILCO move in percent").fill("8")
  await host.getByRole("button", { name: "Publish now" }).first().click()

  await expect(team.getByText("Breaking news — check the News tab.")).toBeVisible()
  await expect(team.getByRole("button", { name: /OILCO/ })).toContainText("₹108.00")
  await team.getByRole("button", { name: /^News/ }).click()
  await expect(team.getByRole("heading", { name: "Refinery outage cuts supply" })).toBeVisible()
  await expect(team.getByText("8%")).toHaveCount(0)

  await host.getByRole("button", { name: "Control" }).click()
  await host.getByRole("button", { name: "Pause" }).click()
  await expect(team.getByLabel("Time left in round")).toHaveText("Paused")
})
