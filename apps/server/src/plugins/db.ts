import { PrismaPg } from '@prisma/adapter-pg'
import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { PrismaClient } from '../generated/prisma/client.ts'

declare module 'fastify' {
  interface FastifyInstance {
    db: PrismaClient
  }
}

interface DbPluginOptions {
  connectionString: string
  poolMax: number
}

/**
 * Decorates the app with a Prisma client.
 * Room mutations must run inside a transaction that first takes
 * pg_advisory_xact_lock on the room (single writer per room, see ADR 0002).
 */
const db: FastifyPluginAsync<DbPluginOptions> = async (app, opts) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: opts.connectionString, max: opts.poolMax }) })
  await prisma.$connect()
  app.decorate('db', prisma)
  app.addHook('onClose', async () => {
    await prisma.$disconnect()
  })
}

export const dbPlugin = fp(db, { name: 'db' })
