import { hostLoginSchema, teamLoginSchema, type Me } from '@tradetech/contracts'
import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { dummyPasswordHash, verifyPassword } from '../auth/password.ts'
import { createSession, deleteSession, SESSION_COOKIE } from '../auth/sessions.ts'
import { disconnectSession } from '../plugins/realtime.ts'
import { AppError, ok, parseInput } from '../http/errors.ts'

const invalidCredentials = (): AppError => new AppError(401, 'invalid_credentials', 'Those details don’t match. Check and try again.')

interface AuthRoutesOptions {
  loginRateLimitMax: number
}

/**
 * Rate-limit key: IP plus the account being tried. Keying by IP alone would
 * let one team lock out a whole venue sharing a NAT address.
 */
function loginKey(request: FastifyRequest): string {
  const body = (request.body ?? {}) as Record<string, unknown>
  // Normalize exactly as the login schemas do (trim + case-fold) so variants share one bucket.
  const account = [body.email, body.roomCode, body.loginName].map((v) => String(v ?? '').trim().toLowerCase().slice(0, 64))
  return `${request.ip}|${account.join('|')}`
}

export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (app, opts) => {
  const LOGIN_RATE_LIMIT = { max: opts.loginRateLimitMax, timeWindow: '1 minute', hook: 'preHandler' as const, keyGenerator: loginKey }
  app.post('/auth/host/login', { config: { rateLimit: LOGIN_RATE_LIMIT } }, async (request, reply) => {
    const input = parseInput(hostLoginSchema, request.body)
    const host = await app.db.host.findUnique({ where: { email: input.email.toLowerCase() } })
    const valid = await verifyPassword(input.password, host?.passwordHash ?? (await dummyPasswordHash()))
    if (!host || !valid) throw invalidCredentials()
    reply.setSessionCookie(await createSession(app.db, { hostId: host.id }))
    return ok({ kind: 'host', hostId: host.id.toString(), email: host.email } satisfies Me)
  })

  app.post('/auth/team/login', { config: { rateLimit: LOGIN_RATE_LIMIT } }, async (request, reply) => {
    const input = parseInput(teamLoginSchema, request.body)
    const team = await app.db.team.findFirst({
      where: { loginName: input.loginName, room: { code: input.roomCode } },
      include: { room: true },
    })
    const valid = await verifyPassword(input.password, team?.passwordHash ?? (await dummyPasswordHash()))
    if (!team || !valid) throw invalidCredentials()
    if (team.status === 'disqualified') throw new AppError(403, 'team_inactive', 'This team has been disqualified.')
    reply.setSessionCookie(await createSession(app.db, { teamId: team.id, roomId: team.roomId }))
    return ok({
      kind: 'team',
      teamId: team.id.toString(),
      teamName: team.name,
      roomId: team.roomId.toString(),
      roomName: team.room.name,
      roomCode: team.room.code,
    } satisfies Me)
  })

  app.post('/auth/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE]
    await deleteSession(app.db, token)
    // Only this device: a teammate's phone on the same team stays connected.
    if (token) disconnectSession(app, token)
    reply.clearCookie(SESSION_COOKIE, { path: '/' })
    return ok(null)
  })

  app.get('/auth/me', async (request) => {
    const auth = request.auth
    if (!auth) throw new AppError(401, 'unauthenticated', 'Please sign in.')
    if (auth.kind === 'host') return ok({ kind: 'host', hostId: auth.hostId.toString(), email: auth.email } satisfies Me)
    const team = await app.db.team.findUniqueOrThrow({ where: { id: auth.teamId }, include: { room: true } })
    return ok({
      kind: 'team',
      teamId: team.id.toString(),
      teamName: team.name,
      roomId: team.roomId.toString(),
      roomName: team.room.name,
      roomCode: team.room.code,
    } satisfies Me)
  })
}
