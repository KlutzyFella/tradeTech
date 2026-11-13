import { DEFAULT_ROOM_RULES } from "@tradetech/contracts"
import { describe, expect, it } from "vitest"
import { describeRules, plainPercent, plainSeconds } from "./rules-copy"

describe("rules copy for teams", () => {
  it("writes fractions as short percentages", () => {
    expect(plainPercent(0.001)).toBe("0.1%")
    expect(plainPercent(0.0005)).toBe("0.05%")
    expect(plainPercent(0.25)).toBe("25%")
    expect(plainPercent(0.75)).toBe("75%")
  })

  it("writes milliseconds as seconds", () => {
    expect(plainSeconds(1000)).toBe("1 second")
    expect(plainSeconds(3000)).toBe("3 seconds")
    expect(plainSeconds(1500)).toBe("1.5 seconds")
  })

  it("leads with the scoring rule and uses this event's numbers", () => {
    const sections = describeRules({ startingCashPaise: 100_000_000, rules: { ...DEFAULT_ROOM_RULES, fee: 0.002, newsPauseMs: 5000 } })
    expect(sections[0]!.title).toBe("How you're scored")
    const text = sections.flatMap((s) => [s.title, ...s.points]).join(" ")
    expect(text).toContain("₹10,00,000")
    expect(text).toContain("0.2% fee")
    expect(text).toContain("5 seconds")
    expect(text).toContain("1.5×")
    expect(text).toContain("one order per second")
  })

  it("leaves out pacing when there is none", () => {
    const sections = describeRules({ startingCashPaise: 100_000_000, rules: { ...DEFAULT_ROOM_RULES, minOrderIntervalMs: 0, newsPauseMs: 0 } })
    const text = sections.flatMap((s) => s.points).join(" ")
    expect(text).not.toMatch(/one order (every|per)/i)
    expect(text).not.toMatch(/pause for/i)
  })
})
