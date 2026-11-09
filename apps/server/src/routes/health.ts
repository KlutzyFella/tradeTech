import type { FastifyPluginAsync } from 'fastify'

const healthResponse = {
  200: {
    type: 'object',
    properties: { status: { type: 'string' } },
    required: ['status'],
  },
} as const

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', { schema: { response: healthResponse } }, async () => ({ status: 'ok' }))
}
