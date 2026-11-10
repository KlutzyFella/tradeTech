import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.ts'
import { loadConfig } from '../src/config.ts'

describe('event service', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp(loadConfig({ LOG_LEVEL: 'silent' }))
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('reports healthy', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ok' })
  })

  it('sets security headers', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' })
    expect(response.headers['x-content-type-options']).toBe('nosniff')
  })
})

describe('configuration', () => {
  it('rejects an invalid port with a readable error', () => {
    expect(() => loadConfig({ PORT: 'not-a-port' })).toThrow(/PORT/)
  })

  it('refuses to start in production unless TRUST_PROXY is set explicitly', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://x@h/db' })).toThrow(/TRUST_PROXY/)
    expect(loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://x@h/db', TRUST_PROXY: 'true' }).TRUST_PROXY).toBe(true)
  })

  it('refuses to start in production without a database', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', TRUST_PROXY: 'false' })).toThrow(/DATABASE_URL/)
  })
})
