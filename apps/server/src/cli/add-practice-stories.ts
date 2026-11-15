/**
 * Adds the two practice news stories (see host/practice-stories.ts) to an
 * existing event as drafts, for rehearsing in a room seeded before they existed.
 *
 *   node src/cli/add-practice-stories.ts DEMO
 */
import { PrismaPg } from '@prisma/adapter-pg'
import { roomCodeSchema } from '@tradetech/contracts'
import { loadConfig } from '../config.ts'
import { PrismaClient } from '../generated/prisma/client.ts'
import { addPracticeStories, PRACTICE_STORIES } from '../host/practice-stories.ts'

async function main(): Promise<void> {
  const parsed = roomCodeSchema.safeParse(process.argv[2])
  if (!parsed.success) throw new Error('Usage: node src/cli/add-practice-stories.ts <ROOM CODE>')
  const config = loadConfig()
  if (!config.DATABASE_URL) throw new Error('Set DATABASE_URL')
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: config.DATABASE_URL }) })
  try {
    const room = await db.room.findUnique({ where: { code: parsed.data } })
    if (!room) throw new Error(`No event with room code ${parsed.data}.`)
    if (room.status === 'closed') throw new Error(`Event ${parsed.data} is closed.`)
    const existing = await db.newsItem.count({ where: { roomId: room.id, headline: { in: PRACTICE_STORIES.map((s) => s.headline) } } })
    if (existing > 0) throw new Error(`Event ${parsed.data} already has the practice stories.`)
    await addPracticeStories(db, room.id)
    process.stdout.write(`Added ${PRACTICE_STORIES.length} practice stories to ${parsed.data} as drafts (minutes 3 and 6).\n`)
  } finally {
    await db.$disconnect()
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
