import { buildApp } from './app.ts'
import { loadConfig } from './config.ts'

const config = loadConfig()
const app = await buildApp(config)

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, 'shutting down')
  try {
    await app.close()
    process.exit(0)
  } catch (error: unknown) {
    app.log.error({ err: error }, 'error during shutdown')
    process.exit(1)
  }
}
process.once('SIGINT', () => void shutdown('SIGINT'))
process.once('SIGTERM', () => void shutdown('SIGTERM'))

try {
  await app.listen({ port: config.PORT, host: config.HOST })
} catch (error: unknown) {
  app.log.fatal({ err: error }, 'failed to start server')
  process.exit(1)
}
