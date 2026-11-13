import {
  createRoomSchema,
  createStockSchema,
  idSchema,
  setRoomStatusSchema,
  teamImportSchema,
  type HostRoomView,
} from '@tradetech/contracts'
import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { z } from 'zod'
import {
  createRoom,
  createStock,
  importTeams,
  ownedRoom,
  resetPractice,
  roomOverview,
  setRoomStatus,
} from '../host/room-service.ts'
import { ok, parseInput } from '../http/errors.ts'
import { hostAuth, requireHost } from '../plugins/auth.ts'
import { signal } from '../plugins/realtime.ts'
import { createRoomFromTemplate, ownedTemplate } from '../host/templates.ts'
import { parseRoomRules } from '../rooms/rules.ts'
import { latestRound, toRoundView } from '../rounds/clock.ts'
import { toStockView } from '../trading/market-state.ts'

const roomParams = z.object({ roomId: idSchema })

/** Host console endpoints. Every room route checks ownership first. */
export const hostRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireHost)

  const loadRoom = async (request: FastifyRequest) => {
    const { roomId } = parseInput(roomParams, request.params)
    return ownedRoom(app.db, hostAuth(request).hostId, BigInt(roomId))
  }

  app.get('/host/rooms', async (request) => {
    const rooms = await app.db.room.findMany({
      where: { hostId: hostAuth(request).hostId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, code: true, name: true, status: true },
    })
    return ok(rooms.map((r) => ({ ...r, id: r.id.toString() })))
  })

  app.post('/host/rooms', async (request) => {
    const input = parseInput(createRoomSchema, request.body)
    const { hostId } = hostAuth(request)
    const room = input.templateId
      ? await createRoomFromTemplate(app.db, hostId, input, await ownedTemplate(app.db, hostId, BigInt(input.templateId)))
      : await createRoom(app.db, hostId, input)
    return ok({ id: room.id.toString(), code: room.code, name: room.name, status: room.status })
  })

  app.get('/host/rooms/:roomId', async (request) => {
    const room = await roomOverview(app.db, (await loadRoom(request)).id)
    const round = await latestRound(app.db, room.id)
    const now = new Date()
    return ok({
      id: room.id.toString(),
      code: room.code,
      name: room.name,
      status: room.status,
      startingCashPaise: Number(room.startingCashPaise),
      rules: parseRoomRules(room.rules),
      marketVersion: Number(room.marketVersion),
      round: round ? toRoundView(round, now) : null,
      stocks: room.stocks.map((s) => ({
        ...toStockView(s, now),
        depth: s.depth,
        sensitivity: s.sensitivity,
        borrowPool: s.borrowPool,
        borrowUsed: s.borrowUsed,
        haltReason: s.haltReason,
        bandFraction: s.bandFraction,
      })),
      teams: room.teams.map((t) => ({ ...t, id: t.id.toString(), cashPaise: Number(t.cashPaise) })),
    } satisfies HostRoomView)
  })

  app.post('/host/rooms/:roomId/teams', async (request) => {
    const room = await loadRoom(request)
    const created = await importTeams(app.db, room, parseInput(teamImportSchema, request.body))
    return ok({ created })
  })

  app.post('/host/rooms/:roomId/stocks', async (request) => {
    const room = await loadRoom(request)
    const stock = await createStock(app.db, room, parseInput(createStockSchema, request.body))
    return ok(toStockView(stock))
  })

  app.post('/host/rooms/:roomId/status', async (request) => {
    const room = await loadRoom(request)
    const status = await setRoomStatus(app.db, room, parseInput(setRoomStatusSchema, request.body).status)
    signal(app, `room:${room.id}`, 'room:status', { status })
    return ok({ status })
  })

  app.post('/host/rooms/:roomId/reset-practice', async (request) => {
    const room = await loadRoom(request)
    await resetPractice(app.db, room)
    signal(app, `room:${room.id}`, 'portfolio:reset', {})
    return ok(null)
  })
}
