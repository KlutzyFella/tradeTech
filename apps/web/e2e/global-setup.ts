import { writeFileSync } from "node:fs"
import { request } from "@playwright/test"

export const FIXTURE_PATH = "e2e/.fixture.json"
const API = "http://localhost:3000/api"

/**
 * Creates a fresh practice room through the host API so the test never
 * depends on seed data. Host credentials default to the dev seed host.
 */
export default async function globalSetup(): Promise<void> {
  const email = process.env.E2E_HOST_EMAIL ?? "host@tradetech.local"
  const password = process.env.E2E_HOST_PASSWORD ?? "host-password-1"
  const ctx = await request.newContext()
  const call = async (path: string, data: unknown) => {
    const res = await ctx.post(`${API}${path}`, { data })
    if (!res.ok()) throw new Error(`${path} failed (${res.status()}): ${await res.text()}`)
    return (await res.json()).data
  }
  await call("/auth/host/login", { email, password })
  const code = `E2E${Date.now().toString(36).slice(-6).toUpperCase()}`
  const room = await call("/host/rooms", { name: "E2E Cup", code, startingCashRupees: 1_000_000 })
  await call(`/host/rooms/${room.id}/stocks`, {
    ticker: "OILCO",
    name: "Meridian Oil",
    sector: "Energy",
    openingPrice: 100,
    depth: 524_603,
    borrowPool: 100_000,
  })
  await call(`/host/rooms/${room.id}/teams`, { teams: [{ name: "Bulls", loginName: "bulls", password: "bulls-password" }] })
  await call(`/host/rooms/${room.id}/status`, { status: "practice" })
  await ctx.dispose()
  writeFileSync(FIXTURE_PATH, JSON.stringify({ code, loginName: "bulls", password: "bulls-password" }))
}
