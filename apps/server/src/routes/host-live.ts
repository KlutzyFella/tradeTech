import { createNewsSchema, createRoundSchema, haltSchema, idSchema, ROUND_ACTIONS } from '@tradetech/contracts'
import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { ownedRoom } from '../host/room-service.ts'
import { leaderboard, setHalt } from '../host/live-service.ts'
import { ok, parseInput } from '../http/errors.ts'
import { createNews, listHostNews, publishNow } from '../news/news-service.ts'
import { hostAuth, requireHost } from '../plugins/auth.ts'
import { signal } from '../plugins/realtime.ts'
import { latestRound, toRoundView } from '../rounds/clock.ts'
import { createRound, roundAction } from '../rounds/round-service.ts'

const roomParams = z.object({ roomId: idSchema })
const actionParams = roomParams.extend({ action: z.enum(ROUND_ACTIONS) })
const stockParams = roomParams.extend({ stockId: idSchema })
const newsParams = roomParams.extend({ newsId: idSchema })

/** Live event controls: rounds, news desk, halts, standings. */
export const hostLiveRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireHost)
  const loadRoom = (request: FastifyRequest, params: { roomId: string }) =>
    ownedRoom(app.db, hostAuth(request).hostId, BigInt(params.roomId))
  const changed = (roomId: bigint, ...events: string[]) => {
    for (const event of events) signal(app, `room:${roomId}`, event, {})
  }

  app.get('/host/rooms/:roomId/round', async (request) => {
    const room = await loadRoom(request, parseInput(roomParams, request.params))
    const round = await latestRound(app.db, room.id)
    return ok(round ? toRoundView(round, new Date()) : null)
  })

  app.post('/host/rooms/:roomId/rounds', async (request) => {
    const room = await loadRoom(request, parseInput(roomParams, request.params))
    const round = await createRound(app.db, room, parseInput(createRoundSchema, request.body).durationMinutes)
    changed(room.id, 'room:status')
    return ok(toRoundView(round, new Date()))
  })

  app.post('/host/rooms/:roomId/rounds/current/:action', async (request) => {
    const params = parseInput(actionParams, request.params)
    const room = await loadRoom(request, params)
    const round = await roundAction(app.db, room, params.action)
    changed(room.id, 'room:status')
    return ok(toRoundView(round, new Date()))
  })

  app.get('/host/rooms/:roomId/news', async (request) => {
    const room = await loadRoom(request, parseInput(roomParams, request.params))
    return ok(await listHostNews(app.db, room.id))
  })

  app.post('/host/rooms/:roomId/news', async (request) => {
    const room = await loadRoom(request, parseInput(roomParams, request.params))
    const item = await createNews(app.db, room, parseInput(createNewsSchema, request.body))
    if (item.status === 'published') changed(room.id, 'news:published', 'market:changed')
    return ok(item)
  })

  app.post('/host/rooms/:roomId/news/:newsId/publish', async (request) => {
    const params = parseInput(newsParams, request.params)
    const room = await loadRoom(request, params)
    await publishNow(app.db, room, BigInt(params.newsId))
    changed(room.id, 'news:published', 'market:changed')
    return ok(null)
  })

  app.post('/host/rooms/:roomId/stocks/:stockId/halt', async (request) => {
    const params = parseInput(stockParams, request.params)
    const room = await loadRoom(request, params)
    const input = parseInput(haltSchema, request.body)
    await setHalt(app.db, room, BigInt(params.stockId), input.halted, input.rebaseBand)
    changed(room.id, 'market:changed')
    return ok(null)
  })

  app.get('/host/rooms/:roomId/leaderboard', async (request) => {
    const room = await loadRoom(request, parseInput(roomParams, request.params))
    return ok(await leaderboard(app.db, room.id))
  })
}
