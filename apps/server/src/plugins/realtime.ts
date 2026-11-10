import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { Server } from 'socket.io'
import { hashToken, resolveSession, SESSION_COOKIE, type AuthContext } from '../auth/sessions.ts'

declare module 'fastify' {
  interface FastifyInstance {
    io: Server
    /** Room-wide "market changed" signal, coalesced so N teams × fills can't become N² refetches. */
    signalMarketChanged(roomId: bigint | string): void
  }
}

interface RealtimeOptions {
  webOrigin: string
  /** Coalesce room-wide market signals to at most one per this many ms (0 = every change). */
  marketSignalThrottleMs: number
  /** With more than one instance, signals must fan out through Redis. */
  redisUrl?: string | undefined
}

/**
 * Socket.IO attached to Fastify's HTTP server.
 *
 * Stage B delivery contract: sockets carry only "something changed" signals
 * sent after commit; clients refetch authoritative state over HTTP, so a
 * missed signal is healed by the next refetch or reconnect. (Stage C adds
 * offset-based resume from the room_events outbox.)
 *
 * Handshakes are authenticated from the session cookie, and each socket joins
 * only its own room and team channels.
 */
const realtime: FastifyPluginAsync<RealtimeOptions> = async (app, opts) => {
  const io = new Server(app.server, {
    cors: { origin: opts.webOrigin, credentials: true },
    // CORS doesn't cover WebSocket upgrades; refuse cross-site origins explicitly.
    allowRequest: (req, callback) => {
      const origin = req.headers.origin
      callback(null, origin === undefined || origin === opts.webOrigin)
    },
  })
  app.decorate('io', io)

  // Leading + trailing throttle per room: the first change goes out at once,
  // later ones within the window collapse into one trailing signal.
  const lastSent = new Map<string, number>()
  const trailing = new Map<string, NodeJS.Timeout>()
  app.decorate('signalMarketChanged', (roomId: bigint | string) => {
    const key = String(roomId)
    const wait = opts.marketSignalThrottleMs - (Date.now() - (lastSent.get(key) ?? 0))
    if (wait <= 0) {
      lastSent.set(key, Date.now())
      signal(app, `room:${key}`, 'market:changed', {})
      return
    }
    if (trailing.has(key)) return
    trailing.set(
      key,
      setTimeout(() => {
        trailing.delete(key)
        lastSent.set(key, Date.now())
        signal(app, `room:${key}`, 'market:changed', {})
      }, wait),
    )
  })
  app.addHook('onClose', async () => {
    for (const timer of trailing.values()) clearTimeout(timer)
  })

  if (opts.redisUrl) {
    const [{ createAdapter }, { createClient }] = await Promise.all([import('@socket.io/redis-adapter'), import('redis')])
    const pub = createClient({ url: opts.redisUrl })
    const sub = pub.duplicate()
    // Without listeners, a Redis blip would surface as an uncaught exception and crash a live round.
    pub.on('error', (error: unknown) => app.log.error({ err: error }, 'redis publisher error'))
    sub.on('error', (error: unknown) => app.log.error({ err: error }, 'redis subscriber error'))
    await Promise.all([pub.connect(), sub.connect()])
    io.adapter(createAdapter(pub, sub))
    app.addHook('onClose', async () => {
      await Promise.allSettled([pub.quit(), sub.quit()])
    })
    app.log.info('socket.io using Redis adapter')
  }

  io.use(async (socket, next) => {
    try {
      const cookies = app.parseCookie(socket.handshake.headers.cookie ?? '')
      const token = cookies[SESSION_COOKIE]
      const auth = await resolveSession(app.db, token)
      if (!auth || !token) return next(new Error('unauthenticated'))
      socket.data.auth = auth
      socket.data.sessionChannel = `session:${hashToken(token)}`
      return next()
    } catch (error: unknown) {
      app.log.error({ err: error }, 'socket auth failed')
      return next(new Error('unauthenticated'))
    }
  })

  io.on('connection', (socket) => {
    const auth = socket.data.auth as AuthContext
    if (auth.kind === 'team') {
      void socket.join([`room:${auth.roomId}`, `team:${auth.teamId}`, socket.data.sessionChannel as string])
    }
  })

  app.addHook('onClose', async () => {
    await io.close()
  })
}

export const realtimePlugin = fp(realtime, { name: 'realtime', dependencies: ['db', 'auth'] })

/**
 * Sends a post-commit change signal. Never throws: the state is already
 * committed, and failing the HTTP request would make clients retry an order
 * whose outcome they'd then wrongly treat as unknown.
 */
/** Drops the live connections of one signed-in session (that device's sign-out). */
export function disconnectSession(app: FastifyInstance, token: string): void {
  try {
    app.io.in(`session:${hashToken(token)}`).disconnectSockets(true)
  } catch (error: unknown) {
    app.log.warn({ err: error }, 'failed to disconnect session sockets')
  }
}

/** Drops all of a team's live connections (disqualification, password reset). */
export function disconnectTeam(app: FastifyInstance, teamId: bigint | string): void {
  try {
    app.io.in(`team:${teamId}`).disconnectSockets(true)
  } catch (error: unknown) {
    app.log.warn({ err: error, teamId: String(teamId) }, 'failed to disconnect team sockets')
  }
}

export function signal(app: FastifyInstance, channel: string, event: string, payload: object): void {
  try {
    app.io.to(channel).emit(event, payload)
  } catch (error: unknown) {
    app.log.warn({ err: error, channel, event }, 'failed to send realtime signal')
  }
}
