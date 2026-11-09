/**
 * Creates a host account (if missing) and a demo room in practice mode.
 *
 *   SEED_HOST_EMAIL=you@example.com SEED_HOST_PASSWORD='…' pnpm --filter @tradetech/server seed
 *
 * Team passwords are generated and printed once.
 */
import { randomBytes } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { createStockSchema } from '@tradetech/contracts'
import { createHost } from '../auth/hosts.ts'
import { loadConfig } from '../config.ts'
import { PrismaClient } from '../generated/prisma/client.ts'
import { createRoom, createStock, importTeams, setRoomStatus } from '../host/room-service.ts'

const ROOM_CODE = 'DEMO'
const STARTING_CASH_RUPEES = 1_000_000
const TEAM_COUNT = 6

/** Blueprint §8: L = λ·Q_stress / ln(1 + r). ₹50 lakh of net flow moves the quote ~10%. */
const STRESS_FLOW_RUPEES = 5_000_000
const STRESS_RESPONSE = 0.1
const depthFor = (price: number): number => Math.round(STRESS_FLOW_RUPEES / price / Math.log(1 + STRESS_RESPONSE))

const STOCKS = [
  { ticker: 'OILCO', name: 'Meridian Oil', sector: 'Energy', openingPrice: 420, profile: 'Integrated refiner with coastal terminals.' },
  { ticker: 'SOLAR', name: 'Brightfield Solar', sector: 'Energy', openingPrice: 85, profile: 'Utility-scale solar developer.' },
  { ticker: 'AIRCO', name: 'Skyline Airways', sector: 'Transport', openingPrice: 160, profile: 'Low-cost domestic carrier; fuel is its largest cost.' },
  { ticker: 'SHIPX', name: 'Harbourline Logistics', sector: 'Transport', openingPrice: 240, profile: 'Container shipping and port logistics.' },
  { ticker: 'SOFTW', name: 'Cobalt Software', sector: 'Technology', openingPrice: 1250, profile: 'Enterprise software, mostly export revenue.' },
  { ticker: 'CHIPS', name: 'Silica Semiconductors', sector: 'Technology', openingPrice: 610, profile: 'Chip packaging and testing.' },
  { ticker: 'BANKR', name: 'Rupa Bank', sector: 'Financials', openingPrice: 520, profile: 'Mid-sized retail lender.' },
  { ticker: 'INSUR', name: 'Shield Insurance', sector: 'Financials', openingPrice: 330, profile: 'General and health insurer.' },
  { ticker: 'FOODS', name: 'Harvest Foods', sector: 'Consumer', openingPrice: 95, profile: 'Packaged foods with rural distribution.' },
  { ticker: 'STYLE', name: 'Loom & Thread', sector: 'Consumer', openingPrice: 210, profile: 'Apparel retailer.' },
]

async function main(): Promise<void> {
  const email = process.env.SEED_HOST_EMAIL
  const password = process.env.SEED_HOST_PASSWORD
  if (!email || !password) throw new Error('Set SEED_HOST_EMAIL and SEED_HOST_PASSWORD')
  const config = loadConfig()
  if (!config.DATABASE_URL) throw new Error('Set DATABASE_URL')

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: config.DATABASE_URL }) })
  try {
    const host = (await db.host.findUnique({ where: { email: email.toLowerCase() } })) ?? (await createHost(db, email, password))
    if (await db.room.findUnique({ where: { code: ROOM_CODE } })) {
      throw new Error(`Room ${ROOM_CODE} already exists — delete it or reset the database first.`)
    }
    const room = await createRoom(db, host.id, { name: 'Demo Trading Cup', code: ROOM_CODE, startingCashRupees: STARTING_CASH_RUPEES })
    for (const stock of STOCKS) {
      const depth = depthFor(stock.openingPrice)
      await createStock(db, room, createStockSchema.parse({ ...stock, depth, borrowPool: Math.round(depth / 5) }))
    }
    const teams = Array.from({ length: TEAM_COUNT }, (_, i) => ({
      name: `Team ${i + 1}`,
      loginName: `team${i + 1}`,
      password: randomBytes(6).toString('base64url'),
    }))
    await importTeams(db, room, { teams })
    await setRoomStatus(db, room, 'practice')

    process.stdout.write(`\nRoom ${ROOM_CODE} is open for practice. Host: ${email}\n\n`)
    process.stdout.write(teams.map((t) => `  ${t.loginName.padEnd(8)} ${t.password}`).join('\n') + '\n\n')
  } finally {
    await db.$disconnect()
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
