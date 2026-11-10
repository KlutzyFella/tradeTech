import { defineConfig, devices } from "@playwright/test"

/**
 * E2E against the real API and a real Postgres. Requires `pnpm db:up`, a
 * migrated database and a host account (see e2e/global-setup.ts).
 */
/** Point at a deployed or containerised build with E2E_BASE_URL; otherwise dev servers are started. */
const externalBaseUrl = process.env.E2E_BASE_URL

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: externalBaseUrl ?? "http://localhost:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"] } },
    // The laptop trading desk: market table, docked ticket and news rail.
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1920, height: 1080 } } },
  ],
  webServer: externalBaseUrl
    ? []
    : [
        {
          command: "pnpm --filter @tradetech/server dev",
          // Only servers Playwright starts itself: many sign-ins per minute across two projects.
          env: { LOGIN_RATE_LIMIT_MAX: "200" },
          url: "http://localhost:3000/health",
          reuseExistingServer: true,
          cwd: "../..",
        },
        {
          command: "pnpm dev --port 5173 --strictPort",
          url: "http://localhost:5173",
          reuseExistingServer: true,
        },
      ],
})
