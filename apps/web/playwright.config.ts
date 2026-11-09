import { defineConfig, devices } from "@playwright/test"

/**
 * E2E against the real API and a real Postgres. Requires `pnpm db:up`, a
 * migrated database and a host account (see e2e/global-setup.ts).
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "phone", use: { ...devices["Pixel 7"] } }],
  webServer: [
    {
      command: "pnpm --filter @tradetech/server dev",
      url: "http://localhost:3000/health",
      reuseExistingServer: true,
      cwd: "../..",
    },
    { command: "pnpm dev --port 5173 --strictPort", url: "http://localhost:5173", reuseExistingServer: true },
  ],
})
