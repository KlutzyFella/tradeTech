import { execFileSync } from 'node:child_process'
import pg from 'pg'

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://tradetech:tradetech@localhost:5432/tradetech_test'

/** Creates the test database if needed and applies all migrations. */
export default async function setup(): Promise<void> {
  const url = new URL(TEST_DATABASE_URL)
  const dbName = url.pathname.slice(1)
  if (!/^[a-z0-9_]+$/.test(dbName)) throw new Error(`unsafe test database name: ${dbName}`)
  const admin = new pg.Client({ connectionString: new URL('/postgres', url).toString() })
  try {
    await admin.connect()
  } catch (error: unknown) {
    throw new Error(`Postgres is not reachable for integration tests — run \`pnpm db:up\`. (${String(error)})`)
  }
  try {
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName])
    if (exists.rowCount === 0) await admin.query(`CREATE DATABASE ${dbName}`)
  } finally {
    await admin.end()
  }
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'pipe',
  })
}
