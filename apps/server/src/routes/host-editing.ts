import {
  idSchema,
  importTemplateSchema,
  saveTemplateSchema,
  scheduleDraftSchema,
  updateRulesSchema,
  updateStockSchema,
} from '@tradetech/contracts'
import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { deleteStock, updateRules, updateStock } from '../host/editing.ts'
import { ownedRoom } from '../host/room-service.ts'
import { deleteTemplate, exportTemplate, importTemplate, listTemplates, ownedTemplate, saveTemplate } from '../host/templates.ts'
import { ok, parseInput } from '../http/errors.ts'
import { scheduleNews } from '../news/news-service.ts'
import { hostAuth, requireHost } from '../plugins/auth.ts'
import { signal } from '../plugins/realtime.ts'

const roomParams = z.object({ roomId: idSchema })
const stockParams = roomParams.extend({ stockId: idSchema })
const newsParams = roomParams.extend({ newsId: idSchema })
const templateParams = z.object({ templateId: idSchema })

/** Editing an event's rules and stocks, scheduling drafts, and reusable templates. */
export const hostEditingRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireHost)
  const loadRoom = (request: FastifyRequest, params: { roomId: string }) =>
    ownedRoom(app.db, hostAuth(request).hostId, BigInt(params.roomId))

  app.post('/host/rooms/:roomId/rules', async (request) => {
    const room = await loadRoom(request, parseInput(roomParams, request.params))
    return ok(await updateRules(app.db, room, parseInput(updateRulesSchema, request.body)))
  })

  app.post('/host/rooms/:roomId/stocks/:stockId', async (request) => {
    const params = parseInput(stockParams, request.params)
    const room = await loadRoom(request, params)
    const stock = await updateStock(app.db, room, BigInt(params.stockId), parseInput(updateStockSchema, request.body))
    signal(app, `room:${room.id}`, 'market:changed', {})
    return ok(stock)
  })

  app.delete('/host/rooms/:roomId/stocks/:stockId', async (request) => {
    const params = parseInput(stockParams, request.params)
    const room = await loadRoom(request, params)
    await deleteStock(app.db, room, BigInt(params.stockId))
    signal(app, `room:${room.id}`, 'market:changed', {})
    return ok(null)
  })

  app.post('/host/rooms/:roomId/news/:newsId/schedule', async (request) => {
    const params = parseInput(newsParams, request.params)
    const room = await loadRoom(request, params)
    await scheduleNews(app.db, room, BigInt(params.newsId), parseInput(scheduleDraftSchema, request.body).minute)
    return ok(null)
  })

  app.post('/host/rooms/:roomId/save-template', async (request) => {
    const room = await loadRoom(request, parseInput(roomParams, request.params))
    const input = parseInput(saveTemplateSchema, request.body)
    return ok(await saveTemplate(app.db, room, input.name, input.description))
  })

  app.get('/host/templates', async (request) => ok(await listTemplates(app.db, hostAuth(request).hostId)))

  app.post('/host/templates', async (request) => {
    const input = parseInput(importTemplateSchema, request.body)
    return ok(await importTemplate(app.db, hostAuth(request).hostId, input.name, input.description, input.data))
  })

  app.get('/host/templates/:templateId/export', async (request) => {
    const { templateId } = parseInput(templateParams, request.params)
    return ok(exportTemplate(await ownedTemplate(app.db, hostAuth(request).hostId, BigInt(templateId))))
  })

  app.delete('/host/templates/:templateId', async (request) => {
    const { templateId } = parseInput(templateParams, request.params)
    await deleteTemplate(app.db, hostAuth(request).hostId, BigInt(templateId))
    return ok(null)
  })
}
