import { orderTicketSchema, placeOrderSchema } from '@tradetech/contracts'
import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { ok, parseInput } from '../http/errors.ts'
import { signal } from '../plugins/realtime.ts'
import { requireTeam, teamAuth } from '../plugins/auth.ts'
import { listPublicNews } from '../news/news-service.ts'
import { teamStandings } from '../results/standings.ts'
import { placeOrder, previewOrder } from '../trading/order-service.ts'
import { getMarketView, getPortfolioView, listTeamOrders } from '../trading/views.ts'

/** Participant endpoints. Team and room always come from the session, never the request. */
export const teamRoutes: FastifyPluginAsync<{ previewRateLimitPerSec: number }> = async (app, opts) => {
  app.addHook('preHandler', requireTeam)

  app.get('/market', async (request) => ok(await getMarketView(app.db, teamAuth(request).roomId)))

  app.get('/portfolio', async (request) => ok(await getPortfolioView(app.db, teamAuth(request))))

  app.get('/standings', async (request) => ok(await teamStandings(app.db, teamAuth(request))))

  app.get('/news', async (request) => ok(await listPublicNews(app.db, teamAuth(request).roomId)))

  app.get('/orders', async (request) => ok(await listTeamOrders(app.db, teamAuth(request).teamId)))

  const previewLimit = {
    max: opts.previewRateLimitPerSec,
    timeWindow: 1000,
    hook: 'preHandler' as const,
    keyGenerator: (request: FastifyRequest) => `preview:${request.auth?.kind === 'team' ? request.auth.teamId : request.ip}`,
  }

  app.post('/orders/preview', { config: { rateLimit: previewLimit } }, async (request) => {
    const ticket = parseInput(orderTicketSchema, request.body)
    return ok(await previewOrder(app.db, teamAuth(request), ticket))
  })

  app.post('/orders', async (request) => {
    const auth = teamAuth(request)
    const input = parseInput(placeOrderSchema, request.body)
    const result = await placeOrder(app.db, auth, input)
    if (!result.replayed) {
      // Only committed state is announced. Clients refetch on these signals.
      signal(app, `team:${auth.teamId}`, 'orders:changed', { orderId: result.order.id })
      if (result.order.status === 'filled') app.signalMarketChanged(auth.roomId)
    }
    return ok(result)
  })
}
