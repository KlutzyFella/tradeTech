import { EXPORT_KINDS, idSchema, leaderboardVisibilitySchema, resetPasswordSchema, teamStatusSchema } from '@tradetech/contracts'
import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { ownedRoom } from '../host/room-service.ts'
import { resetTeamPassword, setTeamStatus } from '../host/team-admin.ts'
import { ok, parseInput } from '../http/errors.ts'
import { hostAuth, requireHost } from '../plugins/auth.ts'
import { signal } from '../plugins/realtime.ts'
import { buildExport } from '../results/exports.ts'
import { hostStandings } from '../results/standings.ts'

const roomParams = z.object({ roomId: idSchema })
const teamParams = roomParams.extend({ teamId: idSchema })
const exportParams = roomParams.extend({ file: z.enum(EXPORT_KINDS.map((k) => `${k}.csv`) as [string, ...string[]]) })

/** Standings, visibility, exports and team administration. */
export const hostResultsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireHost)
  const loadRoom = (request: FastifyRequest, params: { roomId: string }) =>
    ownedRoom(app.db, hostAuth(request).hostId, BigInt(params.roomId))

  app.get('/host/rooms/:roomId/leaderboard', async (request) => {
    const room = await loadRoom(request, parseInput(roomParams, request.params))
    return ok(await hostStandings(app.db, room.id))
  })

  app.post('/host/rooms/:roomId/leaderboard/visibility', async (request) => {
    const room = await loadRoom(request, parseInput(roomParams, request.params))
    const { public: isPublic } = parseInput(leaderboardVisibilitySchema, request.body)
    await app.db.room.update({ where: { id: room.id }, data: { leaderboardPublic: isPublic } })
    signal(app, `room:${room.id}`, 'standings:changed', {})
    return ok({ public: isPublic })
  })

  app.get('/host/rooms/:roomId/export/:file', async (request, reply) => {
    const params = parseInput(exportParams, request.params)
    const room = await loadRoom(request, params)
    const kind = params.file.replace(/\.csv$/, '') as (typeof EXPORT_KINDS)[number]
    const csv = await buildExport(app.db, room.id, kind)
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="${room.code.toLowerCase()}-${kind}.csv"`)
      .header('cache-control', 'no-store')
      .send(csv)
  })

  app.post('/host/rooms/:roomId/teams/:teamId/password', async (request) => {
    const params = parseInput(teamParams, request.params)
    const room = await loadRoom(request, params)
    await resetTeamPassword(app.db, room, BigInt(params.teamId), parseInput(resetPasswordSchema, request.body).password)
    return ok(null)
  })

  app.post('/host/rooms/:roomId/teams/:teamId/status', async (request) => {
    const params = parseInput(teamParams, request.params)
    const room = await loadRoom(request, params)
    const input = parseInput(teamStatusSchema, request.body)
    await setTeamStatus(app.db, room, BigInt(params.teamId), input.status, input.reason)
    signal(app, `team:${params.teamId}`, 'orders:changed', {})
    return ok(null)
  })
}
