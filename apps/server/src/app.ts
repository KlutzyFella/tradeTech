import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import Fastify, { type FastifyInstance } from 'fastify'
import type { AppConfig } from './config.ts'
import { registerErrorHandler, registerJsonNotFound } from './http/errors.ts'
import { authPlugin } from './plugins/auth.ts'
import { dbPlugin } from './plugins/db.ts'
import { realtimePlugin } from './plugins/realtime.ts'
import { tickerPlugin } from './rounds/ticker.ts'
import { webAppPlugin } from './plugins/web-app.ts'
import { hostLiveRoutes } from './routes/host-live.ts'
import { hostResultsRoutes } from './routes/host-results.ts'
import { authRoutes } from './routes/auth.ts'
import { healthRoutes } from './routes/health.ts'
import { hostRoutes } from './routes/host.ts'
import { teamRoutes } from './routes/team.ts'

/** Builds the Fastify app without listening, so tests can use inject(). */
export async function buildApp(config: AppConfig): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: config.LOG_LEVEL },
    genReqId: () => crypto.randomUUID(),
    bodyLimit: 256 * 1024,
    trustProxy: config.TRUST_PROXY,
  })
  registerErrorHandler(app)

  await app.register(helmet)
  await app.register(cors, { origin: config.WEB_ORIGIN, credentials: true })
  // Only routes that opt in (logins) are limited; order pacing is a game rule enforced by the room writer.
  await app.register(rateLimit, { global: false })
  await app.register(healthRoutes)

  if (!config.DATABASE_URL) {
    registerJsonNotFound(app)
    app.log.warn('DATABASE_URL not set — only /health is served')
    return app
  }
  await app.register(dbPlugin, { connectionString: config.DATABASE_URL, poolMax: config.DATABASE_POOL_MAX })
  await app.register(authPlugin, { secureCookies: config.NODE_ENV === 'production' })
  await app.register(realtimePlugin, {
    webOrigin: config.WEB_ORIGIN,
    redisUrl: config.REDIS_URL,
    marketSignalThrottleMs: config.MARKET_SIGNAL_THROTTLE_MS,
  })
  if (config.TICKER_ENABLED) await app.register(tickerPlugin, { intervalMs: config.TICK_INTERVAL_MS })

  await app.register(
    async (api) => {
      await api.register(authRoutes, { loginRateLimitMax: config.LOGIN_RATE_LIMIT_MAX })
      await api.register(teamRoutes, { previewRateLimitPerSec: config.PREVIEW_RATE_LIMIT_PER_SEC })
      await api.register(hostRoutes)
      await api.register(hostLiveRoutes)
      await api.register(hostResultsRoutes)
    },
    { prefix: '/api' },
  )
  if (config.WEB_DIST_DIR) await app.register(webAppPlugin, { distDir: config.WEB_DIST_DIR })
  else registerJsonNotFound(app)
  return app
}
