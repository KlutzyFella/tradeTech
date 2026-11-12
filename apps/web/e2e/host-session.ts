import { readFileSync } from "node:fs"
import type { BrowserContext } from "@playwright/test"

/**
 * The host session saved by global setup. Specs reuse it instead of signing in
 * again, so the suite stays under the server's per-account sign-in limit and
 * can run against production. Holds a live token: git-ignored.
 */
export const HOST_STATE_PATH = "e2e/.host-state.json"

export function hostCookies(): Parameters<BrowserContext["addCookies"]>[0] {
  return (JSON.parse(readFileSync(HOST_STATE_PATH, "utf8")) as { cookies: Parameters<BrowserContext["addCookies"]>[0] }).cookies
}

/** Signs a browser context in as the host (no network sign-in). */
export async function signInAsHost(context: BrowserContext): Promise<void> {
  await context.addCookies(hostCookies())
}
