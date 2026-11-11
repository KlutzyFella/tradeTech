import { describe, expect, it } from "vitest"
import { buildMentionIndex, findMentions } from "./mentions"

const stocks = [
  { id: "1", ticker: "OILCO", name: "Meridian Oil" },
  { id: "2", ticker: "SOLAR", name: "Brightfield Solar" },
  { id: "3", ticker: "AIRCO", name: "Skyline Airways" },
  { id: "4", ticker: "BANKR", name: "Rupa Bank" },
  { id: "5", ticker: "STYLE", name: "Loom & Thread" },
  { id: "6", ticker: "FOODS", name: "Harvest Foods" },
]
const index = buildMentionIndex(stocks)
const ids = (text: string) => findMentions(text, index)

describe("finding stocks mentioned in news", () => {
  it("finds a ticker as a whole word", () => {
    expect(ids("OILCO shares are in focus")).toEqual(["1"])
  })

  it("ignores a ticker inside another word or in lower case", () => {
    expect(ids("OILCOS and oilco are not tickers")).toEqual([])
  })

  it("finds a company by its full name, ignoring case", () => {
    expect(ids("A fire at meridian oil's coastal refinery")).toEqual(["1"])
  })

  it("finds a company by its distinctive first word", () => {
    expect(ids("Meridian expects repairs to take weeks")).toEqual(["1"])
    expect(ids("Skyline cancels flights")).toEqual(["3"])
  })

  it("does not treat generic industry words as mentions", () => {
    expect(ids("Solar power and bank lending rose; foods prices fell")).toEqual([])
  })

  it("handles names with punctuation", () => {
    expect(ids("Loom & Thread opens 40 stores")).toEqual(["5"])
  })

  it("returns each stock once, in order of first mention", () => {
    expect(ids("Skyline Airways warns as Meridian Oil rallies; AIRCO falls")).toEqual(["3", "1"])
  })

  it("returns nothing for text without mentions", () => {
    expect(ids("Markets were quiet today")).toEqual([])
  })
})
