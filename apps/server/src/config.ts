import { z } from 'zod'

const configSchema = z
  .object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url().optional(),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  /** Login attempts per minute per (IP, account). Teams often share one NAT IP. */
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  /** Set to true only behind a trusted reverse proxy, so request.ip is the real client. */
  /** Disable only in tests, which drive ticks directly. */
  TICKER_ENABLED: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
  TICK_INTERVAL_MS: z.coerce.number().int().min(100).max(10_000).default(1000),
  TRUST_PROXY: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  })
  .refine((c) => c.NODE_ENV !== 'production' || c.DATABASE_URL !== undefined, {
    message: 'DATABASE_URL is required in production',
    path: ['DATABASE_URL'],
  })

export type AppConfig = z.infer<typeof configSchema>

/** Fail fast with a readable message when the environment is invalid. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = configSchema.safeParse(env)
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`)
  }
  return parsed.data
}
