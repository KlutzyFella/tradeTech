import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import Fastify, { type FastifyInstance } from 'fastify'
import type { AppConfig } from './config.ts'
import { realtimePlugin } from './plugins/realtime.ts'
import { healthRoutes } from './routes/health.ts'

/**
 * Builds the Fastify app without listening, so tests can use inject().
 * The database plugin is registered only when DATABASE_URL is configured.
 */
export async function buildApp(config: AppConfig): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: config.LOG_LEVEL },
    // Clients send their own request IDs for orders; this is for log correlation.
    genReqId: () => crypto.randomUUID(),
  })

  await app.register(helmet)
  await app.register(cors, { origin: config.WEB_ORIGIN, credentials: true })

  if (config.DATABASE_URL) {
    const { dbPlugin } = await import('./plugins/db.ts')
    await app.register(dbPlugin, { connectionString: config.DATABASE_URL })
  }

  await app.register(realtimePlugin, { webOrigin: config.WEB_ORIGIN })
  await app.register(healthRoutes)

  return app
}
