import cookie from '@fastify/cookie'
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { resolveSession, SESSION_COOKIE, SESSION_TTL_MS, type AuthContext } from '../auth/sessions.ts'
import { AppError } from '../http/errors.ts'

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null
  }
  interface FastifyReply {
    setSessionCookie(token: string): FastifyReply
  }
}

const SESSION_SWEEP_MS = 10 * 60 * 1000

interface AuthPluginOptions {
  secureCookies: boolean
}

const auth: FastifyPluginAsync<AuthPluginOptions> = async (app, opts) => {
  await app.register(cookie)
  app.decorateRequest('auth', null)
  app.decorateReply('setSessionCookie', function (this: FastifyReply, token: string) {
    return this.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: opts.secureCookies,
      path: '/',
      maxAge: SESSION_TTL_MS / 1000,
    })
  })
  app.addHook('onRequest', async (request) => {
    request.auth = await resolveSession(app.db, request.cookies[SESSION_COOKIE])
  })

  // Expired sessions are already refused; this just keeps the table small.
  const sweep = setInterval(() => {
    app.db.session
      .deleteMany({ where: { expiresAt: { lt: new Date() } } })
      .catch((error: unknown) => app.log.warn({ err: error }, 'session sweep failed'))
  }, SESSION_SWEEP_MS)
  sweep.unref()
  app.addHook('onClose', async () => clearInterval(sweep))
}

export const authPlugin = fp(auth, { name: 'auth', dependencies: ['db'] })

export async function requireHost(request: FastifyRequest): Promise<void> {
  if (!request.auth) throw new AppError(401, 'unauthenticated', 'Please sign in.')
  if (request.auth.kind !== 'host') throw new AppError(403, 'forbidden', 'Hosts only.')
}

export async function requireTeam(request: FastifyRequest): Promise<void> {
  if (!request.auth) throw new AppError(401, 'unauthenticated', 'Please sign in.')
  if (request.auth.kind !== 'team') throw new AppError(403, 'forbidden', 'Teams only.')
}

export function hostAuth(request: FastifyRequest): Extract<AuthContext, { kind: 'host' }> {
  if (request.auth?.kind !== 'host') throw new AppError(403, 'forbidden', 'Hosts only.')
  return request.auth
}

export function teamAuth(request: FastifyRequest): Extract<AuthContext, { kind: 'team' }> {
  if (request.auth?.kind !== 'team') throw new AppError(403, 'forbidden', 'Teams only.')
  return request.auth
}
