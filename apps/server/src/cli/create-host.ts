/**
 * Creates a host account for production use.
 *
 *   pnpm --filter @tradetech/server create-host organiser@example.com
 *
 * The password is generated (24 random characters) and printed once, unless
 * HOST_PASSWORD is set. Refuses to overwrite an existing host.
 */
import { randomBytes } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { z } from 'zod'
import { createHost } from '../auth/hosts.ts'
import { loadConfig } from '../config.ts'
import { PrismaClient } from '../generated/prisma/client.ts'

async function main(): Promise<void> {
  const email = z.email().parse(process.argv[2], { error: () => 'Usage: create-host <email>' }).toLowerCase()
  const password = process.env.HOST_PASSWORD ?? randomBytes(18).toString('base64url')
  if (password.length < 12) throw new Error('HOST_PASSWORD must be at least 12 characters')
  const config = loadConfig()
  if (!config.DATABASE_URL) throw new Error('Set DATABASE_URL')
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: config.DATABASE_URL }) })
  try {
    if (await db.host.findUnique({ where: { email } })) throw new Error(`A host with email ${email} already exists`)
    await createHost(db, email, password)
    process.stdout.write(`Created host ${email}\n`)
    if (!process.env.HOST_PASSWORD) process.stdout.write(`Password (shown once): ${password}\n`)
  } finally {
    await db.$disconnect()
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
