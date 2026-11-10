import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.ts'
import { loadConfig } from '../src/config.ts'
import { TEST_DATABASE_URL } from './global-setup.ts'
import { buildTestApp, loginHost, resetDatabase, setupRoom } from './helpers.ts'

let app: FastifyInstance

beforeAll(async () => {
  app = await buildTestApp()
})
afterAll(async () => {
  await app.close()
})
beforeEach(async () => {
  await resetDatabase(app)
})

describe('authentication and room scoping', () => {
  it('rejects unauthenticated access to team endpoints', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/portfolio' })
    expect(response.statusCode).toBe(401)
  })

  it('gives the same generic error for an unknown team and a wrong password', async () => {
    await setupRoom(app)
    const wrongPassword = await app.inject({
      method: 'POST',
      url: '/api/auth/team/login',
      payload: { roomCode: 'TEST01', loginName: 'team1', password: 'nope-nope' },
    })
    const unknown = await app.inject({
      method: 'POST',
      url: '/api/auth/team/login',
      payload: { roomCode: 'TEST01', loginName: 'ghost', password: 'nope-nope' },
    })
    expect(wrongPassword.statusCode).toBe(401)
    expect(unknown.json()).toEqual(wrongPassword.json())
  })

  it('accepts room codes and logins case-insensitively', async () => {
    await setupRoom(app)
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/team/login',
      payload: { roomCode: 'test01', loginName: 'TEAM1', password: 'password-1' },
    })
    expect(response.statusCode).toBe(200)
  })

  it('stops a team from using host endpoints', async () => {
    const { teams, roomId } = await setupRoom(app)
    const response = await app.inject({ method: 'GET', url: `/api/host/rooms/${roomId}`, cookies: teams[0]! })
    expect(response.statusCode).toBe(403)
  })

  it('hides one host’s room from another host', async () => {
    const { roomId } = await setupRoom(app)
    const other = await loginHost(app, 'other@example.com', 'other-password-1')
    const response = await app.inject({ method: 'GET', url: `/api/host/rooms/${roomId}`, cookies: other })
    expect(response.statusCode).toBe(404)
  })

  it('ends the session on logout', async () => {
    const { teams } = await setupRoom(app)
    await app.inject({ method: 'POST', url: '/api/auth/logout', cookies: teams[0]! })
    const response = await app.inject({ method: 'GET', url: '/api/portfolio', cookies: teams[0]! })
    expect(response.statusCode).toBe(401)
  })

  it('reports who is signed in', async () => {
    const { teams } = await setupRoom(app)
    const response = await app.inject({ method: 'GET', url: '/api/auth/me', cookies: teams[0]! })
    expect(response.json().data).toMatchObject({ kind: 'team', teamName: 'Team 1', roomCode: 'TEST01' })
  })

  it('rejects duplicate team logins in one import', async () => {
    const { host, roomId } = await setupRoom(app, { teams: 0 })
    const response = await app.inject({
      method: 'POST',
      url: `/api/host/rooms/${roomId}/teams`,
      cookies: host,
      payload: {
        teams: [
          { name: 'A', loginName: 'same', password: 'password-a' },
          { name: 'B', loginName: 'SAME', password: 'password-b' },
        ],
      },
    })
    expect(response.statusCode).toBe(409)
  })
})

describe('validation messages', () => {
  it('names the field and the problem instead of a generic error', async () => {
    const { host, roomId } = await setupRoom(app)
    const team = (await app.inject({ method: 'GET', url: `/api/host/rooms/${roomId}`, cookies: host })).json().data.teams[0]
    const url = `/api/host/rooms/${roomId}/teams/${team.id}/password`
    const short = await app.inject({ method: 'POST', url, cookies: host, payload: { password: 'short' } })
    expect(short.json().error.message).toBe('password: must be at least 8 characters')
    const extra = await app.inject({ method: 'POST', url, cookies: host, payload: { password: 'long-enough-1', teamId: team.id } })
    expect(extra.json().error.message).toBe('Invalid request: unexpected field teamId')
  })
})

describe('login rate limiting', () => {
  it('locks out one account without blocking other teams on the same IP', async () => {
    const limited = await buildApp(
      loadConfig({ LOG_LEVEL: 'silent', DATABASE_URL: TEST_DATABASE_URL, NODE_ENV: 'test', LOGIN_RATE_LIMIT_MAX: '2' }),
    )
    try {
      await setupRoom(limited, { teams: 2 })
      const attempt = (loginName: string, password: string) =>
        limited.inject({ method: 'POST', url: '/api/auth/team/login', payload: { roomCode: 'TEST01', loginName, password } })
      await attempt('team1', 'wrong-password')
      expect((await attempt('team1', 'wrong-password')).statusCode).toBe(429)
      // Whitespace/case variants of the same account share one bucket.
      expect((await attempt(' TEAM1 ', 'wrong-password')).statusCode).toBe(429)
      expect((await attempt('team2', 'password-2')).statusCode).toBe(200)
    } finally {
      await limited.close()
    }
  })
})
