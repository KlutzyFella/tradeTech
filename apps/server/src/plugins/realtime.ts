import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { Server } from 'socket.io'
import { resolveSession, SESSION_COOKIE, type AuthContext } from '../auth/sessions.ts'

declare module 'fastify' {
  interface FastifyInstance {
    io: Server
  }
}

interface RealtimeOptions {
  webOrigin: string
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

  io.use(async (socket, next) => {
    try {
      const cookies = app.parseCookie(socket.handshake.headers.cookie ?? '')
      const auth = await resolveSession(app.db, cookies[SESSION_COOKIE])
      if (!auth) return next(new Error('unauthenticated'))
      socket.data.auth = auth
      return next()
    } catch (error: unknown) {
      app.log.error({ err: error }, 'socket auth failed')
      return next(new Error('unauthenticated'))
    }
  })

  io.on('connection', (socket) => {
    const auth = socket.data.auth as AuthContext
    if (auth.kind === 'team') {
      void socket.join([`room:${auth.roomId}`, `team:${auth.teamId}`])
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
export function signal(app: FastifyInstance, channel: string, event: string, payload: object): void {
  try {
    app.io.to(channel).emit(event, payload)
  } catch (error: unknown) {
    app.log.warn({ err: error, channel, event }, 'failed to send realtime signal')
  }
}
