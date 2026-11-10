import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.ts'
import { loadConfig } from '../src/config.ts'
import { TEST_DATABASE_URL } from './global-setup.ts'

let app: FastifyInstance

beforeAll(async () => {
  const dist = mkdtempSync(join(tmpdir(), 'tt-dist-'))
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>TradeTech</title>')
  mkdirSync(join(dist, 'assets'))
  writeFileSync(join(dist, 'assets', 'app-abc123.js'), 'console.info(1)')
  writeFileSync(join(dist, 'favicon.svg'), '<svg/>')
  app = await buildApp(
    loadConfig({ LOG_LEVEL: 'silent', DATABASE_URL: TEST_DATABASE_URL, NODE_ENV: 'test', TICKER_ENABLED: 'false', WEB_DIST_DIR: dist }),
  )
  await app.ready()
})
afterAll(async () => {
  await app.close()
})

describe('serving the web app from the API origin', () => {
  it('serves index.html at the root without long-term caching', async () => {
    const response = await app.inject({ method: 'GET', url: '/' })
    expect(response.statusCode).toBe(200)
    expect(response.body).toContain('<title>TradeTech</title>')
    expect(response.headers['cache-control']).toBe('no-cache')
  })

  it('caches hashed assets immutably', async () => {
    const response = await app.inject({ method: 'GET', url: '/assets/app-abc123.js' })
    expect(response.headers['cache-control']).toContain('immutable')
  })

  it('falls back to index.html for app routes', async () => {
    const response = await app.inject({ method: 'GET', url: '/some/deep/link' })
    expect(response.statusCode).toBe(200)
    expect(response.body).toContain('<title>TradeTech</title>')
  })

  it('404s a missing asset instead of serving the app shell', async () => {
    const response = await app.inject({ method: 'GET', url: '/assets/app-old999.js' })
    expect(response.statusCode).toBe(404)
  })

  it('does not cache non-hashed public files forever', async () => {
    const response = await app.inject({ method: 'GET', url: '/favicon.svg' })
    expect(response.headers['cache-control']).not.toContain('immutable')
  })

  it('keeps unknown API routes as JSON 404s', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/nope' })
    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ success: false, error: { code: 'not_found' } })
  })
})
