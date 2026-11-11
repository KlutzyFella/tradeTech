/**
 * Finds which stocks a news item talks about, from its public text only, so
 * participants can jump from a story to the stock. It never uses the host's
 * private price impacts.
 */

export interface MentionableStock {
  readonly id: string
  readonly ticker: string
  readonly name: string
}

export interface MentionIndex {
  readonly patterns: readonly { readonly id: string; readonly regex: RegExp }[]
}

/** Industry words that appear in many company names; never treated as a mention on their own. */
const GENERIC_WORDS = new Set(
  [
    "oil", "gas", "solar", "power", "energy", "bank", "banks", "finance", "capital", "insurance", "foods", "food",
    "airways", "airlines", "air", "logistics", "shipping", "software", "systems", "tech", "technologies",
    "semiconductors", "chips", "motors", "pharma", "health", "group", "holdings", "industries", "global",
    "international", "national", "united", "first", "new", "the",
  ].map((w) => w.toLowerCase()),
)

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
/** Letter/digit boundaries that also work around punctuation like "&" or "'s". */
const bounded = (body: string, flags: string) => new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, flags)

export function buildMentionIndex(stocks: readonly MentionableStock[]): MentionIndex {
  const firstWords = stocks.map((s) => s.name.trim().split(/\s+/)[0] ?? "")
  const patterns = stocks.flatMap((stock, i) => {
    const entries = [
      { id: stock.id, regex: bounded(escape(stock.ticker), "gu") },
      { id: stock.id, regex: bounded(escape(stock.name.trim()).replace(/\s+/g, "\\s+"), "giu") },
    ]
    const first = firstWords[i]!
    const multiWord = stock.name.trim().split(/\s+/).length > 1
    const unique = firstWords.filter((w) => w.toLowerCase() === first.toLowerCase()).length === 1
    if (multiWord && unique && first.length >= 4 && !GENERIC_WORDS.has(first.toLowerCase())) {
      // Case-sensitive: "Harvest Foods" is a mention, "the harvest" is not.
      entries.push({ id: stock.id, regex: bounded(escape(first), "gu") })
    }
    return entries
  })
  return { patterns }
}

/** Stock ids mentioned in `text`, each once, in order of first mention. */
export function findMentions(text: string, index: MentionIndex): string[] {
  const firstSeen = new Map<string, number>()
  for (const { id, regex } of index.patterns) {
    regex.lastIndex = 0
    const match = regex.exec(text)
    if (match && (!firstSeen.has(id) || match.index < firstSeen.get(id)!)) firstSeen.set(id, match.index)
  }
  return [...firstSeen].sort((a, b) => a[1] - b[1]).map(([id]) => id)
}
