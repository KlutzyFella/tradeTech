import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { Server } from 'socket.io'

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
 * Delivery contract (blueprint §10): only committed state is broadcast; every
 * room event carries a persisted offset, and clients resume from their last
 * confirmed offset or fall back to a fresh snapshot. Default Socket.IO
 * delivery can miss messages across a disconnect, so the outbox — not the
 * socket — is the source of truth.
 *
 * TODO(stage B): authenticate the handshake from the session and scope
 * subscriptions to the team's room.
 */
const realtime: FastifyPluginAsync<RealtimeOptions> = async (app, opts) => {
  const io = new Server(app.server, {
    cors: { origin: opts.webOrigin, credentials: true },
  })
  app.decorate('io', io)

  io.on('connection', (socket) => {
    app.log.debug({ socketId: socket.id }, 'socket connected')
  })

  app.addHook('onClose', async () => {
    await io.close()
  })
}

export const realtimePlugin = fp(realtime, { name: 'realtime' })
